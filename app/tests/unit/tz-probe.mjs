// Sonda para timezone.test.js: se ejecuta en un proceso con la zona horaria indicada en TZ y escribe en stdout
// las cifras de referencia completas (golden) y la lectura de libros sintéticos .xlsx/.xls con fechas 2000–2100.
// Uso: TZ=Asia/Tokyo npx vite-node tests/unit/tz-probe.mjs
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { utils, write } from 'xlsx';
import { readExcelWorkbook } from '../../src/engine/importers';
import { toIsoDate } from '../../src/engine/normalize';
import { buildGoldenSnapshot } from '../golden/snapshot';

const DATOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../datos');
const FRACTIONS = [0, 0.25, 0.5, 0.76, 0.99999];

/** Libro con un serial por día de 2000 a 2100 (con horas, incluida 23:59:59) en formato de fecha. */
const syntheticBook = (bookType) => {
  const aoa = [['Fecha', 'Serial']];
  for (let serial = 36526; serial <= 73415; serial += 1) {
    const value = serial + FRACTIONS[serial % FRACTIONS.length];
    aoa.push([value, value]);
  }
  const sheet = utils.aoa_to_sheet(aoa);
  for (let r = 1; r < aoa.length; r += 1) sheet[utils.encode_cell({ r, c: 0 })].z = 'dd/mm/yyyy hh:mm:ss';
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, 'REPORTE');
  return write(book, { bookType, type: 'array' });
};

const synthetic = Object.fromEntries(
  ['xlsx', 'biff8'].map((bookType) => {
    const book = readExcelWorkbook(syntheticBook(bookType));
    const rows = utils.sheet_to_json(book.Sheets.REPORTE, { defval: '', raw: true });
    const wrong = rows.filter(
      (row) =>
        !(row.Fecha instanceof Date) ||
        toIsoDate(row.Fecha) !== new Date(Date.UTC(1899, 11, 30) + Math.floor(row.Serial) * 864e5).toISOString().slice(0, 10),
    ).length;
    const signatures = createHash('sha256')
      .update(JSON.stringify(rows.map((row) => Object.entries(row))))
      .digest('hex');
    return [bookType, { rows: rows.length, wrong, signatures }];
  }),
);

process.stdout.write(JSON.stringify({ golden: await buildGoldenSnapshot(DATOS), synthetic }));
