// Dataset público de Seguimiento que se publica para la App Maestra (modules/labores/data/seguimiento.json).
// Sanitizado: sin tarifas, montos ni P.FACT. Conserva exactamente los campos que lee el bundle de la App Maestra
// (8b2-1-public), agrega `ageNote` y `sourceRow` (que ese bundle lee en su CSV) y `year` y `maxPeriod`, que ignora.
import { buildTrackingRows } from './tracking';
import { comparePeriods } from './periods';

export const PUBLISHED_FIELDS = [
  'id',
  'source',
  'date',
  'week',
  'year',
  'producer',
  'hacienda',
  'suerte',
  'labor',
  'service',
  'name',
  'unit',
  'units',
  'classification',
  'scope',
  'ageDays',
  'ageBase',
  // Leídos por el exportador CSV de la App Maestra ("Nota de edad", "Fila"); hasta v0.8 no se publicaban y su CSV
  // mostraba la nota vacía y "REPORTE!undefined".
  'ageNote',
  'sourceRow',
];

export const buildPublishedTracking = (inputs, startDate, generatedAt = new Date().toISOString()) => {
  const tracking = buildTrackingRows(inputs, startDate);
  const rows = tracking.map((row) => Object.fromEntries(PUBLISHED_FIELDS.map((field) => [field, row[field]])));
  const periods = [...new Set(tracking.map((row) => row.period).filter(Boolean))].sort(comparePeriods);
  return {
    version: 1,
    generatedAt,
    // maxWeek se conserva por compatibilidad; con varios años operativos use maxPeriod.
    maxWeek: rows.reduce((max, row) => Math.max(max, row.week || 0), 0),
    maxPeriod: periods.at(-1) ?? '',
    count: rows.length,
    rows,
  };
};
