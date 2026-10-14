import { write as writeWorkbook, utils as XLSXUtils } from 'xlsx';
import { STATUS_LABELS } from './constants';
import { coverageStats, isBlockingPending } from './indicators';
import { downloadBlob } from '../lib/format';

const findingToExportRow = (a) => ({
  Semana: a.week,
  Hacienda: a.hacienda,
  Suerte: a.suerte,
  Tipo: a.type,
  Estado: STATUS_LABELS[a.status] ?? a.status,
  Labor: a.labor,
  Servicio: a.service,
  UM: a.unit,
  'Unidades Nómina': a.payrollUnits,
  'Unidades Prefactura': a.billedUnits,
  Diferencia: a.difference,
  Tarifa: a.tariff,
  Total: a.amount,
  'P.FACT': a.pFacts.join(', '),
  Contratista: a.contractor,
  Maestro: a.masterStatus,
  Explicación: a.explanation,
});
export const exportAuditWorkbook = (a, s) => {
  const t = XLSXUtils.book_new();
  const n = [
    {
      Departamento: 'Negocios de Caña',
      Responsable: 'Carlos Tijerino',
      'Generado el': a.generatedAt,
      'Filas Nómina': a.coverage.payrollRows,
      'Filas Prefactura': a.coverage.prefacturaRows,
      Hallazgos: a.findings.length,
      'Pendientes de cobro': a.findings.filter(isBlockingPending).length,
      'Cobertura de cobro %': coverageStats(a.findings).percent,
      'Sin prefacturar': coverageStats(a.findings).unpaid,
      'Cobro parcial': coverageStats(a.findings).partial,
      'TPS externos': a.findings.filter((r) => r.status === 'TPS_EXTERNO_VALIDO').length,
      'Servicios sin clasificar': a.unknownServices.join(', '),
    },
  ];
  XLSXUtils.book_append_sheet(t, XLSXUtils.json_to_sheet(n), 'Resumen');
  XLSXUtils.book_append_sheet(t, XLSXUtils.json_to_sheet(a.findings.map(findingToExportRow)), 'Conciliación');
  XLSXUtils.book_append_sheet(
    t,
    XLSXUtils.json_to_sheet(
      a.findings.filter((r) => r.type === 'TPS' || r.type === 'EXTERNAL_TPS').map(findingToExportRow),
    ),
    'TPS',
  );
  XLSXUtils.book_append_sheet(
    t,
    XLSXUtils.json_to_sheet(a.findings.filter(isBlockingPending).map(findingToExportRow)),
    'Pendientes',
  );
  XLSXUtils.book_append_sheet(
    t,
    XLSXUtils.json_to_sheet(
      s.files.map((r) => ({
        Tipo: r.kind,
        Archivo: r.name,
        Filas: r.rows,
        Tamaño: r.size,
        Importado: r.importedAt,
        SHA256: r.hash,
      })),
    ),
    'Archivos',
  );
  const i = writeWorkbook(t, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });
  downloadBlob(
    new Blob([i], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `auditoria_nomina_prefactura_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
};
export const exportReviewWorkbook = (a, s) => {
  const t = XLSXUtils.book_new();
  XLSXUtils.book_append_sheet(
    t,
    XLSXUtils.json_to_sheet([
      {
        Departamento: 'Negocios de Caña',
        Responsable: 'Carlos Tijerino',
        Archivo: s.file.name,
        'Semanas solicitadas': `${a.requestedWeekStart}-${a.requestedWeekEnd}`,
        'Semanas en archivo': `${a.fileWeekStart}-${a.fileWeekEnd}`,
        'Filas recibidas': a.reviewRows,
        'Cobros correctos': a.exact,
        'Pendientes críticos': a.critical,
        Advertencias: a.warnings,
        'Filas fuera del período': a.outsidePeriodRows,
        'Total recibido': a.total,
        SHA256: s.file.hash,
        Generado: a.generatedAt,
      },
    ]),
    'Resumen',
  );
  XLSXUtils.book_append_sheet(
    t,
    XLSXUtils.json_to_sheet(
      a.findings.map((i) => ({
        Semana: i.week,
        Hacienda: i.hacienda,
        Suerte: i.suerte,
        Labor: i.labor,
        Servicios: i.services.join(', '),
        'Nombre servicio': i.serviceNames.join(', '),
        Resultado: i.status,
        'UM Nómina': i.unit,
        'UM recibida': i.reviewUnit,
        'Unidades Nómina': i.payrollUnits,
        'Unidades recibidas': i.reviewUnits,
        Diferencia: i.difference,
        Tarifa: i.tariff,
        Total: i.total,
        Explicación: i.explanation,
      })),
    ),
    'Validación',
  );
  const n = writeWorkbook(t, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });
  downloadBlob(
    new Blob([n], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `revision_por_correo_S${a.requestedWeekStart}-S${a.requestedWeekEnd}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
};
