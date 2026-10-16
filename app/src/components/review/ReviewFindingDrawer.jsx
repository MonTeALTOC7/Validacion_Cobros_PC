import { X } from 'lucide-react';
import { REVIEW_STATUS_LABELS } from '../../engine/review';
import { formatCurrency, formatNumber } from '../../lib/format';
export function ReviewFindingDrawer({ finding, inputs, workspace, onClose }) {
  const payrollRows = inputs.payroll.filter((l) => finding.payrollRowIds.includes(l.id));
  const reviewRows = workspace.rows.filter((l) => finding.reviewRowIds.includes(l.id));
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <span>Detalle de evidencia · Revisión por Correo</span>
            <h2>
              {finding.hacienda}
              {' · '}
              {finding.suerte}
            </h2>
          </div>
          <button aria-label="Cerrar detalle" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="drawer-body">
          <span className={`review-status ${finding.severity}`}>{REVIEW_STATUS_LABELS[finding.status]}</span>
          <p className="explanation">{finding.explanation}</p>
          <div className="detail-grid">
            <ReviewDetail label="Semana" value={String(finding.week)} />
            <ReviewDetail label="Labor / servicio" value={`${finding.labor} · ${finding.services.join(', ') || 'sin código'}`} />
            <ReviewDetail label="Unidad Nómina" value={finding.unit} />
            <ReviewDetail label="Unidad recibida" value={finding.reviewUnit} />
            <ReviewDetail label="Nómina" value={`${formatNumber(finding.payrollUnits)} ${finding.unit}`} />
            <ReviewDetail label="Excel recibido" value={`${formatNumber(finding.reviewUnits)} ${finding.reviewUnit}`} />
            <ReviewDetail label="Diferencia" value={`${formatNumber(finding.difference)} ${finding.reviewUnit}`} />
            <ReviewDetail label="Total" value={formatCurrency(finding.total)} />
          </div>
          <ReviewEvidenceTable
            title="Filas de Nómina"
            rows={payrollRows.map((l) => ({
              source: `REPORTE!${l.sourceRow}`,
              detail: l.date,
              service: `${l.labor} · ${l.service}`,
              units: `${formatNumber(l.units)} ${l.unit}`,
            }))}
          />
          <ReviewEvidenceTable
            title="Filas del Excel recibido"
            rows={reviewRows.map((l) => ({
              source: `REPORTE!${l.sourceRow}`,
              detail: `Semana ${l.week}`,
              service: `${l.labor} · ${l.serviceName}`,
              units: `${formatNumber(l.units)} ${l.unit}`,
            }))}
          />
        </div>
      </aside>
    </>
  );
}
function ReviewDetail({ label, value }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function ReviewEvidenceTable({ title, rows }) {
  return (
    <div className="evidence">
      <h3>
        {title} <span>{rows.length}</span>
      </h3>
      {rows.slice(0, 100).map((t, n) => (
        <div key={`${t.source}-${n}`}>
          <code>{t.source}</code>
          <span>{t.detail}</span>
          <strong>{t.service}</strong>
          <b>{t.units}</b>
        </div>
      ))}
      {rows.length > 100 && (
        <p>
          {'Se muestran 100 de '}
          {rows.length}
          {' filas.'}
        </p>
      )}
    </div>
  );
}
