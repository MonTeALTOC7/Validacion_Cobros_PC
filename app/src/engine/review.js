import { DIRECT_SERVICES, TPS_STAGE_SERVICES } from './constants';
import { hashId, lotKey, round, sumBy, withinTolerance } from './normalize';

const reviewKey = (a) => [a.week, a.hacienda, a.suerte, a.labor].join('|');
const parseReviewKey = (a) => {
  const [s, t, n, i] = a.split('|');
  return {
    week: Number(s),
    hacienda: t,
    suerte: n,
    labor: i,
  };
};
const reviewTolerance = (a) => 0.01;
export const isReviewComparable = (a) =>
  a.payrollUnits > 0 &&
  a.reviewUnits > 0 &&
  ['CORRECTO', 'COBRO_EXCESO', 'TOTAL_INCORRECTO'].includes(a.status);
const reviewStatus = (a, s, t) =>
  withinTolerance(a, s, reviewTolerance(t))
    ? {
        status: 'CORRECTO',
        severity: 'ok',
      }
    : a > 0 && s === 0
      ? {
          status: 'FALTA_COBRO',
          severity: 'critical',
        }
      : a === 0 && s > 0
        ? {
            status: 'COBRO_SIN_NOMINA',
            severity: 'warning',
          }
        : s < a
          ? {
              status: 'COBRO_PARCIAL',
              severity: 'critical',
            }
          : {
              status: 'COBRO_EXCESO',
              severity: 'info',
            };
