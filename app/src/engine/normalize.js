// Normalización de valores leídos de los reportes SIAGRI.
// Todas las funciones son puras y no dependen del navegador.

/** Texto comparable: sin tildes ni caracteres de reemplazo, espacios colapsados y en mayúsculas. */
export const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/** Código tal como viene en Excel, sin el sufijo ".0" que agregan algunas exportaciones numéricas. */
export const cleanCode = (value) => {
  const text = String(value ?? '').trim();
  return text.endsWith('.0') ? text.slice(0, -2) : text;
};

/** Suerte con al menos dos dígitos y sufijo de letras: "5" → "05", "5a" → "05A". */
export const normalizeSuerte = (value) => {
  const text = cleanCode(value).toUpperCase();
  const match = text.match(/^(\d+)([A-Z]*)$/);
  return match ? `${match[1].padStart(2, '0')}${match[2]}` : text;
};

/**
 * Número desde una celda. Las comas se interpretan como separador de miles (formato SIAGRI).
 * Un valor no numérico devuelve 0; use `parseNumberCell` cuando necesite distinguirlo.
 */
export const toNumber = (value) => parseNumberCell(value).value;

/** Igual que `toNumber`, pero informa si la celda no era numérica para poder advertirlo. */
export const parseNumberCell = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? { value, valid: true } : { value: 0, valid: false };
  const text = String(value ?? '').trim();
  if (text === '') return { value: 0, valid: true, empty: true };
  const parsed = Number(text.replace(/,/g, ''));
  return Number.isFinite(parsed) ? { value: parsed, valid: true } : { value: 0, valid: false };
};

// ---------------------------------------------------------------------------------------------
// Fechas de Excel independientes de la zona horaria del equipo
//
// SheetJS (cellDates) crea las fechas a medianoche de la zona del equipo: el mismo archivo producía otra fecha
// (un día antes al este de UTC) y otro identificador de fila en cada zona. Desde v0.8 el importador convierte el
// serial de Excel, que no depende de la zona, y representa cada celda de fecha con el mismo instante que
// SheetJS 0.18.5 producía en un equipo con America/Managua (UTC−6, sin horario de verano desde 2007). Así los
// identificadores de filas importadas en Nicaragua con v0.7/v0.8 no cambian y ya no dependen del equipo.

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;
/** Desfase de Nicaragua (UTC−6) en milisegundos. */
export const MANAGUA_OFFSET_MS = 6 * 60 * 60 * 1000;
/**
 * Libros .xlsx: SheetJS 0.18.5 calcula la base con la hora media local de Managua de 1899 (−5:45:12) truncada a
 * minutos, por lo que en Managua sus fechas llevan 12 s de más (p. ej. 2026-03-01T06:00:12.000Z). Se conservan
 * para que la firma de la fila, y con ella su identificador, sea la misma que en v0.7/v0.8.
 */
const XLSX_MANAGUA_BASE_MS = EXCEL_EPOCH_UTC + MANAGUA_OFFSET_MS + 12 * 1000;

/**
 * Date de una celda de fecha: el instante sirve para la firma de la fila; `excelDay` guarda la fecha calendario
 * exacta de la celda (sin el desfase de 12 s), que es la que usa `toIsoDate`. JSON.stringify ignora `excelDay`.
 */
const excelDate = (ms, dayMs) => Object.assign(new Date(ms), { excelDay: new Date(dayMs).toISOString().slice(0, 10) });

/** Serial de Excel de un libro .xlsx → Date con el instante que SheetJS producía en Managua. */
export const xlsxSerialToDate = (serial) =>
  excelDate(serial * 24 * 60 * 60 * 1000 + XLSX_MANAGUA_BASE_MS, EXCEL_EPOCH_UTC + Math.floor(serial) * DAY_MS);

/**
 * Serial de Excel de un libro .xls (BIFF) → Date. SheetJS arma estas fechas con año, mes, día, hora, minuto y
 * segundo locales (SSF.parse_date_code); se reproduce lo mismo con la hora de Managua y sin depender del equipo.
 */
export const biffSerialToDate = (serial) => {
  if (!(serial >= 0 && serial <= 2958465)) return null;
  let days = Math.trunc(serial);
  let seconds = Math.floor(86400 * (serial - days));
  if (86400 * (serial - days) - seconds > 0.9999 && ++seconds === 86400) {
    seconds = 0;
    days += 1;
  }
  // parse_date_code cuenta desde 1900-01-01 con el 29/02/1900 inexistente de Excel: los seriales 60 y 61 son 1900-03-01.
  const day = EXCEL_EPOCH_UTC + (days <= 60 ? days + 1 : days) * DAY_MS;
  return excelDate(day + seconds * 1000 + MANAGUA_OFFSET_MS, day);
};

/** Date con la hora de pared del equipo (SheetJS en formatos de texto) → mismo instante que en Managua. */
export const localWallToManagua = (date) => {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const time = ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();
  return excelDate(day + time + MANAGUA_OFFSET_MS, day);
};

/**
 * Fecha ISO (AAAA-MM-DD) desde una celda de Excel.
 * - Date: la fecha calendario de la celda (`excelDay`, ver arriba); para otra Date, la fecha en Nicaragua (UTC−6).
 *   Igual en cualquier equipo.
 * - Número: serial de Excel (sistema 1900).
 * - Texto: se aceptan AAAA-MM-DD y DD/MM/AAAA (formato regional); otros formatos se rechazan
 *   para no confundir día y mes.
 */
export const toIsoDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.excelDay ?? new Date(value.getTime() - MANAGUA_OFFSET_MS).toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 864e5).toISOString().slice(0, 10);
  }
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return validIso(+match[1], +match[2], +match[3]);
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return validIso(year, +match[2], +match[1]);
  }
  return '';
};

const validIso = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
};

/** Primer código de contratista "CS####" dentro del texto de la columna Contratista. */
export const extractContractorCode = (value) => normalizeText(value).match(/CS\d+/)?.[0] ?? '';

/** Clave de lote usada por el motor: nombre de hacienda normalizado + suerte normalizada. */
export const lotKey = (hacienda, suerte) => `${normalizeText(hacienda)}|${normalizeSuerte(suerte)}`;

export const round = (value, decimals = 4) => Number(value.toFixed(decimals));

export const withinTolerance = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

/** Identificador determinista (FNV-1a de 32 bits) a partir de las partes indicadas. */
export const hashId = (...parts) => {
  let hash = 2166136261;
  const text = parts.map((part) => String(part ?? '')).join('|');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `id-${(hash >>> 0).toString(16)}`;
};

export const sumBy = (items, select) => items.reduce((total, item) => total + select(item), 0);

export const unique = (items) => [...new Set(items)];

export const groupBy = (items, keyOf) => {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
};
