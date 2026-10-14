// Importadores de los reportes Excel de SIAGRI (Nómina, Prefactura, Maestro, Revisión por Correo).
// Cada importador valida columnas requeridas, normaliza las filas y devuelve metadatos del archivo
// (SHA-256, rango de fechas y semanas, filas no utilizables) para trazabilidad.
import { read as readWorkbook, utils as XLSXUtils } from 'xlsx';
import {
  cleanCode,
  extractContractorCode,
  hashId,
  normalizeSuerte,
  normalizeText,
  toIsoDate,
  toNumber,
} from './normalize';

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

const text = (value) => String(value ?? '').trim();

// ---------------------------------------------------------------------------------------------
// Lectura genérica

const readSheet = (workbook, sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSXUtils.sheet_to_json(sheet, { defval: '', raw: true }) : [];
};

const assertColumns = (rows, required, label) => {
  if (!rows.length) throw new Error(`${label}: la hoja no contiene registros.`);
  const present = new Set(Object.keys(rows[0]));
  const missing = required.filter((column) => !present.has(column));
  if (missing.length) throw new Error(`${label}: faltan columnas requeridas: ${missing.join(', ')}.`);
};

const sha256Hex = async (buffer) => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const openWorkbook = async (file) => {
  const buffer = await file.arrayBuffer();
  return { buffer, workbook: readWorkbook(buffer, { type: 'array', cellDates: true }) };
};

/** Filas de movimiento utilizables: fecha, hacienda, servicio y UM presentes, semana 1–53 y unidades ≠ 0. */
const isUsableMovement = (row) =>
  row.date && row.hacienda && row.service && row.unit && row.week >= 1 && row.week <= 53 && row.units !== 0;

const buildFileMetadata = async (file, kind, buffer, rows) => {
  const dates = rows
    .map((row) => row.date)
    .filter((date) => !!date)
    .sort();
  const weeks = rows.map((row) => row.week).filter((week) => !!week && Number.isFinite(week));
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
  };
};

// ---------------------------------------------------------------------------------------------
// Nómina: base diaria de labores manuales (hoja REPORTE)

export const parsePayrollFile = async (file) => {
  const { buffer, workbook } = await openWorkbook(file);
  const raw = readSheet(workbook, 'REPORTE');
  assertColumns(raw, PAYROLL_REQUIRED_COLUMNS, 'Nómina');
  const rows = raw
    .map((row, index) => ({
      id: hashId('payroll', file.name, index + 2),
      sourceRow: index + 2,
      week: toNumber(row.Semana),
      date: toIsoDate(row.Fecha),
      haciendaCode: cleanCode(row.Hacienda),
      hacienda: normalizeText(row['Nombre Hacienda']),
      suerte: normalizeSuerte(row.Suerte),
      labor: normalizeText(row.Labor),
      laborName: text(row['Nombre Labor']),
      service: cleanCode(row.Servicio).toUpperCase(),
      serviceName: text(row['Nombre Servicio']),
      unit: normalizeText(row['Unidad de Medida']),
      units: toNumber(row.Unidades),
      payrollTariff: toNumber(row.Tarifa),
      worker: text(row['Nombre Trabajador']),
    }))
    .filter(isUsableMovement);
  if (!rows.length) throw new Error('Nómina: no hay filas utilizables. Se conserva el archivo anterior.');
  return {
    rows,
    file: { ...(await buildFileMetadata(file, 'payroll', buffer, rows)), rawRows: raw.length, skippedRows: raw.length - rows.length },
  };
};

// ---------------------------------------------------------------------------------------------
// Prefactura: cobros emitidos con número P.FACT (hoja REPORTE)

export const parsePrefacturaFile = async (file) => {
  const { buffer, workbook } = await openWorkbook(file);
  const raw = readSheet(workbook, 'REPORTE');
  assertColumns(raw, PREFACTURA_REQUIRED_COLUMNS, 'Prefactura');
  const rows = raw
    .map((row, index) => ({
      id: hashId('prefactura', file.name, index + 2),
      sourceRow: index + 2,
      week: toNumber(row.Semana),
      date: toIsoDate(row.Fecha),
      haciendaCode: cleanCode(row.Hda),
      hacienda: normalizeText(row['Nombre Hacienda']),
      suerte: normalizeSuerte(row.Ste),
      labor: normalizeText(row.Labor),
      laborName: text(row.Descripcion),
      service: cleanCode(row['Servicio SAP']).toUpperCase(),
      serviceName: text(row['Nombre Servicio']),
      unit: normalizeText(row.UM),
      units: toNumber(row.Unidades),
      tariff: toNumber(row.Tarifa),
      total: toNumber(row.Total),
      pFact: cleanCode(row['P.FACT']),
      producerCode: cleanCode(row.Productor),
      producer: text(row['Nombre Productor']),
      contractorCode: extractContractorCode(row.Contratista),
      contractor: text(row.Contratista),
    }))
    .filter(isUsableMovement);
  if (!rows.length) throw new Error('Prefactura: no hay filas utilizables. Se conserva el archivo anterior.');
  return {
    rows,
    file: {
      ...(await buildFileMetadata(file, 'prefactura', buffer, rows)),
      rawRows: raw.length,
      skippedRows: raw.length - rows.length,
    },
  };
};

