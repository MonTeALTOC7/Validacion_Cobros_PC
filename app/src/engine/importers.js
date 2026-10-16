// Importadores de los reportes Excel de SIAGRI (Nómina, Prefactura, Maestro, Revisión por Correo).
//
// Cada importador:
// - localiza la hoja (REPORTE o la primera que tenga las columnas requeridas);
// - resuelve encabezados sin depender de mayúsculas, tildes ni espacios extra;
// - normaliza las filas y registra por qué se descartó cada fila no utilizable;
// - devuelve metadatos del archivo (SHA-256, fechas, semanas) para trazabilidad.
//
// Identificador de fila: hash del contenido completo de la fila + número de aparición. Es estable
// aunque cambie el nombre del archivo o el orden de las filas, y no depende de la zona horaria del equipo.
import { SSF, read as readWorkbook, utils as XLSXUtils } from 'xlsx';
import {
  biffSerialToDate,
  cleanCode,
  extractContractorCode,
  hashId,
  localWallToManagua,
  normalizeSuerte,
  normalizeText,
  parseNumberCell,
  toIsoDate,
  toNumber,
  xlsxSerialToDate,
} from './normalize';
import { operationalYear, parsePeriodoText } from './periods';

export const PAYROLL_REQUIRED_COLUMNS = [
  'Hacienda',
  'Nombre Hacienda',
  'Suerte',
  'Semana',
  'Fecha',
  'Labor',
  'Unidad de Medida',
  'Servicio',
  'Unidades',
];
export const PREFACTURA_REQUIRED_COLUMNS = [
  'Semana',
  'Fecha',
  'Nombre Hacienda',
  'Ste',
  'Labor',
  'Servicio SAP',
  'Unidades',
  'UM',
  'P.FACT',
  'Contratista',
];
export const REVIEW_REQUIRED_COLUMNS = [
  'AÑO',
  'SEM.',
  'Nombre Hacienda',
  'STE.',
  'LAB',
  'Nombre Servicio',
  'UM',
  'PRESTADOR',
  'TOTAL',
  'TARIFA',
  'UND',
];

/** Variantes de encabezado observadas o razonables para una misma columna. */
const COLUMN_ALIASES = {
  'Nombre Grp.Tenencia': ['Grp.Tenencia', 'Grupo Tenencia'],
  'Area de la Suerte': ['Área de la Suerte'],
};

export const SKIP_REASON_LABELS = {
  date: 'Fecha vacía o inválida',
  hacienda: 'Hacienda vacía',
  service: 'Servicio vacío',
  unit: 'Unidad de medida vacía',
  week: 'Semana fuera de 1–53',
  unitsZero: 'Unidades en cero o vacías',
  unitsInvalid: 'Unidades no numéricas',
  year: 'Año fuera de rango',
  labor: 'Labor vacía',
};

const text = (value) => String(value ?? '').trim();
const headerKey = (header) => normalizeText(header).replace(/\s+/g, '');

// ---------------------------------------------------------------------------------------------
// Lectura genérica

const sheetRows = (workbook, sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSXUtils.sheet_to_json(sheet, { defval: '', raw: true }) : [];
};

/** Mapa columna canónica → encabezado real del archivo. */
const resolveHeaders = (headers, wanted) => {
  const byKey = new Map(headers.map((header) => [headerKey(header), header]));
  const resolved = {};
  for (const column of wanted) {
    const candidates = [column, ...(COLUMN_ALIASES[column] ?? [])];
    const found = candidates.map((candidate) => byKey.get(headerKey(candidate))).find(Boolean);
    if (found !== undefined) resolved[column] = found;
  }
  return resolved;
};

/**
 * Hoja de trabajo: "REPORTE" si existe (sin importar mayúsculas); si no, la primera hoja que tenga
 * todas las columnas requeridas. Lanza un error descriptivo si ninguna sirve.
 */
