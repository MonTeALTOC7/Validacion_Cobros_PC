// Repeticiones en la Prefactura. Nada se elimina ni se descuenta: solo se clasifica para revisión.
//
// Tipos (de más a menos sospechoso), verificados con la Prefactura al 11 oct 2026:
// - DUPLICADO_EXACTO: filas idénticas en todos los campos leídos (incluidos Total y P.FACT).
// - COBRO_EN_OTRA_PREFACTURA: mismo lote, fecha, servicio, cantidad, tarifa y total, pero con P.FACT distinto.
// - MISMA_CANTIDAD_TARIFA_DISTINTA: misma clave de cobro (fecha, lote, labor, servicio, UM, P.FACT) y misma
//   cantidad, con tarifas distintas (p. ej. 3,2 D-H × 368,21 y 3,2 D-H × 724,85).
// - VARIAS_LINEAS_MISMA_CLAVE: misma clave de cobro con cantidades distintas. Es lo habitual (líneas con tarifa
//   normal y doble) y se informa solo como dato, sin bandera.
// Una repetición exacta puede tener justificación operativa: si la Nómina respalda la cantidad total, el hallazgo
// lleva la bandera "Repetición respaldada" en lugar de "Duplicado potencial".
import { round } from './normalize';

export const REPETITION_KINDS = {
  DUPLICADO_EXACTO: 'Duplicado exacto',
  COBRO_EN_OTRA_PREFACTURA: 'Mismo cobro en otra prefactura',
  MISMA_CANTIDAD_TARIFA_DISTINTA: 'Misma cantidad con tarifas distintas',
  VARIAS_LINEAS_MISMA_CLAVE: 'Varias líneas en la misma clave de cobro',
};

const EXACT_FIELDS = [
  'year', 'week', 'date', 'haciendaCode', 'hacienda', 'suerte', 'labor', 'laborName', 'service', 'serviceName', 'unit',
  'units', 'tariff', 'total', 'pFact', 'producerCode', 'producer', 'contractorCode', 'contractor', 'periodStart',
  'periodEnd', 'lotArea', 'tenureGroup', 'interfaceStatus',
];
const CONTENT_FIELDS = ['year', 'week', 'date', 'hacienda', 'suerte', 'labor', 'service', 'unit', 'units', 'tariff', 'total', 'contractorCode'];
const BILLING_KEY_FIELDS = ['year', 'week', 'date', 'hacienda', 'suerte', 'labor', 'service', 'unit', 'pFact', 'contractorCode'];

const signature = (fields) => (row) => JSON.stringify(fields.map((field) => row[field] ?? null));

const groupsOf = (rows, keyOf) => {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].filter((list) => list.length > 1);
};

/**
 * @returns {{ byId: Map<string, string[]>, groups: Array, summary: Record<string, {groups, rows, extraRows, extraAmount, amount}> }}
 *   byId: tipos de repetición de cada fila; extraAmount: monto de las copias adicionales (sin descontar).
 */
export const classifyRepetitions = (prefactura) => {
  const byId = new Map();
  const groups = [];
  const mark = (row, kind) => byId.set(row.id, [...new Set([...(byId.get(row.id) ?? []), kind])]);
  const summary = Object.fromEntries(Object.keys(REPETITION_KINDS).map((kind) => [kind, { groups: 0, rows: 0, extraRows: 0, extraAmount: 0, amount: 0 }]));
  const register = (kind, rows, extra) => {
    groups.push({ kind, rows, extraRows: extra.length, extraAmount: round(extra.reduce((total, row) => total + row.total, 0), 2) });
    const entry = summary[kind];
    entry.groups += 1;
    entry.rows += rows.length;
    entry.extraRows += extra.length;
    entry.extraAmount = round(entry.extraAmount + extra.reduce((total, row) => total + row.total, 0), 2);
    entry.amount = round(entry.amount + rows.reduce((total, row) => total + row.total, 0), 2);
    rows.forEach((row) => mark(row, kind));
  };

  for (const rows of groupsOf(prefactura, signature(EXACT_FIELDS))) register('DUPLICADO_EXACTO', rows, rows.slice(1));

  for (const rows of groupsOf(prefactura, signature(CONTENT_FIELDS))) {
    const invoices = [...new Set(rows.map((row) => row.pFact))];
    if (invoices.length < 2) continue;
    // Una copia adicional por cada P.FACT distinta de la primera (las copias dentro de una misma P.FACT
    // ya se cuentan como duplicado exacto).
    const extra = invoices.slice(1).map((pFact) => rows.find((row) => row.pFact === pFact));
    register('COBRO_EN_OTRA_PREFACTURA', rows, extra);
  }

  for (const rows of groupsOf(prefactura, signature(BILLING_KEY_FIELDS))) {
    if (new Set(rows.map((row) => row.total)).size < 2 && new Set(rows.map((row) => row.tariff)).size < 2) continue;
    const byUnits = new Map();
    rows.forEach((row) => byUnits.set(row.units, [...(byUnits.get(row.units) ?? []), row]));
    const sameQuantity = [...byUnits.values()].filter((list) => list.length > 1 && new Set(list.map((row) => row.tariff)).size > 1);
    if (sameQuantity.length) sameQuantity.forEach((list) => register('MISMA_CANTIDAD_TARIFA_DISTINTA', list, []));
    else register('VARIAS_LINEAS_MISMA_CLAVE', rows, []);
  }
  return { byId, groups, summary };
};

/** Copias exactas adicionales contenidas en un conjunto de filas (por grupo idéntico). */
export const exactExtraCopies = (rows, repetitions) => {
  const exactSignature = signature(EXACT_FIELDS);
  const counts = new Map();
  rows
    .filter((row) => repetitions.byId.get(row.id)?.includes('DUPLICADO_EXACTO'))
    .forEach((row) => counts.set(exactSignature(row), (counts.get(exactSignature(row)) ?? 0) + 1));
  return [...counts.values()].reduce((total, count) => total + count - 1, 0);
};
