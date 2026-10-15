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

/**
 * Fecha ISO (AAAA-MM-DD) desde una celda de Excel.
 * - Date (SheetJS con cellDates): se toma la fecha UTC; correcto en Nicaragua (UTC−6).
 * - Número: serial de Excel (sistema 1900).
 * - Texto: se aceptan AAAA-MM-DD y DD/MM/AAAA (formato regional); otros formatos se rechazan
 *   para no confundir día y mes.
 */
export const toIsoDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
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
