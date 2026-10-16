import { formatCurrency, formatNumber } from '../../lib/format';
import { periodLongText } from '../../lib/labels';
import { periodKey } from '../../engine/periods';

export function Field({ label, children }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{children === '' || children == null ? '—' : children}</strong>
    </div>
  );
}

/** Ficha de una fila de origen (Prefactura o Nómina) con archivo, hoja y fila. Solo muestra lo leído del reporte. */
export function LineFields({ row, source = 'Prefactura', children }) {
  const period = row.period ?? (row.year != null ? periodKey(row.year, row.week) : null);
  const isPayroll = source === 'Nómina';
  return (
    <div className="detail-grid drill-fields">
      <Field label="Origen">{source}</Field>
      <Field label="Archivo">{row.sourceFile}</Field>
      <Field label="Hoja · fila">{`${row.sourceSheet ?? 'REPORTE'}!${row.sourceRow}`}</Field>
      <Field label="Semana">{period ? periodLongText(period, true) : `S${row.week}`}</Field>
      <Field label="Fecha">{row.date}</Field>
      {!isPayroll && <Field label="Periodo SIAGRI">{row.periodStart ? `${row.periodStart} → ${row.periodEnd}` : ''}</Field>}
      {!isPayroll && <Field label="Productor">{[row.producerCode, row.producerName].filter(Boolean).join(' · ')}</Field>}
      <Field label="Finca">{[row.haciendaCode, row.hacienda].filter(Boolean).join(' · ')}</Field>
      <Field label="Suerte">
        {`${row.suerte}${row.lotArea != null ? ` · ${formatNumber(row.lotArea)} ha${row.lotAreaSource ? ` (${row.lotAreaSource})` : ''}` : ''}`}
      </Field>
      <Field label="Labor">{[row.labor, row.laborName].filter(Boolean).join(' · ')}</Field>
      <Field label="Servicio">{[row.service, row.serviceName].filter(Boolean).join(' · ')}</Field>
      <Field label="Cantidad">{`${formatNumber(row.units)} ${row.unit}`}</Field>
      {isPayroll ? (
        <>
          <Field label="Tarifa Nómina">{Number.isFinite(row.payrollTariff) ? formatNumber(row.payrollTariff) : ''}</Field>
          <Field label="Trabajador">{row.worker}</Field>
          <Field label="Documento">{row.doc}</Field>
        </>
      ) : (
        <>
          <Field label="Tarifa">{formatNumber(row.tariff)}</Field>
          <Field label="Total (columna Total)">{formatCurrency(row.total ?? 0)}</Field>
          <Field label="P.FACT">{row.pFact}</Field>
          <Field label="Contratista">{row.contractor || row.contractorCode}</Field>
          <Field label="Interface SIAGRI">{row.interfaceStatus}</Field>
          <Field label="Grupo de tenencia">{row.tenureGroup}</Field>
        </>
      )}
      {children}
    </div>
  );
}
