// Auditoría descriptiva V1. Solo lee Prefactura; nunca escribe fuentes, conciliación ni almacenamiento.
import { financeClass, financeUniverse } from '../finance';

export const AUDIT_VERSION = 'tariff-audit-v1';
export const AUDIT_DEFAULTS = Object.freeze({
  minSamples: 10,
  minWeeks: 2,
  robustZ: 3.5,
  zeroMadRelative: 0.25,
  rateTolerance: 0.02,
  presentationTolerance: 0.02,
  extremeRatio: 100,
  cutoff: '2026-06-01',
});
export const AUDIT_RULES = {
  INPUT: 'Respaldo insuficiente',
  NON_POSITIVE: 'Cero o negativo: verificar origen',
  PRESENTATION: 'Presentación SIAGRI',
  REPORTED_OUTLIER: 'Tarifa reportada atípica',
  EFFECTIVE_OUTLIER: 'Tarifa efectiva atípica',
  EXTREME: 'Valor extremo prioritario',
  EXACT_REPEAT: 'Repetición exacta documental',
  CROSS_INVOICE: 'Coincidencia entre P.FACT',
  DIFFERENT_RATE: 'Misma cantidad con tarifas distintas',
};

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const keyOf = (values) => JSON.stringify(values.map((value) => value ?? null));
const sum = (rows) => Number(rows.reduce((total, row) => total + (finite(row.total) ? row.total : 0), 0).toFixed(2));
const groupBy = (rows, key) => {
  const groups = new Map();
  rows.forEach((row) => {
    const value = key(row);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  });
  return groups;
};
const validDate = (date) => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
const coverage = (rows) => {
  const dates = rows
    .map((row) => row.date)
    .filter(validDate)
    .sort();
  return { from: dates[0] ?? null, to: dates.at(-1) ?? null, rows: rows.length };
};
export const median = (values) => {
  const ordered = values.filter(finite).sort((a, b) => a - b);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

function configuration(options) {
  const config = { ...AUDIT_DEFAULTS, ...options };
  for (const name of ['minSamples', 'minWeeks', 'robustZ', 'rateTolerance', 'presentationTolerance', 'extremeRatio']) {
    if (!finite(config[name]) || config[name] <= 0) throw new Error(`Configuración de auditoría inválida: ${name}`);
  }
  if (!Number.isInteger(config.minSamples) || config.minSamples < 3 || !Number.isInteger(config.minWeeks))
    throw new Error('La referencia exige al menos tres muestras y un número entero de semanas.');
  if (!finite(config.zeroMadRelative) || config.zeroMadRelative <= 0 || config.extremeRatio <= 1 || !validDate(config.cutoff))
    throw new Error('Configuración de dispersión o corte histórico inválida.');
  return config;
}

const COMPARABLE_FIELDS = ['service', 'labor', 'unit', 'contractorCode', 'universe', 'jornada', 'billingBase'];
const DOCUMENT_FIELDS = [
  'year',
  'week',
  'date',
  'producerCode',
  'producerName',
  'haciendaCode',
  'hacienda',
  'suerte',
  'labor',
  'service',
  'unit',
  'contractorCode',
  'jornada',
  'billingBase',
  'periodStart',
  'periodEnd',
];
const EXACT_FIELDS = [
  ...DOCUMENT_FIELDS,
  'units',
  'tariff',
  'total',
  'pFact',
  'invoice',
  'contractor',
  'producer',
  'serviceName',
  'laborName',
  'lotArea',
  'tenureGroup',
  'interfaceStatus',
];
const signature = (fields) => (row) => keyOf(fields.map((field) => row[field]));

function repetitions(rows) {
  const groups = [];
  const excluded = new Set();
  const register = (rule, list) => groups.push({ key: `${rule}:${groups.length}`, rule, rows: list });
  for (const list of groupBy(rows, signature(EXACT_FIELDS)).values()) {
    if (list.length < 2) continue;
    register('EXACT_REPEAT', list);
    list.slice(1).forEach((row) => excluded.add(row.auditId));
  }
  for (const list of groupBy(rows, signature([...DOCUMENT_FIELDS, 'units', 'tariff', 'total'])).values()) {
    if (list.every((row) => row.pFact) && new Set(list.map((row) => row.pFact)).size > 1) register('CROSS_INVOICE', list);
  }
  for (const list of groupBy(rows, signature([...DOCUMENT_FIELDS, 'units', 'pFact'])).values()) {
    if (new Set(list.map((row) => row.tariff)).size > 1) register('DIFFERENT_RATE', list);
  }
  return { groups, excluded };
}

function reference(rows, metric, config, identified) {
  const eligible = rows.filter((row) => finite(row[metric]) && row[metric] > 0 && row.units > 0);
  const values = eligible.map((row) => row[metric]);
  const center = median(values);
  const mad = center == null ? null : median(values.map((value) => Math.abs(value - center)));
  const weeks = new Set(eligible.map((row) => row.period).filter(Boolean)).size;
  const sufficient = identified && values.length >= config.minSamples && weeks >= config.minWeeks;
  // MAD=0 (o muy pequeño por redondeo): piso explícito, no división por cero.
  const floor = center == null ? null : Math.max(config.rateTolerance, Math.abs(center) * config.zeroMadRelative);
  const radius = center == null ? null : Math.max(floor, config.robustZ * 1.4826 * mad);
  return {
    n: values.length,
    weeks,
    median: center,
    mad,
    sufficient,
    lower: sufficient ? Math.max(0, center - radius) : null,
    upper: sufficient ? center + radius : null,
    method: mad === 0 ? 'MAD=0: tolerancia relativa/absoluta' : 'MAD escalado con piso de tolerancia',
    reason: sufficient ? '' : !identified ? 'Faltan dimensiones de comparación' : 'Sin referencia suficiente',
    rowIds: eligible.map((row) => row.auditId),
  };
}

function historySide(rows) {
  const positive = rows.filter((row) => row.units > 0 && row.tariff > 0 && row.effective > 0);
  return {
    ...coverage(rows),
    samples: positive.length,
    reportedMedian: median(positive.map((row) => row.tariff)),
    effectiveMedian: median(positive.map((row) => row.effective)),
    rowIds: rows.map((row) => row.auditId),
  };
}
const change = (before, after) => (before > 0 && after != null ? (after / before - 1) * 100 : null);

/**
 * Contrato: todos los registros importados, sin filtro global de conciliación. Las opciones son locales.
 * null en campos económicos significa NO VERIFICABLE, nunca diferencia cero certificada.
 * Los IDs auditId son locales a esta corrida, no identificadores persistentes de expedientes.
 */
export function analyzeTariffs(prefactura = [], options = {}) {
  const config = configuration(options);
  const rows = prefactura.map((source, index) => {
    const row = {
      ...source,
      auditId: `prefactura:${index}`,
      universe: financeUniverse(financeClass(source)),
      jornada: source.jornada || 'No informada',
      billingBase: source.billingBase || 'No informada',
      month: validDate(source.date) ? source.date.slice(0, 7) : 'Sin fecha',
      period:
        Number.isInteger(source.year) && Number.isInteger(source.week) && source.week >= 1 && source.week <= 53
          ? `${source.year}-S${String(source.week).padStart(2, '0')}`
          : null,
      effective:
        finite(source.total) && finite(source.units) && source.units > 0 && source.unit ? source.total / source.units : null,
      authorizedTariff: null,
      expectedAmount: null,
      economicDifference: null,
      presentationDifference:
        finite(source.tariff) && finite(source.units) && finite(source.total) && source.units > 0
          ? source.total - source.tariff * source.units
          : null,
    };
    row.comparableKey = signature(COMPARABLE_FIELDS)(row);
    row.populationKey = keyOf([row.comparableKey, row.month]);
    return row;
  });
  const repeated = repetitions(rows);
  const populations = [...groupBy(rows, (row) => row.populationKey)]
    .map(([key, list]) => {
      const sample = list[0];
      const training = list.filter((row) => !repeated.excluded.has(row.auditId));
      const identified = !!(sample.service && sample.unit && sample.contractorCode && sample.month !== 'Sin fecha');
      return {
        key,
        comparableKey: sample.comparableKey,
        ...Object.fromEntries(COMPARABLE_FIELDS.map((field) => [field, sample[field]])),
        month: sample.month,
        ...coverage(list),
        rowIds: list.map((row) => row.auditId),
        excludedCopies: list.length - training.length,
        reported: reference(training, 'tariff', config, identified),
        effective: reference(training, 'effective', config, identified),
        exploratory: sample.jornada === 'No informada' || sample.billingBase === 'No informada',
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const byPopulation = new Map(populations.map((population) => [population.key, population]));
  const observations = [];
  const add = (row, rule, explanation, priority = 'Revisar', evidence = {}) =>
    observations.push({
      key: `${row.auditId}:${rule}`,
      rowId: row.auditId,
      rule,
      priority,
      explanation,
      ...evidence,
    });
  rows.forEach((row) => {
    const population = byPopulation.get(row.populationKey);
    row.referenceSufficient = population.reported.sufficient && population.effective.sufficient;
    const missing = [];
    if (!finite(row.tariff) || !finite(row.total)) missing.push('tarifa o importe no numérico');
    if (!finite(row.units) || row.units <= 0 || !row.unit) missing.push('cantidad positiva/UM no disponible');
    if (!validDate(row.date) || !row.period) missing.push('fecha o semana no identificada');
    if (!row.service || !row.contractorCode) missing.push('servicio o contratista no identificado');
    if (missing.length) add(row, 'INPUT', missing.join('; '), 'Respaldo');
    if ((finite(row.tariff) && row.tariff <= 0) || (finite(row.total) && row.total <= 0))
      add(
        row,
        'NON_POSITIVE',
        'Puede ser ajuste, crédito o dato ausente normalizado a cero; comprobar el Excel y documento.',
        'Respaldo',
      );
    if (row.presentationDifference != null && Math.abs(row.presentationDifference) > config.presentationTolerance + 1e-8)
      add(
        row,
        'PRESENTATION',
        'La multiplicación de la tarifa mostrada no reproduce el importe. Es compatible con un promedio SIAGRI, pero no demuestra su causa ni valida el cobro.',
        'Presentación',
      );
    let extreme = false;
    for (const [metric, rule, ref] of [
      ['tariff', 'REPORTED_OUTLIER', population.reported],
      ['effective', 'EFFECTIVE_OUTLIER', population.effective],
    ]) {
      const value = row[metric];
      if (!ref.sufficient || !finite(value) || value <= 0) continue;
      const ratio = value / ref.median;
      if (value < ref.lower || value > ref.upper)
        add(
          row,
          rule,
          'Fuera del intervalo estadístico de su servicio, UM, contratista, universo y mes. La mezcla de jornadas puede explicar diferencias; referencia no autorizada.',
          'Revisar',
          { metric, ratio, populationKey: population.key },
        );
      if (ratio < 1 / config.extremeRatio || ratio > config.extremeRatio) extreme = true;
    }
    if (extreme)
      add(
        row,
        'EXTREME',
        `Más de ${config.extremeRatio} veces por debajo o encima de la mediana comparable. Verificar tarifa de origen, base y documento; sin valoración económica.`,
        'Prioritario',
      );
  });
  repeated.groups.forEach((group) =>
    group.rows.forEach((row) =>
      add(
        row,
        group.rule,
        'Coincidencia documental para investigar. Se requiere ejecución, P.FACT definitiva, anulación o reemisión; no confirma cobro duplicado.',
        'Revisar',
        { repetitionKey: group.key },
      ),
    ),
  );
  const byRow = groupBy(observations, (observation) => observation.rowId);
  rows.forEach((row) => {
    row.observations = byRow.get(row.auditId) ?? [];
  });
  const history = [...groupBy(rows, (row) => row.comparableKey)]
    .map(([key, list]) => {
      const training = list.filter((row) => !repeated.excluded.has(row.auditId) && validDate(row.date));
      const before = historySide(training.filter((row) => row.date < config.cutoff));
      const after = historySide(training.filter((row) => row.date >= config.cutoff));
      return {
        key,
        ...Object.fromEntries(COMPARABLE_FIELDS.map((field) => [field, list[0][field]])),
        before,
        after,
        reportedChange: change(before.reportedMedian, after.reportedMedian),
        effectiveChange: change(before.effectiveMedian, after.effectiveMedian),
        sufficient: before.samples >= config.minSamples && after.samples >= config.minSamples,
        excludedCopies: list.length - list.filter((row) => !repeated.excluded.has(row.auditId)).length,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const uniqueByRule = (rules) => rows.filter((row) => row.observations.some((item) => rules.includes(item.rule)));
  const repeatRows = uniqueByRule(['EXACT_REPEAT', 'CROSS_INVOICE', 'DIFFERENT_RATE']);
  return {
    version: AUDIT_VERSION,
    config,
    rows,
    populations,
    history,
    observations,
    repetitions: repeated.groups,
    coverage: coverage(rows),
    summary: {
      lines: rows.length,
      total: sum(rows),
      observed: rows.filter((row) => row.observations.length).length,
      priority: uniqueByRule(['EXTREME']).length,
      presentation: uniqueByRule(['PRESENTATION']).length,
      statistical: uniqueByRule(['REPORTED_OUTLIER', 'EFFECTIVE_OUTLIER']).length,
      insufficient: rows.filter((row) => !row.referenceSufficient).length,
      repeated: repeatRows.length,
      repeatedAmount: sum(repeatRows),
      excludedTrainingCopies: repeated.excluded.size,
      authorizedTariff: null,
      expectedAmount: null,
      economicDifference: null,
    },
  };
}

/** Filtros de presentación: no recalculan referencias ni agregan una línea por cada señal. */
export function filterAuditRows(
  rows,
  { search = '', category = 'all', service = '', unit = '', contractorCode = '', universe = '', month = '' } = {},
) {
  const normalize = (text) =>
    String(text ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const query = normalize(search).trim();
  return rows.filter((row) => {
    if (Object.entries({ service, unit, contractorCode, universe, month }).some(([key, value]) => value && row[key] !== value))
      return false;
    if (category === 'observed' && !row.observations.length) return false;
    if (category === 'insufficient' && row.referenceSufficient) return false;
    if (
      category === 'statistical' &&
      !row.observations.some((item) => ['REPORTED_OUTLIER', 'EFFECTIVE_OUTLIER'].includes(item.rule))
    )
      return false;
    if (
      category === 'repeated' &&
      !row.observations.some((item) => ['EXACT_REPEAT', 'CROSS_INVOICE', 'DIFFERENT_RATE'].includes(item.rule))
    )
      return false;
    if (
      !['all', 'observed', 'insufficient', 'statistical', 'repeated'].includes(category) &&
      !row.observations.some((item) => item.rule === category)
    )
      return false;
    return (
      !query ||
      normalize(
        [
          row.producerCode,
          row.producerName,
          row.hacienda,
          row.suerte,
          row.labor,
          row.service,
          row.serviceName,
          row.period,
          row.pFact,
          row.sourceFile,
          row.sourceSheet,
          row.sourceRow,
        ].join(' '),
      ).includes(query)
    );
  });
}
