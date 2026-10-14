// Exportación genérica a Excel desde la interfaz.
import { utils as XLSXUtils, write as writeWorkbook } from 'xlsx';
import { downloadBlob } from './format';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Libro con varias hojas: sheets = [{ name, rows }]. Las hojas vacías se escriben con un aviso. */
export const exportSheetsToExcel = (sheets, fileName) => {
  const workbook = XLSXUtils.book_new();
  for (const { name, rows } of sheets) {
    const data = rows.length ? rows : [{ Aviso: 'Sin registros para esta hoja.' }];
    XLSXUtils.book_append_sheet(workbook, XLSXUtils.json_to_sheet(data), name.slice(0, 31));
  }
  const data = writeWorkbook(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  downloadBlob(new Blob([data], { type: XLSX_MIME }), fileName);
};

export const exportRowsToExcel = (rows, sheetName, fileName) => exportSheetsToExcel([{ name: sheetName, rows }], fileName);

export const downloadJson = (data, fileName) =>
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), fileName);
