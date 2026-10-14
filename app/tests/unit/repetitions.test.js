import { describe, expect, it } from 'vitest';
import { parsePayrollFile, parsePrefacturaFile, parseMasterFile } from '../../src/engine/importers';
import { classifyRepetitions } from '../../src/engine/repetitions';
import { runReconciliation } from '../../src/engine/reconciliation';
import { DEFAULT_PARAMETERS } from '../../src/engine/constants';
import { excelFile, masterRows, payrollRow, prefacturaRow } from './helpers';

const billed = async (rows) => (await parsePrefacturaFile(excelFile(rows))).rows;

describe('repeticiones de Prefactura', () => {
  it('duplicado exacto: idéntico en todos los campos, incluido el total', async () => {
    const result = classifyRepetitions(await billed([prefacturaRow(), prefacturaRow()]));
    expect(result.summary.DUPLICADO_EXACTO).toMatchObject({ groups: 1, extraRows: 1, extraAmount: 694.04 });
  });

  it('no es duplicado exacto si cambia el total (misma cantidad, otra tarifa)', async () => {
    const result = classifyRepetitions(await billed([prefacturaRow(), prefacturaRow({ Tarifa: 683.11, Total: 1366.22 })]));
    expect(result.summary.DUPLICADO_EXACTO.groups).toBe(0);
    expect(result.summary.MISMA_CANTIDAD_TARIFA_DISTINTA.groups).toBe(1);
    expect(result.summary.MISMA_CANTIDAD_TARIFA_DISTINTA.extraAmount).toBe(0);
  });

  it('misma clave con cantidades distintas: varias líneas, solo informativo', async () => {
    const result = classifyRepetitions(await billed([prefacturaRow(), prefacturaRow({ Unidades: 1, Tarifa: 683.11, Total: 683.11 })]));
    expect(result.summary.VARIAS_LINEAS_MISMA_CLAVE.groups).toBe(1);
    expect(result.summary.MISMA_CANTIDAD_TARIFA_DISTINTA.groups).toBe(0);
  });

  it('mismo cobro en otra prefactura', async () => {
    const result = classifyRepetitions(
      await billed([prefacturaRow(), prefacturaRow({ 'P.FACT': '15900', 'Nombre Productor': 'PRODUCTOR PRUEBA   FACTURA :15900' })]),
    );
    expect(result.summary.COBRO_EN_OTRA_PREFACTURA).toMatchObject({ groups: 1, extraRows: 1, extraAmount: 694.04 });
    expect(result.summary.DUPLICADO_EXACTO.groups).toBe(0);
  });

  it('no altera montos ni elimina filas en la conciliación; marca la bandera correspondiente', async () => {
    const payroll = (await parsePayrollFile(excelFile([payrollRow()]))).rows;
    const prefactura = await billed([prefacturaRow(), prefacturaRow({ 'P.FACT': '15900' })]);
    const master = (await parseMasterFile(excelFile(masterRows(), { sheet: 'Productores' }))).rows;
    const analysis = runReconciliation({ payroll, prefactura, master, files: [] }, DEFAULT_PARAMETERS);
    const finding = analysis.findings.find((f) => f.type === 'DIRECT');
    expect(finding.billedUnits).toBe(4);
    expect(finding.amount).toBe(1388.08);
    expect(finding.flags).toContain('COBRO_EN_OTRA_PREFACTURA');
    expect(analysis.repetitions.COBRO_EN_OTRA_PREFACTURA.extraAmount).toBe(694.04);
  });
});
