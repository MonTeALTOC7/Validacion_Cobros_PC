// Análisis financiero de las prefacturas (montos cobrados a productores).
//
// Fuente única: filas de Prefactura del período configurado. Los montos son los "Total" informados por
// SIAGRI; no se recalculan ni se estiman montos de trabajo no prefacturado (las tarifas varían dentro
// de un mismo servicio y productor, por lo que valorizar lo pendiente sería inventar una regla).
//
// Dos magnitudes de hectáreas, nunca mezcladas:
// - Área física de suertes: área de cada suerte (Maestro; si no, "Area de la Suerte" de Prefactura),
//   contada una sola vez por suerte. Base del indicador C$/ha de suerte.
// - HA trabajadas: unidades con UM "HA" (trabajo acumulado). Base de la tarifa media por HA trabajada.
import { CASUR_CONTRACTOR, DIRECT_SERVICES, MECHANIZED_SERVICES, TPS_BILLED_SERVICE, TPS_STAGE_SERVICES } from './constants';
import { groupBy, lotKey, round } from './normalize';
import { comparePeriods, isInPeriodRange, periodKey, resolveStartPeriod } from './periods';

export const FINANCE_CLASSES = {
  MANUAL: 'Manual',
  MECANIZADA: 'Mecanizada',
  TPS: 'Paquete TPS (siembra)',
  TPS_EXTERNO: 'TPS externo (CS3625)',
  AEREA: 'Aplicación aérea',
  CS2661: 'CS2661 · universo separado',
  OTRO: 'Otro contratista',
  SIN_CLASIFICAR: 'Sin clasificar',
};

export const FINANCE_CLASS_ORDER = Object.keys(FINANCE_CLASSES);

/** Clase financiera de una fila de Prefactura (mismas reglas que la conciliación). */
export const financeClass = (row) => {
  if (row.labor === 'AAM' || row.contractorCode === 'CS3317') return 'AEREA';
  if (row.contractorCode === 'CS3625') return 'TPS_EXTERNO';
  if (row.contractorCode === 'CS2661') return 'CS2661';
  if (row.contractorCode !== CASUR_CONTRACTOR) return 'OTRO';
  if (row.service === TPS_BILLED_SERVICE || row.labor === 'TPS') return 'TPS';
  if (MECHANIZED_SERVICES.has(row.service)) return 'MECANIZADA';
  if (DIRECT_SERVICES.has(row.service) || TPS_STAGE_SERVICES.has(row.service)) return 'MANUAL';
  return 'SIN_CLASIFICAR';
};

/** Área física única por suerte: Maestro (si es única y positiva) o la informada en Prefactura. */
const buildLotAreas = (master, prefactura) => {
  const masterAreas = groupBy(
    master.filter((row) => Number.isFinite(row.area) && row.area > 0),
    (row) => lotKey(row.hacienda, row.suerte),
  );
  const areas = new Map();
  masterAreas.forEach((rows, key) => {
    const distinct = [...new Set(rows.map((row) => row.area))];
    if (distinct.length === 1) areas.set(key, { area: distinct[0], source: 'Maestro' });
  });
  prefactura.forEach((row) => {
    const key = lotKey(row.hacienda, row.suerte);
    if (!areas.has(key) && Number.isFinite(row.lotArea) && row.lotArea > 0)
      areas.set(key, { area: row.lotArea, source: 'Prefactura' });
  });
  return areas;
};

/** Filas de Prefactura del período con clase, productor, factura, período y área de la suerte. */
export const buildFinanceRows = (inputs, startDate) => {
  const startPeriod = resolveStartPeriod([...inputs.payroll, ...inputs.prefactura], startDate);
  const rows = inputs.prefactura.filter((row) => (row.year != null ? isInPeriodRange(row, startPeriod) : row.date >= startDate));
  const areas = buildLotAreas(inputs.master, rows);
  return rows.map((row) => {
    const lot = lotKey(row.hacienda, row.suerte);
    const area = areas.get(lot);
    return {
      id: row.id,
      sourceFile: row.sourceFile ?? '',
      sourceRow: row.sourceRow,
      year: row.year ?? null,
      week: row.week,
      period: row.year != null ? periodKey(row.year, row.week) : `S${row.week}`,
      date: row.date,
      producerCode: row.producerCode,
      producerName: row.producerName ?? row.producer,
      hacienda: row.hacienda,
      haciendaCode: row.haciendaCode,
      suerte: row.suerte,
      lot,
      lotArea: area?.area ?? null,
      lotAreaSource: area?.source ?? '',
      labor: row.labor,
      laborName: row.laborName,
      service: row.service,
      serviceName: row.serviceName,
      unit: row.unit,
      units: row.units,
      tariff: row.tariff,
      total: row.total,
      pFact: row.pFact,
      invoice: row.invoice ?? '',
      contractorCode: row.contractorCode,
      financeClass: financeClass(row),
    };
  });
};

