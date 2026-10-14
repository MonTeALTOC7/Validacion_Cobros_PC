// Indicadores derivados de los hallazgos de conciliación.
import { hashId } from './normalize';

/**
 * Estado de cobro de un hallazgo desde el punto de vista de la Nómina:
 * - SIN_BASE_NOMINA: no es un caso con base en Nómina (excepciones, excluidos, cobros sin Nómina).
 * - SIN_COBRO: hay Nómina pero no hay prefactura con P.FACT y unidades.
 * - PARCIAL: la prefactura cubre menos unidades que la Nómina.
 * - COBRADO: cubierto (incluye excesos).
 */
export const collectionState = (finding) => {
  if (!['DIRECT', 'TPS'].includes(finding.type)) return 'SIN_BASE_NOMINA';
  if (!finding.payrollRowIds.length && finding.payrollUnits <= 0) return 'SIN_BASE_NOMINA';
  if (!finding.pFacts.some((pFact) => pFact.trim()) || finding.billedUnits <= 0 || finding.status === 'PREFACTURA_SIN_NUMERO') {
    return 'SIN_COBRO';
  }
  return finding.status === 'COBRO_PARCIAL' ? 'PARCIAL' : 'COBRADO';
};

/** Un pendiente bloquea el cierre semanal. */
export const isBlockingPending = (finding) => ['SIN_COBRO', 'PARCIAL'].includes(collectionState(finding));

/** Cobertura por número de casos (no por unidades). */
export const coverageStats = (findings) => {
  const base = findings.filter((f) => collectionState(f) !== 'SIN_BASE_NOMINA');
  const count = (state) => base.filter((f) => collectionState(f) === state).length;
  const covered = count('COBRADO');
  return {
    base: base.length,
    unpaid: count('SIN_COBRO'),
    partial: count('PARCIAL'),
    covered,
    percent: base.length ? (covered / base.length) * 100 : 0,
  };
};

/** Unidades pendientes (`pending`) o excedentes (`excess`) agrupadas por unidad de medida. */
export const unitTotalsByState = (findings, mode) => {
  const totals = new Map();
  for (const finding of findings) {
    const state = collectionState(finding);
    let units = 0;
    if (mode === 'pending') {
      if (state === 'SIN_COBRO') units = finding.payrollUnits;
      else if (state === 'PARCIAL') units = Math.max(0, finding.payrollUnits - finding.billedUnits);
    } else if (finding.status === 'COBRO_EXCESO' && state === 'COBRADO') {
      units = Math.max(0, finding.billedUnits - finding.payrollUnits);
    }
    if (units > 0) totals.set(finding.unit, (totals.get(finding.unit) ?? 0) + units);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b));
};

/** Resumen por semana para el control de cierres. */
export const weekSummaries = (analysis) => {
  const relevant = analysis.findings.filter((f) => f.type !== 'EXCLUDED');
  return [...new Set(relevant.map((f) => f.week))]
    .sort((a, b) => a - b)
    .map((week) => {
      const findings = relevant.filter((f) => f.week === week);
      return {
        week,
        total: findings.length,
        pending: findings.filter(isBlockingPending).length,
        warnings: findings.filter((f) => f.severity === 'warning').length,
      };
    });
};

/** Huella del corte: archivos (por hash) + parámetros. Un cierre solo es vigente con la misma huella. */
export const closureFingerprint = (inputs, parameters) =>
  hashId(...inputs.files.map((file) => file.kind + ':' + file.hash).sort(), JSON.stringify(parameters));
