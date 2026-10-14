import { useMemo, useState } from 'react';
import { SKIP_REASON_LABELS, diffRows, unitTotals } from '../engine/importers';
import { formatNumber } from '../lib/format';
import { periodLongText } from '../lib/labels';

const describeRow = (row) =>
  [row.date, row.week ? 'S' + row.week : '', row.hacienda, row.suerte, row.labor, row.service, row.units, row.unit]
    .filter((value) => value !== undefined && value !== '')
    .join(' · ');

const dateRange = (rows) => {
  const dates = rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort();
  return dates.length ? dates[0] + ' → ' + dates.at(-1) : 'Sin fechas de movimiento';
};

/** Comprobación previa al reemplazo de un archivo: qué filas entran, salen o quedan iguales. */
export function ImportReviewDrawer({ name, metadata, previous, incoming, sameFile, queueLabel, onConfirm, onCancel }) {
  const diff = useMemo(() => diffRows(previous, incoming), [previous, incoming]);
  const skipped = metadata?.skippedRows ?? 0;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAcknowledgement = diff.removed > 0 || skipped > 0 || diff.missingPeriods.length > 0;
  const reasons = Object.entries(metadata?.skipReasons ?? {});

  return (
    <>
      <div className="drawer-overlay" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Validar actualización">
        <div className="drawer-head">
          <div>
            <span>Comprobación antes de reemplazar{queueLabel ? ` · ${queueLabel}` : ''}</span>
            <h2>{name}</h2>
          </div>
        </div>
        <div className="drawer-body">
          <h3>{sameFile ? 'Es el mismo archivo: sin cambios' : 'Formato reconocido · revise los cambios'}</h3>
          <p>
            Reconocer el formato no significa que todos los cobros estén correctos. La conciliación comprobará las cantidades
            después de confirmar.
          </p>
          <div className="detail-grid">
            {[
              ['Filas anteriores', previous.length],
              ['Filas nuevas', incoming.length],
              ['Agregadas o modificadas', diff.added],
              ['Retiradas o modificadas', diff.removed],
              ['Sin cambios', diff.unchanged],
              ['No utilizables', skipped],
              ['Repeticiones conservadas', diff.duplicates],
              ['Hoja leída', metadata?.sheet ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="detail">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {reasons.length > 0 && (
            <p>
              <strong>Motivos de filas no utilizables:</strong>{' '}
              {reasons.map(([reason, count]) => `${SKIP_REASON_LABELS[reason] ?? reason}: ${count}`).join(' · ')}.
            </p>
          )}
          <p>
            Semanas nuevas: {diff.newPeriods.map((period) => periodLongText(period, true)).join(', ') || 'ninguna'}.
            {diff.missingPeriods.length > 0 && (
              <>
                <br />
                <strong>Semanas que desaparecen:</strong>{' '}
                {diff.missingPeriods.map((period) => periodLongText(period, true)).join(', ')}.
              </>
            )}
          </p>
          <p>
            Período anterior: {dateRange(previous)}
            <br />
            Período entrante: {dateRange(incoming)}
          </p>
          <p>Una corrección cuenta como una fila retirada y otra agregada; no se eliminan duplicados automáticamente.</p>
          <h3>Unidades del archivo entrante</h3>
          {unitTotals(incoming).map(([unit, units]) => (
            <p key={unit}>
              {unit}: <strong>{formatNumber(units)}</strong>
            </p>
          ))}
          {!!diff.addedExamples.length && (
            <>
              <h3>Ejemplos de filas agregadas / modificadas</h3>
              {diff.addedExamples.map((row, index) => (
                <p key={index}>{describeRow(row)}</p>
              ))}
              <small>Hasta 8 ejemplos. El recuento superior incluye todos.</small>
            </>
          )}
          {!!diff.removedExamples.length && (
            <>
              <h3>Ejemplos de filas retiradas / modificadas</h3>
              {diff.removedExamples.map((row, index) => (
                <p key={index}>{describeRow(row)}</p>
              ))}
            </>
          )}
          {needsAcknowledgement && (
            <label className="import-warning">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> Revisé
              las filas retiradas/no utilizables y confirmo que este reporte debe sustituir al anterior. Un archivo parcial puede
              quitar semanas históricas.
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="import-actions">
            <button className="button secondary" disabled={saving} onClick={onCancel}>
              Cancelar · conservar actual
            </button>
            <button
              className="button primary"
              disabled={saving || sameFile || (needsAcknowledgement && !acknowledged)}
              onClick={async () => {
                setSaving(true);
                try {
                  await onConfirm();
                } catch (exception) {
                  setError(exception instanceof Error ? exception.message : 'No se pudo guardar.');
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? 'Guardando…' : 'Confirmar actualización'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
