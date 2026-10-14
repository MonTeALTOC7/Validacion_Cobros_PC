import { X } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatCurrency, formatNumber } from '../lib/format';

export function FindingDrawer({ finding: a, inputs: s, onClose: t }) {
  const n = s.payroll.filter((r) => a.payrollRowIds.includes(r.id));
  const i = s.prefactura.filter((r) => a.prefacturaRowIds.includes(r.id));
  return (
    <>
      <div className="drawer-overlay" onClick={t} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <span>Detalle de evidencia</span>
            <h2>
              {a.hacienda}
              {' · '}
              {a.suerte}
            </h2>
          </div>
          <button onClick={t}>
            <X />
          </button>
        </div>
        <div className="drawer-body">
          <StatusBadge status={a.status} severity={a.severity} />
          <p className="explanation">{a.explanation}</p>
          <div className="detail-grid">
            <DetailItem label="Semana" value={String(a.week)} />
            <DetailItem label="Labor / servicio" value={`${a.labor} · ${a.service}`} />
            <DetailItem label="P.FACT" value={a.pFacts.join(', ') || '—'} />
            <DetailItem label="Contratista" value={a.contractor || '—'} />
            <DetailItem label="Nómina" value={`${formatNumber(a.payrollUnits)} ${a.unit}`} />
            <DetailItem label="Prefactura" value={`${formatNumber(a.billedUnits)} ${a.unit}`} />
            <DetailItem label="Diferencia" value={`${formatNumber(a.difference)} ${a.unit}`} />
            <DetailItem label="Total" value={formatCurrency(a.amount)} />
          </div>
          {a.type === 'TPS' && (
            <div className="stage-box">
              <h3>Etapas de siembra</h3>
              <div>
                <DetailItem label="RYA 19084/19085" value={`${formatNumber(a.stageRya ?? 0)} MJO`} />
                <DetailItem label="Corte 19013" value={`${formatNumber(a.stageCut ?? 0)} MJO`} />
                <DetailItem label="Descargue" value={`${formatNumber(a.stageUnload ?? 0)} MJO`} />
              </div>
            </div>
          )}
          <EvidenceTable
            title="Filas de Nómina"
            rows={n.map((r) => ({
              source: `REPORTE!${r.sourceRow}`,
              date: r.date,
              service: r.service,
              units: `${formatNumber(r.units)} ${r.unit}`,
            }))}
          />
          <EvidenceTable
            title="Filas de Prefactura"
            rows={i.map((r) => ({
              source: `REPORTE!${r.sourceRow}`,
              date: r.date,
              service: r.service,
              units: `${formatNumber(r.units)} ${r.unit}`,
            }))}
          />
        </div>
      </aside>
    </>
  );
}
function DetailItem({ label: a, value: s }) {
  return (
    <div className="detail">
      <span>{a}</span>
      <strong>{s}</strong>
    </div>
  );
}
function EvidenceTable({ title: a, rows: s }) {
  return (
    <div className="evidence">
      <h3>
        {a} <span>{s.length}</span>
      </h3>
      {s.slice(0, 100).map((t, n) => (
        <div key={`${t.source}-${n}`}>
          <code>{t.source}</code>
          <span>{t.date}</span>
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
