import { X } from 'lucide-react';
import { REVIEW_STATUS_LABELS } from '../../engine/review';
import { formatCurrency, formatNumber } from '../../lib/format';

export function ReviewFindingDrawer({ finding: a, inputs: s, workspace: t, onClose: n }) {
  const i = s.payroll.filter((l) => a.payrollRowIds.includes(l.id));
  const r = t.rows.filter((l) => a.reviewRowIds.includes(l.id));
  return (
    <>
      <div className="drawer-overlay" onClick={n} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <span>Detalle de evidencia · Revisión por Correo</span>
            <h2>
              {a.hacienda}
              {' · '}
              {a.suerte}
            </h2>
          </div>
          <button aria-label="Cerrar detalle" onClick={n}>
            <X />
          </button>
        </div>
        <div className="drawer-body">
          <span className={`review-status ${a.severity}`}>{REVIEW_STATUS_LABELS[a.status]}</span>
          <p className="explanation">{a.explanation}</p>
          <div className="detail-grid">
            <ReviewDetail label="Semana" value={String(a.week)} />
            <ReviewDetail
              label="Labor / servicio"
              value={`${a.labor} · ${a.services.join(', ') || 'sin código'}`}
            />
            <ReviewDetail label="Unidad Nómina" value={a.unit} />
            <ReviewDetail label="Unidad recibida" value={a.reviewUnit} />
            <ReviewDetail label="Nómina" value={`${formatNumber(a.payrollUnits)} ${a.unit}`} />
            <ReviewDetail label="Excel recibido" value={`${formatNumber(a.reviewUnits)} ${a.reviewUnit}`} />
            <ReviewDetail label="Diferencia" value={`${formatNumber(a.difference)} ${a.reviewUnit}`} />
            <ReviewDetail label="Total" value={formatCurrency(a.total)} />
          </div>
          <ReviewEvidenceTable
            title="Filas de Nómina"
            rows={i.map((l) => ({
              source: `REPORTE!${l.sourceRow}`,
              detail: l.date,
              service: `${l.labor} · ${l.service}`,
              units: `${formatNumber(l.units)} ${l.unit}`,
            }))}
          />
          <ReviewEvidenceTable
            title="Filas del Excel recibido"
            rows={r.map((l) => ({
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
function ReviewDetail({ label: a, value: s }) {
  return (
    <div className="detail">
      <span>{a}</span>
      <strong>{s}</strong>
    </div>
  );
}
function ReviewEvidenceTable({ title: a, rows: s }) {
  return (
    <div className="evidence">
      <h3>
        {a} <span>{s.length}</span>
      </h3>
      {s.slice(0, 100).map((t, n) => (
        <div key={`${t.source}-${n}`}>
          <code>{t.source}</code>
          <span>{t.detail}</span>
          <strong>{t.service}</strong>
          <b>{t.units}</b>
        </div>
      ))}
      {s.length > 100 && (
        <p>
          {'Se muestran 100 de '}
          {s.length}
          {' filas.'}
        </p>
      )}
    </div>
  );
}
