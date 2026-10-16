// Utilidades puras para la consulta de detalle (drill-down). No calculan montos nuevos: agrupan las mismas filas
// que muestra cada indicador, de modo que la suma de los grupos coincide siempre con el total de origen.
import { FINANCE_DIMENSIONS, aggregateFinance, financeClass, financeUniverse } from '../engine/finance';
import { directKey } from '../engine/reconciliation';
import { comparePeriods } from '../engine/periods';
import { normalizeText } from '../engine/normalize';

/** Dimensiones navegables del detalle financiero, en el orden en que se ofrecen. */
export const DRILL_DIMENSIONS = ['producer', 'hacienda', 'lot', 'labor', 'service', 'contractor', 'period', 'invoice'];

export const DIMENSION_TAB_LABELS = {
  producer: 'Por productor',
  hacienda: 'Por finca',
  lot: 'Por suerte',
  labor: 'Por labor',
  service: 'Por servicio',
  contractor: 'Por contratista',
  period: 'Por semana',
  invoice: 'Por prefactura',
};

const r2 = (value) => Math.round(value * 100) / 100;

/** Dimensiones con más de un valor en las filas (las de un solo valor no aportan desglose). */
export const availableDimensions = (rows) =>
  DRILL_DIMENSIONS.filter((dimension) => new Set(rows.map(FINANCE_DIMENSIONS[dimension].keyOf)).size > 1);

/** Grupos de una dimensión; la semana se ordena cronológicamente y el resto por total. */
export const groupRows = (rows, dimension) => {
  const { keyOf, labelOf } = FINANCE_DIMENSIONS[dimension];
  const groups = aggregateFinance(rows, keyOf, labelOf);
  return dimension === 'period' ? groups.sort((a, b) => comparePeriods(a.key, b.key)) : groups;
};

/** Filas de un grupo de la dimensión. */
export const rowsOfGroup = (rows, dimension, key) => rows.filter((row) => FINANCE_DIMENSIONS[dimension].keyOf(row) === key);

/** Total (C$) de un conjunto de filas, redondeado como los indicadores. */
export const totalOf = (rows) => r2(rows.reduce((total, row) => total + row.total, 0));

/** Cantidades por unidad de medida: nunca se suman unidades distintas. */
export const unitTotals = (rows) =>
  Object.entries(
    rows.reduce((map, row) => {
      map[row.unit] = (map[row.unit] ?? 0) + row.units;
      return map;
    }, {}),
  )
    .map(([unit, units]) => ({ unit, units: r2(units) }))
    .sort((a, b) => a.unit.localeCompare(b.unit));

/** Búsqueda de texto en líneas financieras (productor, finca, suerte, labor, servicio, P.FACT, contratista, fila). */
export const searchLines = (rows, query) => {
  const search = normalizeText(query);
  if (!search) return rows;
  return rows.filter((row) =>
    normalizeText(
      [
        row.producerName,
        row.hacienda,
        row.suerte,
        row.labor,
        row.laborName,
        row.service,
        row.serviceName,
        row.pFact,
        row.contractorCode,
        row.sourceRow,
        row.date,
      ].join(' '),
    ).includes(search),
  );
};

// ---------------------------------------------------------------------------------------------
// "Aplicar como filtro": solo cuando la selección equivale exactamente a filtros reales de la página.

/** Filtros de la página Financiero (misma semántica que FinancePanel). */
export const applyFinanceFilters = (rows, filters) => {
  const search = normalizeText(filters.search ?? '');
  return rows.filter(
    (row) =>
      (!filters.from || comparePeriods(row.period, filters.from) >= 0) &&
      (!filters.to || comparePeriods(row.period, filters.to) <= 0) &&
      (filters.producer === 'all' || row.producerName === filters.producer) &&
      (filters.hacienda === 'all' || row.hacienda === filters.hacienda) &&
      (filters.financeClass === 'all' || row.financeClass === filters.financeClass) &&
      (filters.contractor === 'all' || (row.contractorCode || 'SIN CÓDIGO') === filters.contractor) &&
      (filters.universe === 'all' || row.universe === filters.universe) &&
      (!search ||
        normalizeText(
          `${row.producerName} ${row.hacienda} ${row.suerte} ${row.labor} ${row.service} ${row.serviceName} ${row.pFact}`,
        ).includes(search)),
  );
};

