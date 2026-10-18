import { utils } from 'xlsx';
import { readExcelWorkbook } from '../engine/importers';
import { normalizeText, normalizeSuerte, cleanCode, parseNumberCell, toIsoDate } from '../engine/normalize';

export const FIELDS = [
  ['haciendaCode', 'Código hacienda', ['Hacienda', 'Hda']],
  ['hacienda', 'Nombre hacienda', ['Nombre Hacienda']],
  ['suerte', 'Suerte', ['Suerte', 'Ste']],
  ['date', 'Fecha', ['Fecha']],
  ['period', 'Período', ['Periodo']],
  ['labor', 'Código labor', ['Labor']],
  ['laborName', 'Descripción labor', ['Labor2', 'Descripcion']],
  ['machine', 'Máquina', ['Maquina']],
  ['document', 'Documento', ['Nro del Documento']],
  ['unit', 'Unidad', ['UM']],
  ['units', 'Cantidad', ['Cant.']],
  ['costCenter', 'Centro de costo', ['Centro Costo']],
  ['age', 'Edad suerte', ['Edad de la Suerte']],
  ['area', 'Área suerte', ['Area de la Suerte']],
  ['product', 'Insumo (opcional)', []],
];
const text = (v) => String(v ?? '').trim();
export const digest = async (value) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export async function openSource(file) {
  const workbook = readExcelWorkbook(await file.arrayBuffer());
  return {
    name: file.name,
    sheets: workbook.SheetNames.map((name) => ({
      name,
      matrix: utils.sheet_to_json(workbook.Sheets[name], { header: 1, range: 0, defval: '', blankrows: true, raw: true }),
    })),
  };
}

// Quoted TSV supports Excel cells containing tabs, newlines and escaped quotes.
export function openTSV(input) {
  const matrix = [];
  let row = [],
    cell = '',
    quoted = false;
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"' && (quoted || cell === '')) {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === '\t' || c === '\n')) {
      row.push(cell);
      cell = '';
      if (c === '\n') {
        matrix.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error('Hay una celda con comillas sin cerrar. Copie nuevamente el rango completo.');
  row.push(cell);
  matrix.push(row);
  if (!matrix.some((r) => r.some((c) => text(c)))) throw new Error('El rango está vacío.');
  return { name: 'Rango pegado', sheets: [{ name: 'TSV', matrix }] };
}

export function suggestMapping(headers, kind) {
  // Programming has no known schema: the operator explicitly maps its columns.
  if (kind === 'program') return {};
  const mapping = {};
  for (const [field, , aliases] of FIELDS) {
    const index = headers.findIndex((h) => aliases.some((a) => normalizeText(a) === normalizeText(h)));
    if (index >= 0) mapping[field] = index;
  }
  const repeatedLabor = headers.map((h, i) => (normalizeText(h) === 'LABOR' ? i : -1)).filter((i) => i >= 0);
  if (repeatedLabor.length === 2 && mapping.laborName === undefined) mapping.laborName = repeatedLabor[1];
  return mapping;
}

export async function normalizeSource(source, sheetIndex, headerRow, mapping, kind) {
  if (!['hm', 'program'].includes(kind)) throw new Error('Fuente desconocida.');
  const sheet = source.sheets[sheetIndex];
  if (!sheet || !Number.isInteger(headerRow) || headerRow < 0 || headerRow >= sheet.matrix.length)
    throw new Error('Seleccione una fila de encabezados válida.');
  const mapped = (key) => Number.isInteger(mapping[key]) && mapping[key] >= 0 && mapping[key] < sheet.matrix[headerRow].length;
  const required = ['suerte', 'labor', ...(kind === 'hm' ? ['unit', 'units'] : [])];
  if (
    (!mapped('haciendaCode') && !mapped('hacienda')) ||
    (!mapped('date') && !mapped('period')) ||
    required.some((key) => !mapped(key))
  )
    throw new Error('Asigne hacienda, suerte, labor y fecha o período; HM requiere también unidad y cantidad.');
  const columns = Object.values(mapping).filter((v) => Number.isInteger(v));
  if (new Set(columns).size !== columns.length) throw new Error('Una columna no puede asignarse a dos campos.');
  const accepted = [],
    rejected = [],
    seen = new Map();
  for (let i = headerRow + 1; i < sheet.matrix.length; i++) {
    const cells = sheet.matrix[i];
    if (!cells.some((c) => text(c))) continue;
    const get = (key) => (mapped(key) ? (cells[mapping[key]] ?? '') : '');
    const row = Object.fromEntries(FIELDS.map(([key]) => [key, text(get(key))]));
    row.haciendaCode = cleanCode(get('haciendaCode'));
    row.suerte = normalizeSuerte(get('suerte'));
    row.date = get('date') === '' ? '' : toIsoDate(get('date'));
    row.labor = normalizeText(get('labor'));
    row.unit = normalizeText(get('unit'));
    const quantity = parseNumberCell(get('units'));
    row.units = quantity.empty ? null : quantity.value;
    const reasons = [];
    if (!row.haciendaCode && !row.hacienda) reasons.push('Hacienda vacía');
    if (!row.suerte || !row.labor) reasons.push('Suerte o labor vacía');
    if ((get('date') !== '' && !row.date) || (!row.date && !row.period)) reasons.push('Fecha inválida o período ausente');
    if (kind === 'hm' && row.unit !== 'HR') reasons.push(`Unidad ${row.unit || 'vacía'}: fuera del alcance HR`);
    if ((kind === 'hm' && (quantity.empty || quantity.value <= 0)) || !quantity.valid) reasons.push('Cantidad inválida');
    const reference = { sourceFile: source.name, sourceSheet: sheet.name, sourceRow: i + 1 };
    // Full content signature is retained to detect hypothetical SHA collisions.
    const signature = JSON.stringify([kind, ...FIELDS.map(([key]) => row[key])]);
    const id = await digest(signature);
    const previous = seen.get(id);
    if (previous && previous !== signature) throw new Error('Colisión de identidad; no se importó ninguna fila.');
    seen.set(id, signature);
    const original = cells.map((value, index) => ({
      column: index + 1,
      header: text(sheet.matrix[headerRow][index]),
      value: value instanceof Date ? toIsoDate(value) : value,
    }));
    if (reasons.length) rejected.push({ ...reference, reasons, original });
    else accepted.push({ ...row, ...reference, kind, id, signature, original });
  }
  return {
    rows: accepted,
    rejected,
    mapping,
    name: source.name,
    sheet: sheet.name,
    importedAt: new Date().toISOString(),
    duplicateRows: accepted.length - new Set(accepted.map((r) => r.id)).size,
  };
}
