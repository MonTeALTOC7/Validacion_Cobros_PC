export const PRIORITY_LABORS = ['CQM', 'CMN', 'GCO', 'ECR'];
export const AGE_BUCKETS = ['0–30 días', '31–60 días', '61–90 días', '91–120 días', 'Más de 120 días', 'Sin edad'];
export const lotLabel = (a) => a.hacienda + ' · ' + a.suerte;
export const countDistinct = (a, s) => new Set(a.map(s)).size;
export const groupEntries = (a, s) => {
  const t = new Map();
  a.forEach((n) => {
    const i = s(n);
    const r = t.get(i) ?? [];
    r.push(n);
    t.set(i, r);
  });
  return [...t];
};
