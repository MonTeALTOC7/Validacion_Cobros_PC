// Exportación local de la auditoría. Conserva filas únicas y datos fuente tal como los recibió el motor.
import { utils, write } from 'xlsx';
import { downloadBlob } from '../../lib/format';
import { caseGuidance, reviewReasons, reviewRows } from './operationalPresentation';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GENERATED_AT = () => new Date().toISOString();
const DAY = () => new Date().toISOString().slice(0, 10);
const sum = (rows) => rows.reduce((value, row) => value + (Number.isFinite(row.total) ? row.total : 0), 0);
const displayTotal = (rows) => Number(sum(rows).toFixed(2));
const text = (value) => (value == null ? '' : String(value));

const COLUMNS = {
  line: [
    ['Identificador de auditoría', 'auditId'],
    ['Identificador fuente', 'id'],
    ['Año', 'year'],
    ['Semana', 'week'],
    ['Período', 'period'],
    ['Fecha', 'date'],
    ['Productor código', 'producerCode'],
    ['Productor', 'producerName'],
    ['Texto productor fuente', 'producer'],
    ['Factura identificada', 'invoice'],
    ['Hacienda código', 'haciendaCode'],
    ['Hacienda', 'hacienda'],
    ['Suerte', 'suerte'],
    ['Labor', 'labor'],
    ['Descripción labor', 'laborName'],
    ['Servicio', 'service'],
    ['Nombre servicio', 'serviceName'],
    ['UM', 'unit'],
    ['Unidades', 'units'],
    ['Tarifa reportada', 'tariff'],
    ['Tarifa efectiva', 'effective'],
    ['Total Prefactura', 'total'],
    ['P.FACT', 'pFact'],
    ['Contratista código', 'contractorCode'],
    ['Contratista', 'contractor'],
    ['Período desde fuente', 'periodStart'],
    ['Período hasta fuente', 'periodEnd'],
    ['Área de suerte', 'lotArea'],
    ['Grupo de tenencia', 'tenureGroup'],
    ['Estado de interfaz fuente', 'interfaceStatus'],
    ['Universo', 'universe'],
    ['Mes', 'month'],
    ['Jornada', 'jornada'],
    ['Base de cobro', 'billingBase'],
    ['Archivo', 'sourceFile'],
    ['Hoja', 'sourceSheet'],
    ['Fila origen', 'sourceRow'],
    ['Tarifa autorizada', 'authorizedTariff'],
    ['Importe esperado', 'expectedAmount'],
    ['Diferencia económica', 'economicDifference'],
    ['Diferencia presentación', 'presentationDifference'],
    ['Comparables suficientes', 'referenceSufficient'],
    ['Cantidad de observaciones', 'observationCount'],
    ['Motivos', 'reasons'],
    ['Explicaciones', 'explanations'],
  ],
};
const CURRENCY_COLUMNS = new Set([
  'Total informado en este alcance (C$)',
  'Importe informado de casos únicos (C$)',
  'Importe con referencia insuficiente (C$)',
  'Total Prefactura',
  'Total informado C$',
  'Importe NO es sobrecobro',
  'Total informativo repetido C$',
]);
const RATE_COLUMNS = new Set([
  'Tarifa reportada',
  'Tarifa efectiva',
  'Tarifa autorizada',
  'Diferencia presentación',
  'Tarifa reportada mediana',
  'MAD reportada',
  'Límite inferior reportada',
  'Límite superior reportada',
  'Tarifa efectiva mediana',
  'MAD efectiva',
  'Límite inferior efectiva',
  'Mediana reportada observada',
  'Mediana efectiva observada',
]);

const displayRow = (row) => {
  const reasons = reviewReasons(row);
  return Object.fromEntries(
    COLUMNS.line.map(([label, key]) => [
      label,
      key === 'reasons'
        ? reasons.join(' · ')
        : key === 'explanations'
          ? row.observations.map((item) => item.explanation).join(' · ')
          : key === 'observationCount'
            ? row.observations.length
            : key === 'pFact'
              ? text(row[key])
              : (row[key] ?? ''),
    ]),
  );
};

