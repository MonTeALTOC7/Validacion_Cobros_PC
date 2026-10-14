import { describe, expect, it } from 'vitest';
import { parseMasterFile, parsePayrollFile, parsePrefacturaFile } from '../../src/engine/importers';
import {
  aggregateFinance,
  buildFinanceRows,
  FINANCE_DIMENSIONS,
  financeClass,
  financeSummary,
  invoiceSummaries,
  pendingByProducer,
} from '../../src/engine/finance';
import { buildTariffProfile } from '../../src/engine/tariffs';
import { assessDataQuality } from '../../src/engine/quality';
import { runReconciliation } from '../../src/engine/reconciliation';
import { DEFAULT_PARAMETERS } from '../../src/engine/constants';
import { isBlockingPending } from '../../src/engine/indicators';
import { adaptRemoteMaster, compareMasterVersions, parseMasterVersion, remoteMasterFile } from '../../src/data/remoteMaster';
import { day, excelFile, masterRows, payrollRow, prefacturaRow } from './helpers';

const load = async (prefactura, payroll = [payrollRow()]) => {
  const p = await parsePayrollFile(excelFile(payroll));
  const f = await parsePrefacturaFile(excelFile(prefactura));
  const m = await parseMasterFile(excelFile(masterRows(), { sheet: 'Productores' }));
  return { payroll: p.rows, prefactura: f.rows, master: m.rows, files: [p.file, f.file, m.file] };
};

describe('módulo financiero', () => {
  it('suma exactamente la columna Total y separa área física de HA trabajadas', async () => {
    const inputs = await load([
      prefacturaRow(),
      prefacturaRow({
        Ste: '02',
        'Area de la Suerte': 3,
        Unidades: 4,
        Total: 1388.08,
        'P.FACT': '15838',
        'Nombre Productor': 'PRODUCTOR PRUEBA   FACTURA :15838',
      }),
      prefacturaRow({ 'Servicio SAP': 'EBCM', Labor: 'MEC', UM: 'D-H', Unidades: 1, Total: 500, Tarifa: 500 }),
    ]);
    const rows = buildFinanceRows(inputs, '2026-01-01');
    const { overall, byClass } = financeSummary(rows);
    expect(overall.total).toBe(694.04 + 1388.08 + 500);
    expect(overall.invoices).toBe(2);
    expect(overall.lots).toBe(2);
    // Suerte 01: área del Maestro (5 ha); suerte 02: área de Prefactura (3 ha).
    expect(overall.area).toBe(8);
    expect(overall.perHa).toBeCloseTo((694.04 + 1388.08 + 500) / 8, 2);
    // HA trabajadas: solo UM HA (2 + 4), tarifa media por HA = monto HA / HA.
    expect(overall.haUnits).toBe(6);
    expect(overall.perHaWorked).toBeCloseTo((694.04 + 1388.08) / 6, 2);
    expect(byClass.map((group) => group.key).sort()).toEqual(['MANUAL', 'MECANIZADA']);
  });

  it('agrupa por productor con el nombre sin número de factura', async () => {
    const inputs = await load([
      prefacturaRow(),
      prefacturaRow({ 'P.FACT': '15838', 'Nombre Productor': 'PRODUCTOR PRUEBA   FACTURA :15838' }),
    ]);
    const groups = aggregateFinance(
      buildFinanceRows(inputs, '2026-01-01'),
      FINANCE_DIMENSIONS.producer.keyOf,
      FINANCE_DIMENSIONS.producer.labelOf,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: 'PRODUCTOR PRUEBA', invoices: 2 });
    expect(invoiceSummaries(buildFinanceRows(inputs, '2026-01-01')).map((invoice) => invoice.pFact)).toEqual(['15838', '15837']);
  });

  it('P.FACT con el mismo número en otro productor o año no se fusiona', async () => {
    const inputs = await load([
      prefacturaRow(),
      prefacturaRow({ Productor: 'CL2000', 'Nombre Productor': 'OTRO PRODUCTOR   FACTURA :15837', Hda: '300', 'Nombre Hacienda': 'OTRA FINCA' }),
      prefacturaRow({ Fecha: day('2027-03-01'), Periodo: '' }),
    ]);
    const rows = buildFinanceRows(inputs, '2026-01-01');
    const invoices = invoiceSummaries(rows);
    expect(invoices).toHaveLength(3);
    expect(invoices.every((invoice) => invoice.pFact === '15837' && invoice.reusedNumber)).toBe(true);
    expect(financeSummary(rows).overall.invoices).toBe(3);
  });

  it('separa universos: conciliable, mecanizada CASUR y fuera de la conciliación', async () => {
    const inputs = await load([
      prefacturaRow(),
      prefacturaRow({ 'Servicio SAP': 'EBCM', Labor: 'MEC', Total: 500, Tarifa: 250 }),
      prefacturaRow({ Contratista: 'CS2661 SERVICIOS', 'Servicio SAP': 'SGR', Labor: 'SGR', Total: 300, Tarifa: 150 }),
    ]);
    const { byUniverse, overall } = financeSummary(buildFinanceRows(inputs, '2026-01-01'));
    const amounts = Object.fromEntries(byUniverse.map((group) => [group.key, group.total]));
    expect(amounts).toEqual({ CONCILIABLE: 694.04, MECANIZADA_CASUR: 500, FUERA_CONCILIACION: 300 });
    expect(overall.total).toBe(1494.04);
  });

  it('clasifica contratistas con las reglas de la conciliación', () => {
    expect(financeClass({ contractorCode: 'CS2661', labor: 'SGR', service: 'SGR' })).toBe('CS2661');
    expect(financeClass({ contractorCode: 'CS3317', labor: 'CAP', service: 'AAI' })).toBe('AEREA');
    expect(financeClass({ contractorCode: 'CS9999', labor: 'TPS', service: 'SIE_INV' })).toBe('TPS');
    expect(financeClass({ contractorCode: 'CS9999', labor: 'CMN', service: '21076' })).toBe('MANUAL');
  });

  it('pendientes por productor en unidades, sin valorizar', async () => {
    const inputs = await load([prefacturaRow({ Ste: '02' })], [payrollRow()]);
    const analysis = runReconciliation(inputs, DEFAULT_PARAMETERS);
    const pending = pendingByProducer(analysis.findings, buildFinanceRows(inputs, '2026-01-01'), isBlockingPending);
    expect([...pending.values()]).toEqual([{ producer: 'PRODUCTOR PRUEBA', cases: 1, byUnit: { HA: 2 } }]);
  });
});

