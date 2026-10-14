import { DIRECT_SERVICES, MECHANIZED_SERVICES, TPS_STAGE_SERVICES } from './constants';
import { lotKey, normalizeText } from './normalize';

const computeAge = (a, s) => {
  if (!a)
    return {
      ageDays: null,
      ageBase: '',
      ageNote: 'Sin maestro exacto de la suerte',
    };
  const t = [a.plantingDate, a.lastCutDate]
    .filter((i) => !!i && /^\d{4}-\d{2}-\d{2}$/.test(i) && i >= '1900-01-01')
    .sort()
    .at(-1);
  if (!t)
    return {
      ageDays: null,
      ageBase: '',
      ageNote: 'Faltan fechas de siembra/corte; recargue el maestro para incorporarlas',
    };
  if (t > s)
    return {
      ageDays: null,
      ageBase: t,
      ageNote: 'Labor anterior al ciclo del maestro; falta historial de cortes',
    };
  const n = Math.floor((Date.parse(s) - Date.parse(t)) / 864e5);
  return {
    ageDays: Number.isFinite(n) ? n : null,
    ageBase: t,
    ageNote: t === a.lastCutDate ? 'Desde último corte del maestro' : 'Desde siembra del maestro',
  };
};
export const ageBucket = (a) =>
  a === null
    ? 'Sin edad'
    : a <= 30
      ? '0–30 días'
      : a <= 60
        ? '31–60 días'
        : a <= 90
          ? '61–90 días'
          : a <= 120
            ? '91–120 días'
            : 'Más de 120 días';
export const laborUnitKey = (a) => JSON.stringify([a.labor, a.unit]);
export const sumUnits = (a) => a.reduce((s, t) => s + t.units, 0);
export const laborDisplayName = (a) =>
  ({
    CQM: 'Control químico de maleza',
    CMN: 'Control manual de maleza',
    GCO: 'Riego por gravedad',
    ZGC: 'Preparación de riego',
    ECR: 'Resiembra · regada y tapada',
    RYA: 'Regada, acomodada y tapada',
    MAN: 'Fertilización manual',
    IAP: 'Riego pivote',
    GOT: 'Riego por goteo',
    VIG: 'Vigilancia',
  })[a.labor] ||
  a.name ||
  a.labor;
export const buildTrackingRows = (a, s) => {
  const t = buildActivityRows(a, s);
  const n = (r) => [r.week, r.hacienda, r.suerte, r.labor, r.service, r.unit].join('|');
  const i = new Set(t.filter((r) => r.source === 'Nómina').map(n));
  return t.filter((r) => r.source === 'Nómina' || (r.classification === 'Mecanizada' && !i.has(n(r))));
};
function buildActivityRows(a, s) {
  const t = new Map();
  a.master.forEach((o) => {
    const x = lotKey(o.hacienda, o.suerte);
    (!t.has(x) || o.producerScope) && t.set(x, o);
  });
  const n = new Map();
  a.prefactura.forEach((o) => {
    if (!o.producer.trim()) return;
    const x = n.get(o.hacienda) ?? new Set();
    x.add(normalizeText(o.producer));
    n.set(o.hacienda, x);
  });
  const i = new Set(a.master.filter((o) => o.producerScope).map((o) => o.hacienda));
  const r = new Set([...DIRECT_SERVICES, ...TPS_STAGE_SERVICES, ...a.payroll.map((o) => o.service)]);
  const l = [];
  for (const [o, x] of [
    ['Nómina', a.payroll],
    ['Prefactura', a.prefactura],
  ])
    for (const m of x) {
      if (m.date < s) continue;
      const f = t.get(lotKey(m.hacienda, m.suerte));
      const S = n.get(m.hacienda);
      const A = 'producer' in m ? normalizeText(m.producer) : '';
      const E =
        A || ((S == null ? undefined : S.size) === 1 ? [...S][0] : m.hacienda + ' · titular sin confirmar');
      const D =
        (f != null && f.producerScope) || i.has(m.hacienda) || A
          ? 'Productores'
          : f
            ? 'CASUR / otro ámbito'
            : 'Sin maestro · revisar';
      const I =
        m.labor === 'AAM'
          ? 'AAM · separada'
          : m.labor === 'TPS'
            ? 'Paquete TPS'
            : MECHANIZED_SERVICES.has(m.service)
              ? 'Mecanizada'
              : r.has(m.service)
                ? 'Manual'
                : 'Sin clasificar';
      l.push({
        id: o + ':' + m.id,
        source: o,
        sourceRow: m.sourceRow,
        date: m.date,
        week: m.week,
        producer: E,
        hacienda: m.hacienda,
        suerte: m.suerte,
        labor: m.labor,
        service: m.service,
        name: m.serviceName || m.laborName,
        unit: m.unit,
        units: m.units,
        amount: 'total' in m ? m.total : 0,
        pFact: 'pFact' in m ? m.pFact : '',
        contractor: 'contractorCode' in m ? m.contractorCode : 'CS9999',
        classification: I,
        scope: D,
        ...computeAge(f, m.date),
      });
    }
  return l;
}
