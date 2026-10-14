import { describe, expect, it } from 'vitest';
import {
  parseMasterFile,
  parsePayrollFile,
  parsePrefacturaFile,
  splitProducerInvoice,
  upgradeInputs,
  diffRows,
} from '../../src/engine/importers';
import { runReconciliation } from '../../src/engine/reconciliation';
import { DEFAULT_PARAMETERS } from '../../src/engine/constants';
import { collectionState, coverageStats, isBlockingPending, weekSummaries } from '../../src/engine/indicators';
import { buildTrackingRows } from '../../src/engine/tracking';
import { PUBLISHED_FIELDS, buildPublishedTracking } from '../../src/engine/published';
import { day, excelFile, masterRows, payrollRow, prefacturaRow } from './helpers';

const load = async ({ payroll = [payrollRow()], prefactura = [prefacturaRow()], master = masterRows() } = {}) => {
  const p = await parsePayrollFile(excelFile(payroll, { name: 'nomina.xlsx' }));
  const f = await parsePrefacturaFile(excelFile(prefactura, { name: 'prefactura.xlsx' }));
  const m = await parseMasterFile(excelFile(master, { name: 'maestro.xlsx', sheet: 'Productores' }));
  return { payroll: p.rows, prefactura: f.rows, master: m.rows, files: [p.file, f.file, m.file] };
};
const run = async (data, parameters = {}) => runReconciliation(await load(data), { ...DEFAULT_PARAMETERS, ...parameters });
const direct = (analysis) => analysis.findings.filter((finding) => finding.type === 'DIRECT');

describe('importadores', () => {
  it('lee Nómina con año operativo, origen y motivos de filas descartadas', async () => {
    const file = excelFile(
      [
        payrollRow(),
        payrollRow({ Unidades: 0 }),
        payrollRow({ Unidades: 'abc' }),
        payrollRow({ Servicio: '' }),
        payrollRow({ Semana: '60' }),
        payrollRow({ Fecha: '' }),
      ],
      { name: 'n.xlsx' },
    );
    const parsed = await parsePayrollFile(file);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      year: 2026,
      week: 10,
      suerte: '01',
      sourceFile: 'n.xlsx',
      sourceSheet: 'REPORTE',
      sourceRow: 2,
    });
    expect(parsed.file.skipReasons).toEqual({ unitsZero: 1, unitsInvalid: 1, service: 1, week: 1, date: 1 });
  });

  it('identifica la hoja aunque no se llame REPORTE y tolera variantes de encabezado', async () => {
    const row = payrollRow();
    const renamed = { ...row, 'nombre  hacienda': row['Nombre Hacienda'] };
    delete renamed['Nombre Hacienda'];
    const parsed = await parsePayrollFile(excelFile([renamed], { sheet: 'Datos' }));
    expect(parsed.rows[0].hacienda).toBe('FINCA PRUEBA');
    expect(parsed.file.sheet).toBe('Datos');
  });

  it('informa columnas faltantes', async () => {
    const row = payrollRow();
    delete row.Servicio;
    await expect(parsePayrollFile(excelFile([row]))).rejects.toThrow(/Servicio/);
  });

  it('Prefactura: separa productor y factura, Periodo y área de suerte', async () => {
    const parsed = await parsePrefacturaFile(excelFile([prefacturaRow()]));
    expect(parsed.rows[0]).toMatchObject({
      producerName: 'PRODUCTOR PRUEBA',
      invoice: '15837',
      periodStart: '2026-03-02',
      periodEnd: '2026-03-08',
      lotArea: 5,
      contractorCode: 'CS9999',
    });
    expect(splitProducerInvoice('PANSACO   FACTURA :15837')).toEqual({ name: 'PANSACO', invoice: '15837' });
  });

  it('ids estables: el mismo contenido da el mismo id aunque cambie el nombre del archivo', async () => {
    const a = await parsePayrollFile(excelFile([payrollRow()], { name: 'a.xlsx' }));
    const b = await parsePayrollFile(excelFile([payrollRow()], { name: 'b.xlsx' }));
    expect(a.rows[0].id).toBe(b.rows[0].id);
  });

  it('reimportar el mismo archivo no produce cambios', async () => {
    const a = await parsePayrollFile(excelFile([payrollRow(), payrollRow({ Unidades: 3 })]));
    const diff = diffRows(a.rows, a.rows);
    expect(diff).toMatchObject({ added: 0, removed: 0, unchanged: 2 });
  });

  it('compatibilidad: completa año y productor en datos guardados por v0.7', () => {
    const legacy = {
      payroll: [{ id: 'x', week: 2, date: '2025-12-30', hacienda: 'H', suerte: '01', units: 1 }],
      prefactura: [
        { id: 'y', week: 2, date: '2026-01-02', producer: 'PANSACO   FACTURA :1', hacienda: 'H', suerte: '01', units: 1 },
      ],
      master: [],
      files: [],
    };
    const upgraded = upgradeInputs(legacy);
    expect(upgraded.payroll[0].year).toBe(2026);
    expect(upgraded.prefactura[0]).toMatchObject({ year: 2026, producerName: 'PANSACO', invoice: '1' });
    expect(legacy.payroll[0].year).toBeUndefined();
  });
});

