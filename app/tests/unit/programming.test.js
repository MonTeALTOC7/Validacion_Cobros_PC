import { describe, it, expect } from 'vitest';
import { utils, write } from 'xlsx';
import {
  openSource,
  openTSV,
  suggestMapping,
  detectHeaderRow,
  normalizeSource,
  parseSiagriDate,
} from '../../src/mechanized/importers';
import { programmingEvents } from '../../src/mechanized/model';
import { programHeaders, programRows } from '../fixtures/programming';

async function normalize(source) {
  const sheet = source.sheets[0];
  const header = detectHeaderRow(sheet.matrix, 'program');
  const mapping = suggestMapping(sheet.matrix[header], 'program');
  expect(Object.keys(mapping)).toHaveLength(25);
  return normalizeSource(source, 0, header, mapping, 'program');
}
describe('Programación SIAGRI', () => {
  it('autodetecta 25 columnas y encabezados desplazados en Excel y TSV con 84 líneas', async () => {
    const headers = programHeaders.map((h) => ` ${h.toLowerCase().replaceAll(' ', '  ')} `);
    const matrix = [['Título sintético'], headers, ...programRows];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.aoa_to_sheet(matrix), 'Plan');
    const data = write(wb, { type: 'array', bookType: 'xlsx' });
    const excel = await normalize(await openSource({ name: 'demo.xlsx', arrayBuffer: async () => data }));
    const tsv = await normalize(openTSV(matrix.map((r) => r.join('\t')).join('\n')));
    for (const result of [excel, tsv]) {
      expect(result.rows).toHaveLength(84);
      expect(result.rejected).toHaveLength(0);
      expect(result.rows.filter((r) => r.executed === 'SI')).toHaveLength(59);
      expect(result.rows.filter((r) => r.executed === 'NO')).toHaveLength(25);
      expect(result.rows.filter((r) => r.executed === 'NO' && r.suspended === '1')).toHaveLength(22);
      expect(result.rows.filter((r) => r.executed === 'NO' && r.suspended === '0')).toHaveLength(3);
      expect(result.rows[0]).toMatchObject({
        year: '2026',
        week: '8',
        startDate: '2026-02-23',
        endDate: '2026-03-01',
        executionDate: '2026-03-04',
        date: '',
        units: 5.97,
        productQuantity: '59.7',
        unit: 'HA',
        product: 'P001',
        productName: 'Producto A',
        dose: '10',
        warehouse: 'B01',
        warehouseName: 'BODEGA DEMO',
        reserved: 'SI',
        sourceRow: 3,
      });
      expect(result.rows[0].original[2].value).toBe('23-feb.-26');
      expect(result.rows.every((r) => r.status === undefined)).toBe(true);
    }
    expect(excel.rows.map((r) => r.id)).toEqual(tsv.rows.map((r) => r.id));
  });
  it('valida fechas españolas y no intercambia semana SIAGRI con semana ISO', () => {
    expect(parseSiagriDate('1-mar.-26')).toBe('2026-03-01');
    expect(parseSiagriDate('4-MÁR.-2026')).toBe('2026-03-04');
    expect(parseSiagriDate('31-feb.-26')).toBe('');
  });
  it('conserva productos y prepara grupos sin sumar hectáreas ni unir ejecuciones distintas', async () => {
    const result = await normalize(openTSV([programHeaders, ...programRows].map((r) => r.join('\t')).join('\n')));
    const events = programmingEvents(result.rows);
    expect(events).toHaveLength(83);
    expect(events[0]).toMatchObject({ workQuantity: 5.97, reviewRequired: true });
    expect(events[0].lines).toHaveLength(2);
    expect(events.flatMap((e) => e.lines)).toHaveLength(84);
    const first = result.rows[0];
    expect(programmingEvents([first, { ...first, executionDate: '2026-03-05' }])).toHaveLength(2);
    expect(programmingEvents([first, { ...first, document: 'OTRO' }])).toHaveLength(2);
    expect(
      programmingEvents([
        { ...first, document: '' },
        { ...first, document: '' },
      ]),
    ).toHaveLength(2);
    expect(programmingEvents([first, first])[0].workQuantity).toBeNull();
    expect(programmingEvents([first, { ...first, product: 'P2', units: 6 }])[0].workQuantity).toBeNull();
  });
});