const pickReportSheet = (workbook, required, label) => {
  const names = workbook.SheetNames;
  const preferred = names.find((name) => normalizeText(name) === 'REPORTE');
  const ordered = preferred ? [preferred, ...names.filter((name) => name !== preferred)] : names;
  let firstError = null;
  for (const name of ordered) {
    const raw = sheetRows(workbook, name);
    if (!raw.length) {
      firstError ??= `${label}: la hoja ${name} no contiene registros.`;
      continue;
    }
    const headers = Object.keys(raw[0]);
    const columns = resolveHeaders(headers, required);
    const missing = required.filter((column) => !(column in columns));
    if (!missing.length) return { sheetName: name, raw, headers };
    firstError ??= `${label}: faltan columnas requeridas en la hoja ${name}: ${missing.join(', ')}.`;
  }
  throw new Error(firstError ?? `${label}: el libro no contiene hojas.`);
};

const sha256Hex = async (buffer) => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

/** Aplica `convert` a cada celda de las hojas del libro. */
const eachCell = (workbook, convert) => {
  for (const sheet of Object.values(workbook.Sheets))
    for (const [address, cell] of Object.entries(sheet)) if (address[0] !== '!' && cell) convert(cell);
};

/**
 * Lee el libro con las fechas independientes de la zona horaria del equipo (ver normalize.js).
 * - .xlsx (ZIP) y .xls (BIFF): se leen los seriales de Excel y se convierten las celdas con formato de fecha, el
 *   mismo criterio con que SheetJS (cellDates) las convertía.
 * - Otros formatos (HTML, XML, CSV): SheetJS crea la fecha desde el texto con la hora del equipo; se toma esa
 *   hora de pared.
 */
export const readExcelWorkbook = (buffer) => {
  const bytes = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  const serialToDate =
    bytes[0] === 0x50 && bytes[1] === 0x4b ? xlsxSerialToDate : bytes[0] === 0xd0 && bytes[1] === 0xcf ? biffSerialToDate : null;
  if (!serialToDate) {
    const workbook = readWorkbook(buffer, { type: 'array', cellDates: true });
    eachCell(workbook, (cell) => {
      if (cell.t === 'd' && cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) cell.v = localWallToManagua(cell.v);
    });
    return workbook;
  }
  const workbook = readWorkbook(buffer, { type: 'array', cellDates: false, cellNF: true });
  eachCell(workbook, (cell) => {
    if (cell.t !== 'n' || !cell.z || !SSF.is_date(cell.z)) return;
    const date = serialToDate(cell.v);
    if (date && !Number.isNaN(date.getTime())) {
      cell.t = 'd';
      cell.v = date;
    }
  });
  return workbook;
};

const openWorkbook = async (file) => {
  const buffer = await file.arrayBuffer();
  return { buffer, workbook: readExcelWorkbook(buffer) };
};

/** Lector de celdas por nombre canónico de columna. */
const cellReader = (headers, columns) => {
  const resolved = resolveHeaders(headers, columns);
  return (row, column) => (column in resolved ? row[resolved[column]] : '');
};

/** Identificadores estables por contenido (con número de aparición para filas idénticas). */
const stableIdFactory = (kind) => {
  const seen = new Map();
  return (raw) => {
    const signature = JSON.stringify(Object.entries(raw));
    const occurrence = (seen.get(signature) ?? 0) + 1;
    seen.set(signature, occurrence);
    return hashId(kind, signature, occurrence);
  };
};

const skipReasonOf = (row, unitsCell) => {
  if (!row.date) return 'date';
  if (!row.hacienda) return 'hacienda';
  if (!row.service) return 'service';
  if (!row.unit) return 'unit';
  if (!(row.week >= 1 && row.week <= 53)) return 'week';
  if (!unitsCell.valid) return 'unitsInvalid';
  if (row.units === 0) return 'unitsZero';
  return null;
};

const countReasons = (reasons) => {
  const counts = {};
  reasons.forEach((reason) => {
    counts[reason] = (counts[reason] ?? 0) + 1;
  });
  return counts;
};

