import Dexie from 'dexie';

// IMPORTANTE: el esquema debe permanecer en la versión 1. El módulo "Seguimiento de Labores"
// de la App Maestra comparte el mismo origen (montealtoc7.github.io) y abre esta misma base con
// un bundle que declara la versión 1; subirla provocaría VersionError en ese módulo.
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
export const saveInputs = (a) =>
  db.values.put({
    key: 'inputs',
    value: a,
    updatedAt: new Date().toISOString(),
  });
export const loadInputs = async () => {
  var a;
  return (a = await db.values.get('inputs')) == null ? undefined : a.value;
};
export const saveAnalysis = (a) =>
  db.values.put({
    key: 'analysis',
    value: a,
    updatedAt: new Date().toISOString(),
  });
export const loadAnalysis = async () => {
  var a;
  return (a = await db.values.get('analysis')) == null ? undefined : a.value;
};
export const saveParameters = (a) =>
  db.values.put({
    key: 'parameters',
    value: a,
    updatedAt: new Date().toISOString(),
  });
export const loadParameters = async () => {
  var a;
  return (a = await db.values.get('parameters')) == null ? undefined : a.value;
};
export const saveReviewWorkspace = (a) =>
  db.values.put({
    key: 'review-workspace',
    value: a,
    updatedAt: new Date().toISOString(),
  });
export const loadReviewWorkspace = async () => {
  var a;
  return (a = await db.values.get('review-workspace')) == null ? undefined : a.value;
};
export const appendAudit = (a) => db.audit.put(a);
export const clearLocalData = async () => {
  await db.transaction('rw', db.values, db.audit, db.closures, async () => {
    await db.values.clear();
    await db.audit.clear();
    await db.closures.clear();
  });
};
