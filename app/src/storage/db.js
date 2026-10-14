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

// ---------------------------------------------------------------------------------------------
// Preferencias y metadatos adicionales (claves nuevas del store `values`, sin cambiar el esquema)

/** Fuente del Maestro: 'REMOTE' (Maestro Central, por defecto) o 'FILE' (Excel importado). */
export const loadMasterSource = async () => (await getValue('master-source')) ?? 'REMOTE';
export const saveMasterSource = (mode) => putValue('master-source', mode);

/** Versión del manifiesto de datos/ con la que se cargaron los datos de este dispositivo. */
export const loadPreloadVersion = () => getValue('preload-version');
export const savePreloadVersion = (version) => putValue('preload-version', version);

// ---------------------------------------------------------------------------------------------
// Cierres semanales por período (año operativo + semana)
//
// El store `closures` usa la clave primaria "week". Desde v0.8 su valor es el período "AAAA-SNN";
// los cierres de v0.7 (número de semana sin año) se conservan intactos y se muestran como históricos.

export const listClosures = () => db.closures.toArray();

/** Registra un cierre; si el período ya tenía registro, el anterior pasa al historial. */
export const saveClosure = async ({ period, year, week, note, fingerprint, closedAt = new Date().toISOString() }) => {
  await db.transaction('rw', db.closures, db.audit, async () => {
    const previous = await db.closures.get(period);
    const history = previous ? [...(previous.history ?? []), snapshot(previous)] : [];
    const record = { week: period, period, year, weekNumber: week, status: 'CLOSED', closedAt, note, fingerprint, history };
    await db.closures.put(record);
    await db.audit.put({
      id: `close-${period}-${Date.now()}`,
      at: closedAt,
      action: 'SEMANA_CERRADA',
      detail: `Período ${period} sin bloqueos. Corte ${fingerprint}. ${note}`.trim(),
    });
  });
};

/** Reabre un cierre con motivo obligatorio; el cierre anterior queda en el historial. */
export const reopenClosure = async (period, reason) => {
  if (!reason?.trim()) throw new Error('Indique el motivo de la reapertura.');
  const at = new Date().toISOString();
  await db.transaction('rw', db.closures, db.audit, async () => {
    const previous = await db.closures.get(period);
    if (!previous) throw new Error('El período no tiene cierre registrado.');
    await db.closures.put({
      ...previous,
      status: 'REOPENED',
      reopenedAt: at,
      reopenReason: reason.trim(),
      history: [...(previous.history ?? []), snapshot(previous)],
    });
    await db.audit.put({
      id: `reopen-${period}-${Date.now()}`,
      at,
      action: 'SEMANA_REABIERTA',
      detail: `Período ${period}: ${reason.trim()}`,
    });
  });
};

const snapshot = (record) => ({
  status: record.status,
  closedAt: record.closedAt,
  note: record.note,
  fingerprint: record.fingerprint,
  reopenedAt: record.reopenedAt,
  reopenReason: record.reopenReason,
});

// ---------------------------------------------------------------------------------------------
// Respaldo y restauración completa del dispositivo

export const BACKUP_FORMAT = 'conciliador-casur-respaldo';

export const exportBackupData = async (appVersion) => {
  const [values, audit, closures] = await Promise.all([db.values.toArray(), db.audit.toArray(), db.closures.toArray()]);
  return { format: BACKUP_FORMAT, formatVersion: 1, exportedAt: new Date().toISOString(), appVersion, values, audit, closures };
};

export const validateBackup = (data) => {
  if (!data || data.format !== BACKUP_FORMAT || data.formatVersion !== 1)
    throw new Error('El archivo no es un respaldo del Conciliador CASUR.');
  if (![data.values, data.audit, data.closures].every(Array.isArray)) throw new Error('El respaldo está incompleto.');
  if (!data.values.every((entry) => entry && typeof entry.key === 'string'))
    throw new Error('El respaldo contiene valores inválidos.');
  return data;
};

/** Sustituye todo el contenido local por el del respaldo (transacción única). */
export const restoreBackupData = async (data, appVersion) => {
  validateBackup(data);
  await db.transaction('rw', db.values, db.audit, db.closures, async () => {
    await db.values.clear();
    await db.audit.clear();
    await db.closures.clear();
    await db.values.bulkPut(data.values);
    await db.audit.bulkPut(data.audit);
    await db.closures.bulkPut(data.closures);
    await db.audit.put({
      id: `restore-${Date.now()}`,
      at: new Date().toISOString(),
      action: 'RESPALDO_RESTAURADO',
      detail: `Respaldo del ${data.exportedAt} (v${data.appVersion ?? '¿?'}) restaurado en v${appVersion}.`,
    });
  });
};

export const listAudit = () => db.audit.orderBy('at').reverse().toArray();