describe('tarifas y calidad de datos', () => {
  it('perfil de tarifas por servicio/UM con frecuencia y semanas', async () => {
    const inputs = await load([
      prefacturaRow(),
      prefacturaRow({ Semana: '11', Fecha: day('2026-03-09'), Tarifa: 381.73, Total: 763.46, Periodo: '' }),
    ]);
    const profile = buildTariffProfile(inputs.prefactura, 5).get('21076|HA');
    expect(profile.values.map((value) => [value.tariff, value.rows, value.firstPeriodKey])).toEqual([
      [347.02, 1, '2026-S10'],
      [381.73, 1, '2026-S11'],
    ]);
  });

  it('informa duplicados, totales inconsistentes y fechas fuera de semana', async () => {
    const inputs = await load([
      prefacturaRow(),
      prefacturaRow(),
      prefacturaRow({ Ste: '03', Total: 999 }),
      prefacturaRow({ Ste: '04', Fecha: day('2026-03-20') }),
    ]);
    const ids = assessDataQuality(inputs, { atypicalTariffPct: 5 }).map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining(['repetition-DUPLICADO_EXACTO', 'prefactura-total', 'date-outside-week', 'lots-missing']),
    );
  });
});

describe('Maestro Central', () => {
  const json = {
    meta: { dataVersion: '2026.09.06-siagri.1415' },
    producers: [
      {
        code: '242',
        name: 'Finca Prueba',
        details: [{ suerte: '1', area: 5, zona: '5-Productores', fSiembra: '2017-06-02', fUltCte: '2025-12-31' }],
      },
    ],
  };
  it('compara versiones', () => {
    expect(parseMasterVersion('2026.09.06-siagri.1415')).toEqual({ date: 20260906, seq: 1415 });
    expect(compareMasterVersions('2026.09.07-siagri.1', '2026.09.06-siagri.1415')).toBe(1);
    expect(compareMasterVersions('x', '2026.09.06-siagri.1415')).toBeNull();
  });
  it('adapta el cronológico y registra la versión en la huella del archivo', () => {
    const master = adaptRemoteMaster(json);
    expect(master.rows[0]).toMatchObject({ hacienda: 'FINCA PRUEBA', suerte: '01', producerScope: true, area: 5 });
    expect(remoteMasterFile({ ...master, origin: 'REMOTE' }).hash).toBe('remote:2026.09.06-siagri.1415');
  });
});