describe('conciliación directa', () => {
  it('concilia Nómina y Prefactura con la misma cantidad y muestra la tarifa cobrada', async () => {
    const analysis = await run();
    const [finding] = direct(analysis);
    expect(finding).toMatchObject({
      status: 'CONCILIADO',
      payrollUnits: 2,
      billedUnits: 2,
      tariffs: [347.02],
      period: '2026-S10',
    });
    expect(collectionState(finding)).toBe('COBRADO');
  });

  it('Nómina sin cobro bloquea; cobro parcial y exceso se distinguen', async () => {
    const none = await run({ prefactura: [prefacturaRow({ Semana: '11', Fecha: day('2026-03-09') })] });
    expect(direct(none).find((f) => f.week === 10).status).toBe('NOMINA_SIN_COBRO');
    const partial = await run({ prefactura: [prefacturaRow({ Unidades: 1, Total: 347.02 })] });
    expect(direct(partial)[0].status).toBe('COBRO_PARCIAL');
    expect(isBlockingPending(direct(partial)[0])).toBe(true);
    const excess = await run({ prefactura: [prefacturaRow({ Unidades: 3, Total: 1041.06 })] });
    expect(direct(excess)[0].status).toBe('COBRO_EXCESO');
  });

  it('manual presente en ambas fuentes no se cuenta dos veces en Seguimiento', async () => {
    const inputs = await load();
    const rows = buildTrackingRows(inputs, '2026-01-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('Nómina');
  });

  it('mecanizada de Prefactura entra en Seguimiento sin cruce con Nómina', async () => {
    const inputs = await load({
      prefactura: [
        prefacturaRow(),
        prefacturaRow({ 'Servicio SAP': 'EBCM', Labor: 'MEC', UM: 'HA', Unidades: 4, Total: 400, Tarifa: 100 }),
      ],
    });
    const rows = buildTrackingRows(inputs, '2026-01-01');
    expect(rows.filter((row) => row.classification === 'Mecanizada')).toHaveLength(1);
    const analysis = runReconciliation(inputs, DEFAULT_PARAMETERS);
    expect(analysis.mechanizedRows).toBe(1);
    expect(direct(analysis)).toHaveLength(1);
  });

  it('Seguimiento: una mecanizada de 2027 no se descarta por una Nómina de la misma semana en 2026', async () => {
    const mec = { 'Servicio SAP': 'EBCM', Labor: 'MEC', Unidades: 4, Total: 400, Tarifa: 100 };
    const inputs = await load({
      payroll: [payrollRow({ Labor: 'MEC', Servicio: 'EBCM', Fecha: day('2026-03-02') })],
      prefactura: [
        prefacturaRow({ ...mec, Fecha: day('2026-03-02') }),
        prefacturaRow({ ...mec, Fecha: day('2027-03-01'), Periodo: '' }),
      ],
    });
    const rows = buildTrackingRows(inputs, '2026-01-01');
    const mechanized = rows.filter((row) => row.source === 'Prefactura');
    // La de 2026 coincide con la Nómina (no se duplica); la de 2027 se conserva.
    expect(mechanized.map((row) => row.period)).toEqual(['2027-S10']);
    expect(rows.filter((row) => row.source === 'Nómina').map((row) => row.period)).toEqual(['2026-S10']);
  });

  it('Seguimiento: misma semana en años distintos se mantiene separada en Nómina', async () => {
    const inputs = await load({
      payroll: [payrollRow({ Fecha: day('2026-03-02') }), payrollRow({ Fecha: day('2027-03-01') })],
    });
    const rows = buildTrackingRows(inputs, '2026-01-01');
    expect(rows.map((row) => row.period).sort()).toEqual(['2026-S10', '2027-S10']);
  });

  it('seguimiento publicado para la App Maestra: mismos campos del bundle 8b2-1, sin montos ni P.FACT', async () => {
    const inputs = await load({
      payroll: [payrollRow({ Fecha: day('2026-03-02') }), payrollRow({ Fecha: day('2027-03-01') })],
    });
    const payload = buildPublishedTracking(inputs, '2026-01-01', '2026-10-14T00:00:00.000Z');
    expect(payload).toMatchObject({
      version: 1,
      generatedAt: '2026-10-14T00:00:00.000Z',
      count: 2,
      maxWeek: 10,
      maxPeriod: '2027-S10',
    });
    for (const row of payload.rows) {
      expect(Object.keys(row)).toEqual(PUBLISHED_FIELDS);
      expect(row).not.toHaveProperty('tariff');
      expect(row).not.toHaveProperty('total');
      expect(row).not.toHaveProperty('pFact');
    }
  });

  it('más de una labor en la misma suerte y semana se concilia por separado', async () => {
    const analysis = await run({
      payroll: [payrollRow(), payrollRow({ Labor: 'CQM', Servicio: '32019', Unidades: 1 })],
      prefactura: [
        prefacturaRow(),
        prefacturaRow({ Labor: 'CQM', 'Servicio SAP': '32019', Unidades: 1, Total: 371.14, Tarifa: 371.14 }),
      ],
    });
    expect(direct(analysis).map((f) => f.status)).toEqual(['CONCILIADO', 'CONCILIADO']);
  });

  it('suerte como texto o número coincide entre fuentes', async () => {
    const analysis = await run({ payroll: [payrollRow({ Suerte: 1 })], prefactura: [prefacturaRow({ Ste: '01' })] });
    expect(direct(analysis)[0].status).toBe('CONCILIADO');
  });

  it('duplicado exacto en Prefactura se marca (no se elimina)', async () => {
    const analysis = await run({ prefactura: [prefacturaRow(), prefacturaRow()] });
    const [finding] = direct(analysis);
    expect(finding.status).toBe('COBRO_EXCESO');
    expect(finding.flags).toContain('DUPLICADO_POTENCIAL');
    expect(finding.duplicateRows).toBe(1);
    expect(analysis.duplicateExtraRows).toBe(1);
  });

  it('repetición respaldada: Nómina también registra la cantidad repetida', async () => {
    const analysis = await run({
      payroll: [payrollRow(), payrollRow({ 'Nombre Trabajador': 'B' })],
      prefactura: [prefacturaRow(), prefacturaRow()],
    });
    const [finding] = direct(analysis);
    expect(finding.status).toBe('CONCILIADO');
    expect(finding.flags).toContain('REPETICION_RESPALDADA');
  });

  it('cambio de año: la Nómina del 29–31 dic cuenta en la semana 2 de 2026', async () => {
    const analysis = await run({
      payroll: [payrollRow({ Semana: '2', Fecha: day('2025-12-30') })],
      prefactura: [prefacturaRow({ Semana: '2', Fecha: day('2026-01-02'), Periodo: 'SEMANA 2  -  29/12/25 - 04/01/26' })],
    });
    expect(direct(analysis)[0]).toMatchObject({ status: 'CONCILIADO', period: '2026-S02' });
  });

  it('la misma semana de años distintos no se mezcla', async () => {
    const analysis = await run({
      payroll: [payrollRow({ Semana: '10', Fecha: day('2026-03-02') }), payrollRow({ Semana: '10', Fecha: day('2027-03-01') })],
      prefactura: [prefacturaRow()],
    });
    const periods = direct(analysis)
      .map((f) => `${f.period}:${f.status}`)
      .sort();
    expect(periods).toEqual(['2026-S10:CONCILIADO', '2027-S10:NOMINA_SIN_COBRO']);
    expect(weekSummaries(analysis).map((w) => w.period)).toEqual(['2026-S10', '2027-S10']);
  });

  it('lote no encontrado se marca; con suertes históricas desactivadas no se valida por hacienda', async () => {
    const missing = await run({
      payroll: [payrollRow({ 'Nombre Hacienda': 'OTRA' })],
      prefactura: [prefacturaRow({ 'Nombre Hacienda': 'OTRA' })],
    });
    expect(direct(missing)[0].flags).toContain('LOTE_NO_ENCONTRADO');
    const historic = await run({ payroll: [payrollRow({ Suerte: '09' })], prefactura: [prefacturaRow({ Ste: '09' })] });
    expect(direct(historic)[0].status).toBe('SUERTE_HISTORICA_DADA_DE_BAJA');
    const strict = await run(
      { payroll: [payrollRow({ Suerte: '09' })], prefactura: [prefacturaRow({ Ste: '09' })] },
      { includeHistoricalInactive: false },
    );
    expect(direct(strict)[0]).toMatchObject({ status: 'CONCILIADO', severity: 'warning' });
    expect(direct(strict)[0].flags).toContain('LOTE_NO_ENCONTRADO');
  });

  it('servicio de Nómina sin regla y contratista desconocido quedan visibles', async () => {
    const analysis = await run({
      payroll: [payrollRow(), payrollRow({ Servicio: '99999', Labor: 'XYZ' })],
      prefactura: [prefacturaRow(), prefacturaRow({ Contratista: 'CS1234 OTRO', 'Servicio SAP': 'ABC' })],
    });
    expect(analysis.findings.find((f) => f.status === 'SERVICIO_SIN_CLASIFICAR')).toMatchObject({
      service: '99999',
      payrollUnits: 2,
    });
    expect(analysis.findings.find((f) => f.status === 'FUERA_DE_ALCANCE')).toMatchObject({ contractor: 'CS1234' });
    expect(coverageStats(analysis.findings).base).toBe(1);
  });

  it('tarifa poco frecuente se marca como bandera', async () => {
    const prefactura = Array.from({ length: 25 }, (_, i) =>
      prefacturaRow({ Fecha: day('2026-03-02'), Hda: '242', Ste: String(i + 1).padStart(2, '0') }),
    );
    prefactura.push(prefacturaRow({ Tarifa: 0.64, Total: 1.28 }));
    const analysis = await run({ prefactura });
    const flagged = analysis.findings.filter((f) => (f.flags ?? []).includes('TARIFA_POCO_FRECUENTE'));
    expect(flagged).toHaveLength(1);
    expect(flagged[0].tariffs).toEqual([0.64, 347.02]);
  });
});

describe('paquetes TPS', () => {
  const tps = (overrides = {}) =>
    prefacturaRow({ Labor: 'TPS', 'Servicio SAP': 'SIE_INV', UM: 'PAQ', Unidades: 10, Total: 1000, Tarifa: 100, ...overrides });
  const rya = (overrides = {}) =>
    payrollRow({ Labor: 'RYA', Servicio: '19084', 'Unidad de Medida': 'MJO', Unidades: 10, ...overrides });

  it('valida TPS con RYA', async () => {
    const analysis = await run({ payroll: [rya()], prefactura: [tps()] });
    expect(analysis.findings.find((f) => f.type === 'TPS').status).toBe('PAQUETE_TPS_VALIDADO_RYA');
  });

  it('una misma RYA no valida dos paquetes', async () => {
    const analysis = await run({
      payroll: [rya()],
      prefactura: [tps(), tps({ 'P.FACT': '15900', Semana: '11', Fecha: day('2026-03-09'), Periodo: '' })],
    });
    const byWeek = Object.fromEntries(analysis.findings.filter((f) => f.type === 'TPS').map((f) => [f.week, f.status]));
    expect(byWeek).toEqual({ 10: 'PAQUETE_TPS_VALIDADO_RYA', 11: 'PAQUETE_TPS_REQUIERE_REVISION' });
  });

  it('excepción TPS confirmada por negocio desde parámetros', async () => {
    const analysis = await run(
      { payroll: [payrollRow()], prefactura: [tps()] },
      { tpsConfirmedExceptions: ['15837|FINCA PRUEBA|01'] },
    );
    expect(analysis.findings.find((f) => f.type === 'TPS').status).toBe('TPS_COBRADO_CON_DIFERENCIA_NOMINA');
  });

  it('RYA sin paquete queda pendiente; etapa de corte sin paquete es informativa', async () => {
    const analysis = await run({
      payroll: [rya(), payrollRow({ Labor: 'CSS', Servicio: '19013', 'Unidad de Medida': 'MJO', Unidades: 5 })],
      prefactura: [prefacturaRow({ Ste: '02' })],
    });
    expect(analysis.findings.find((f) => f.type === 'TPS').status).toBe('NOMINA_SIN_COBRO');
    expect(analysis.findings.find((f) => f.type === 'TPS_STAGE')).toMatchObject({
      status: 'ETAPA_TPS_SIN_PAQUETE',
      severity: 'info',
    });
  });
});

describe('pendientes por cobertura de Prefactura', () => {
  it('separa pendientes de semanas prefacturadas y de semanas aún sin Prefactura', async () => {
    const { pendingBreakdown } = await import('../../src/engine/indicators');
    const analysis = await run({
      payroll: [
        payrollRow(),
        payrollRow({ Labor: 'CQM', Servicio: '32019' }),
        payrollRow({ Semana: '12', Fecha: day('2026-03-16') }),
      ],
      prefactura: [prefacturaRow()],
    });
    const breakdown = pendingBreakdown(analysis);
    expect(breakdown).toMatchObject({ inBilledWeeks: 1, inUnbilledWeeks: 1, lastBilledPeriod: '2026-S10' });
    expect(breakdown.periods.map((entry) => [entry.period, entry.covered, entry.cases])).toEqual([
      ['2026-S10', true, 1],
      ['2026-S12', false, 1],
    ]);
  });
});
