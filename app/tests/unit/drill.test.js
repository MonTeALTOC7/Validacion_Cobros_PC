import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DRILL_DIMENSIONS,
  applyFinanceFilters,
  availableDimensions,
  distinctRepetitionLines,
  filtersForSelection,
  groupRows,
  payrollIndex,
  repetitionEvidence,
  rowsOfGroup,
  searchLines,
  totalOf,
  unitTotals,
} from '../../src/lib/drill';
import { buildFinanceRows, financeSummary } from '../../src/engine/finance';
import { classifyRepetitions } from '../../src/engine/repetitions';
import { assessDataQuality } from '../../src/engine/quality';
import { DEFAULT_PARAMETERS } from '../../src/engine/constants';
import { loadPublishedInputs } from '../golden/snapshot';

const DATOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../datos');
const ALL = {
  from: '',
  to: '',
  producer: 'all',
  hacienda: 'all',
  financeClass: 'all',
  contractor: 'all',
  universe: 'all',
  search: '',
};

let seq = 0;
const line = (overrides = {}) => ({
  id: `r${++seq}`,
  sourceRow: seq + 1,
  year: 2026,
  week: 10,
  period: '2026-S10',
  date: '2026-03-02',
  producerCode: 'CL1',
  producerName: 'PRODUCTOR A',
  hacienda: 'FINCA A',
  haciendaCode: '1',
  suerte: '01',
  lot: 'FINCA A|01',
  lotArea: 5,
  labor: 'CMN',
  laborName: 'Control manual',
  service: '21076',
  serviceName: 'Limpia',
  unit: 'HA',
  units: 2,
  tariff: 100,
  total: 200,
  pFact: '1000',
  invoiceKey: '2026|CL1|1000',
  contractorCode: 'CS9999',
  financeClass: 'MANUAL',
  universe: 'CONCILIABLE',
  ...overrides,
});

const sample = () => [
  line(),
  line({ unit: 'D-H', units: 1.5, total: 572.6, service: '21018', labor: 'ZGC' }),
  line({
    producerCode: 'CL2',
    producerName: 'PRODUCTOR B',
    hacienda: 'FINCA B',
    lot: 'FINCA B|02',
    suerte: '02',
    pFact: '1001',
    invoiceKey: '2026|CL2|1001',
    total: 333.33,
    units: 3,
  }),
  line({
    period: '2026-S11',
    week: 11,
    total: 99.99,
    units: 1,
    contractorCode: 'CS2661',
    financeClass: 'CS2661',
    universe: 'FUERA_CONCILIACION',
  }),
];

describe('drill: agrupación y conciliación de totales', () => {
  it('en cada dimensión la suma de los grupos es el total del nivel y cada grupo es la suma de sus líneas', () => {
    const rows = sample();
    for (const dimension of DRILL_DIMENSIONS) {
      const groups = groupRows(rows, dimension);
      expect(Math.round(groups.reduce((t, g) => t + g.total, 0) * 100) / 100).toBe(totalOf(rows));
      for (const group of groups) expect(group.total).toBe(totalOf(rowsOfGroup(rows, dimension, group.key)));
    }
  });

  it('las cantidades se informan por unidad sin sumar UM distintas', () => {
    expect(unitTotals(sample())).toEqual([
      { unit: 'D-H', units: 1.5 },
      { unit: 'HA', units: 6 },
    ]);
  });

  it('solo ofrece dimensiones con más de un valor y busca en las líneas', () => {
    const rows = sample();
    expect(availableDimensions(rows)).toEqual(DRILL_DIMENSIONS);
    expect(availableDimensions([line()])).toEqual([]);
    expect(searchLines(rows, '1001').map((row) => row.pFact)).toEqual(['1001']);
  });
});

