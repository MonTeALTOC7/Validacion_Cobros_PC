// Seguimiento de labores: universo de trabajo realizado (Nómina + mecanizadas de Prefactura).
import { DIRECT_SERVICES, MECHANIZED_SERVICES, TPS_STAGE_SERVICES } from './constants';
import { lotKey, normalizeText } from './normalize';
import { isInPeriodRange, periodKey, resolveStartPeriod } from './periods';
import { splitProducerInvoice } from './importers';

/** Edad del cultivo en la fecha de la labor, desde la fecha más reciente (siembra/corte) no posterior a ella. */
export const computeAge = (masterRow, date) => {
  if (!masterRow) return { ageDays: null, ageBase: '', ageNote: 'Sin maestro exacto de la suerte' };
  const base = [masterRow.plantingDate, masterRow.lastCutDate]
    .filter((value) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01')
    .sort()
    .at(-1);
  if (!base) {
    return { ageDays: null, ageBase: '', ageNote: 'Faltan fechas de siembra/corte; recargue el maestro para incorporarlas' };
  }
  if (base > date) {
    return { ageDays: null, ageBase: base, ageNote: 'Labor anterior al ciclo del maestro; falta historial de cortes' };
  }
  const days = Math.floor((Date.parse(date) - Date.parse(base)) / 864e5);
  return {
    ageDays: Number.isFinite(days) ? days : null,
    ageBase: base,
    ageNote: base === masterRow.lastCutDate ? 'Desde último corte del maestro' : 'Desde siembra del maestro',
  };
};

export const ageBucket = (days) => {
  if (days === null) return 'Sin edad';
  if (days <= 30) return '0–30 días';
  if (days <= 60) return '31–60 días';
  if (days <= 90) return '61–90 días';
  if (days <= 120) return '91–120 días';
  return 'Más de 120 días';
};

export const laborUnitKey = (row) => JSON.stringify([row.labor, row.unit]);

export const sumUnits = (rows) => rows.reduce((total, row) => total + row.units, 0);

const LABOR_NAMES = {
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
};
export const laborDisplayName = (row) => LABOR_NAMES[row.labor] || row.name || row.labor;

/**
 * Seguimiento sin doble conteo: toda la Nómina, más las labores mecanizadas de Prefactura que no
 * tengan una fila de Nómina con la misma semana/hacienda/suerte/labor/servicio/UM.
 * Las manuales de Prefactura nunca se suman (la Nómina es la fuente primaria).
 */
export const buildTrackingRows = (inputs, startDate) => {
  const rows = buildActivityRows(inputs, startDate);
  // El año operativo forma parte de la clave: la semana 10 de 2026 y la de 2027 son períodos distintos.
  const key = (row) => [row.year ?? '', row.week, row.hacienda, row.suerte, row.labor, row.service, row.unit].join('|');
  const payrollKeys = new Set(rows.filter((row) => row.source === 'Nómina').map(key));
  return rows.filter((row) => row.source === 'Nómina' || (row.classification === 'Mecanizada' && !payrollKeys.has(key(row))));
};

const classify = (row, manualServices) => {
  if (row.labor === 'AAM') return 'AAM · separada';
  if (row.labor === 'TPS') return 'Paquete TPS';
  if (MECHANIZED_SERVICES.has(row.service)) return 'Mecanizada';
  if (manualServices.has(row.service)) return 'Manual';
  return 'Sin clasificar';
};

/** Nombre de productor sin el sufijo "FACTURA :n" (compatible con filas guardadas por v0.7). */
const producerNameOf = (row) => row.producerName ?? normalizeText(splitProducerInvoice(row.producer).name);

/**
 * Filas de actividad de Nómina y Prefactura desde el período operativo que contiene `startDate`,
 * con productor, ámbito, clase y edad.
 */
export function buildActivityRows(inputs, startDate) {
  const startPeriod = resolveStartPeriod([...inputs.payroll, ...inputs.prefactura], startDate);
  const masterByLot = new Map();
  inputs.master.forEach((row) => {
    const key = lotKey(row.hacienda, row.suerte);
    if (!masterByLot.has(key) || row.producerScope) masterByLot.set(key, row);
  });
  const producersByHacienda = new Map();
  inputs.prefactura.forEach((row) => {
    const name = producerNameOf(row);
    if (!name) return;
    const set = producersByHacienda.get(row.hacienda) ?? new Set();
    set.add(name);
    producersByHacienda.set(row.hacienda, set);
  });
  const producerHaciendas = new Set(inputs.master.filter((row) => row.producerScope).map((row) => row.hacienda));
  const manualServices = new Set([...DIRECT_SERVICES, ...TPS_STAGE_SERVICES, ...inputs.payroll.map((row) => row.service)]);
  const activity = [];
  for (const [source, rows] of [
    ['Nómina', inputs.payroll],
    ['Prefactura', inputs.prefactura],
  ]) {
    for (const row of rows) {
      if (row.year != null ? !isInPeriodRange(row, startPeriod) : row.date < startDate) continue;
      const master = masterByLot.get(lotKey(row.hacienda, row.suerte));
      const known = producersByHacienda.get(row.hacienda);
      const ownProducer = 'producer' in row ? producerNameOf(row) : '';
      const producer = ownProducer || (known?.size === 1 ? [...known][0] : row.hacienda + ' · titular sin confirmar');
      const scope =
        master?.producerScope || producerHaciendas.has(row.hacienda) || ownProducer
          ? 'Productores'
          : master
            ? 'CASUR / otro ámbito'
            : 'Sin maestro · revisar';
      activity.push({
        id: source + ':' + row.id,
        source,
        sourceRow: row.sourceRow,
        sourceFile: row.sourceFile,
        sourceSheet: row.sourceSheet,
        date: row.date,
        week: row.week,
        producer,
        hacienda: row.hacienda,
        suerte: row.suerte,
        labor: row.labor,
        service: row.service,
        name: row.serviceName || row.laborName,
        unit: row.unit,
        units: row.units,
        amount: 'total' in row ? row.total : 0,
        pFact: 'pFact' in row ? row.pFact : '',
        contractor: 'contractorCode' in row ? row.contractorCode : 'CS9999',
        classification: classify(row, manualServices),
        scope,
        ...computeAge(master, row.date),
        year: row.year ?? null,
        period: row.year != null ? periodKey(row.year, row.week) : '',
        tariff: 'tariff' in row ? row.tariff : null,
        payrollTariff: 'payrollTariff' in row ? row.payrollTariff : null,
      });
    }
  }
  return activity;
}
