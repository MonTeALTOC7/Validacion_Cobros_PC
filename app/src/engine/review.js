// Revisión por Correo: valida un reporte de cobros recibido (CS9999) contra la Nómina del período solicitado.
import { DIRECT_SERVICES, TPS_STAGE_SERVICES } from './constants';
import { hashId, lotKey, round, sumBy, withinTolerance } from './normalize';
import { operationalYear } from './periods';

export const REVIEW_STATUS_LABELS = {
  CORRECTO: 'Cobro correcto',
  FALTA_COBRO: 'Falta en archivo',
  COBRO_PARCIAL: 'Cobro parcial',
  COBRO_EXCESO: 'Incluido · exceso',
  COBRO_SIN_NOMINA: 'Sin respaldo en Nómina',
  UNIDAD_DIFERENTE: 'Unidad diferente',
  TOTAL_INCORRECTO: 'Total incorrecto',
  FUERA_PERIODO: 'Fuera del período',
  CONTRATISTA_NO_ESPERADO: 'Prestador inesperado',
};

/** Clave de comparación de la revisión: semana|hacienda|suerte|labor (la UM se compara aparte). */
export const reviewKey = (row) => [row.week, row.hacienda, row.suerte, row.labor].join('|');

export const parseReviewKey = (key) => {
  const [week, hacienda, suerte, labor] = key.split('|');
  return { week: Number(week), hacienda, suerte, labor };
};

/** Tolerancia de unidades de la revisión (fija, heredada de v0.7). */
export const reviewTolerance = () => 0.01;

export const isReviewComparable = (finding) =>
  finding.payrollUnits > 0 &&
  finding.reviewUnits > 0 &&
  ['CORRECTO', 'COBRO_EXCESO', 'TOTAL_INCORRECTO'].includes(finding.status);

export const reviewStatus = (payrollUnits, reviewUnits, unit) => {
  if (withinTolerance(payrollUnits, reviewUnits, reviewTolerance(unit))) return { status: 'CORRECTO', severity: 'ok' };
  if (payrollUnits > 0 && reviewUnits === 0) return { status: 'FALTA_COBRO', severity: 'critical' };
  if (payrollUnits === 0 && reviewUnits > 0) return { status: 'COBRO_SIN_NOMINA', severity: 'warning' };
  if (reviewUnits < payrollUnits) return { status: 'COBRO_PARCIAL', severity: 'critical' };
  return { status: 'COBRO_EXCESO', severity: 'info' };
};

/** Agrupa filas por clave de revisión y, dentro de ella, por UM. */
const groupByKeyAndUnit = (rows, withTotal) => {
  const groups = new Map();
  rows.forEach((row) => {
    const byUnit = groups.get(reviewKey(row)) ?? new Map();
    const group = byUnit.get(row.unit) ?? (withTotal ? { rows: [], units: 0, total: 0 } : { rows: [], units: 0 });
    group.rows.push(row);
    group.units += row.units;
    if (withTotal) group.total += row.total;
    byUnit.set(row.unit, group);
    groups.set(reviewKey(row), byUnit);
  });
  return groups;
};
export const groupPayrollForReview = (rows) => groupByKeyAndUnit(rows, false);
export const groupReviewRows = (rows) => groupByKeyAndUnit(rows, true);

