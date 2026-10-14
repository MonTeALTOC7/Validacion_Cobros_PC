// Maestro Central: cronológico publicado por la App Maestra (módulo Producción).
//
// Comportamiento heredado del parche 8b3-1-1, ahora explícito y trazable:
// - se descarga en cada inicio; si falla, se usa la copia local (localStorage) más reciente;
// - la versión (meta.dataVersion "AAAA.MM.DD-etiqueta.N") se registra en el archivo del maestro
//   (hash "remote:<versión>") para que un cambio de versión invalide los cierres vigentes;
// - solo se aplica cuando el usuario mantiene el Maestro Central como fuente (por defecto). Si importa
//   un Maestro Excel manualmente, ese archivo prevalece hasta que vuelva a elegir el Maestro Central.
import { cleanCode, normalizeSuerte, normalizeText } from '../engine/normalize';

export const REMOTE_MASTER_URL =
  'https://montealtoc7.github.io/Negocios_de_Cana_CASUR_APP/modules/produccion/data/cronologico.json';
export const REMOTE_MASTER_CACHE_KEY = 'casur-remote-master-cache-v1';
export const REMOTE_MASTER_HASH_PREFIX = 'remote:';

/** "2026.09.06-siagri.1415" → { date: 20260906, seq: 1415 }; null si el formato no es válido. */
export const parseMasterVersion = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})\.(\d{2})\.(\d{2})-([a-zA-Z0-9]+)\.(\d+)$/);
  if (!match) return null;
  const year = +match[1];
  const month = +match[2];
  const day = +match[3];
  const seq = +match[5];
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 || !Number.isSafeInteger(seq) || seq < 0)
    return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { date: year * 10000 + month * 100 + day, seq };
};

/** 1 si a es más reciente, -1 si es más antigua, 0 si son iguales, null si alguna no es comparable. */
export const compareMasterVersions = (a, b) => {
  if (a === b) return 0;
  const pa = parseMasterVersion(a);
  const pb = parseMasterVersion(b);
  if (!pa || !pb) return null;
  if (pa.date !== pb.date) return pa.date > pb.date ? 1 : -1;
  if (pa.seq !== pb.seq) return pa.seq > pb.seq ? 1 : -1;
  return 0;
};

/** Convierte cronologico.json al formato de filas del Maestro usado por el motor. */
export const adaptRemoteMaster = (json) => {
  if (!json?.meta || !parseMasterVersion(json.meta.dataVersion) || !Array.isArray(json.producers)) return null;
  const rows = [];
  for (const producer of json.producers) {
    for (const detail of producer.details ?? []) {
      const haciendaCode = cleanCode(producer.code);
      const hacienda = normalizeText(producer.name);
      const suerte = normalizeSuerte(detail.suerte);
      if (!haciendaCode || !hacienda || !suerte) continue;
      rows.push({
        id: 'master:cronologico:' + haciendaCode + '|' + suerte,
        sourceRow: null,
        sheet: 'cronologico.json',
        haciendaCode,
        hacienda,
        suerte,
        tenure: normalizeText(detail.tenencia || ''),
        erp: cleanCode(detail.erp || ''),
        zone: String(detail.zona ?? '').trim(),
        status: String(detail.estado ?? '').trim(),
        plantingDate: detail.fSiembra || '',
        lastCutDate: detail.fUltCte || '',
        area: Number(detail.area) || 0,
        producerScope: normalizeText(String(detail.zona ?? '')).includes('PRODUCTOR'),
      });
    }
  }
  return rows.length
    ? { rows, version: json.meta.dataVersion, publishedAt: json.meta.publishedAt ?? '', rule: json.meta.rule ?? '' }
    : null;
};

const readCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(REMOTE_MASTER_CACHE_KEY) ?? 'null');
    return cached && Array.isArray(cached.rows) && cached.rows.length ? cached : null;
  } catch {
    return null;
  }
};

const writeCache = (master) => {
  try {
    localStorage.setItem(REMOTE_MASTER_CACHE_KEY, JSON.stringify(master));
  } catch {
    /* almacenamiento lleno o bloqueado: se sigue con la versión en memoria */
  }
};

/**
 * Obtiene el Maestro Central: la versión publicada si es igual o más reciente que la copia local,
 * o la copia local si la publicada es más antigua o no está disponible.
 * @returns { rows, version, origin: 'REMOTE' | 'CACHE' } o null
 */
export const fetchRemoteMaster = async (fetchImpl = fetch) => {
  const cached = readCache();
  try {
    const response = await fetchImpl(REMOTE_MASTER_URL, { cache: 'no-store' });
    if (response.ok) {
      const adapted = adaptRemoteMaster(await response.json());
      if (adapted) {
        const comparison = cached ? compareMasterVersions(adapted.version, cached.version) : 1;
        if (!cached || comparison === 1 || comparison === 0) {
          if (comparison !== 0) writeCache(adapted);
          return { ...adapted, origin: 'REMOTE' };
        }
        return { ...cached, origin: 'CACHE' };
      }
    }
  } catch {
    /* sin red: se intenta la copia local */
  }
  return cached ? { ...cached, origin: 'CACHE' } : null;
};

/** Metadatos de archivo del Maestro Central (el hash incluye la versión para la huella de cierres). */
export const remoteMasterFile = (master) => ({
  kind: 'master',
  name: `Maestro Central · ${master.version}${master.origin === 'CACHE' ? ' · Respaldo local' : ''}`,
  size: 0,
  modified: Date.now(),
  importedAt: new Date().toISOString(),
  hash: REMOTE_MASTER_HASH_PREFIX + master.version,
  rows: master.rows.length,
  source: 'REMOTE',
  validation: 'RECOGNIZED',
  version: master.version,
  dateStart: undefined,
  dateEnd: undefined,
  weekStart: undefined,
  weekEnd: undefined,
  skippedRows: 0,
});

export const isRemoteMasterFile = (file) =>
  file?.kind === 'master' &&
  (file.source === 'REMOTE' || String(file.hash ?? '').startsWith(REMOTE_MASTER_HASH_PREFIX) || file.hash === 'remote');
