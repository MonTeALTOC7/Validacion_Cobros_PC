// Stage A inventory only. No inference about execution, debt, matching or equivalences.
export function inventory(hm, prefactura, program, labors) {
  const allowed = new Set(
    labors
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  return [
    ...hm.map((r) => ({ ...r, source: 'HM' })),
    ...prefactura.filter((r) => allowed.has(r.labor)).map((r) => ({ ...r, source: 'Prefactura', document: r.pFact })),
    ...program.map((r) => ({ ...r, source: 'Programación' })),
  ].map((r, i) => ({ ...r, inventoryKey: `${r.source}:${r.id}:${i}` }));
}
export function coverage(rows) {
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  return dates.length ? `${dates[0]} a ${dates.at(-1)}` : 'Sin fechas verificables';
}