/** Paso de navegación → filtro de la página. Las dimensiones sin filtro equivalente (suerte, labor, servicio, P.FACT) devuelven null. */
const filterForStep = (step, rows) => {
  switch (step.dimension) {
    case 'producer': {
      const names = new Set(rows.map((row) => row.producerName));
      return names.size === 1 ? { producer: [...names][0] } : null;
    }
    case 'hacienda':
      return { hacienda: step.key };
    case 'contractor':
      return { contractor: step.key };
    case 'financeClass':
      return { financeClass: step.key };
    case 'universe':
      return { universe: step.key };
    case 'period':
      return { from: step.key, to: step.key };
    default:
      return null;
  }
};

/**
 * Filtros equivalentes a una selección del detalle, o un motivo si no se puede representar.
 * Se verifica que los filtros propuestos den exactamente las mismas líneas que la selección.
 */
export const filtersForSelection = (allRows, baseFilters, path, selectionRows) => {
  if (!path.length) return { filters: null, reason: 'La selección ya corresponde a los filtros actuales.' };
  let filters = { ...baseFilters };
  for (const step of path) {
    const extra = filterForStep(step, selectionRows);
    if (!extra) {
      return {
        filters: null,
        reason: `“${step.label}” (${(DIMENSION_TAB_LABELS[step.dimension] ?? step.dimension).replace('Por ', '')}) no tiene un filtro equivalente en la página.`,
      };
    }
    // Una semana elegida dentro de un rango ya filtrado reemplaza el rango por esa semana.
    filters = { ...filters, ...extra };
  }
  const expected = new Set(selectionRows.map((row) => row.id));
  const actual = applyFinanceFilters(allRows, filters);
  const same = actual.length === expected.size && actual.every((row) => expected.has(row.id));
  return same
    ? { filters, reason: '' }
    : { filters: null, reason: 'Los filtros disponibles no reproducen exactamente esta selección.' };
};

// ---------------------------------------------------------------------------------------------
// Repeticiones de Prefactura con evidencia de Nómina (sin conclusiones automáticas).

/** Líneas distintas de un conjunto de grupos: una línea en varios grupos se cuenta una vez. */
export const distinctRepetitionLines = (groups) => {
  const byId = new Map();
  groups.forEach((group) => group.rows.forEach((row) => byId.set(row.id, row)));
  const rows = [...byId.values()];
  return { rows, count: rows.length, amount: r2(rows.reduce((total, row) => total + row.total, 0)) };
};

/** Índice de Nómina por clave de conciliación directa (año, semana, hacienda, suerte, labor, servicio, UM). */
export const payrollIndex = (payroll) => {
  const index = new Map();
  payroll.forEach((row) => {
    const key = directKey(row);
    const list = index.get(key);
    if (list) list.push(row);
    else index.set(key, [row]);
  });
  return index;
};

/**
 * Evidencia disponible para un grupo de líneas de Prefactura: Nómina de la misma clave y todas las líneas de
 * Prefactura de esa clave. Solo describe; no califica el caso.
 */
export const repetitionEvidence = (group, prefactura, payrollByKey) => {
  const first = group.rows[0];
  const key = directKey(first);
  const universe = financeUniverse(financeClass(first));
  const payrollRows = [...(payrollByKey.get(key) ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sourceRow - b.sourceRow,
  );
  const keyLines = prefactura.filter((row) => directKey(row) === key).sort((a, b) => a.sourceRow - b.sourceRow);
  return {
    key,
    universe,
    payrollApplies: universe === 'CONCILIABLE',
    payrollRows,
    payrollUnits: unitTotals(payrollRows),
    keyLines,
    keyUnits: unitTotals(keyLines),
    keyAmount: totalOf(keyLines),
  };
};