const buildFileMetadata = async (file, kind, buffer, rows) => {
  const dates = rows
    .map((row) => row.date)
    .filter((date) => !!date)
    .sort();
  const weeks = rows.map((row) => row.week).filter((week) => !!week && Number.isFinite(week));
  const years = [...new Set(rows.map((row) => row.year).filter((year) => year != null))].sort();
  return {
    kind,
    name: file.name,
    size: file.size,
    modified: file.lastModified,
    importedAt: new Date().toISOString(),
    hash: await sha256Hex(buffer),
    rows: rows.length,
    source: 'UPLOADED',
    validation: 'RECOGNIZED',
    dateStart: dates[0],
    dateEnd: dates.at(-1),
    weekStart: weeks.length ? Math.min(...weeks) : undefined,
    weekEnd: weeks.length ? Math.max(...weeks) : undefined,
    years,
  };
};

/** Lectura común de reportes de movimientos (Nómina y Prefactura). */
const parseMovementReport = async (file, { kind, label, required, optional, mapRow }) => {
  const { buffer, workbook } = await openWorkbook(file);
  const { sheetName, raw, headers } = pickReportSheet(workbook, required, label);
  const read = cellReader(headers, [...required, ...optional]);
  const nextId = stableIdFactory(kind);
  const rows = [];
  const reasons = [];
  const skippedExamples = [];
  raw.forEach((source, index) => {
    const unitsCell = parseNumberCell(read(source, 'Unidades'));
    const row = mapRow(read, source);
    row.units = unitsCell.value;
    const reason = skipReasonOf(row, unitsCell);
    if (reason) {
      reasons.push(reason);
      if (skippedExamples.length < 20) skippedExamples.push({ row: index + 2, reason });
      return;
    }
    rows.push({
      id: nextId(source),
      sourceRow: index + 2,
      ...row,
      year: operationalYear(row.date, row.week),
      sourceFile: file.name,
      sourceSheet: sheetName,
    });
  });
  if (!rows.length) throw new Error(`${label}: no hay filas utilizables. Se conserva el archivo anterior.`);
  return {
    rows,
    file: {
      ...(await buildFileMetadata(file, kind, buffer, rows)),
      sheet: sheetName,
      rawRows: raw.length,
      skippedRows: raw.length - rows.length,
      skipReasons: countReasons(reasons),
      skippedExamples,
    },
  };
};

// ---------------------------------------------------------------------------------------------
// Nómina: base diaria de labores manuales

export const parsePayrollFile = (file) =>
  parseMovementReport(file, {
    kind: 'payroll',
    label: 'Nómina',
    required: PAYROLL_REQUIRED_COLUMNS,
    optional: ['Nombre Labor', 'Nombre Servicio', 'Tarifa', 'Nombre Trabajador', 'Doc'],
    mapRow: (read, source) => ({
      week: toNumber(read(source, 'Semana')),
      date: toIsoDate(read(source, 'Fecha')),
      haciendaCode: cleanCode(read(source, 'Hacienda')),
      hacienda: normalizeText(read(source, 'Nombre Hacienda')),
      suerte: normalizeSuerte(read(source, 'Suerte')),
      labor: normalizeText(read(source, 'Labor')),
      laborName: text(read(source, 'Nombre Labor')),
      service: cleanCode(read(source, 'Servicio')).toUpperCase(),
      serviceName: text(read(source, 'Nombre Servicio')),
      unit: normalizeText(read(source, 'Unidad de Medida')),
      units: 0,
      payrollTariff: toNumber(read(source, 'Tarifa')),
      worker: text(read(source, 'Nombre Trabajador')),
      doc: cleanCode(read(source, 'Doc')),
    }),
  });

// ---------------------------------------------------------------------------------------------
// Prefactura: cobros emitidos con número P.FACT

/** "PANSACO   FACTURA :15837" → { name: "PANSACO", invoice: "15837" }. */
export const splitProducerInvoice = (value) => {
  const raw = text(value);
  const match = /^(.*?)\s*FACTURA\s*:\s*(\S+)\s*$/i.exec(raw);
  return match ? { name: match[1].trim(), invoice: match[2] } : { name: raw, invoice: '' };
};

