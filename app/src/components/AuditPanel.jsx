import { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { FindingsTable } from './FindingsTable';
import { closureFingerprint, isBlockingPending, weekSummaries } from '../engine/indicators';
import { hashId } from '../engine/normalize';
import { appendAudit, db } from '../storage/db';

export function AuditPanel({ analysis: a, inputs: s, parameters: t, onSelect: n }) {
  const [i, r] = useState([]);
  const [l, o] = useState([]);
  const [x, m] = useState(null);
  const [f, S] = useState('');
  const [A, E] = useState('');
  const [D, I] = useState(false);
  const v = async () => {
    r(await db.audit.orderBy('at').reverse().toArray());
    o(await db.closures.toArray());
  };
  if (
    (useEffect(() => {
      v();
    }, []),
    !a)
  )
    return (
      <section className="panel closure-form">
        <h2>Primero concilie los archivos actuales</h2>
        <p>No se permite cerrar una semana sin análisis vigente.</p>
      </section>
    );
  const N = weekSummaries(a);
  const g = closureFingerprint(s, t);
  const d = N.find((y) => y.week === x);
  const R = a.findings.filter((y) => y.week === x && y.type !== 'EXCLUDED');
  const O = (y) => l.find((_) => _.week === y && _.fingerprint === g && _.status === 'CLOSED');
  const C = async () => {
    if (!d || !R.length || R.some(isBlockingPending) || O(d.week)) {
      E('Cierre bloqueado: seleccione una semana conciliada sin pendientes.');
      return;
    }
    I(true);
    E('');
    try {
      const y = {
        week: d.week,
        closedAt: new Date().toISOString(),
        status: 'CLOSED',
        note: f.trim(),
        fingerprint: g,
      };
      await db.transaction('rw', db.closures, db.audit, async () => {
        await db.closures.put(y);
        await appendAudit({
          id: hashId('close', d.week, Date.now()),
          at: y.closedAt,
          action: 'SEMANA_CERRADA',
          detail: 'Semana ' + d.week + ' sin bloqueos. Corte ' + g + '. ' + f,
        });
      });
      await v();
      S('');
    } catch (y) {
      E(y instanceof Error ? y.message : 'No se pudo guardar el cierre.');
    } finally {
      I(false);
    }
  };
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Control de todas las semanas</h2>
            <p>
              El cierre se bloquea por labores sin cobro o con cobro parcial. Los excesos y otras
              observaciones quedan en seguimiento.
            </p>
          </div>
        </div>
        <div className="week-controls">
          {N.map((y) => {
            const _ = l.find((P) => P.week === y.week);
            return (
              <button
                key={y.week}
                className={x === y.week ? 'selected' : ''}
                onClick={() => {
                  m(y.week);
                  E('');
                }}
              >
                <strong>
                  {'Semana '}
                  {y.week}
                </strong>
                <span>
                  {y.pending}
                  {' pendientes · '}
                  {y.warnings}
                  {' advertencias'}
                </span>
                <small>
                  {y.pending
                    ? 'Bloqueada'
                    : O(y.week)
                      ? 'Cerrada · corte vigente'
                      : _
                        ? 'Cierre anterior por revalidar'
                        : 'Disponible para cerrar'}
                </small>
              </button>
            );
          })}
        </div>
      </section>
      {d && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>
                {'Semana '}
                {d.week}
                {' · '}
                {d.pending ? 'Cierre bloqueado' : 'Sin unidades pendientes de cobro'}
              </h2>
              <p>
                Revise las evidencias antes de cerrar. Los cierres se vinculan a los archivos y reglas
                actuales.
              </p>
            </div>
          </div>
          <div className="closure-form">
            <label>
              Comentario de revisión
              <textarea value={f} onChange={(y) => S(y.target.value)} />
            </label>
            <button
              className="button primary"
              disabled={D || d.pending > 0 || !!O(d.week)}
              onClick={() => void C()}
            >
              <ShieldCheck />
              {O(d.week)
                ? 'Ya cerrada en este corte'
                : d.pending
                  ? 'No se puede cerrar: existen pendientes'
                  : 'Cerrar semana'}
            </button>
            {A && <p role="alert">{A}</p>}
          </div>
          <FindingsTable key={d.week} rows={R} onSelect={n} />
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Bitácora de auditoría</h2>
            <p>Los cierres históricos se conservan; un cambio de datos exige revalidarlos.</p>
          </div>
        </div>
        <div className="closure-list">
          {l.map((y) => {
            var _;
            return (
              <div key={y.week}>
                <span>
                  <strong>
                    {'Semana '}
                    {y.week}
                    {' · '}
                    {y.fingerprint === g &&
                    O(y.week) &&
                    !((_ = N.find((P) => P.week === y.week)) != null && _.pending)
                      ? 'Cierre vigente'
                      : 'Histórico · requiere revalidación'}
                  </strong>
                  <small>
                    {new Date(y.closedAt).toLocaleString('es-NI')}
                    {' · '}
                    {y.note}
                  </small>
                </span>
              </div>
            );
          })}
        </div>
        <div className="timeline">
          {i.map((y) => (
            <div key={y.id}>
              <i />
              <span>
                <strong>{y.action.replaceAll('_', ' ')}</strong>
                <small>{new Date(y.at).toLocaleString('es-NI')}</small>
                <p>{y.detail}</p>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
