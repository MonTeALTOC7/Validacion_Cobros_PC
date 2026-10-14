// Aplicaciones estimadas por suerte: agrupa ejecuciones por fechas cercanas y las compara con el área
// del Maestro. Es una estimación orientativa: HA de labor es trabajo acumulado, no superficie física.
import { lotKey } from './normalize';

export const DEFAULT_APPLICATION_RULE = { gapDays: 7, maxDays: 14, repeatDays: 3, tolerancePct: 5 };
export const APPLICATION_RULES_STORAGE_KEY = 'casur-application-rules-v1';

export const ruleKey = (row) => JSON.stringify([row.labor, row.service]);

export const isValidRule = (rule) =>
  Number.isInteger(rule.gapDays) &&
  rule.gapDays >= 1 &&
  rule.gapDays <= 90 &&
  Number.isInteger(rule.maxDays) &&
  rule.maxDays >= rule.gapDays &&
  rule.maxDays <= 180 &&
  Number.isInteger(rule.repeatDays) &&
  rule.repeatDays >= 1 &&
  rule.repeatDays <= rule.maxDays &&
  Number.isFinite(rule.tolerancePct) &&
  rule.tolerancePct >= 0 &&
  rule.tolerancePct <= 20;

export const APPLICATION_STATUS_LABELS = {
  COMPLETA: 'Área completa estimada',
  PARCIAL: 'Área parcial',
  SOBREAREA: 'Supera el área · revisar',
  SIN_AREA: 'Sin área confiable',
  NO_HA: 'Jornada · sin equivalencia HA',
  REVISAR: 'Datos por revisar',
};

/** Número de día (desde 1970) de una fecha ISO válida; NaN si no es válida. */
export const dateToDayNumber = (iso) => {
  const time = Date.parse(iso);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso
    ? time / 864e5
    : NaN;
};

/** Reglas guardadas en este dispositivo (localStorage), validadas; si no hay o son inválidas, las de fábrica. */
export const loadApplicationRules = () => {
  const fallback = { base: { ...DEFAULT_APPLICATION_RULE }, overrides: {} };
  try {
    const stored = JSON.parse(localStorage.getItem(APPLICATION_RULES_STORAGE_KEY) ?? 'null');
    if (!stored || !isValidRule(stored.base) || !stored.overrides) return fallback;
    return {
      base: stored.base,
      overrides: Object.fromEntries(Object.entries(stored.overrides).filter(([, rule]) => isValidRule(rule))),
    };
  } catch {
    return fallback;
  }
};

const EPSILON = 1e-9;

export function buildApplicationEpisodes(rows, master, rules) {
  const masterByLot = new Map();
  master.forEach((row) => {
    const key = lotKey(row.hacienda, row.suerte);
    masterByLot.set(key, [...(masterByLot.get(key) ?? []), row]);
  });
  const series = new Map();
  rows.forEach((row) => {
    const key = JSON.stringify([row.hacienda, row.suerte, row.labor, row.service, row.unit, row.source]);
    series.set(key, [...(series.get(key) ?? []), row]);
  });
  const episodes = [];
  for (const [seriesKey, list] of series) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const first = list[0];
    const masterRows = masterByLot.get(lotKey(first.hacienda, first.suerte)) ?? [];
    const areas = [...new Set(masterRows.map((row) => row.area).filter((area) => typeof area === 'number' && Number.isFinite(area) && area > 0))];
    const area = areas.length === 1 ? areas[0] : null;
    const candidate = rules.overrides[ruleKey(first)] ?? rules.base;
    const rule = isValidRule(candidate) ? { ...candidate } : { ...DEFAULT_APPLICATION_RULE };
    const cycleDates = [
      ...new Set(
        masterRows.flatMap((row) => [row.plantingDate, row.lastCutDate]).filter((date) => !!date && Number.isFinite(dateToDayNumber(date))),
      ),
    ].sort();
    const cycleOf = (date) => cycleDates.filter((cycleDate) => cycleDate <= date).at(-1) ?? '';
    const byDate = new Map();
    list.forEach((row) => byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]));
    let current = [];
    let sequence = 0;
    const quantityOf = (items) => items.reduce((total, row) => total + (Number.isFinite(row.units) ? row.units : 0), 0);
    const close = () => {
      if (!current.length) return;
      const quantity = quantityOf(current);
      const isHa = first.unit === 'HA';
      const equivalent = isHa && area ? quantity / area : null;
      const invalid = current.some((row) => !Number.isFinite(dateToDayNumber(row.date)) || !Number.isFinite(row.units) || row.units <= 0);
      let status;
      if (invalid) status = 'REVISAR';
      else if (!isHa) status = 'NO_HA';
      else if (!area) status = 'SIN_AREA';
      else if (equivalent < 1 - rule.tolerancePct / 100 - EPSILON) status = 'PARCIAL';
      else if (equivalent > 1 + rule.tolerancePct / 100 + EPSILON) status = 'SOBREAREA';
      else status = 'COMPLETA';
      const notes = ['Agrupación estimada por fechas; no demuestra cobertura física uniforme del lote.'];
      if (area) notes.push('Área de referencia del maestro cargado; no acredita el área histórica de cada ejecución.');
      else {
        notes.push(
          areas.length > 1
            ? 'El maestro contiene áreas distintas para esta suerte. Actualice o aclare el maestro.'
            : 'No hay área positiva de la suerte exacta; no se sustituye por el área de la hacienda.',
        );
      }
      if (first.source === 'Prefactura') {
        notes.push('Fechas de registro del reporte mecanizado: aplicaciones orientativas, ejecución no confirmada.');
      }
      if (status === 'SOBREAREA') {
        notes.push('El exceso no se convierte automáticamente en dos o más aplicaciones. Revise las fechas y el detalle.');
      }
      if (status === 'NO_HA') {
        notes.push(
          'Se cuentan jornadas agrupadas, no aplicaciones completas: esta unidad no es convertible a hectáreas sin una regla validada.',
        );
      }
      if (invalid) notes.push('Hay cantidades nulas, negativas, no numéricas o fechas inválidas. Se conservan para revisión.');
      episodes.push({
        id: seriesKey + ':' + current[0].id,
        sequence: ++sequence,
        rows: current,
        start: current[0].date,
        end: current.at(-1).date,
        area,
        quantity,
        equivalent,
        status,
        rule,
        notes,
      });
      current = [];
    };
    for (const [date, sameDay] of byDate) {
      if (current.length) {
        const gap = dateToDayNumber(date) - dateToDayNumber(current.at(-1).date);
        const span = dateToDayNumber(date) - dateToDayNumber(current[0].date);
        const areaReached = first.unit === 'HA' && area !== null && quantityOf(current) >= area * (1 - rule.tolerancePct / 100) - EPSILON;
        if (
          !Number.isFinite(gap) ||
          gap > rule.gapDays ||
          span >= rule.maxDays ||
          cycleOf(date) !== cycleOf(current[0].date) ||
          (areaReached && gap >= rule.repeatDays)
        ) {
          close();
        }
      }
      current.push(...sameDay);
    }
    close();
  }
  return episodes.sort((a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id));
}

/** Episodios recortados a las filas visibles (filtros activos). */
export const clipEpisodesToRows = (episodes, rows) => {
  const visibleIds = new Set(rows.map((row) => row.id));
  return episodes.flatMap((episode) => {
    const visible = episode.rows.filter((row) => visibleIds.has(row.id));
    return visible.length ? [{ ...episode, visible, clipped: visible.length !== episode.rows.length }] : [];
  });
};