export const parsePrefacturaFile = (file) =>
  parseMovementReport(file, {
    kind: 'prefactura',
    label: 'Prefactura',
    required: PREFACTURA_REQUIRED_COLUMNS,
    optional: [
      'Hda',
      'Descripcion',
      'Nombre Servicio',
      'Tarifa',
      'Total',
      'Productor',
      'Nombre Productor',
      'Periodo',
      'Area de la Suerte',
      'Nombre Grp.Tenencia',
      'Interface',
    ],
    mapRow: (read, source) => {
      const producer = text(read(source, 'Nombre Productor'));
      const { name, invoice } = splitProducerInvoice(producer);
      const periodo = parsePeriodoText(read(source, 'Periodo'));
      const lotArea = parseNumberCell(read(source, 'Area de la Suerte'));
      return {
        week: toNumber(read(source, 'Semana')),
        date: toIsoDate(read(source, 'Fecha')),
        haciendaCode: cleanCode(read(source, 'Hda')),
        hacienda: normalizeText(read(source, 'Nombre Hacienda')),
        suerte: normalizeSuerte(read(source, 'Ste')),
        labor: normalizeText(read(source, 'Labor')),
        laborName: text(read(source, 'Descripcion')),
        service: cleanCode(read(source, 'Servicio SAP')).toUpperCase(),
        serviceName: text(read(source, 'Nombre Servicio')),
        unit: normalizeText(read(source, 'UM')),
        units: 0,
        tariff: toNumber(read(source, 'Tarifa')),
        total: toNumber(read(source, 'Total')),
        pFact: cleanCode(read(source, 'P.FACT')),
        producerCode: cleanCode(read(source, 'Productor')),
        producer,
        contractorCode: extractContractorCode(read(source, 'Contratista')),
        contractor: text(read(source, 'Contratista')),
        producerName: normalizeText(name),
        invoice,
        periodStart: periodo && periodo.week === toNumber(read(source, 'Semana')) ? periodo.start : '',
        periodEnd: periodo && periodo.week === toNumber(read(source, 'Semana')) ? periodo.end : '',
        lotArea: lotArea.valid && lotArea.value > 0 ? lotArea.value : null,
        tenureGroup: text(read(source, 'Nombre Grp.Tenencia')),
        interfaceStatus: text(read(source, 'Interface')),
      };
    },
  });

// ---------------------------------------------------------------------------------------------
// Cronológico Maestro: todas las hojas con columna "Hacienda"

export const parseMasterFile = async (file) => {
  const { buffer, workbook } = await openWorkbook(file);
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const raw = sheetRows(workbook, sheetName);
    if (!raw.length) continue;
    const headers = Object.keys(raw[0]);
    const columns = resolveHeaders(headers, ['Hacienda']);
    if (!('Hacienda' in columns)) continue;
    const read = cellReader(headers, [
      'Hacienda',
      'Suerte',
      'Cod',
      'Tenencia',
      'ERP',
      'ZONA',
      'Estado',
      'F. Siembra',
      'F. Ult. Cte',
      'Area',
    ]);
    raw.forEach((row, index) => {
      const hacienda = normalizeText(read(row, 'Hacienda'));
      const suerte = normalizeSuerte(read(row, 'Suerte'));
      if (!hacienda || !suerte) return;
      const planting = read(row, 'F. Siembra');
      const lastCut = read(row, 'F. Ult. Cte');
      rows.push({
        id: hashId('master', file.name, sheetName, index + 2),
        sourceRow: index + 2,
        sheet: sheetName,
        haciendaCode: cleanCode(read(row, 'Cod')),
        hacienda,
        suerte,
        tenure: normalizeText(read(row, 'Tenencia')),
        erp: cleanCode(read(row, 'ERP')),
        zone: text(read(row, 'ZONA')),
        status: text(read(row, 'Estado')),
        plantingDate: planting ? toIsoDate(planting) : '',
        lastCutDate: lastCut ? toIsoDate(lastCut) : '',
        area: toNumber(read(row, 'Area')),
        producerScope: normalizeText(sheetName).includes('PRODUCTOR') || normalizeText(read(row, 'ZONA')).includes('PRODUCTOR'),
      });
    });
  }
  if (!rows.length) throw new Error('Maestro: no se encontraron hojas con Hacienda y Suerte.');
  return { rows, file: await buildFileMetadata(file, 'master', buffer, rows) };
};

