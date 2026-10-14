import { hashId } from './normalize';

export const collectionState = (a) =>
  !['DIRECT', 'TPS'].includes(a.type) || (!a.payrollRowIds.length && a.payrollUnits <= 0)
    ? 'SIN_BASE_NOMINA'
    : !a.pFacts.some((s) => s.trim()) || a.billedUnits <= 0 || a.status === 'PREFACTURA_SIN_NUMERO'
      ? 'SIN_COBRO'
      : a.status === 'COBRO_PARCIAL'
        ? 'PARCIAL'
        : 'COBRADO';
export const isBlockingPending = (a) => ['SIN_COBRO', 'PARCIAL'].includes(collectionState(a));
export const coverageStats = (a) => {
  const s = a.filter((r) => collectionState(r) !== 'SIN_BASE_NOMINA');
  const t = s.filter((r) => collectionState(r) === 'SIN_COBRO').length;
  const n = s.filter((r) => collectionState(r) === 'PARCIAL').length;
  const i = s.filter((r) => collectionState(r) === 'COBRADO').length;
  return {
    base: s.length,
    unpaid: t,
    partial: n,
    covered: i,
    percent: s.length ? (i / s.length) * 100 : 0,
  };
};
export const unitTotalsByState = (a, s) => {
  const t = new Map();
  a.forEach((n) => {
    const i = collectionState(n);
    const r =
      s === 'pending'
        ? i === 'SIN_COBRO'
          ? n.payrollUnits
          : i === 'PARCIAL'
            ? Math.max(0, n.payrollUnits - n.billedUnits)
            : 0
        : n.status === 'COBRO_EXCESO' && i === 'COBRADO'
          ? Math.max(0, n.billedUnits - n.payrollUnits)
          : 0;
    r > 0 && t.set(n.unit, (t.get(n.unit) ?? 0) + r);
  });
  return [...t].sort(([n], [i]) => n.localeCompare(i));
};
export const weekSummaries = (a) =>
  [...new Set(a.findings.filter((t) => t.type !== 'EXCLUDED').map((t) => t.week))]
    .sort((t, n) => t - n)
    .map((t) => {
      const n = a.findings.filter((i) => i.week === t && i.type !== 'EXCLUDED');
      return {
        week: t,
        total: n.length,
        pending: n.filter(isBlockingPending).length,
        warnings: n.filter((i) => i.severity === 'warning').length,
      };
    });
export const closureFingerprint = (a, s) =>
  hashId(...a.files.map((t) => t.kind + ':' + t.hash).sort(), JSON.stringify(s));
