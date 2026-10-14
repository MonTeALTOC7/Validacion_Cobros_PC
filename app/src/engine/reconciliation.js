import {
  DIRECT_SERVICES,
  MECHANIZED_SERVICES,
  TPS_CONFIRMED_EXCEPTIONS,
  TPS_CUT_SERVICES,
  TPS_RYA_SERVICES,
  TPS_STAGE_SERVICES,
  TPS_UNLOAD_SERVICES,
} from './constants';
import { hashId, lotKey, normalizeText, round, sumBy, withinTolerance } from './normalize';

const toleranceForUnit = (a, s) =>
  a === 'D-H'
    ? s.toleranceDH
    : a === 'HA'
      ? s.toleranceHA
      : a === 'MJO'
        ? s.toleranceMJO
        : a === 'PAQ'
          ? s.tolerancePAQ
          : 0.01;
const directKey = (a) => [a.week, a.hacienda, a.suerte, a.labor, a.service, a.unit].join('|');
const createMasterLookup = (a) => {
  const s = new Map();
  const t = new Map();
  a.forEach((n) => {
    s.set(lotKey(n.hacienda, n.suerte), n);
    const i = t.get(n.hacienda) ?? [];
    i.push(n);
    t.set(n.hacienda, i);
  });
  return (n, i) => {
    var o;
    const r = s.get(lotKey(n, i));
    if (r)
      return {
        status: 'EXACT',
        row: r,
      };
    const l = (o = t.get(normalizeText(n))) == null ? undefined : o[0];
    return l
      ? {
          status: 'FALLBACK_HACIENDA',
          row: l,
        }
      : {
          status: 'MISSING',
          row: undefined,
        };
  };
};
const directStatus = (a, s, t) =>
  withinTolerance(a, s, t)
    ? {
        status: 'CONCILIADO',
        severity: 'ok',
      }
    : a > 0 && s === 0
      ? {
          status: 'NOMINA_SIN_COBRO',
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
const reconcileDirect = (a, s, t, n) => {
  const i = new Map();
  const r = new Map();
  a.filter((l) => DIRECT_SERVICES.has(l.service)).forEach((l) => {
    const o = directKey(l);
    i.set(o, [...(i.get(o) ?? []), l]);
  });
  s.filter((l) => l.contractorCode === 'CS9999' && DIRECT_SERVICES.has(l.service)).forEach((l) => {
    const o = directKey(l);
    r.set(o, [...(r.get(o) ?? []), l]);
  });
  return Array.from(new Set([...i.keys(), ...r.keys()])).map((l) => {
    var g;
    var d;
    const o = i.get(l) ?? [];
    const x = r.get(l) ?? [];
    const m = o[0] ?? x[0];
    const f = round(sumBy(o, (R) => R.units));
    const S = round(sumBy(x, (R) => R.units));
    const A = directStatus(f, S, toleranceForUnit(m.unit, t));
    const E = n(m.hacienda, m.suerte);
    const D = ((g = x[0]) == null ? undefined : g.tariff) ?? 0;
    let I = A.status;
    let v = A.severity;
    let N = `Nómina ${f} ${m.unit}; Prefactura ${S} ${m.unit}.`;
    E.status === 'FALLBACK_HACIENDA' && I === 'CONCILIADO'
      ? ((I = 'SUERTE_HISTORICA_DADA_DE_BAJA'),
        (v = 'info'),
        (N += ' La suerte no está en el Maestro vigente; se validó por Hacienda como registro histórico.'))
      : E.status === 'MISSING' && (N += ' La Hacienda/Suerte no aparece en el Maestro vigente.');
    x.some((R) => !R.pFact.trim()) &&
      ((I = 'PREFACTURA_SIN_NUMERO'),
      (v = 'critical'),
      (N += ' Hay filas sin número P.FACT: no acreditan prefactura emitida y bloquean el cierre.'));
    return {
      id: hashId('direct', l),
      type: 'DIRECT',
      status: I,
      severity: v,
      week: m.week,
      date: m.date,
      haciendaCode: m.haciendaCode,
      hacienda: m.hacienda,
      suerte: m.suerte,
      labor: m.labor,
      service: m.service,
      unit: m.unit,
      payrollUnits: f,
      billedUnits: S,
      difference: round(S - f),
      tariff: D,
      amount: round(
        sumBy(x, (R) => R.total),
        2,
      ),
      pFacts: [...new Set(x.map((R) => R.pFact))],
      contractor: ((d = x[0]) == null ? undefined : d.contractorCode) ?? 'CS9999',
      explanation: N,
      masterStatus: E.status,
      payrollRowIds: o.map((R) => R.id),
      prefacturaRowIds: x.map((R) => R.id),
    };
  });
};
const reconcileTps = (a, s, t, n) =>
  s
    .filter((i) => i.contractorCode === 'CS9999' && i.labor === 'TPS' && i.service === 'SIE_INV')
    .map((i) => {
      const r = a.filter(
        (d) =>
          d.hacienda === i.hacienda &&
          d.suerte === i.suerte &&
          TPS_STAGE_SERVICES.has(d.service) &&
          d.week >= i.week - t.tpsWeeksBefore &&
          d.week <= i.week + t.tpsWeeksAfter,
      );
      const l = round(
        sumBy(
          r.filter((d) => TPS_RYA_SERVICES.has(d.service)),
          (d) => d.units,
        ),
      );
      const o = round(
        sumBy(
          r.filter((d) => TPS_CUT_SERVICES.has(d.service)),
          (d) => d.units,
        ),
      );
      const x = round(
        sumBy(
          r.filter((d) => TPS_UNLOAD_SERVICES.has(d.service)),
          (d) => d.units,
        ),
      );
      const m = t.tolerancePAQ;
      const f = withinTolerance(l, i.units, m);
      const S = withinTolerance(o, i.units, m) || withinTolerance(x, i.units, m);
      const A = withinTolerance(o, i.units, m) || withinTolerance(x, i.units, m);
      const E = `${i.pFact}|${i.hacienda}|${i.suerte}`;
      let D;
      let I;
      let v;
      f && S
        ? ((D = 'PAQUETE_TPS_VALIDADO_RYA_CORROBORADO'),
          (I = 'ok'),
          (v = 'La cantidad TPS coincide con RYA y al menos otra etapa de siembra.'))
        : f
          ? ((D = 'PAQUETE_TPS_VALIDADO_RYA'),
            (I = 'info'),
            (v = 'La cantidad TPS coincide con RYA; corte o descargue están incompletos.'))
          : A
            ? ((D = 'PAQUETE_TPS_VALIDADO_UNA_ETAPA_CON_ADVERTENCIA'),
              (I = 'warning'),
              (v = 'Una etapa de siembra coincide, pero RYA está ausente o incompleta.'))
            : TPS_CONFIRMED_EXCEPTIONS.has(E)
              ? ((D = 'TPS_COBRADO_CON_DIFERENCIA_NOMINA'),
                (I = 'warning'),
                (v = 'Siembra y cobro confirmados por negocio; la evidencia RYA de Nómina está incompleta.'))
              : ((D = 'PAQUETE_TPS_REQUIERE_REVISION'),
                (I = 'warning'),
                (v = 'Ninguna etapa de cantidad coincide con los PAQ cobrados.'));
      const N = [...new Set(r.map((d) => d.week))];
      (D === 'PAQUETE_TPS_VALIDADO_RYA' || D === 'PAQUETE_TPS_VALIDADO_RYA_CORROBORADO') &&
        N.some((d) => d !== i.week) &&
        (v += ` Ciclo observado en semana(s) ${N.join(', ')}.`);
      const g = n(i.hacienda, i.suerte);
      return {
        id: hashId('tps', i.id),
        type: 'TPS',
        status: D,
        severity: I,
        week: i.week,
        date: i.date,
        haciendaCode: i.haciendaCode,
        hacienda: i.hacienda,
        suerte: i.suerte,
        labor: i.labor,
        service: i.service,
        unit: i.unit,
        payrollUnits: l,
        billedUnits: i.units,
        difference: round(i.units - l),
        tariff: i.tariff,
        amount: i.total,
        pFacts: [i.pFact],
        contractor: i.contractorCode,
        explanation: v,
        masterStatus: g.status,
        payrollRowIds: r.map((d) => d.id),
        prefacturaRowIds: [i.id],
        stageCut: o,
        stageUnload: x,
        stageRya: l,
        userConfirmed: D === 'TPS_COBRADO_CON_DIFERENCIA_NOMINA',
      };
    });
const classifyExceptions = (a, s) =>
  a.flatMap((t) => {
    let n;
    let i = 'EXCLUDED';
    let r = 'info';
    let l = '';
    if (
      (t.contractorCode === 'CS3625' && t.labor === 'TPS' && t.service === 'SSCONTRA'
        ? ((n = 'TPS_EXTERNO_VALIDO'),
          (i = 'EXTERNAL_TPS'),
          (r = 'ok'),
          (l = 'Siembra contratada externamente; no se espera Nómina CASUR.'))
        : t.labor === 'AAM'
          ? ((n = 'EXCLUIDO_AAM'), (l = 'Aplicación aérea AAM excluida del cobro a productores.'))
          : t.contractorCode === 'CS2661'
            ? ((n = 'SEPARADO_CS2661'), (l = 'Contratista CS2661 reportado en universo separado.'))
            : t.contractorCode === 'CS3317' &&
              t.labor === 'CAP' &&
              ((n = 'EXCEPCION_CAP_VALIDADA'),
              (i = 'EXCEPTION'),
              (r = 'ok'),
              (l = 'Excepción CAP/Vuelos Verdes aceptada.')),
      !n)
    )
      return [];
    const o = s(t.hacienda, t.suerte);
    return [
      {
        id: hashId('exception', t.id),
        type: i,
        status: n,
        severity: r,
        week: t.week,
        date: t.date,
        haciendaCode: t.haciendaCode,
        hacienda: t.hacienda,
        suerte: t.suerte,
        labor: t.labor,
        service: t.service,
        unit: t.unit,
        payrollUnits: 0,
        billedUnits: t.units,
        difference: t.units,
        tariff: t.tariff,
        amount: t.total,
        pFacts: [t.pFact],
        contractor: t.contractorCode,
        explanation: l,
        masterStatus: o.status,
        payrollRowIds: [],
        prefacturaRowIds: [t.id],
      },
    ];
  });
const countDuplicateGroups = (a) => {
  const s = new Map();
  a.forEach((t) => {
    const n = [
      t.week,
      t.date,
      t.hacienda,
      t.suerte,
      t.labor,
      t.service,
      t.units,
      t.unit,
      t.tariff,
      t.pFact,
      t.contractorCode,
    ].join('|');
    s.set(n, (s.get(n) ?? 0) + 1);
  });
  return [...s.values()].filter((t) => t > 1).length;
};
export const runReconciliation = (a, s) => {
  const t = s.startDate;
  const n = a.prefactura.filter((v) => v.date >= t);
  const i = createMasterLookup(a.master);
  const r = new Set(n.map((v) => lotKey(v.hacienda, v.suerte)));
  const l = a.payroll.filter((v) => {
    var d;
    if (v.date < t) return false;
    if (s.scope === 'BOTH') return true;
    const g =
      !!((d = i(v.hacienda, v.suerte).row) != null && d.producerScope) || r.has(lotKey(v.hacienda, v.suerte));
    return s.scope === 'PRODUCERS' ? g : !g;
  });
  const o = reconcileDirect(l, n, s, i);
  const x = reconcileTps(l, n, s, i);
  const m = new Set(x.flatMap((v) => v.payrollRowIds));
  const f = new Map();
  l.filter((v) => TPS_RYA_SERVICES.has(v.service) && !m.has(v.id)).forEach((v) => {
    const N = directKey(v);
    f.set(N, [...(f.get(N) ?? []), v]);
  });
  f.forEach((v, N) => {
    const g = v[0];
    const d = round(sumBy(v, (R) => R.units));
    d <= 0 ||
      x.push({
        id: hashId('tps-pending', N),
        type: 'TPS',
        status: 'NOMINA_SIN_COBRO',
        severity: 'critical',
        week: g.week,
        date: g.date,
        haciendaCode: g.haciendaCode,
        hacienda: g.hacienda,
        suerte: g.suerte,
        labor: g.labor,
        service: g.service,
        unit: g.unit,
        payrollUnits: d,
        billedUnits: 0,
        difference: -d,
        tariff: 0,
        amount: 0,
        pFacts: [],
        contractor: 'CS9999',
        explanation:
          'RYA de Nómina sin TPS asociado en la ventana configurada. Revisar cobro pendiente o desfase.',
        masterStatus: i(g.hacienda, g.suerte).status,
        payrollRowIds: v.map((R) => R.id),
        prefacturaRowIds: [],
        stageRya: d,
      });
  });
  const S = classifyExceptions(n, i);
  const A = new Set([...DIRECT_SERVICES, ...TPS_STAGE_SERVICES, ...MECHANIZED_SERVICES, 'SIE_INV']);
  const E = [
    ...new Set(n.filter((v) => v.contractorCode === 'CS9999' && !A.has(v.service)).map((v) => v.service)),
  ].sort();
  const D = [...l.map((v) => v.week), ...n.map((v) => v.week)].filter(Boolean);
  const I = [...o, ...x, ...S].sort((v, N) => N.week - v.week || v.hacienda.localeCompare(N.hacienda));
  return {
    generatedAt: new Date().toISOString(),
    findings: I,
    excludedRows: S.filter((v) => v.type === 'EXCLUDED').length,
    mechanizedRows: n.filter((v) => v.contractorCode === 'CS9999' && MECHANIZED_SERVICES.has(v.service))
      .length,
    unknownServices: E,
    duplicateGroups: countDuplicateGroups(n),
    coverage: {
      payrollRows: l.length,
      prefacturaRows: n.length,
      producerPayrollRows: l.length,
      startWeek: Math.min(...D),
      endWeek: Math.max(...D),
    },
  };
};