const widths = (rows, headers) =>
  headers.map((header) => ({
    wch: Math.min(
      46,
      Math.max(12, String(header).length + 2, ...rows.slice(0, 500).map((row) => String(row[header] ?? '').length + 2)),
    ),
  }));

function appendSheet(workbook, name, rows, warning = '') {
  const safeRows = rows.length ? rows : [{ Aviso: 'Sin registros en este alcance.' }];
  const sheet = utils.json_to_sheet(safeRows);
  // Explicitly mark all textual values as strings. Source values can never become Excel formulas.
  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) continue;
    const cell = sheet[address];
    if (typeof cell.v === 'string') {
      cell.t = 's';
      delete cell.f;
    }
  }
  sheet['!cols'] = widths(safeRows, Object.keys(safeRows[0]));
  sheet['!autofilter'] = {
    ref: utils.encode_range({ s: { r: 0, c: 0 }, e: { r: safeRows.length, c: Object.keys(safeRows[0]).length - 1 } }),
  };
  const headings = Object.keys(safeRows[0]);
  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) continue;
    const cell = sheet[address];
    if (typeof cell.v !== 'number') continue;
    const heading = headings[utils.decode_cell(address).c];
    if (CURRENCY_COLUMNS.has(heading)) cell.z = '"C$" #,##0.00;[Red]("C$" #,##0.00)';
    else if (RATE_COLUMNS.has(heading)) cell.z = '#,##0.0000;[Red](#,##0.0000)';
    else if (heading?.endsWith('%')) cell.z = '0.00"%"';
  }
  if (warning) sheet.A1.c = [{ a: 'Control Tarjetas', t: warning }];
  utils.book_append_sheet(workbook, sheet, name);
}

const filtersText = (filters = {}) =>
  Object.entries(filters)
    .map(([key, value]) => `${key}: ${value || 'Todos'}`)
    .join(' · ');

