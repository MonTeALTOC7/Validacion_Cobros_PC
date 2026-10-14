import { lotKey } from './normalize';

const DEFAULT_APPLICATION_RULE = {
  gapDays: 7,
  maxDays: 14,
  repeatDays: 3,
  tolerancePct: 5,
};
export const ruleKey = (a) => JSON.stringify([a.labor, a.service]);
export const isValidRule = (a) =>
  Number.isInteger(a.gapDays) &&
  a.gapDays >= 1 &&
  a.gapDays <= 90 &&
  Number.isInteger(a.maxDays) &&
  a.maxDays >= a.gapDays &&
  a.maxDays <= 180 &&
  Number.isInteger(a.repeatDays) &&
  a.repeatDays >= 1 &&
  a.repeatDays <= a.maxDays &&
  Number.isFinite(a.tolerancePct) &&
  a.tolerancePct >= 0 &&
  a.tolerancePct <= 20;
export const APPLICATION_STATUS_LABELS = {
  COMPLETA: 'Área completa estimada',
  PARCIAL: 'Área parcial',
  SOBREAREA: 'Supera el área · revisar',
  SIN_AREA: 'Sin área confiable',
  NO_HA: 'Jornada · sin equivalencia HA',
  REVISAR: 'Datos por revisar',
};
const dateToDayNumber = (a) => {
  const s = Date.parse(a);
  return /^\d{4}-\d{2}-\d{2}$/.test(a) && Number.isFinite(s) && new Date(s).toISOString().slice(0, 10) === a
    ? s / 864e5
    : NaN;
};
export const loadApplicationRules = () => {
  const a = {
    base: {
      ...DEFAULT_APPLICATION_RULE,
    },
    overrides: {},
  };
  try {
    const s = JSON.parse(localStorage.getItem('casur-application-rules-v1') ?? 'null');
    return !s || !isValidRule(s.base) || !s.overrides
      ? a
      : {
          base: s.base,
          overrides: Object.fromEntries(Object.entries(s.overrides).filter(([, t]) => isValidRule(t))),
        };
  } catch {
    return a;
  }
};
export function buildApplicationEpisodes(a, s, t) {
  const n = new Map();
  s.forEach((l) => {
    const o = lotKey(l.hacienda, l.suerte);
    n.set(o, [...(n.get(o) ?? []), l]);
  });
  const i = new Map();
  a.forEach((l) => {
    const o = JSON.stringify([l.hacienda, l.suerte, l.labor, l.service, l.unit, l.source]);
    i.set(o, [...(i.get(o) ?? []), l]);
  });
  const r = [];
  for (const [l, o] of i) {
    o.sort((O, C) => O.date.localeCompare(C.date) || O.id.localeCompare(C.id));
    const x = o[0];
    const m = n.get(lotKey(x.hacienda, x.suerte)) ?? [];
    const f = [
      ...new Set(m.map((O) => O.area).filter((O) => typeof O == 'number' && Number.isFinite(O) && O > 0)),
    ];
    const S = f.length === 1 ? f[0] : null;
    const A = t.overrides[ruleKey(x)] ?? t.base;
    const E = isValidRule(A)
      ? {
          ...A,
        }
      : {
          ...DEFAULT_APPLICATION_RULE,
        };
    const D = [
      ...new Set(
        m
          .flatMap((O) => [O.plantingDate, O.lastCutDate])
          .filter((O) => !!O && Number.isFinite(dateToDayNumber(O))),
      ),
    ].sort();
    const I = (O) => D.filter((C) => C <= O).at(-1) ?? '';
    const v = new Map();
    o.forEach((O) => v.set(O.date, [...(v.get(O.date) ?? []), O]));
    let N = [];
    let g = 0;
    const d = (O) => O.reduce((C, y) => C + (Number.isFinite(y.units) ? y.units : 0), 0);
    const R = () => {
      if (!N.length) return;
      const O = d(N);
      const C = x.unit === 'HA';
      const y = C && S ? O / S : null;
      const _ = N.some(
        (L) => !Number.isFinite(dateToDayNumber(L.date)) || !Number.isFinite(L.units) || L.units <= 0,
      );
      const P = _
        ? 'REVISAR'
        : C
          ? S
            ? y < 1 - E.tolerancePct / 100 - 1e-9
              ? 'PARCIAL'
              : y > 1 + E.tolerancePct / 100 + 1e-9
                ? 'SOBREAREA'
                : 'COMPLETA'
            : 'SIN_AREA'
          : 'NO_HA';
      const h = ['Agrupación estimada por fechas; no demuestra cobertura física uniforme del lote.'];
      S
        ? h.push('Área de referencia del maestro cargado; no acredita el área histórica de cada ejecución.')
        : h.push(
            f.length > 1
              ? 'El maestro contiene áreas distintas para esta suerte. Actualice o aclare el maestro.'
              : 'No hay área positiva de la suerte exacta; no se sustituye por el área de la hacienda.',
          );
      x.source === 'Prefactura' &&
        h.push(
          'Fechas de registro del reporte mecanizado: aplicaciones orientativas, ejecución no confirmada.',
        );
      P === 'SOBREAREA' &&
        h.push(
          'El exceso no se convierte automáticamente en dos o más aplicaciones. Revise las fechas y el detalle.',
        );
      P === 'NO_HA' &&
        h.push(
          'Se cuentan jornadas agrupadas, no aplicaciones completas: esta unidad no es convertible a hectáreas sin una regla validada.',
        );
      _ &&
        h.push(
          'Hay cantidades nulas, negativas, no numéricas o fechas inválidas. Se conservan para revisión.',
        );
      r.push({
        id: l + ':' + N[0].id,
        sequence: ++g,
        rows: N,
        start: N[0].date,
        end: N.at(-1).date,
        area: S,
        quantity: O,
        equivalent: y,
        status: P,
        rule: E,
        notes: h,
      });
      N = [];
    };
    for (const [O, C] of v) {
      if (N.length) {
        const y = dateToDayNumber(O) - dateToDayNumber(N.at(-1).date);
        const _ = dateToDayNumber(O) - dateToDayNumber(N[0].date);
        const P = x.unit === 'HA' && S !== null && d(N) >= S * (1 - E.tolerancePct / 100) - 1e-9;
        (!Number.isFinite(y) ||
          y > E.gapDays ||
          _ >= E.maxDays ||
          I(O) !== I(N[0].date) ||
          (P && y >= E.repeatDays)) &&
          R();
      }
      N.push(...C);
    }
    R();
  }
  return r.sort((l, o) => o.start.localeCompare(l.start) || l.id.localeCompare(o.id));
}
export const clipEpisodesToRows = (a, s) => {
  const t = new Set(s.map((n) => n.id));
  return a.flatMap((n) => {
    const i = n.rows.filter((r) => t.has(r.id));
    return i.length
      ? [
          {
            ...n,
            visible: i,
            clipped: i.length !== n.rows.length,
          },
        ]
      : [];
  });
};
