import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { read, utils, write } from 'xlsx';
import { parsePrefacturaFile } from '../../src/engine/importers';
import { analyzeTariffs } from '../../src/engine/audit/tariffAudit';
import { buildTariffAuditWorkbook } from '../../src/components/audit/tariffAuditExport';

describe('exportación Excel de auditoría de tarifas', () => {
  let inputs;
  let audit;
  let workbook;
  let reopened;
  beforeAll(async () => {
    const bytes = await readFile(new URL('../../../datos/Prefactura_2026.xlsx', import.meta.url));
    const parsed = await parsePrefacturaFile(new File([bytes], 'Prefactura_2026.xlsx'));
    inputs = {
      prefactura: parsed.rows,
      files: [
        {
          kind: 'prefactura',
          name: parsed.file.name,
          rows: parsed.rows.length,
          hash: parsed.file.hash,
          sheet: parsed.file.sheet,
          skippedRows: parsed.file.skippedRows,
        },
      ],
    };
    audit = analyzeTariffs(inputs.prefactura);
    workbook = buildTariffAuditWorkbook(audit, inputs, { scope: 'complete', filters: { category: 'all' } });
    reopened = read(write(workbook, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer', cellFormula: true });
  });

  it('exporta todas las filas y reconcilia los importes fuente sin duplicar líneas', () => {
    const sourceRows = utils.sheet_to_json(reopened.Sheets.Prefactura, { defval: '' });
    expect(sourceRows).toHaveLength(4452);
    expect(sourceRows.reduce((sum, row) => sum + row['Total Prefactura'], 0)).toBeCloseTo(13278583.33, 5);
    expect(sourceRows.map((row) => row['Identificador de auditoría'])).toEqual([
      ...new Set(sourceRows.map((row) => row['Identificador de auditoría'])),
    ]);
    const summary = utils.sheet_to_json(reopened.Sheets.Resumen, { defval: '' });
    expect(summary.find((row) => row.Indicador === 'Líneas en el archivo fuente').Valor).toBe(4452);
    expect(summary.find((row) => row.Indicador === 'Total informado en este alcance (C$)').Valor).toBeCloseTo(13278583.33, 5);
  });

  it('exporta revisión única, subconjunto insuficiente, motivos no sumables y evidencia CMN 0,88 fila 1376', () => {
    const review = utils.sheet_to_json(reopened.Sheets['Revisión única'], { defval: '' });
    const insufficient = review.filter((row) => row.Motivos.includes('Comparables insuficientes'));
    expect(review).toHaveLength(887);
    expect(new Set(review.map((row) => row['ID de auditoría'])).size).toBe(887);
    expect(insufficient).toHaveLength(417);
    const cmn = utils.sheet_to_json(reopened.Sheets.Prefactura, { defval: '' }).find((row) => row['Fila origen'] === 1376);
    expect(cmn).toMatchObject({
      Labor: 'CMN',
      Servicio: '16013',
      UM: 'HA',
      'Tarifa reportada': 0.88,
      'P.FACT': '16183',
      Hoja: 'REPORTE',
    });
    expect(
      utils.sheet_to_json(reopened.Sheets['Motivos (no sumar)'], { defval: '' }).every((row) => row.Nota.includes('No sumar')),
    ).toBe(true);
    expect(utils.sheet_to_json(reopened.Sheets.Evidencia, { defval: '' }).find((row) => row.Fila === 1376)).toMatchObject({
      Hoja: 'REPORTE',
      Servicio: '16013',
      'P.FACT': '16183',
    });
    expect(reopened.SheetNames).toEqual([
      'Resumen',
      'Prefactura',
      'Revisión única',
      'Motivos (no sumar)',
      'Referencias mensuales',
      'Evolución',
      'Evidencia',
    ]);
  });

  it('selección filtrada respeta filas recibidas y exporta identificadores de P.FACT como texto', () => {
    const selected = audit.rows.filter((row) => row.sourceRow === 1376);
    const selectedBook = buildTariffAuditWorkbook(audit, inputs, {
      scope: 'selection',
      rows: selected,
      filters: { search: '1376', category: 'EXTREME' },
    });
    const selectedRows = utils.sheet_to_json(selectedBook.Sheets.Prefactura, { defval: '' });
    expect(selectedRows).toHaveLength(1);
    expect(selectedRows[0]['P.FACT']).toBe('16183');
    expect(selectedBook.Sheets.Prefactura.A2.t).toBe('s');
  });

  it('no escribe fórmulas ejecutables a partir de cadenas de datos', () => {
    for (const name of reopened.SheetNames) {
      const sheet = reopened.Sheets[name];
      for (const address of Object.keys(sheet).filter((key) => !key.startsWith('!')))
        expect(sheet[address].f, `${name}!${address}`).toBeUndefined();
    }
  });

  it('conserva texto fuente con prefijo de fórmula como texto plano', () => {
    const hostile = analyzeTariffs([
      {
        producerName: '=HYPERLINK("https://example.invalid")',
        sourceFile: 'formula.xlsx',
        sourceSheet: 'REPORTE',
        sourceRow: 2,
        pFact: '=1+1',
        service: 'TEST',
        labor: 'CMN',
        unit: 'HA',
        tariff: 1,
        units: 2,
        total: 2,
        date: '2026-09-01',
        week: 36,
        year: 2026,
      },
    ]);
    const safeBook = buildTariffAuditWorkbook(hostile, {
      prefactura: hostile.rows,
      files: [{ kind: 'prefactura', name: 'formula.xlsx' }],
    });
    const sheet = safeBook.Sheets.Prefactura;
    const headers = utils.sheet_to_json(sheet, { header: 1 })[0];
    expect(sheet[utils.encode_cell({ r: 1, c: headers.indexOf('P.FACT') })]).toMatchObject({ t: 's', v: '=1+1' });
    for (const address of Object.keys(sheet).filter((key) => !key.startsWith('!'))) expect(sheet[address].f).toBeUndefined();
  });
});