export function buildTariffAuditWorkbook(
  audit,
  inputs,
  { rows = audit.rows, filters = {}, scope = 'complete', view = 'No especificada' } = {},
) {
  const selected = scope === 'complete' ? audit.rows : rows;
  const selectedIds = new Set(selected.map((row) => row.auditId));
  const review = reviewRows(selected);
  const populations = audit.populations.filter((population) => population.rowIds.some((id) => selectedIds.has(id)));
  const history = audit.history.filter((item) => item.before.rowIds.concat(item.after.rowIds).some((id) => selectedIds.has(id)));
  const source = inputs.files?.find((file) => file.kind === 'prefactura');
  const sourceFiles = inputs.files?.filter((file) => file.kind === 'prefactura') ?? [];
  const sourceRows = inputs.prefactura.length;
  const selectedTotal = displayTotal(selected);
  const reviewAmount = displayTotal(review);
  const insufficient = review.filter((row) => !row.referenceSufficient);
  const workbook = utils.book_new();
  workbook.Props = {
    Title: 'Auditoría de tarifas y cobros',
    Subject: 'Análisis descriptivo de Prefactura; no determina tarifa autorizada ni sobrecobro',
    Author: 'Validación de Cobros PC',
    CreatedDate: new Date(),
  };

  appendSheet(workbook, 'Resumen', [
    { Indicador: 'Alcance', Valor: scope === 'complete' ? 'Prefactura completa' : 'Selección filtrada' },
    { Indicador: 'Vista consultada', Valor: view },
    { Indicador: 'Generado', Valor: GENERATED_AT() },
    { Indicador: 'Archivos fuente', Valor: sourceFiles.map((file) => file.name).join(' · ') || 'No disponible' },
    {
      Indicador: 'Hojas fuente',
      Valor: sourceFiles.map((file) => `${file.name}: ${file.sheet ?? 'REPORTE'}`).join(' · ') || 'REPORTE',
    },
    {
      Indicador: 'SHA-256 fuente',
      Valor: sourceFiles.map((file) => `${file.name}: ${file.hash ?? 'No disponible'}`).join(' · ') || 'No disponible',
    },
    {
      Indicador:
        scope === 'complete'
          ? 'Filtros presentes en la vista (no aplicados al archivo completo)'
          : 'Filtros aplicados a esta selección',
      Valor: filtersText(filters) || 'Sin filtros',
    },
    { Indicador: 'Líneas en el archivo fuente', Valor: sourceRows },
    { Indicador: 'Líneas en este alcance', Valor: selected.length },
    { Indicador: 'Total informado en este alcance (C$)', Valor: selectedTotal },
    { Indicador: 'Casos únicos para revisión', Valor: review.length },
    { Indicador: 'Importe informado de casos únicos (C$)', Valor: reviewAmount },
    { Indicador: 'Con referencia insuficiente (subconjunto)', Valor: insufficient.length },
    { Indicador: 'Importe con referencia insuficiente (C$)', Valor: displayTotal(insufficient) },
    { Indicador: 'Casos y referencia insuficiente', Valor: 'Conjuntos relacionados: no sumar sus conteos ni importes.' },
    {
      Indicador: 'Población de referencias',
      Valor:
        scope === 'complete'
          ? 'Auditoría completa.'
          : 'Referencias e historial calculados sobre la población completa para no recalibrar por filtros.',
    },
    { Indicador: 'Tarifa autorizada / importe esperado / diferencia económica', Valor: 'No disponibles; no calculados.' },
    {
      Indicador: 'Metodología',
      Valor: `Mediana y MAD por servicio, labor, UM, contratista, universo, mes, jornada y base. Corte ${audit.config.cutoff}.`,
    },
    {
      Indicador: 'Limitaciones',
      Valor:
        'Comparables estadísticos descriptivos, no tarifas oficiales. Posible mezcla de jornadas/base. La revisión no confirma duplicidad ni sobrecobro.',
    },
    { Indicador: 'Filas descartadas por importador', Valor: source?.skippedRows ?? 0 },
  ]);

  appendSheet(workbook, 'Prefactura', selected.map(displayRow));
  appendSheet(
    workbook,
    'Revisión única',
    review.map((row) => {
      const population = audit.populations.find((item) => item.key === row.populationKey);
      const guidance = caseGuidance(row, population);
      return {
        'ID de auditoría': row.auditId,
        'Fila origen': row.sourceRow ?? '',
        Productor: row.producerName ?? '',
        Hacienda: row.hacienda ?? '',
        Suerte: row.suerte ?? '',
        Labor: row.labor ?? '',
        Servicio: row.service ?? '',
        Semana: row.period ?? '',
        'P.FACT': text(row.pFact),
        UM: row.unit ?? '',
        Unidades: row.units ?? '',
        'Tarifa reportada': row.tariff ?? '',
        'Tarifa efectiva': row.effective ?? '',
        'Total informado C$': row.total ?? '',
        Motivos: reviewReasons(row).join(' · '),
        'Qué se detectó': guidance.found,
        Explicación: guidance.why,
        'Acciones sugeridas': guidance.actions.join(' · '),
        'Importe NO es sobrecobro': row.total ?? '',
      };
    }),
  );

  appendSheet(
    workbook,
    'Motivos (no sumar)',
    selected.flatMap((row) =>
      row.observations.map((item) => ({
        'ID de auditoría': row.auditId,
        'Fila origen': row.sourceRow ?? '',
        'P.FACT': text(row.pFact),
        Motivo: item.rule,
        Prioridad: item.priority,
        Explicación: item.explanation,
        'Población comparable': item.populationKey ?? row.populationKey,
        Métrica: item.metric ?? '',
        'Valor del registro': item.metric ? (row[item.metric] ?? '') : '',
        'Referencia suficiente': row.referenceSufficient,
        'Total informativo repetido C$': row.total ?? '',
        Nota: 'Esta hoja tiene una fila por motivo; sus importes se duplican entre motivos. No sumar sin deduplicar por ID de auditoría.',
      })),
    ),
  );

  appendSheet(
    workbook,
    'Referencias mensuales',
    populations.map((item) => ({
      Servicio: item.service,
      Labor: item.labor,
      UM: item.unit,
      Contratista: item.contractorCode,
      Universo: item.universe,
      Jornada: item.jornada,
      'Base de cobro': item.billingBase,
      Mes: item.month,
      'Filas observadas': item.rows,
      'Tarifa reportada mediana': item.reported.median ?? '',
      'MAD reportada': item.reported.mad ?? '',
      'N reportada': item.reported.n,
      'Semanas reportada': item.reported.weeks,
      'Límite inferior reportada': item.reported.lower ?? '',
      'Límite superior reportada': item.reported.upper ?? '',
      'Referencia reportada suficiente': item.reported.sufficient,
      'Tarifa efectiva mediana': item.effective.median ?? '',
      'MAD efectiva': item.effective.mad ?? '',
      'N efectiva': item.effective.n,
      'Semanas efectiva': item.effective.weeks,
      'Límite inferior efectiva': item.effective.lower ?? '',
      'Límite superior efectiva': item.effective.upper ?? '',
      'Referencia efectiva suficiente': item.effective.sufficient,
      Método: item.reported.method,
      Nota: 'Medianas observadas; no son tarifas oficiales ni contractuales.',
    })),
  );

  appendSheet(
    workbook,
    'Evolución',
    history.flatMap((item) => [
      ...[
        ['Antes del corte', item.before],
        ['Desde el corte', item.after],
      ].map(([period, side]) => ({
        Servicio: item.service,
        Labor: item.labor,
        UM: item.unit,
        Contratista: item.contractorCode,
        Universo: item.universe,
        Jornada: item.jornada,
        'Base de cobro': item.billingBase,
        Tramo: period,
        Desde: side.from ?? '',
        Hasta: side.to ?? '',
        Registros: side.rows,
        'Muestras positivas': side.samples,
        'Mediana reportada observada': side.reportedMedian ?? '',
        'Mediana efectiva observada': side.effectiveMedian ?? '',
        'Cambio mediana reportada %': item.sufficient ? (item.reportedChange ?? '') : '',
        'Cambio mediana efectiva %': item.sufficient ? (item.effectiveChange ?? '') : '',
        'Muestras suficientes antes/después': item.sufficient,
        Nota: 'Cambio descriptivo de medianas; no indica vigencia ni reajuste autorizado.',
      })),
    ]),
  );

  appendSheet(
    workbook,
    'Evidencia',
    selected.map((row) => ({
      Productor: row.producerName ?? '',
      'Código productor': row.producerCode ?? '',
      Hacienda: row.hacienda ?? '',
      'Código hacienda': row.haciendaCode ?? '',
      Suerte: row.suerte ?? '',
      Servicio: row.service ?? '',
      Semana: row.period ?? '',
      'P.FACT': text(row.pFact),
      Archivo: row.sourceFile ?? source?.name ?? '',
      Hoja: row.sourceSheet ?? 'REPORTE',
      Fila: row.sourceRow ?? '',
    })),
  );

  return workbook;
}

export function exportTariffAuditWorkbook(audit, inputs, options = {}) {
  const workbook = buildTariffAuditWorkbook(audit, inputs, options);
  const data = write(workbook, { bookType: 'xlsx', type: 'array', compression: true, cellDates: true });
  const scope = options.scope === 'complete' ? 'completa' : 'seleccion';
  downloadBlob(new Blob([data], { type: XLSX_MIME }), `auditoria_tarifas_cobros_${scope}_${DAY()}.xlsx`);
}
