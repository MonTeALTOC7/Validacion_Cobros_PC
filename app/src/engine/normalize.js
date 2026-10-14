export const normalizeText = (a) =>
  String(a ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
export const cleanCode = (a) => {
  const s = String(a ?? '').trim();
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};
export const normalizeSuerte = (a) => {
  const s = cleanCode(a).toUpperCase();
  const t = s.match(/^(\d+)([A-Z]*)$/);
  return t ? `${t[1].padStart(2, '0')}${t[2]}` : s;
};
export const toNumber = (a) => {
  if (typeof a == 'number') return Number.isFinite(a) ? a : 0;
  const s = Number(
    String(a ?? '')
      .replace(/,/g, '')
      .trim(),
  );
  return Number.isFinite(s) ? s : 0;
};
export const toIsoDate = (a) => {
  if (a instanceof Date && !Number.isNaN(a.getTime())) return a.toISOString().slice(0, 10);
  if (typeof a == 'number') return new Date(Date.UTC(1899, 11, 30) + a * 864e5).toISOString().slice(0, 10);
  const s = new Date(String(a ?? ''));
  return Number.isNaN(s.getTime()) ? '' : s.toISOString().slice(0, 10);
};
export const extractContractorCode = (a) => {
  var s;
  return ((s = normalizeText(a).match(/CS\d+/)) == null ? undefined : s[0]) ?? '';
};
export const lotKey = (a, s) => `${normalizeText(a)}|${normalizeSuerte(s)}`;
export const round = (a, s = 4) => Number(a.toFixed(s));
export const withinTolerance = (a, s, t) => Math.abs(a - s) <= t;
export const hashId = (...a) => {
  let s = 2166136261;
  const t = a.map((n) => String(n ?? '')).join('|');
  for (let n = 0; n < t.length; n += 1) {
    s ^= t.charCodeAt(n);
    s = Math.imul(s, 16777619);
  }
  return `id-${(s >>> 0).toString(16)}`;
};
export const sumBy = (a, s) => a.reduce((t, n) => t + s(n), 0);