// ---------------------------------------------------------------------------------------------
// Archivo de ejemplo (opcional, solo referencia)

export const parseExampleFile = async (file) => {
  const { buffer, workbook } = await openWorkbook(file);
  const rows = workbook.SheetNames.flatMap((sheetName) => sheetRows(workbook, sheetName));
  return { rows, file: await buildFileMetadata(file, 'example', buffer, rows) };
};

// ---------------------------------------------------------------------------------------------
// Revisión por Correo: reporte de cobros recibido para validar contra Nómina

export const parseReviewFile = async (file) => {
  const { buffer, workbook } = await openWorkbook(file);
  const { sheetName, raw, headers } = pickReportSheet(workbook, REVIEW_REQUIRED_COLUMNS, 'Revisión por Correo');
  const read = cellReader(headers, REVIEW_REQUIRED_COLUMNS);
  const nextId = stableIdFactory('review');
  const rows = [];
  const reasons = [];
  raw.forEach((source, index) => {
    const unitsCell = parseNumberCell(read(source, 'UND'));
    const row = {
      id: nextId(source),
      sourceRow: index + 2,
      year: toNumber(read(source, 'AÑO')),
      week: toNumber(read(source, 'SEM.')),
      hacienda: normalizeText(read(source, 'Nombre Hacienda')),
      suerte: normalizeSuerte(read(source, 'STE.')),
      labor: normalizeText(read(source, 'LAB')),
      serviceName: text(read(source, 'Nombre Servicio')),
      unit: normalizeText(read(source, 'UM')),
      units: unitsCell.value,
      tariff: toNumber(read(source, 'TARIFA')),
      total: toNumber(read(source, 'TOTAL')),
      contractorCode: extractContractorCode(read(source, 'PRESTADOR')),
      contractor: text(read(source, 'PRESTADOR')),
      sourceFile: file.name,
      sourceSheet: sheetName,
    };
    let reason = null;
    if (!(row.year >= 2000)) reason = 'year';
    else if (!(row.week >= 1 && row.week <= 53)) reason = 'week';
    else if (!row.hacienda) reason = 'hacienda';
    else if (!row.labor) reason = 'labor';
    else if (!row.unit) reason = 'unit';
    else if (!unitsCell.valid) reason = 'unitsInvalid';
    else if (row.units === 0) reason = 'unitsZero';
    if (reason) reasons.push(reason);
    else rows.push(row);
  });
  if (!rows.length) throw new Error('Revisión por Correo: no se encontraron registros utilizables.');
  if (new Set(rows.map((row) => row.year)).size !== 1) {
    throw new Error('Revisión por Correo: seleccione un reporte de un solo año para no mezclar semanas de distintos años.');
  }
  const weeks = rows.map((row) => row.week);
  return {
    rows,
    file: {
      name: file.name,
      size: file.size,
      importedAt: new Date().toISOString(),
      hash: await sha256Hex(buffer),
      rows: rows.length,
      weekStart: Math.min(...weeks),
      weekEnd: Math.max(...weeks),
      source: 'UPLOADED',
      sheet: sheetName,
      rawRows: raw.length,
      skippedRows: raw.length - rows.length,
      skipReasons: countReasons(reasons),
    },
  };
};

// ---------------------------------------------------------------------------------------------
// Compatibilidad con datos guardados por versiones anteriores (≤ v0.7)

/**
 * Completa campos derivables en filas guardadas por versiones anteriores sin modificar los existentes:
 * año operativo, nombre de productor y número de factura. No inventa datos no derivables.
 */
