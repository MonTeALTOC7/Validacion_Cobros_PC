// Calidad de datos: problemas detectables en los reportes cargados, con ejemplos rastreables a la
// fila de origen. Nada se corrige ni se descarta automáticamente: solo se informa.
import { CASUR_CONTRACTOR, DIRECT_SERVICES, MECHANIZED_SERVICES, TPS_BILLED_SERVICE, TPS_STAGE_SERVICES } from './constants';
import { SKIP_REASON_LABELS } from './importers';
import { groupBy, lotKey, round } from './normalize';
import { buildOfficialCalendar, parsePeriodKey, periodKey } from './periods';
import { classifyRepetitions } from './repetitions';
import { buildTariffProfile, isAtypicalTariff } from './tariffs';

const MAX_EXAMPLES = 12;
/** Número legible para los ejemplos (evita 333.28000000000003). */
const num = (value) => (Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : String(value));
const KIND_LABELS = { payroll: 'Nómina', prefactura: 'Prefactura', master: 'Maestro' };

const example = (source, row, detail) => ({
  source,
  file: row.sourceFile ?? '',
  row: row.sourceRow,
  period: row.year != null ? periodKey(row.year, row.week) : `S${row.week}`,
  date: row.date,
  lot: `${row.hacienda} · ${row.suerte}`,
  detail,
});

const issue = (id, severity, title, detail, items) => ({
  id,
  severity,
  title,
  detail,
  count: items.length,
  examples: items.slice(0, MAX_EXAMPLES),
});

/**
 * @param inputs datos cargados (payroll, prefactura, master, files)
 * @param options { atypicalTariffPct }
 * @returns lista de problemas { id, severity, title, detail, count, examples[] }
 */