const emptyGroup = (key, label) => ({
  key,
  label,
  total: 0,
  rows: 0,
  invoices: new Set(),
  producers: new Set(),
  haciendas: new Set(),
  lots: new Map(),
  haUnits: 0,
  haAmount: 0,
  byClass: {},
  byUnit: {},
  periods: new Set(),
  tariffs: new Set(),
});

const finalizeGroup = (group) => {
  let area = 0;
  let lotsWithArea = 0;
  group.lots.forEach((lotArea) => {
    if (lotArea != null) {
      area += lotArea;
      lotsWithArea += 1;
    }
  });
  const periods = [...group.periods].sort(comparePeriods);
  return {
    key: group.key,
    label: group.label,
    total: round(group.total, 2),
    rows: group.rows,
    invoices: group.invoices.size,
    producers: group.producers.size,
    haciendas: group.haciendas.size,
    lots: group.lots.size,
    lotsWithArea,
    area: round(area, 2),
    perHa: area > 0 ? round(group.total / area, 2) : null,
    haUnits: round(group.haUnits, 2),
    haAmount: round(group.haAmount, 2),
    perHaWorked: group.haUnits > 0 ? round(group.haAmount / group.haUnits, 2) : null,
    byClass: Object.fromEntries(Object.entries(group.byClass).map(([key, value]) => [key, round(value, 2)])),
    byUnit: Object.fromEntries(
      Object.entries(group.byUnit).map(([unit, value]) => [
        unit,
        { units: round(value.units, 2), amount: round(value.amount, 2) },
      ]),
    ),
    firstPeriod: periods[0] ?? '',
    lastPeriod: periods.at(-1) ?? '',
    tariffs: [...group.tariffs].sort((a, b) => a - b),
  };
};

/** Agrega filas financieras por una dimensión. Devuelve grupos ordenados por total descendente. */
export const aggregateFinance = (rows, keyOf, labelOf = keyOf) => {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    let group = groups.get(key);
    if (!group) {
      group = emptyGroup(key, labelOf(row));
      groups.set(key, group);
    }
    group.total += row.total;
    group.rows += 1;
    if (row.pFact) group.invoices.add(row.pFact);
    group.producers.add(row.producerName);
    group.haciendas.add(row.hacienda);
    if (!group.lots.has(row.lot)) group.lots.set(row.lot, row.lotArea);
    if (row.unit === 'HA') {
      group.haUnits += row.units;
      group.haAmount += row.total;
    }
    group.byClass[row.financeClass] = (group.byClass[row.financeClass] ?? 0) + row.total;
    const unit = (group.byUnit[row.unit] ??= { units: 0, amount: 0 });
    unit.units += row.units;
    unit.amount += row.total;
    group.periods.add(row.period);
    if (Number.isFinite(row.tariff)) group.tariffs.add(row.tariff);
  }
  return [...groups.values()]
    .map(finalizeGroup)
    .sort((a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label)));
};

export const FINANCE_DIMENSIONS = {
  producer: { label: 'Productor', keyOf: (row) => row.producerCode || row.producerName, labelOf: (row) => row.producerName },
  hacienda: { label: 'Finca / hacienda', keyOf: (row) => row.hacienda, labelOf: (row) => row.hacienda },
  lot: { label: 'Suerte', keyOf: (row) => row.lot, labelOf: (row) => `${row.hacienda} · ${row.suerte}` },
  labor: { label: 'Labor', keyOf: (row) => row.labor, labelOf: (row) => `${row.labor} · ${row.laborName || row.serviceName}` },
  service: {
    label: 'Servicio',
    keyOf: (row) => `${row.service}|${row.unit}`,
    labelOf: (row) => `${row.service} · ${row.serviceName} (${row.unit})`,
  },
  financeClass: { label: 'Tipo de labor', keyOf: (row) => row.financeClass, labelOf: (row) => FINANCE_CLASSES[row.financeClass] },
  contractor: {
    label: 'Contratista',
    keyOf: (row) => row.contractorCode || 'SIN CÓDIGO',
    labelOf: (row) => row.contractorCode || 'Sin código',
  },
  period: { label: 'Semana', keyOf: (row) => row.period, labelOf: (row) => row.period },
  invoice: {
    label: 'Prefactura (P.FACT)',
    keyOf: (row) => row.pFact || '(sin P.FACT)',
    labelOf: (row) => row.pFact || '(sin P.FACT)',
  },
};

