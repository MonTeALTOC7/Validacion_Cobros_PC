// Exportaciones a Excel (informe de auditoría y revisión por correo).
import { utils as XLSXUtils, write as writeWorkbook } from 'xlsx';
import { APP_VERSION, BUILD_DATE, STATUS_LABELS, TYPE_LABELS } from './constants';
import { COLLECTION_STATE_LABELS, collectionState, coverageStats, findingPeriod, isBlockingPending } from './indicators';
import { FLAG_LABELS } from './reconciliation';
import { downloadBlob } from '../lib/format';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const today = () => new Date().toISOString().slice(0, 10);

const saveWorkbook = (workbook, fileName) => {
  const data = writeWorkbook(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  downloadBlob(new Blob([data], { type: XLSX_MIME }), fileName);
};

const appendSheet = (workbook, rows, name) =>
  XLSXUtils.book_append_sheet(workbook, XLSXUtils.json_to_sheet(rows.length ? rows : [{ Aviso: 'Sin registros.' }]), name);

/**
 * Fila de exportación de un hallazgo. Conserva las 17 columnas de v0.7 en el mismo orden y agrega
 * al final las columnas nuevas (año operativo, período, tarifas, banderas, estado de cobro, tipo).
 */
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
  'Año operativo': finding.year ?? '',
  Período: findingPeriod(finding),
  'Tarifas cobradas': (finding.tariffs ?? []).join(' / '),
  Banderas: (finding.flags ?? []).map((flag) => FLAG_LABELS[flag] ?? flag).join(', '),
  'Estado de cobro': COLLECTION_STATE_LABELS[collectionState(finding)],
  'Tipo (descripción)': TYPE_LABELS[finding.type] ?? finding.type,
  'Filas idénticas en Prefactura': finding.duplicateRows ?? 0,
  'ID hallazgo': finding.id,
});

/** Una fila por cada fila de origen que respalda un hallazgo (archivo, hoja y número de fila). */
const originRows = (analysis, inputs) => {
  const payroll = new Map(inputs.payroll.map((row) => [row.id, row]));
  const prefactura = new Map(inputs.prefactura.map((row) => [row.id, row]));
  const rows = [];
  for (const finding of analysis.findings) {
    const add = (source, row) =>
      row &&
      rows.push({
        'ID hallazgo': finding.id,
        Período: findingPeriod(finding),
        Hacienda: finding.hacienda,
        Suerte: finding.suerte,
        Estado: STATUS_LABELS[finding.status] ?? finding.status,
        Fuente: source,
        Archivo: row.sourceFile ?? '',
        Hoja: row.sourceSheet ?? 'REPORTE',
        Fila: row.sourceRow,
        Fecha: row.date,
        Servicio: row.service,
        Unidades: row.units,
        UM: row.unit,
        Tarifa: source === 'Prefactura' ? row.tariff : (row.payrollTariff ?? ''),
        Total: source === 'Prefactura' ? row.total : '',
        'P.FACT': row.pFact ?? '',
      });
    finding.payrollRowIds.forEach((id) => add('Nómina', payroll.get(id)));
    finding.prefacturaRowIds.forEach((id) => add('Prefactura', prefactura.get(id)));
  }
  return rows;
};

export const exportAuditWorkbook = (analysis, inputs, { parameters = analysis.parameters, quality = [] } = {}) => {
  const workbook = XLSXUtils.book_new();
  const coverage = coverageStats(analysis.findings);
  const master = inputs.files.find((file) => file.kind === 'master');
  appendSheet(
    workbook,
    [
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
        'Período inicial': analysis.startPeriod ?? '',
        'Semanas incluidas': `${analysis.coverage.startPeriod ?? analysis.coverage.startWeek} → ${analysis.coverage.endPeriod ?? analysis.coverage.endWeek}`,
        'Grupos duplicados Prefactura': analysis.duplicateGroups,
        'Copias extra Prefactura': analysis.duplicateExtraRows ?? '',
        'Monto copias extra': analysis.duplicateExtraAmount ?? '',
      },
    ],
    'Resumen',
  );
  appendSheet(workbook, analysis.findings.map(findingToExportRow), 'Conciliación');
  appendSheet(
    workbook,
    analysis.findings
      .filter((f) => f.type === 'TPS' || f.type === 'EXTERNAL_TPS' || f.type === 'TPS_STAGE')
      .map(findingToExportRow),
    'TPS',
  );
  appendSheet(workbook, analysis.findings.filter(isBlockingPending).map(findingToExportRow), 'Pendientes');
  appendSheet(workbook, originRows(analysis, inputs), 'Origen');
  appendSheet(
    workbook,
    quality.map((item) => ({
      Severidad: item.severity,
      Problema: item.title,
      Detalle: item.detail,
      Cantidad: item.count,
      Ejemplos: item.examples
        .slice(0, 5)
        .map((example) => [example.file, example.row && `fila ${example.row}`, example.detail].filter(Boolean).join(' '))
        .join(' | '),
    })),
    'Calidad',
  );
  appendSheet(
    workbook,
    inputs.files.map((file) => ({
      Tipo: file.kind,
      Archivo: file.name,
      Filas: file.rows,
      Tamaño: file.size,
      Importado: file.importedAt,
      SHA256: file.hash,
      Hoja: file.sheet ?? '',
      'No utilizables': file.skippedRows ?? '',
      Origen: file.source ?? '',
    })),
    'Archivos',
  );
  appendSheet(
    workbook,
    Object.entries(parameters ?? {}).map(([name, value]) => ({
      Parámetro: name,
      Valor: Array.isArray(value) ? value.join('; ') : String(value),
    })),
    'Parámetros',
  );
  appendSheet(
    workbook,
    [
      {
        'Versión de la aplicación': APP_VERSION,
        Compilación: BUILD_DATE,
        'Versión del motor': analysis.engineVersion ?? 1,
        'Maestro usado': master?.name ?? '',
        'Huella del Maestro': master?.hash ?? '',
      },
    ],
    'Versión',
  );
  saveWorkbook(workbook, `auditoria_nomina_prefactura_${today()}.xlsx`);
};

export const exportReviewWorkbook = (review, workspace) => {
  const workbook = XLSXUtils.book_new();
  appendSheet(
    workbook,
    [
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
    ],
    'Resumen',
  );
  appendSheet(
    workbook,
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
    'Validación',
  );
  saveWorkbook(workbook, `revision_por_correo_S${review.requestedWeekStart}-S${review.requestedWeekEnd}_${today()}.xlsx`);
};