export const buildReviewFinding = (key, unit, payrollGroup, reviewGroup) => {
  const parts = parseReviewKey(key);
  const payrollUnits = round(payrollGroup?.units ?? 0);
  const reviewUnits = round(reviewGroup?.units ?? 0);
  let { status, severity } = reviewStatus(payrollUnits, reviewUnits, unit);
  let explanation = `Nómina ${payrollUnits} ${unit}; archivo recibido ${reviewUnits} ${unit}.`;
  if (reviewGroup?.rows.length) {
    const expectedTotal = round(
      sumBy(reviewGroup.rows, (row) => row.tariff * row.units),
      2,
    );
    const reportedTotal = round(reviewGroup.total, 2);
    if (status === 'CORRECTO' && !withinTolerance(expectedTotal, reportedTotal, 0.02)) {
      status = 'TOTAL_INCORRECTO';
      severity = 'warning';
      explanation += ` El total informado ${reportedTotal} no coincide con tarifa × unidades ${expectedTotal}.`;
    }
  }
  return {
    id: hashId('review-finding', key, unit),
    status,
    severity,
    ...parts,
    services: [...new Set(payrollGroup?.rows.map((row) => row.service) ?? [])],
    serviceNames: [
      ...new Set(
        [
          ...(payrollGroup?.rows.map((row) => row.serviceName) ?? []),
          ...(reviewGroup?.rows.map((row) => row.serviceName) ?? []),
        ].filter(Boolean),
      ),
    ],
    unit,
    reviewUnit: unit,
    payrollUnits,
    reviewUnits,
    difference: round(reviewUnits - payrollUnits),
    tariff: reviewGroup?.rows[0]?.tariff ?? 0,
    total: round(reviewGroup?.total ?? 0, 2),
    explanation,
    payrollRowIds: payrollGroup?.rows.map((row) => row.id) ?? [],
    reviewRowIds: reviewGroup?.rows.map((row) => row.id) ?? [],
  };
};

export const buildReviewSpecialFinding = (row, status, explanation) => ({
  id: hashId('review-special', status, row.id),
  status,
  severity: 'warning',
  week: row.week,
  hacienda: row.hacienda,
  suerte: row.suerte,
  labor: row.labor,
  services: [],
  serviceNames: row.serviceName ? [row.serviceName] : [],
  unit: row.unit,
  reviewUnit: row.unit,
  payrollUnits: 0,
  reviewUnits: row.units,
  difference: row.units,
  tariff: row.tariff,
  total: row.total,
  explanation,
  payrollRowIds: [],
  reviewRowIds: [row.id],
});

/**
 * Ejecuta la revisión de las semanas [weekStart, weekEnd] del archivo recibido.
 * La Nómina se limita a servicios conciliables, al año del archivo y a los lotes/haciendas
 * de productores (Maestro) o presentes en el archivo recibido.
 */
