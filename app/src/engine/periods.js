// Períodos operativos SIAGRI: año operativo + semana.
//
// Hecho verificado en los reportes 2025–2026: la numeración SIAGRI no coincide con el año calendario
// en el cambio de año. Las fechas del 22 al 31 de diciembre de 2025 vienen como semanas 1 y 2 (de 2026)
// y las del 1 al 21 de diciembre como semanas 50–52 (de 2025). La columna "Periodo" de la Prefactura lo
// confirma: "SEMANA 2 - 29/12/25 - 04/01/26".
//
// Regla aplicada (sin asumir semana ISO): el año operativo es el año de la fecha, salvo
//   - fecha de diciembre con semana ≤ 26 → año siguiente;
//   - fecha de enero con semana ≥ 27 → año anterior.

export const operationalYear = (date, week) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (month === 12 && week <= 26) return year + 1;
  if (month === 1 && week >= 27) return year - 1;
  return year;
};

export const periodKey = (year, week) => `${year}-S${String(week).padStart(2, '0')}`;

export const parsePeriodKey = (key) => {
  const match = /^(\d{4})-S(\d{1,2})$/.exec(key ?? '');
  return match ? { year: Number(match[1]), week: Number(match[2]) } : null;
};

/** Orden cronológico de períodos (año, semana). Acepta claves "AAAA-SNN" u objetos { year, week }. */
export const comparePeriods = (a, b) => {
  const pa = typeof a === 'string' ? parsePeriodKey(a) : a;
  const pb = typeof b === 'string' ? parsePeriodKey(b) : b;
  if (!pa || !pb || pa.year == null || pb.year == null)
    return String(a?.week ?? a).localeCompare(String(b?.week ?? b), 'es', { numeric: true });
  return pa.year - pb.year || pa.week - pb.week;
};

/** Etiqueta corta: "S35" si hay un solo año en los datos, "2026 · S35" si hay varios. */
export const periodLabel = (year, week, multiYear) => (multiYear ? `${year} · S${week}` : `S${week}`);

/** Interpreta la columna Periodo de la Prefactura: "SEMANA 10  -  23/02/26 - 01/03/26". */
export const parsePeriodoText = (value) => {
  const match = /SEMANA\s+(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(
    String(value ?? ''),
  );
  if (!match) return null;
  const iso = (d, m, y) => {
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    return date.getUTCDate() === Number(d) ? date.toISOString().slice(0, 10) : '';
  };
  const start = iso(match[2], match[3], match[4]);
  const end = iso(match[5], match[6], match[7]);
  return start && end ? { week: Number(match[1]), start, end } : null;
};

/**
 * Índice lineal de semanas para medir distancias entre períodos de años distintos (ventana TPS).
 * El número de semanas de cada año operativo se toma de los datos (máxima semana observada, mínimo 52).
 */
export const createWeekIndex = (rows) => {
  const maxWeek = new Map();
  rows.forEach((row) => {
    if (row.year == null) return;
    maxWeek.set(row.year, Math.max(maxWeek.get(row.year) ?? 52, row.week));
  });
  const years = [...maxWeek.keys()].sort((a, b) => a - b);
  const base = years[0] ?? 2000;
  const offsets = new Map();
  let offset = 0;
  for (let year = base; year <= (years.at(-1) ?? base) + 1; year += 1) {
    offsets.set(year, offset);
    offset += maxWeek.get(year) ?? 52;
  }
  return (year, week) => {
    if (offsets.has(year)) return offsets.get(year) + week;
    // Fuera del rango observado: aproximación con 52 semanas por año.
    return (year - base) * 52 + week;
  };
};

/**
 * Período inicial a partir de una fecha: el primer período (año, semana) que contiene alguna fila con
 * fecha ≥ fecha inicial. Así una semana operativa no se parte por la fecha (p. ej. semana 2 de 2026,
 * que empieza el 29/12/2025, se incluye completa al iniciar el 01/01/2026).
 */
export const resolveStartPeriod = (rows, startDate) => {
  let best = null;
  for (const row of rows) {
    if (row.year == null || !row.date || row.date < startDate) continue;
    if (!best || comparePeriods(row, best) < 0) best = { year: row.year, week: row.week };
  }
  return best;
};

/** ¿La fila pertenece al período inicial o posterior? */
export const isInPeriodRange = (row, startPeriod) => !!startPeriod && row.year != null && comparePeriods(row, startPeriod) >= 0;

/** Calendario oficial por período, a partir de la columna Periodo de la Prefactura. */
export const buildOfficialCalendar = (prefactura) => {
  const calendar = new Map();
  prefactura.forEach((row) => {
    if (!row.periodStart || !row.periodEnd || row.year == null) return;
    const key = periodKey(row.year, row.week);
    if (!calendar.has(key)) calendar.set(key, { start: row.periodStart, end: row.periodEnd });
  });
  return calendar;
};
