// Utilidades de prueba: construcción de libros Excel sintéticos y filas mínimas.
import { utils, write } from 'xlsx';

/** File de Excel con una hoja (por defecto REPORTE) a partir de objetos. */
export const excelFile = (rows, { sheet = 'REPORTE', name = 'prueba.xlsx', extraSheets = {} } = {}) => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet(rows), sheet);
  for (const [extra, extraRows] of Object.entries(extraSheets))
    utils.book_append_sheet(workbook, utils.json_to_sheet(extraRows), extra);
  const data = write(workbook, { bookType: 'xlsx', type: 'array' });
  return new File([data], name);
};

/** Fecha como Date UTC (equivalente a la lectura con cellDates en UTC−6 para el día). */
export const day = (iso) => new Date(`${iso}T12:00:00Z`);

export const payrollRow = (overrides = {}) => ({
  Doc: '1',
  Hacienda: '242',
  'Nombre Hacienda': 'FINCA PRUEBA',
  Suerte: '01',
  Semana: '10',
  Fecha: day('2026-03-02'),
  Labor: 'CMN',
  'Nombre Labor': 'Control manual de maleza',
  'Unidad de Medida': 'HA',
  Servicio: '21076',
  'Nombre Servicio': 'Limpia manual',
  Unidades: 2,
  'Nombre Trabajador': 'TRABAJADOR A',
  Tarifa: 100,
  ...overrides,
});

export const prefacturaRow = (overrides = {}) => ({
  Semana: '10',
  Fecha: day('2026-03-02'),
  'Grp.Tenencia': 'CV',
  Hda: '242',
  'Nombre Hacienda': 'FINCA PRUEBA',
  Ste: '01',
  'Area de la Suerte': 5,
  Labor: 'CMN',
  Descripcion: 'Control manual',
  'Servicio SAP': '21076',
  'Nombre Servicio': 'Limpia manual',
  Unidades: 2,
  UM: 'HA',
  Total: 694.04,
  'P.FACT': '15837',
  Productor: 'CL1105',
  Tarifa: 347.02,
  Periodo: 'SEMANA 10  -  02/03/26 - 08/03/26',
  Interface: 'ENVIADO',
  'Nombre Productor': 'PRODUCTOR PRUEBA   FACTURA :15837',
  Contratista: 'CS9999 CASUR',
  ...overrides,
});

export const masterRows = (overrides = []) => [
  {
    'Hac-Sue': '24201',
    Cod: '242',
    Hacienda: 'FINCA PRUEBA',
    Suerte: '01',
    Area: 5,
    'F. Ult. Cte': day('2025-12-31'),
    'F. Siembra': day('2017-06-02'),
    ZONA: '5-Productores',
    Estado: 'Mantener activo',
    Tenencia: 'Compra Venta',
    ERP: '1-1',
  },
  ...overrides,
];