const groupPayrollForReview = (a) => {
  const s = new Map();
  a.forEach((t) => {
    const n = s.get(reviewKey(t)) ?? new Map();
    const i = n.get(t.unit) ?? {
      rows: [],
      units: 0,
    };
    i.rows.push(t);
    i.units += t.units;
    n.set(t.unit, i);
    s.set(reviewKey(t), n);
  });
  return s;
};
const groupReviewRows = (a) => {
  const s = new Map();
  a.forEach((t) => {
    const n = s.get(reviewKey(t)) ?? new Map();
    const i = n.get(t.unit) ?? {
      rows: [],
      units: 0,
      total: 0,
    };
    i.rows.push(t);
    i.units += t.units;
    i.total += t.total;
    n.set(t.unit, i);
    s.set(reviewKey(t), n);
  });
  return s;
};
const buildReviewFinding = (a, s, t, n) => {
  var f;
  const i = parseReviewKey(a);
  const r = round((t == null ? undefined : t.units) ?? 0);
  const l = round((n == null ? undefined : n.units) ?? 0);
  let { status: o, severity: x } = reviewStatus(r, l, s);
  let m = `Nómina ${r} ${s}; archivo recibido ${l} ${s}.`;
  if (n != null && n.rows.length) {
    const S = round(
      sumBy(n.rows, (E) => E.tariff * E.units),
      2,
    );
    const A = round(n.total, 2);
    o === 'CORRECTO' &&
      !withinTolerance(S, A, 0.02) &&
      ((o = 'TOTAL_INCORRECTO'),
      (x = 'warning'),
      (m += ` El total informado ${A} no coincide con tarifa × unidades ${S}.`));
  }
  return {
    id: hashId('review-finding', a, s),
    status: o,
    severity: x,
    ...i,
    services: [...new Set((t == null ? undefined : t.rows.map((S) => S.service)) ?? [])],
    serviceNames: [
      ...new Set(
        [
          ...((t == null ? undefined : t.rows.map((S) => S.serviceName)) ?? []),
          ...((n == null ? undefined : n.rows.map((S) => S.serviceName)) ?? []),
        ].filter(Boolean),
      ),
    ],
    unit: s,
    reviewUnit: s,
    payrollUnits: r,
    reviewUnits: l,
    difference: round(l - r),
    tariff: ((f = n == null ? undefined : n.rows[0]) == null ? undefined : f.tariff) ?? 0,
    total: round((n == null ? undefined : n.total) ?? 0, 2),
    explanation: m,
    payrollRowIds: (t == null ? undefined : t.rows.map((S) => S.id)) ?? [],
    reviewRowIds: (n == null ? undefined : n.rows.map((S) => S.id)) ?? [],
  };
};
const buildReviewSpecialFinding = (a, s, t) => ({
  id: hashId('review-special', s, a.id),
  status: s,
  severity: 'warning',
  week: a.week,
  hacienda: a.hacienda,
  suerte: a.suerte,
  labor: a.labor,
  services: [],
  serviceNames: a.serviceName ? [a.serviceName] : [],
  unit: a.unit,
  reviewUnit: a.unit,
  payrollUnits: 0,
  reviewUnits: a.units,
  difference: a.units,
  tariff: a.tariff,
  total: a.total,
  explanation: t,
  payrollRowIds: [],
  reviewRowIds: [a.id],
});
export const runReview = (a, s, t, n) => {
  var g;
  const i = new Set(s.map((d) => d.year));
  const r = new Set(a.master.filter((d) => d.producerScope).map((d) => lotKey(d.hacienda, d.suerte)));
  const l = new Set(a.master.filter((d) => d.producerScope).map((d) => d.hacienda));
  const o = new Set(s.map((d) => lotKey(d.hacienda, d.suerte)));
  const x = new Set(s.map((d) => d.hacienda));
  const m = new Set([...DIRECT_SERVICES, ...TPS_STAGE_SERVICES]);
  const f = a.payroll.filter(
    (d) =>
      d.week >= t &&
      d.week <= n &&
      i.has(Number(d.date.slice(0, 4))) &&
      m.has(d.service) &&
      (r.has(lotKey(d.hacienda, d.suerte)) ||
        l.has(d.hacienda) ||
        o.has(lotKey(d.hacienda, d.suerte)) ||
        x.has(d.hacienda)),
  );
  const S = s.filter((d) => d.week < t || d.week > n);
  const A = s.filter((d) => d.week >= t && d.week <= n && d.contractorCode !== 'CS9999');
  const E = s.filter((d) => d.week >= t && d.week <= n && d.contractorCode === 'CS9999');
  const D = groupPayrollForReview(f);
  const I = groupReviewRows(E);
  const v = [];
  for (const d of new Set([...D.keys(), ...I.keys()])) {
    const R = D.get(d) ?? new Map();
    const O = I.get(d) ?? new Map();
    const C = new Set([...R.keys()].filter((P) => O.has(P)));
    C.forEach((P) => v.push(buildReviewFinding(d, P, R.get(P), O.get(P))));
    const y = [...R.entries()].filter(([P]) => !C.has(P));
    const _ = [...O.entries()].filter(([P]) => !C.has(P));
    if (y.length === 1 && _.length === 1) {
      const [P, h] = y[0];
      const [L, F] = _[0];
      const j = parseReviewKey(d);
      v.push({
        id: hashId('review-unit', d),
        status: 'UNIDAD_DIFERENTE',
        severity: 'warning',
        ...j,
        services: [...new Set(h.rows.map((w) => w.service))],
        serviceNames: [
          ...new Set(
            [...h.rows.map((w) => w.serviceName), ...F.rows.map((w) => w.serviceName)].filter(Boolean),
          ),
        ],
        unit: P,
        reviewUnit: L,
        payrollUnits: round(h.units),
        reviewUnits: round(F.units),
        difference: round(F.units - h.units),
        tariff: ((g = F.rows[0]) == null ? undefined : g.tariff) ?? 0,
        total: round(F.total, 2),
        explanation: `Las cantidades se compararon, pero Nómina usa ${P} y el archivo recibido usa ${L}.`,
        payrollRowIds: h.rows.map((w) => w.id),
        reviewRowIds: F.rows.map((w) => w.id),
      });
    } else {
      y.forEach(([P, h]) => v.push(buildReviewFinding(d, P, h, undefined)));
      _.forEach(([P, h]) => v.push(buildReviewFinding(d, P, undefined, h)));
    }
  }
  S.forEach((d) =>
    v.push(
      buildReviewSpecialFinding(
        d,
        'FUERA_PERIODO',
        `El correo solicita semanas ${t}–${n}, pero esta fila pertenece a la semana ${d.week}.`,
      ),
    ),
  );
  A.forEach((d) =>
    v.push(
      buildReviewSpecialFinding(
        d,
        'CONTRATISTA_NO_ESPERADO',
        `El prestador ${d.contractorCode || d.contractor} no corresponde a CS9999.`,
      ),
    ),
  );
  v.sort(
    (d, R) => d.week - R.week || d.hacienda.localeCompare(R.hacienda) || d.suerte.localeCompare(R.suerte),
  );
  const N = s.map((d) => d.week);
  return {
    generatedAt: new Date().toISOString(),
    requestedWeekStart: t,
    requestedWeekEnd: n,
    fileWeekStart: Math.min(...N),
    fileWeekEnd: Math.max(...N),
    findings: v,
    reviewRows: s.length,
    total: round(
      sumBy(s, (d) => d.total),
      2,
    ),
    exact: v.filter((d) => d.status === 'CORRECTO').length,
    critical: v.filter((d) => d.severity === 'critical').length,
    warnings: v.filter((d) => d.severity === 'warning' || d.severity === 'info').length,
    outsidePeriodRows: S.length,
    unexpectedContractorRows: A.length,
  };
};
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