describe('drill: aplicar como filtro', () => {
  it('representa productor y semana con filtros reales verificados', () => {
    const rows = sample();
    const selection = rows.filter((row) => row.producerCode === 'CL1');
    const result = filtersForSelection(rows, ALL, [{ dimension: 'producer', key: 'CL1', label: 'PRODUCTOR A' }], selection);
    expect(result.filters).toMatchObject({ producer: 'PRODUCTOR A' });
    expect(applyFinanceFilters(rows, result.filters).map((row) => row.id)).toEqual(selection.map((row) => row.id));
    const week = filtersForSelection(rows, ALL, [{ dimension: 'period', key: '2026-S11', label: 'S11' }], rows.slice(3));
    expect(week.filters).toMatchObject({ from: '2026-S11', to: '2026-S11' });
  });

  it('no se aplica cuando la selección no tiene filtro equivalente o los filtros no la reproducen', () => {
    const rows = sample();
    const lot = filtersForSelection(
      rows,
      ALL,
      [{ dimension: 'lot', key: 'FINCA A|01', label: 'FINCA A · 01' }],
      rows.slice(0, 2),
    );
    expect(lot.filters).toBeNull();
    expect(lot.reason).toMatch(/no tiene un filtro equivalente/);
    // Dos códigos de productor con el mismo nombre: el filtro por nombre traería líneas de más.
    const shared = [...rows, line({ producerCode: 'CL9', producerName: 'PRODUCTOR A' })];
    const ambiguous = filtersForSelection(
      shared,
      ALL,
      [{ dimension: 'producer', key: 'CL1', label: 'PRODUCTOR A' }],
      shared.filter((r) => r.producerCode === 'CL1'),
    );
    expect(ambiguous.filters).toBeNull();
    expect(ambiguous.reason).toMatch(/no reproducen exactamente/);
    expect(filtersForSelection(rows, ALL, [], rows).filters).toBeNull();
  });
});

describe('drill: repeticiones y evidencia de Nómina', () => {
  it('una línea en varios grupos se cuenta una sola vez', () => {
    const a = line({ total: 10 });
    const b = line({ total: 10 });
    const c = line({ total: 10 });
    const groups = [
      { kind: 'DUPLICADO_EXACTO', rows: [b, c], extraRows: 1, extraAmount: 10 },
      { kind: 'COBRO_EN_OTRA_PREFACTURA', rows: [a, b, c], extraRows: 1, extraAmount: 10 },
    ];
    expect(distinctRepetitionLines(groups)).toMatchObject({ count: 3, amount: 30 });
  });

  it('la evidencia de Nómina usa la clave de conciliación y no aplica fuera del universo conciliable', () => {
    const billed = line({ hacienda: 'FINCA A', suerte: '01', labor: 'CMN', service: '21076', unit: 'HA' });
    const payroll = [
      { ...billed, id: 'p1', units: 1.5, worker: 'X' },
      { ...billed, id: 'p2', units: 0.5, worker: 'Y' },
      { ...billed, id: 'p3', week: 11, units: 9 },
    ];
    const evidence = repetitionEvidence({ kind: 'DUPLICADO_EXACTO', rows: [billed] }, [billed], payrollIndex(payroll));
    expect(evidence.payrollApplies).toBe(true);
    expect(evidence.payrollRows.map((row) => row.id)).toEqual(['p1', 'p2']);
    expect(evidence.payrollUnits).toEqual([{ unit: 'HA', units: 2 }]);
    const mechanized = line({ service: '187011SP', labor: 'RAS' });
    expect(
      repetitionEvidence({ kind: 'DUPLICADO_EXACTO', rows: [mechanized] }, [mechanized], payrollIndex([])).payrollApplies,
    ).toBe(false);
  });
});

describe('drill: datos publicados (datos/)', async () => {
  const { inputs } = await loadPublishedInputs(DATOS);
  const rows = buildFinanceRows(inputs, DEFAULT_PARAMETERS.startDate);

  it('cada dimensión reconcilia exactamente con el total informado (C$ 13.278.583,33)', () => {
    const overall = financeSummary(rows).overall.total;
    expect(overall).toBe(13278583.33);
    for (const dimension of DRILL_DIMENSIONS) {
      const sum = groupRows(rows, dimension).reduce((t, g) => t + g.total, 0);
      expect(Math.round(sum * 100) / 100, dimension).toBe(overall);
    }
  });

  it('las repeticiones exactas y entre prefacturas comparten líneas y se cuentan sin duplicar', () => {
    const groups = classifyRepetitions(inputs.prefactura).groups.filter((g) =>
      ['DUPLICADO_EXACTO', 'COBRO_EN_OTRA_PREFACTURA'].includes(g.kind),
    );
    const lines = groups.reduce((t, g) => t + g.rows.length, 0);
    const distinct = distinctRepetitionLines(groups);
    expect(lines).toBe(37);
    expect(distinct.count).toBeLessThan(lines);
  });

  it('Calidad con fullItems conserva la salida por defecto y trae todos los registros', () => {
    const base = assessDataQuality(inputs, { atypicalTariffPct: 5 });
    const full = assessDataQuality(inputs, { atypicalTariffPct: 5, fullItems: true });
    expect(full.map(({ items, ...rest }) => rest)).toEqual(base);
    const tariff = full.find((issue) => issue.id === 'tariff-atypical');
    expect(tariff.items).toHaveLength(tariff.count);
    expect(tariff.items.every((item) => item.rowId)).toBe(true);
  });
});
