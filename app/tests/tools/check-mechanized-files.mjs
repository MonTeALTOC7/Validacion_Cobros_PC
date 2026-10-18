// Local-only verification; paths come from arguments, never committed fixtures.
// npx vite-node tests/tools/check-mechanized-files.mjs -- <hm.xlsx> <prefactura.xlsx>
import { readFile } from 'node:fs/promises';
import { openSource, normalizeSource, suggestMapping } from '../../src/mechanized/importers.js';
import { parsePrefacturaFile } from '../../src/engine/importers.js';
const paths = process.argv.slice(2).filter((arg) => arg !== '--');
if (paths.length !== 2) throw new Error('Indique rutas HM y Prefactura.');
const file = async (path) => {
  const data = await readFile(path);
  return {
    name: 'local-verification.xlsx',
    size: data.byteLength,
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  };
};
const hm = await openSource(await file(paths[0]));
for (let index = 0; index < hm.sheets.length; index++) {
  const result = await normalizeSource(hm, index, 0, suggestMapping(hm.sheets[index].matrix[0], 'hm'), 'hm');
  console.log(
    JSON.stringify({
      source: 'HM',
      sheet: hm.sheets[index].name,
      accepted: result.rows.length,
      excluded: result.rejected.length,
      exactRepeats: result.duplicateRows,
      units: Object.fromEntries(['HR', 'KM'].map((unit) => [unit, result.rows.filter((r) => r.unit === unit).length])),
      kmLabors: Object.fromEntries(
        ['ALC', 'ALR'].map((labor) => [labor, result.rows.filter((r) => r.unit === 'KM' && r.labor === labor).length]),
      ),
      zone5: result.rows.filter((r) => r.zone === '5').length,
      withWeek: result.rows.filter((r) => r.week !== '').length,
      reasons: [...new Set(result.rejected.flatMap((r) => r.reasons))],
    }),
  );
}
const pf = await parsePrefacturaFile(await file(paths[1]));
console.log(
  JSON.stringify({ source: 'Prefactura', accepted: pf.rows.length, excluded: pf.file.skippedRows, sheet: pf.file.sheet }),
);
