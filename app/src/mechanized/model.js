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
    .flatMap((r) => [r.date || r.startDate, r.endDate])
    .filter(Boolean)
    .sort();
  return dates.length ? `${dates[0]} a ${dates.at(-1)}` : 'Sin fechas verificables';
}

// Counts of movements only: never add quantities with different dimensions.
export function unitDistribution(rows) {
  return Object.entries(
    rows.reduce((counts, row) => {
      const unit = row.unit || 'Sin unidad';
      counts[unit] = (counts[unit] || 0) + 1;
      return counts;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));
}

// Candidate events only. Same plot is never enough. No source line is removed.
export function programmingEvents(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const fields = [
      'document',
      'haciendaCode',
      'hacienda',
      'suerte',
      'labor',
      'year',
      'week',
      'startDate',
      'endDate',
      'executionDate',
      'date',
      'period',
      'unit',
      'executed',
      'suspended',
      'reserved',
      'warehouse',
    ];
    const complete = row.document && row.suerte && (row.haciendaCode || row.hacienda) && row.labor && (row.startDate || row.date);
    const key = complete ? JSON.stringify(fields.map((field) => row[field] ?? '')) : `unresolved:${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([key, lines]) => {
    const quantities = new Set(lines.map((r) => r.units));
    const products = new Set(lines.map((r) => r.product));
    const ambiguous = quantities.size !== 1 || products.size !== lines.length || lines.some((r) => !r.product || r.units == null);
    return {
      key,
      lines,
      reviewRequired: ambiguous || lines.length > 1,
      workQuantity: ambiguous ? null : lines[0].units,
      unit: lines[0].unit,
    };
  });
}
