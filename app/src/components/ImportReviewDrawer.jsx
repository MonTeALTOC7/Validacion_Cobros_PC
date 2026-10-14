import { useState } from 'react';
import { diffRows, unitTotals } from '../engine/importers';
import { formatNumber } from '../lib/format';

export function ImportReviewDrawer({
  name: a,
  previous: s,
  incoming: t,
  skipped: n = 0,
  sameFile: i,
  onConfirm: r,
  onCancel: l,
}) {
  const o = diffRows(s, t);
  const [x, m] = useState(false);
  const [f, S] = useState('');
  const [A, E] = useState(false);
  const D = o.removed > 0 || n > 0;
  const I = (N) => {
    const g = N;
    return [g.date, g.week ? 'S' + g.week : '', g.hacienda, g.suerte, g.labor, g.service, g.units, g.unit]
      .filter((d) => d !== undefined && d !== '')
      .join(' · ');
  };
  const v = (N) => {
    const g = N.map((d) => d.date)
      .filter(Boolean)
      .sort();
    return g.length ? g[0] + ' → ' + g.at(-1) : 'Sin fechas de movimiento';
  };
  return (
    <>
      <div className="drawer-overlay" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Validar actualización">
        <div className="drawer-head">
          <div>
            <span>Comprobación antes de reemplazar</span>
            <h2>{a}</h2>
          </div>
        </div>
        <div className="drawer-body">
          <h3>{i ? 'Es el mismo archivo: sin cambios' : 'Formato reconocido · revise los cambios'}</h3>
          <p>
            Reconocer el formato no significa que todos los cobros estén correctos. La conciliación comprobará
            las cantidades después de confirmar.
          </p>
          <div className="detail-grid">
            {[
              ['Filas anteriores', s.length],
              ['Filas nuevas', t.length],
              ['Agregadas o modificadas', o.added],
              ['Retiradas o modificadas', o.removed],
              ['Sin cambios', o.unchanged],
              ['No utilizables', n],
              ['Repeticiones conservadas', o.duplicates],
            ].map(([N, g]) => (
              <div key={N} className="detail">
                <span>{N}</span>
                <strong>{g}</strong>
              </div>
            ))}
          </div>
          <p>
            {'Semanas nuevas: '}
            {o.newWeeks.join(', ') || 'ninguna'}.
          </p>
          <p>
            {'Período anterior: '}
            {v(s)}
            <br />
            {'Período entrante: '}
            {v(t)}
          </p>
          <p>
            Una corrección cuenta como una fila retirada y otra agregada; no se eliminan duplicados
            automáticamente.
          </p>
          <h3>Unidades del archivo entrante</h3>
          {unitTotals(t).map(([N, g]) => (
            <p key={N}>
              {N}
              {': '}
              <strong>{formatNumber(g)}</strong>
            </p>
          ))}
          {!!o.addedExamples.length && (
            <>
              <h3>Ejemplos de filas agregadas / modificadas</h3>
              {o.addedExamples.map((N, g) => (
                <p key={g}>{I(N)}</p>
              ))}
              <small>Hasta 8 ejemplos. El recuento superior incluye todos.</small>
            </>
          )}
          {!!o.removedExamples.length && (
            <>
              <h3>Ejemplos de filas retiradas / modificadas</h3>
              {o.removedExamples.map((N, g) => (
                <p key={g}>{I(N)}</p>
              ))}
            </>
          )}
          {D && (
            <label className="import-warning">
              <input type="checkbox" checked={A} onChange={(N) => E(N.target.checked)} />
              {
                ' Revisé las filas retiradas/no utilizables y confirmo que este reporte debe sustituir al anterior. Un archivo parcial puede quitar semanas históricas.'
              }
            </label>
          )}
          {f && <p role="alert">{f}</p>}
          <div className="import-actions">
            <button className="button secondary" disabled={x} onClick={l}>
              Cancelar · conservar actual
            </button>
            <button
              className="button primary"
              disabled={x || i || (D && !A)}
              onClick={async () => {
                m(true);
                try {
                  await r();
                } catch (N) {
                  S(N instanceof Error ? N.message : 'No se pudo guardar.');
                } finally {
                  m(false);
                }
              }}
            >
              {x ? 'Guardando…' : 'Confirmar actualización'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
