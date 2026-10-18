import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { openSource, openTSV, suggestMapping, normalizeSource } from '../../src/mechanized/importers';
import { inventory } from '../../src/mechanized/model';

const headers = [
  'Fecha',
  'Hacienda',
  'Nombre Hacienda',
  'Suerte',
  'UM',
  'Labor',
  'Maquina',
  'Nro del Documento',
  'Labor',
  'Cant.',
];
const row = ['01/10/2026', '900', 'FINCA SINTÉTICA', '01', 'HR', 'FTS', 'T-01', '000123', 'FTS-Ferti-Escarificado', 5.1];
const source = (rows) => ({ name: 'prueba.xlsx', sheets: [{ name: 'REPORTE', matrix: [headers, ...rows] }] });
const normalize = (rows) => normalizeSource(source(rows), 0, 0, suggestMapping(headers, 'hm'), 'hm');

describe('Mecanizadas Etapa A', () => {
  it('lee Excel con hojas alternativas y encabezados Labor repetidos sin fusionarlas', async () => {
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.aoa_to_sheet([headers, row]), 'REPORTE');
    utils.book_append_sheet(wb, utils.aoa_to_sheet([headers, row]), 'REPORTE (2)');
    const data = write(wb, { type: 'array', bookType: 'xlsx' });
    const opened = await openSource({ name: 'prueba.xlsx', arrayBuffer: async () => data });
    const mapping = suggestMapping(opened.sheets[0].matrix[0], 'hm');
    expect(mapping.labor).toBe(5);
    expect(mapping.laborName).toBe(8);
    const result = await normalizeSource(opened, 0, 0, mapping, 'hm');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ document: '000123', labor: 'FTS', units: 5.1, sourceRow: 2, date: '2026-10-01' });
  });
  it('mantiene identidad al reordenar o renombrar y conserva repeticiones', async () => {
    const another = [...row];
    another[7] = '000124';
    const a = await normalize([row, another, row]);
    const b = await normalizeSource(
      { ...source([another, row]), name: 'actualizado.xlsx' },
      0,
      0,
      suggestMapping(headers, 'hm'),
      'hm',
    );
    expect(a.rows[0].id).toBe(b.rows[1].id);
    expect(a.duplicateRows).toBe(1);
    expect(a.rows[0].signature).toBe(b.rows[1].signature);
  });
  it('rechaza KM, fechas inválidas y cantidades vacías sin convertir magnitudes', async () => {
    const km = [...row];
    km[4] = 'KM';
    const invalid = [...row];
    invalid[0] = '31/02/2026';
    const empty = [...row];
    empty[9] = '';
    const result = await normalize([row, km, invalid, empty]);
    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toHaveLength(3);
    expect(result.rejected[0].sourceRow).toBe(3);
    expect(result.rejected[0].original[4].value).toBe('KM');
  });
  it('exige mapeo explícito de programación y admite período sin horas', async () => {
    const s = openTSV('Finca\tLote\tTrabajo\tPeriodo\tNota\n900\t01\tMEC\tOctubre 2026\t"Urea\nprogramada"');
    expect(suggestMapping(s.sheets[0].matrix[0], 'program')).toEqual({});
    await expect(normalizeSource(s, 0, 0, {}, 'program')).rejects.toThrow('Asigne');
    const result = await normalizeSource(s, 0, 0, { haciendaCode: 0, suerte: 1, labor: 2, period: 3, product: 4 }, 'program');
    expect(result.rows[0]).toMatchObject({ units: null, period: 'Octubre 2026', product: 'Urea\nprogramada' });
  });
  it('rechaza columnas asignadas dos veces y TSV incompleto', async () => {
    await expect(normalizeSource(source([row]), 0, 0, { ...suggestMapping(headers, 'hm'), machine: 5 }, 'hm')).rejects.toThrow(
      'dos campos',
    );
    expect(() => openTSV('a\t"incompleto')).toThrow('comillas');
  });
  it('el inventario no muta Prefactura ni infiere FTS=MEC o estados de cobro', () => {
    const pf = Object.freeze([
      Object.freeze({ id: 'pf', labor: 'MEC', unit: 'HA', units: 2, pFact: '00001' }),
      Object.freeze({ id: 'manual', labor: 'MAN' }),
    ]);
    const rows = inventory([{ id: 'hm', labor: 'FTS', unit: 'HR', units: 6 }], pf, [], 'MEC,ZGC,CCH');
    expect(rows).toHaveLength(2);
    expect(rows[1].document).toBe('00001');
    expect(rows[0].labor).toBe('FTS');
    expect(rows.every((r) => r.status === undefined)).toBe(true);
    expect(pf[0].source).toBeUndefined();
  });
});