export const upgradeInputs = (inputs) => {
  if (!inputs) return inputs;
  let changed = false;
  const upgradeMovement = (row) => {
    if (row.year !== undefined && (row.producerName !== undefined || !('producer' in row))) return row;
    changed = true;
    const next = { ...row };
    if (next.year === undefined) next.year = operationalYear(row.date, row.week);
    if ('producer' in row && next.producerName === undefined) {
      const { name, invoice } = splitProducerInvoice(row.producer);
      next.producerName = normalizeText(name);
      next.invoice = invoice;
    }
    return next;
  };
  const payroll = inputs.payroll.map(upgradeMovement);
  const prefactura = inputs.prefactura.map(upgradeMovement);
  return changed ? { ...inputs, payroll, prefactura } : inputs;
};

// ---------------------------------------------------------------------------------------------
// Comparación de un archivo entrante contra el vigente (antes de confirmar el reemplazo)

/**
 * Campos que identifican el contenido de una fila para comparar versiones de un reporte.
 * Se usa una lista fija para que filas guardadas por versiones anteriores (sin campos nuevos)
 * no aparezcan como modificadas.
 */
const SIGNATURE_FIELDS = [
  'week',
  'date',
  'haciendaCode',
  'hacienda',
  'suerte',
  'labor',
  'laborName',
  'service',
  'serviceName',
  'unit',
  'units',
  'payrollTariff',
  'worker',
  'tariff',
  'total',
  'pFact',
  'producerCode',
  'producer',
  'contractorCode',
  'contractor',
  'tenure',
  'erp',
  'zone',
  'status',
  'plantingDate',
  'lastCutDate',
  'area',
  'producerScope',
];
const rowSignature = (row) =>
  JSON.stringify(SIGNATURE_FIELDS.filter((field) => field in row).map((field) => [field, row[field]]));

const countSignatures = (rows) => {
  const counts = new Map();
  rows.forEach((row) => {
    const signature = rowSignature(row);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  });
  return counts;
};

/** Ejemplos (máximo 8) de filas de `rows` que no tienen pareja en `otherCounts`. */
const unmatchedExamples = (rows, otherCounts) => {
  const remaining = new Map(otherCounts);
  const examples = [];
  rows.forEach((row) => {
    const signature = rowSignature(row);
    const available = remaining.get(signature) ?? 0;
    if (available) remaining.set(signature, available - 1);
    else if (examples.length < 8) examples.push(row);
  });
  return examples;
};

const periodOf = (row) => (row.year != null ? `${row.year}-S${String(row.week).padStart(2, '0')}` : row.week);

export const diffRows = (previous, incoming) => {
  const previousCounts = countSignatures(previous);
  const incomingCounts = countSignatures(incoming);
  let unchanged = 0;
  incomingCounts.forEach((count, signature) => {
    unchanged += Math.min(count, previousCounts.get(signature) ?? 0);
  });
  const previousPeriods = new Set(previous.map(periodOf));
  const incomingPeriods = new Set(incoming.map(periodOf));
  const newWeeks = [...new Set(incoming.map((row) => row.week).filter((week) => !!week))]
    .filter((week) => !previous.some((row) => row.week === week))
    .sort((a, b) => a - b);
  const sortPeriods = (list) => list.sort((a, b) => String(a).localeCompare(String(b)));
  return {
    added: incoming.length - unchanged,
    removed: previous.length - unchanged,
    unchanged,
    addedExamples: unmatchedExamples(incoming, previousCounts),
    removedExamples: unmatchedExamples(previous, incomingCounts),
    duplicates: [...incomingCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    newWeeks,
    newPeriods: sortPeriods([...incomingPeriods].filter((period) => !previousPeriods.has(period) && period !== undefined)),
    missingPeriods: sortPeriods([...previousPeriods].filter((period) => !incomingPeriods.has(period) && period !== undefined)),
  };
};

/** Total de unidades por UM de un conjunto de filas. */
export const unitTotals = (rows) => {
  const totals = new Map();
  rows.forEach((row) => {
    if (row.unit && typeof row.units === 'number') totals.set(row.unit, (totals.get(row.unit) ?? 0) + row.units);
  });
  return [...totals].sort(([a], [b]) => a.localeCompare(b));
};
