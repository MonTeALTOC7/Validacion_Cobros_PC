import { useMemo } from 'react';
import { X } from 'lucide-react';
import { FlagBadges, StatusBadge } from './StatusBadge';
import { TYPE_LABELS } from '../engine/constants';
import { COLLECTION_STATE_LABELS, collectionState, findingPeriod } from '../engine/indicators';
import { formatCurrency, formatNumber } from '../lib/format';
import { periodLongText, tariffText } from '../lib/labels';

const MASTER_LABELS = {
  EXACT: 'Suerte encontrada',
  FALLBACK_HACIENDA: 'Validada por hacienda (suerte no vigente)',
  MISSING: 'No encontrada',
};

/** Detalle de un hallazgo con toda la evidencia de origen (archivo, hoja, fila). */
export function FindingDrawer({ finding, inputs, multiYear, onClose }) {
  const { payrollRows, billedRows } = useMemo(() => {
    const payrollIds = new Set(finding.payrollRowIds);
    const billedIds = new Set(finding.prefacturaRowIds);
    return {
      payrollRows: inputs.payroll.filter((row) => payrollIds.has(row.id)),
      billedRows: inputs.prefactura.filter((row) => billedIds.has(row.id)),
    };
  }, [finding, inputs]);

  const duplicateSignatures = useMemo(() => {
    const counts = new Map();
    billedRows.forEach((row) => {
      const key = [row.date, row.units, row.tariff, row.pFact, row.service].join('|');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [billedRows]);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer drawer-wide" role="dialog" aria-modal="true" aria-label="Detalle de evidencia">
        <div className="drawer-head">
          <div>
            <span>Detalle de evidencia · {TYPE_LABELS[finding.type] ?? finding.type}</span>
            <h2>
              {finding.hacienda} · {finding.suerte}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <div className="drawer-body">
          <div className="badge-row">
            <StatusBadge status={finding.status} severity={finding.severity} />
            <FlagBadges flags={finding.flags} />
          </div>
          <p className="explanation">{finding.explanation}</p>
          <div className="detail-grid">
            <DetailItem label="Semana" value={periodLongText(findingPeriod(finding), multiYear)} />
            <DetailItem label="Labor / servicio" value={`${finding.labor} · ${finding.service}`} />
            <DetailItem label="Estado de cobro" value={COLLECTION_STATE_LABELS[collectionState(finding)]} />
            <DetailItem label="Maestro" value={MASTER_LABELS[finding.masterStatus] ?? finding.masterStatus} />
            <DetailItem label="Nómina" value={`${formatNumber(finding.payrollUnits)} ${finding.unit}`} />
            <DetailItem label="Prefactura" value={`${formatNumber(finding.billedUnits)} ${finding.unit}`} />
            <DetailItem label="Diferencia" value={`${formatNumber(finding.difference)} ${finding.unit}`} />
            <DetailItem label="Tarifa cobrada" value={tariffText(finding)} />
            <DetailItem label="P.FACT" value={finding.pFacts.join(', ') || '—'} />
            <DetailItem label="Total cobrado" value={formatCurrency(finding.amount)} />
            <DetailItem label="Contratista" value={finding.contractor || '—'} />
            {finding.duplicateRows > 0 && (
              <DetailItem label="Filas idénticas" value={`${finding.duplicateRows} copia(s) extra`} />
            )}
          </div>
          {finding.type === 'TPS' && (
            <div className="stage-box">
              <h3>Etapas de siembra</h3>
              <div>
                <DetailItem label="RYA 19084/19085" value={`${formatNumber(finding.stageRya ?? 0)} MJO`} />
                <DetailItem label="Corte 19013" value={`${formatNumber(finding.stageCut ?? 0)} MJO`} />
                <DetailItem label="Descargue" value={`${formatNumber(finding.stageUnload ?? 0)} MJO`} />
              </div>
            </div>
          )}
          <EvidenceTable
            title="Filas de Nómina"
            columns={['Origen', 'Fecha', 'Servicio', 'Unidades', 'Tarifa Nómina', 'Trabajador']}
            rows={payrollRows.map((row) => [
              sourceLabel(row),
              row.date,
              row.service,
              `${formatNumber(row.units)} ${row.unit}`,
              row.payrollTariff ? formatNumber(row.payrollTariff) : '—',
              row.worker || '—',
            ])}
            note="La tarifa de Nómina es la registrada en la planilla; no se compara con la tarifa cobrada al productor."
          />
          <EvidenceTable
            title="Filas de Prefactura"
            columns={['Origen', 'Fecha', 'Servicio', 'Unidades', 'Tarifa', 'Total', 'P.FACT']}
            rows={billedRows.map((row) => {
              const duplicated =
                (duplicateSignatures.get([row.date, row.units, row.tariff, row.pFact, row.service].join('|')) ?? 0) > 1;
              return [
                sourceLabel(row) + (duplicated ? ' · idéntica' : ''),
                row.date,
                row.service,
                `${formatNumber(row.units)} ${row.unit}`,
                formatNumber(row.tariff),
                formatCurrency(row.total),
                row.pFact || '—',
              ];
            })}
          />
        </div>
      </aside>
    </>
  );
}

const sourceLabel = (row) => `${row.sourceSheet ?? 'REPORTE'}!${row.sourceRow}`;

export function DetailItem({ label, value }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const MAX_ROWS = 150;

export function EvidenceTable({ title, columns, rows, note }) {
  return (
    <div className="evidence">
      <h3>
        {title} <span>{rows.length}</span>
      </h3>
      {rows.length > 0 && (
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, MAX_ROWS).map((cells, index) => (
                <tr key={index}>
                  {cells.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cellIndex === 0 ? <code>{cell}</code> : cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > MAX_ROWS && (
        <p>
          Se muestran {MAX_ROWS} de {rows.length} filas.
        </p>
      )}
      {note && rows.length > 0 && <small className="muted">{note}</small>}
    </div>
  );
}