/** Resumen ejecutivo de un conjunto de filas financieras. */
export const financeSummary = (rows) => {
  const overall =
    aggregateFinance(
      rows,
      () => 'ALL',
      () => 'Total',
    )[0] ?? finalizeGroup(emptyGroup('ALL', 'Total'));
  const byPeriod = aggregateFinance(rows, FINANCE_DIMENSIONS.period.keyOf, FINANCE_DIMENSIONS.period.labelOf).sort((a, b) =>
    comparePeriods(a.key, b.key),
  );
  const byClass = aggregateFinance(rows, FINANCE_DIMENSIONS.financeClass.keyOf, FINANCE_DIMENSIONS.financeClass.labelOf);
  const byProducer = aggregateFinance(rows, FINANCE_DIMENSIONS.producer.keyOf, FINANCE_DIMENSIONS.producer.labelOf);
  const byLabor = aggregateFinance(rows, FINANCE_DIMENSIONS.labor.keyOf, FINANCE_DIMENSIONS.labor.labelOf);
  const byContractor = aggregateFinance(rows, FINANCE_DIMENSIONS.contractor.keyOf, FINANCE_DIMENSIONS.contractor.labelOf);
  const last = byPeriod.at(-1);
  const previous = byPeriod.at(-2);
  const recent = byPeriod.slice(-4);
  return {
    overall,
    byPeriod,
    byClass,
    byProducer,
    byLabor,
    byContractor,
    lastPeriod: last ?? null,
    previousPeriod: previous ?? null,
    lastFourAverage: recent.length ? round(recent.reduce((total, group) => total + group.total, 0) / recent.length, 2) : 0,
    topProducerShare: overall.total ? (byProducer[0]?.total ?? 0) / overall.total : 0,
    top5ProducerShare: overall.total
      ? byProducer.slice(0, 5).reduce((total, group) => total + group.total, 0) / overall.total
      : 0,
  };
};

/** Resumen por prefactura (P.FACT): productor, finca, fechas, períodos y líneas. */
export const invoiceSummaries = (rows) =>
  [...groupBy(rows, (row) => row.pFact || '(sin P.FACT)')]
    .map(([pFact, list]) => {
      const dates = list.map((row) => row.date).sort();
      const periods = [...new Set(list.map((row) => row.period))].sort(comparePeriods);
      return {
        pFact,
        producerName: [...new Set(list.map((row) => row.producerName))].join(' / '),
        producerCode: [...new Set(list.map((row) => row.producerCode))].join(' / '),
        haciendas: [...new Set(list.map((row) => row.hacienda))].join(' / '),
        lots: new Set(list.map((row) => row.lot)).size,
        lines: list.length,
        total: round(
          list.reduce((total, row) => total + row.total, 0),
          2,
        ),
        firstDate: dates[0],
        lastDate: dates.at(-1),
        periods,
        classes: [...new Set(list.map((row) => FINANCE_CLASSES[row.financeClass]))].join(', '),
      };
    })
    .sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)) || b.pFact.localeCompare(a.pFact));

/**
 * Pendientes de cobro por productor (unidades, por UM), a partir de la conciliación: se asigna a cada
 * hacienda el productor que la Prefactura informa para ella. No se valoriza en córdobas.
 */
export const pendingByProducer = (findings, financeRows, isPending) => {
  const producerByHacienda = new Map();
  financeRows.forEach((row) => {
    const set = producerByHacienda.get(row.hacienda) ?? new Set();
    set.add(row.producerName);
    producerByHacienda.set(row.hacienda, set);
  });
  const result = new Map();
  findings.filter(isPending).forEach((finding) => {
    const producers = producerByHacienda.get(finding.hacienda);
    const producer = producers?.size === 1 ? [...producers][0] : `${finding.hacienda} · titular sin confirmar`;
    const entry = result.get(producer) ?? { producer, cases: 0, byUnit: {} };
    entry.cases += 1;
    const pending =
      finding.status === 'COBRO_PARCIAL' ? Math.max(0, finding.payrollUnits - finding.billedUnits) : finding.payrollUnits;
    entry.byUnit[finding.unit] = round((entry.byUnit[finding.unit] ?? 0) + pending, 2);
    result.set(producer, entry);
  });
  return result;
};
