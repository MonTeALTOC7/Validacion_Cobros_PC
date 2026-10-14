// Exportaciones a Excel (informe de auditoría y revisión por correo).
import { utils as XLSXUtils, write as writeWorkbook } from 'xlsx';
import { STATUS_LABELS } from './constants';
import { coverageStats, isBlockingPending } from './indicators';
import { downloadBlob } from '../lib/format';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const today = () => new Date().toISOString().slice(0, 10);

const saveWorkbook = (workbook, fileName) => {
  const data = writeWorkbook(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  downloadBlob(new Blob([data], { type: XLSX_MIME }), fileName);
};

export const findingToExportRow = (finding) => ({
  Semana: finding.week,
  Hacienda: finding.hacienda,
  Suerte: finding.suerte,
  Tipo: finding.type,
  Estado: STATUS_LABELS[finding.status] ?? finding.status,
  Labor: finding.labor,
  Servicio: finding.service,
  UM: finding.unit,
  'Unidades Nómina': finding.payrollUnits,
  'Unidades Prefactura': finding.billedUnits,
  Diferencia: finding.difference,
  Tarifa: finding.tariff,
  Total: finding.amount,
  'P.FACT': finding.pFacts.join(', '),
  Contratista: finding.contractor,
  Maestro: finding.masterStatus,
  Explicación: finding.explanation,
});

export const exportAuditWorkbook = (analysis, inputs) => {
  const workbook = XLSXUtils.book_new();
  const coverage = coverageStats(analysis.findings);
  const summary = [
    {
      Departamento: 'Negocios de Caña',
      Responsable: 'Carlos Tijerino',
      'Generado el': analysis.generatedAt,
      'Filas Nómina': analysis.coverage.payrollRows,
      'Filas Prefactura': analysis.coverage.prefacturaRows,
      Hallazgos: analysis.findings.length,
      'Pendientes de cobro': analysis.findings.filter(isBlockingPending).length,
      'Cobertura de cobro %': coverage.percent,
      'Sin prefacturar': coverage.unpaid,
      'Cobro parcial': coverage.partial,
      'TPS externos': analysis.findings.filter((f) => f.status === 'TPS_EXTERNO_VALIDO').length,
      'Servicios sin clasificar': analysis.unknownServices.join(', '),
    },
  ];
  XLSXUtils.book_append_sheet(workbook, XLSXUtils.json_to_sheet(summary), 'Resumen');
  XLSXUtils.book_append_sheet(workbook, XLSXUtils.json_to_sheet(analysis.findings.map(findingToExportRow)), 'Conciliación');
  XLSXUtils.book_append_sheet(
    workbook,
    XLSXUtils.json_to_sheet(analysis.findings.filter((f) => f.type === 'TPS' || f.type === 'EXTERNAL_TPS').map(findingToExportRow)),
    'TPS',
  );
  XLSXUtils.book_append_sheet(workbook, XLSXUtils.json_to_sheet(analysis.findings.filter(isBlockingPending).map(findingToExportRow)), 'Pendientes');
  XLSXUtils.book_append_sheet(
    workbook,
    XLSXUtils.json_to_sheet(
      inputs.files.map((file) => ({
        Tipo: file.kind,
        Archivo: file.name,
        Filas: file.rows,
        Tamaño: file.size,
        Importado: file.importedAt,
        SHA256: file.hash,
      })),
    ),
    'Archivos',
  );
  saveWorkbook(workbook, `auditoria_nomina_prefactura_${today()}.xlsx`);
};

export const exportReviewWorkbook = (review, workspace) => {
  const workbook = XLSXUtils.book_new();
  XLSXUtils.book_append_sheet(
    workbook,
    XLSXUtils.json_to_sheet([
      {
        Departamento: 'Negocios de Caña',
        Responsable: 'Carlos Tijerino',
        Archivo: workspace.file.name,
        'Semanas solicitadas': `${review.requestedWeekStart}-${review.requestedWeekEnd}`,
        'Semanas en archivo': `${review.fileWeekStart}-${review.fileWeekEnd}`,
        'Filas recibidas': review.reviewRows,
        'Cobros correctos': review.exact,
        'Pendientes críticos': review.critical,
        Advertencias: review.warnings,
        'Filas fuera del período': review.outsidePeriodRows,
        'Total recibido': review.total,
        SHA256: workspace.file.hash,
        Generado: review.generatedAt,
      },
    ]),
    'Resumen',
  );
  XLSXUtils.book_append_sheet(
    workbook,
    XLSXUtils.json_to_sheet(
      review.findings.map((finding) => ({
        Semana: finding.week,
        Hacienda: finding.hacienda,
        Suerte: finding.suerte,
        Labor: finding.labor,
        Servicios: finding.services.join(', '),
        'Nombre servicio': finding.serviceNames.join(', '),
        Resultado: finding.status,
        'UM Nómina': finding.unit,
        'UM recibida': finding.reviewUnit,
        'Unidades Nómina': finding.payrollUnits,
        'Unidades recibidas': finding.reviewUnits,
        Diferencia: finding.difference,
        Tarifa: finding.tariff,
        Total: finding.total,
        Explicación: finding.explanation,
      })),
    ),
    'Validación',
  );
  saveWorkbook(workbook, `revision_por_correo_S${review.requestedWeekStart}-S${review.requestedWeekEnd}_${today()}.xlsx`);
};