export const runReview = (inputs, reviewRows, weekStart, weekEnd) => {
  const years = new Set(reviewRows.map((row) => row.year));
  const producerLots = new Set(inputs.master.filter((row) => row.producerScope).map((row) => lotKey(row.hacienda, row.suerte)));
  const producerHaciendas = new Set(inputs.master.filter((row) => row.producerScope).map((row) => row.hacienda));
  const reviewLots = new Set(reviewRows.map((row) => lotKey(row.hacienda, row.suerte)));
  const reviewHaciendas = new Set(reviewRows.map((row) => row.hacienda));
  const reviewServices = new Set([...DIRECT_SERVICES, ...TPS_STAGE_SERVICES]);
  const payroll = inputs.payroll.filter(
    (row) =>
      row.week >= weekStart &&
      row.week <= weekEnd &&
      years.has(reviewYearOf(row)) &&
      reviewServices.has(row.service) &&
      (producerLots.has(lotKey(row.hacienda, row.suerte)) ||
        producerHaciendas.has(row.hacienda) ||
        reviewLots.has(lotKey(row.hacienda, row.suerte)) ||
        reviewHaciendas.has(row.hacienda)),
  );
  const outsidePeriod = reviewRows.filter((row) => row.week < weekStart || row.week > weekEnd);
  const unexpectedContractor = reviewRows.filter(
    (row) => row.week >= weekStart && row.week <= weekEnd && row.contractorCode !== 'CS9999',
  );
  const comparable = reviewRows.filter((row) => row.week >= weekStart && row.week <= weekEnd && row.contractorCode === 'CS9999');
  const payrollGroups = groupPayrollForReview(payroll);
  const reviewGroups = groupReviewRows(comparable);
  const findings = [];
  for (const key of new Set([...payrollGroups.keys(), ...reviewGroups.keys()])) {
    const payrollByUnit = payrollGroups.get(key) ?? new Map();
    const reviewByUnit = reviewGroups.get(key) ?? new Map();
    const sharedUnits = new Set([...payrollByUnit.keys()].filter((unit) => reviewByUnit.has(unit)));
    sharedUnits.forEach((unit) => findings.push(buildReviewFinding(key, unit, payrollByUnit.get(unit), reviewByUnit.get(unit))));
    const payrollOnly = [...payrollByUnit.entries()].filter(([unit]) => !sharedUnits.has(unit));
    const reviewOnly = [...reviewByUnit.entries()].filter(([unit]) => !sharedUnits.has(unit));
    if (payrollOnly.length === 1 && reviewOnly.length === 1) {
      const [payrollUnit, payrollGroup] = payrollOnly[0];
      const [reviewUnit, reviewGroup] = reviewOnly[0];
      findings.push({
        id: hashId('review-unit', key),
        status: 'UNIDAD_DIFERENTE',
        severity: 'warning',
        ...parseReviewKey(key),
        services: [...new Set(payrollGroup.rows.map((row) => row.service))],
        serviceNames: [
          ...new Set(
            [...payrollGroup.rows.map((row) => row.serviceName), ...reviewGroup.rows.map((row) => row.serviceName)].filter(
              Boolean,
            ),
          ),
        ],
        unit: payrollUnit,
        reviewUnit,
        payrollUnits: round(payrollGroup.units),
        reviewUnits: round(reviewGroup.units),
        difference: round(reviewGroup.units - payrollGroup.units),
        tariff: reviewGroup.rows[0]?.tariff ?? 0,
        total: round(reviewGroup.total, 2),
        explanation: `Las cantidades se compararon, pero Nómina usa ${payrollUnit} y el archivo recibido usa ${reviewUnit}.`,
        payrollRowIds: payrollGroup.rows.map((row) => row.id),
        reviewRowIds: reviewGroup.rows.map((row) => row.id),
      });
    } else {
      payrollOnly.forEach(([unit, group]) => findings.push(buildReviewFinding(key, unit, group, undefined)));
      reviewOnly.forEach(([unit, group]) => findings.push(buildReviewFinding(key, unit, undefined, group)));
    }
  }
  outsidePeriod.forEach((row) =>
    findings.push(
      buildReviewSpecialFinding(
        row,
        'FUERA_PERIODO',
        `El correo solicita semanas ${weekStart}–${weekEnd}, pero esta fila pertenece a la semana ${row.week}.`,
      ),
    ),
  );
  unexpectedContractor.forEach((row) =>
    findings.push(
      buildReviewSpecialFinding(
        row,
        'CONTRATISTA_NO_ESPERADO',
        `El prestador ${row.contractorCode || row.contractor} no corresponde a CS9999.`,
      ),
    ),
  );
  findings.sort((a, b) => a.week - b.week || a.hacienda.localeCompare(b.hacienda) || a.suerte.localeCompare(b.suerte));
  const weeks = reviewRows.map((row) => row.week);
  return {
    generatedAt: new Date().toISOString(),
    requestedWeekStart: weekStart,
    requestedWeekEnd: weekEnd,
    fileWeekStart: Math.min(...weeks),
    fileWeekEnd: Math.max(...weeks),
    findings,
    reviewRows: reviewRows.length,
    total: round(
      sumBy(reviewRows, (row) => row.total),
      2,
    ),
    exact: findings.filter((f) => f.status === 'CORRECTO').length,
    critical: findings.filter((f) => f.severity === 'critical').length,
    warnings: findings.filter((f) => f.severity === 'warning' || f.severity === 'info').length,
    outsidePeriodRows: outsidePeriod.length,
    unexpectedContractorRows: unexpectedContractor.length,
  };
};

/**
 * Año con el que se compara una fila de Nómina contra el AÑO del reporte recibido: el año operativo
 * SIAGRI (las semanas 1–2 pueden tener fechas de diciembre del año anterior).
 */
const reviewYearOf = (row) => row.year ?? operationalYear(row.date, row.week);