export const assessDataQuality = (inputs, options = {}) => {
  const issues = [];
  const { payroll, prefactura, master, files } = inputs;

  // 1. Filas descartadas por el importador, con su motivo
  for (const file of files) {
    if (!file.skippedRows) continue;
    const reasons = Object.entries(file.skipReasons ?? {})
      .map(([reason, count]) => `${SKIP_REASON_LABELS[reason] ?? reason}: ${count}`)
      .join(' · ');
    issues.push({
      id: `skipped-${file.kind}`,
      severity: 'warning',
      title: `${KIND_LABELS[file.kind] ?? file.kind}: ${file.skippedRows} fila(s) no utilizables`,
      detail: reasons || 'Filas sin fecha, hacienda, servicio, UM, semana válida o unidades.',
      count: file.skippedRows,
      examples: (file.skippedExamples ?? []).map((item) => ({
        source: KIND_LABELS[file.kind],
        file: file.name,
        row: item.row,
        detail: SKIP_REASON_LABELS[item.reason] ?? item.reason,
      })),
    });
  }

  // 2. Fechas fuera del rango de su semana.
  //    Oficial: columna Periodo de la Prefactura. Inferido: para semanas del mismo año operativo sin Periodo
  //    (p. ej. S01 o semanas posteriores a la última Prefactura), se extrapola el calendario oficial asumiendo
  //    semanas consecutivas de lunes a domingo, que es lo verificado en las 38 semanas publicadas.
  const calendar = buildOfficialCalendar(prefactura);
  if (calendar.size) {
    const anchors = new Map();
    for (const [key, range] of calendar) {
      const { year, week } = parsePeriodKey(key);
      if (!anchors.has(year) || week < anchors.get(year).week) anchors.set(year, { week, start: range.start });
    }
    const inferredRange = (row) => {
      const anchor = anchors.get(row.year);
      if (!anchor) return null;
      const start = new Date(`${anchor.start}T12:00:00Z`);
      start.setUTCDate(start.getUTCDate() + 7 * (row.week - anchor.week));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    };
    const outside = [];
    const outsideInferred = [];
    for (const [source, rows] of [
      ['Nómina', payroll],
      ['Prefactura', prefactura],
    ]) {
      rows.forEach((row) => {
        const official = calendar.get(periodKey(row.year, row.week));
        if (official) {
          if (row.date < official.start || row.date > official.end) {
            outside.push(
              example(source, row, `Fecha ${row.date} fuera de la semana oficial ${official.start} → ${official.end}`),
            );
          }
          return;
        }
        const inferred = inferredRange(row);
        if (inferred && (row.date < inferred.start || row.date > inferred.end)) {
          outsideInferred.push(
            example(source, row, `Fecha ${row.date} fuera del rango inferido ${inferred.start} → ${inferred.end}`),
          );
        }
      });
    }
    if (outside.length) {
      issues.push(
        issue(
          'date-outside-week',
          'warning',
          'Fechas fuera de su semana operativa',
          'La fecha no cae dentro del rango que la Prefactura publica para esa semana (columna Periodo). La fila se concilia en la semana indicada por SIAGRI.',
          outside,
        ),
      );
    }
    if (outsideInferred.length) {
      issues.push(
        issue(
          'date-outside-inferred-week',
          'info',
          'Fechas fuera del rango inferido de su semana',
          'Semanas sin columna Periodo (anteriores o posteriores a la Prefactura cargada): el rango se infiere del calendario oficial (semanas consecutivas de lunes a domingo). Verifique la fecha o la semana en SIAGRI.',
          outsideInferred,
        ),
      );
    }
  }

  // 3. Repeticiones de Prefactura (clasificadas; ninguna se elimina ni se descuenta)
  const repetitions = classifyRepetitions(prefactura);
  const money = (value) => value.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const repetitionIssues = [
    [
      'DUPLICADO_EXACTO',
      'warning',
      (s) => `Prefactura: ${s.groups} grupo(s) de filas idénticas`,
      (s) =>
        `${s.extraRows} copia(s) extra por C$ ${money(s.extraAmount)} (incluidas en el total informado, sin descontar). Idénticas en todos los campos, incluidos Total y P.FACT.`,
    ],
    [
      'COBRO_EN_OTRA_PREFACTURA',
      'warning',
      (s) => `Prefactura: ${s.groups} cobro(s) repetido(s) en otra prefactura`,
      (s) =>
        `Mismo lote, fecha, servicio, cantidad, tarifa y total con P.FACT distinto. ${s.extraRows} copia(s) por C$ ${money(s.extraAmount)}, sin descontar.`,
    ],
    [
      'MISMA_CANTIDAD_TARIFA_DISTINTA',
      'info',
      (s) => `Prefactura: ${s.groups} grupo(s) con la misma cantidad y tarifas distintas`,
      () =>
        'Misma clave de cobro (fecha, lote, labor, servicio, P.FACT) y misma cantidad con tarifas distintas. Puede ser legítimo (tarifa normal y doble); revisar.',
    ],
    [
      'VARIAS_LINEAS_MISMA_CLAVE',
      'info',
      (s) => `Prefactura: ${s.groups} clave(s) de cobro con varias líneas`,
      () => 'Misma fecha, lote, servicio y P.FACT con cantidades distintas. Es habitual; se informa solo como dato.',
    ],
  ];
  for (const [kind, severity, title, detail] of repetitionIssues) {
    const summary = repetitions.summary[kind];
    if (!summary.groups) continue;
    const rows = repetitions.groups.filter((group) => group.kind === kind).flatMap((group) => group.rows);
    issues.push({
      ...issue(
        `repetition-${kind}`,
        severity,
        title(summary),
        detail(summary),
        rows.map((row) =>
          example(
            'Prefactura',
            row,
            `P.FACT ${row.pFact} · ${row.service} · ${num(row.units)} ${row.unit} × ${num(row.tariff)} = ${num(row.total)}`,
          ),
        ),
      ),
      count: kind === 'DUPLICADO_EXACTO' || kind === 'COBRO_EN_OTRA_PREFACTURA' ? summary.extraRows : summary.groups,
      amount: summary.extraAmount,
    });
  }

  // 4. P.FACT vacío
  const noInvoice = prefactura.filter((row) => !row.pFact.trim());
  if (noInvoice.length) {
    issues.push(
      issue(
        'prefactura-no-pfact',
        'critical',
        'Prefactura sin número P.FACT',
        'No acreditan prefactura emitida y bloquean el cierre de su semana.',
        noInvoice.map((row) => example('Prefactura', row, `${row.service} · ${row.units} ${row.unit}`)),
      ),
    );
  }

  // 5. Total distinto de Tarifa × Unidades
  const badTotals = prefactura.filter((row) => Math.abs(round(row.tariff * row.units, 2) - row.total) > 0.02);
  if (badTotals.length) {
    issues.push(
      issue(
        'prefactura-total',
        'warning',
        'Prefactura: Total distinto de Tarifa × Unidades',
        'Diferencia mayor a C$ 0.02 entre el total informado y la multiplicación.',
        badTotals.map((row) =>
          example(
            'Prefactura',
            row,
            `${num(row.units)} × ${num(row.tariff)} = ${round(row.units * row.tariff, 2)} ≠ ${num(row.total)}`,
          ),
        ),
      ),
    );
  }

  // 6. Tarifas poco frecuentes
  const profile = buildTariffProfile(prefactura, options.atypicalTariffPct);
  const atypical = prefactura.filter((row) => isAtypicalTariff(profile, row));
  if (atypical.length) {
    issues.push(
      issue(
        'tariff-atypical',
        'info',
        'Tarifas poco frecuentes',
        `Tarifas que representan menos del ${options.atypicalTariffPct ?? 5} % de las filas de su servicio y UM. Indicador para revisar; no implica error.`,
        atypical.map((row) => {
          const usual = profile.get(`${row.service}|${row.unit}`)?.mostFrequent;
          return example(
            'Prefactura',
            row,
            `${row.service} ${row.unit}: tarifa ${num(row.tariff)} (más frecuente ${num(usual)})`,
          );
        }),
      ),
    );
  }

  // 7. Lotes no encontrados en el Maestro
  if (master.length) {
    const masterLots = new Set(master.map((row) => lotKey(row.hacienda, row.suerte)));
    const missing = new Map();
    for (const [source, rows] of [
      ['Nómina', payroll],
      ['Prefactura', prefactura],
    ]) {
      rows.forEach((row) => {
        const key = lotKey(row.hacienda, row.suerte);
        if (!masterLots.has(key) && !missing.has(key))
          missing.set(key, example(source, row, 'Hacienda/Suerte no está en el Maestro'));
      });
    }
    if (missing.size) {
      issues.push(
        issue(
          'lots-missing',
          'info',
          `${missing.size} lote(s) sin coincidencia exacta en el Maestro`,
          'Se validan por Hacienda (suerte histórica) cuando el parámetro lo permite. Revise si son suertes nuevas o códigos distintos.',
          [...missing.values()],
        ),
      );
    }
  }

  // 8. Código de hacienda con más de un nombre (el motor concilia por nombre)
  const namesByCode = groupBy(
    [...payroll, ...prefactura].filter((row) => row.haciendaCode),
    (row) => row.haciendaCode,
  );
  const inconsistent = [...namesByCode].filter(([, rows]) => new Set(rows.map((row) => row.hacienda)).size > 1);
  if (inconsistent.length) {
    issues.push(
      issue(
        'hacienda-names',
        'critical',
        'Código de hacienda con nombres distintos',
        'La conciliación usa el nombre de hacienda; nombres distintos para un mismo código impiden el cruce Nómina–Prefactura.',
        inconsistent.map(([code, rows]) => ({
          source: 'Nómina/Prefactura',
          detail: `Código ${code}: ${[...new Set(rows.map((row) => row.hacienda))].join(' / ')}`,
        })),
      ),
    );
  }

  // 9. Servicios sin regla de conciliación
  const known = new Set([...DIRECT_SERVICES, ...TPS_STAGE_SERVICES, ...MECHANIZED_SERVICES, TPS_BILLED_SERVICE]);
  const unknownPayroll = [
    ...new Set(
      payroll
        .filter((row) => !DIRECT_SERVICES.has(row.service) && !TPS_STAGE_SERVICES.has(row.service))
        .map((row) => row.service),
    ),
  ];
  const unknownBilled = [
    ...new Set(
      prefactura.filter((row) => row.contractorCode === CASUR_CONTRACTOR && !known.has(row.service)).map((row) => row.service),
    ),
  ];
  if (unknownPayroll.length || unknownBilled.length) {
    issues.push({
      id: 'services-unknown',
      severity: 'warning',
      title: 'Servicios sin regla de conciliación',
      detail: `Nómina: ${unknownPayroll.join(', ') || 'ninguno'} · Prefactura CS9999: ${unknownBilled.join(', ') || 'ninguno'}. Se muestran como "Servicio sin clasificar".`,
      count: unknownPayroll.length + unknownBilled.length,
      examples: [],
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
};