// ---------------------------------------------------------------------------------------------
// Cronológico Maestro: todas las hojas con columna "Hacienda"

export const parseMasterFile = async (file) => {
  const { buffer, workbook } = await openWorkbook(file);
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const raw = readSheet(workbook, sheetName);
    if (!raw.length || !Object.prototype.hasOwnProperty.call(raw[0], 'Hacienda')) continue;
    raw.forEach((row, index) => {
      const hacienda = normalizeText(row.Hacienda);
      const suerte = normalizeSuerte(row.Suerte);
      if (!hacienda || !suerte) return;
      rows.push({
        id: hashId('master', file.name, sheetName, index + 2),
        sourceRow: index + 2,
        sheet: sheetName,
        haciendaCode: cleanCode(row.Cod),
        hacienda,
        suerte,
        tenure: normalizeText(row.Tenencia),
        erp: cleanCode(row.ERP),
        zone: text(row.ZONA),
        status: text(row.Estado),
        plantingDate: row['F. Siembra'] ? toIsoDate(row['F. Siembra']) : '',
        lastCutDate: row['F. Ult. Cte'] ? toIsoDate(row['F. Ult. Cte']) : '',
        area: toNumber(row.Area),
        producerScope: normalizeText(sheetName).includes('PRODUCTOR') || normalizeText(row.ZONA).includes('PRODUCTOR'),
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
  const rows = workbook.SheetNames.flatMap((sheetName) => readSheet(workbook, sheetName));
  return { rows, file: await buildFileMetadata(file, 'example', buffer, rows) };
};

// ---------------------------------------------------------------------------------------------
// Revisión por Correo: reporte de cobros recibido para validar contra Nómina

export const parseReviewFile = async (file) => {
  const { buffer, workbook } = await openWorkbook(file);
  const raw = readSheet(workbook, 'REPORTE');
  assertColumns(raw, REVIEW_REQUIRED_COLUMNS, 'Revisión por Correo');
  const rows = raw
    .map((row, index) => ({
      id: hashId('review', file.name, index + 2),
      sourceRow: index + 2,
      year: toNumber(row.AÑO),
      week: toNumber(row['SEM.']),
      hacienda: normalizeText(row['Nombre Hacienda']),
      suerte: normalizeSuerte(row['STE.']),
      labor: normalizeText(row.LAB),
      serviceName: text(row['Nombre Servicio']),
      unit: normalizeText(row.UM),
      units: toNumber(row.UND),
      tariff: toNumber(row.TARIFA),
      total: toNumber(row.TOTAL),
      contractorCode: extractContractorCode(row.PRESTADOR),
      contractor: text(row.PRESTADOR),
    }))
    .filter((row) => row.year >= 2000 && row.week >= 1 && row.week <= 53 && row.hacienda && row.labor && row.unit && row.units !== 0);
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
      rawRows: raw.length,
      skippedRows: raw.length - rows.length,
    },
  };
};

// ---------------------------------------------------------------------------------------------
// Comparación de un archivo entrante contra el vigente (antes de confirmar el reemplazo)

const ROW_SIGNATURE_IGNORED = new Set(['id', 'sourceRow', 'sheet']);
const rowSignature = (row) =>
  JSON.stringify(
    Object.entries(row)
      .filter(([key]) => !ROW_SIGNATURE_IGNORED.has(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

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

export const diffRows = (previous, incoming) => {
  const previousCounts = countSignatures(previous);
  const incomingCounts = countSignatures(incoming);
  let unchanged = 0;
  incomingCounts.forEach((count, signature) => {
    unchanged += Math.min(count, previousCounts.get(signature) ?? 0);
  });
  const newWeeks = [...new Set(incoming.map((row) => row.week).filter((week) => !!week))]
    .filter((week) => !previous.some((row) => row.week === week))
    .sort((a, b) => a - b);
  return {
    added: incoming.length - unchanged,
    removed: previous.length - unchanged,
    unchanged,
    addedExamples: unmatchedExamples(incoming, previousCounts),
    removedExamples: unmatchedExamples(previous, incomingCounts),
    duplicates: [...incomingCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    newWeeks,
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
