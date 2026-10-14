// Persistencia local (IndexedDB vía Dexie). Base: "conciliador-casur".
import Dexie from 'dexie';

// IMPORTANTE: el esquema debe permanecer en la versión 1. El módulo "Seguimiento de Labores"
// de la App Maestra comparte el mismo origen (montealtoc7.github.io) y abre esta misma base con
// un bundle que declara la versión 1; subirla provocaría VersionError en ese módulo.
// Los datos nuevos se guardan como claves adicionales del store `values` (sin cambiar el esquema).
class ConciliadorDB extends Dexie {
  constructor() {
    super('conciliador-casur');
    this.version(1).stores({
      values: 'key, updatedAt',
      audit: 'id, at, action',
      closures: 'week, closedAt, status',
    });
  }
}

export const db = new ConciliadorDB();

const putValue = (key, value) => db.values.put({ key, value, updatedAt: new Date().toISOString() });
const getValue = async (key) => (await db.values.get(key))?.value;

export const saveInputs = (inputs) => putValue('inputs', inputs);
export const loadInputs = () => getValue('inputs');
export const saveAnalysis = (analysis) => putValue('analysis', analysis);
export const loadAnalysis = () => getValue('analysis');
export const saveParameters = (parameters) => putValue('parameters', parameters);
export const loadParameters = () => getValue('parameters');
export const saveReviewWorkspace = (workspace) => putValue('review-workspace', workspace);
export const loadReviewWorkspace = () => getValue('review-workspace');
export const saveLastUpdate = (summary) => putValue('last-update', summary);
export const loadLastUpdate = () => getValue('last-update');

export const appendAudit = (entry) => db.audit.put(entry);

/** Borra datos, resultados, cierres y auditoría de este dispositivo. */
export const clearLocalData = async () => {
  await db.transaction('rw', db.values, db.audit, db.closures, async () => {
    await db.values.clear();
    await db.audit.clear();
    await db.closures.clear();
  });
};
