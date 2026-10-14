import { useEffect, useMemo, useState } from 'react';
import { Download, History, ShieldCheck } from 'lucide-react';
import { FindingsTable } from './FindingsTable';
import { closureFingerprint, findingPeriod, isBlockingPending, weekSummaries } from '../engine/indicators';
import { listAudit, listClosures, reopenClosure, saveClosure } from '../storage/db';
import { exportSheetsToExcel } from '../lib/sheet';
import { periodLongText } from '../lib/labels';

const ACTION_LABELS = {
  SEMANA_CERRADA: 'Semana cerrada',
  SEMANA_REABIERTA: 'Semana reabierta',
  ACTUALIZACION_CONFIRMADA: 'Actualización confirmada',
  CONCILIACION_EJECUTADA: 'Conciliación ejecutada',
  DATOS_PRECARGADOS: 'Datos precargados',
  PARAMETROS_ACTUALIZADOS: 'Parámetros actualizados',
  REGLAS_APLICACIONES: 'Reglas de aplicaciones',
  MAESTRO_CENTRAL_APLICADO: 'Maestro Central aplicado',
  FUENTE_MAESTRO: 'Fuente del Maestro',
  RESPALDO_RESTAURADO: 'Respaldo restaurado',
  RESPALDO_DESCARGADO: 'Respaldo descargado',
  REVISION_CORREO: 'Revisión por correo',
};
const actionLabel = (action) => ACTION_LABELS[action] ?? action.replaceAll('_', ' ').toLowerCase();

/** Cierres v0.7 usan un número de semana sin año como clave. */
const isLegacyClosure = (closure) => typeof closure.week === 'number' || !closure.period;

export function AuditPanel({ analysis, inputs, parameters, multiYear, onSelect }) {
  const [audit, setAudit] = useState([]);
  const [closures, setClosures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionFilter, setActionFilter] = useState('all');

  const reload = async () => {
    setAudit(await listAudit());
    setClosures(await listClosures());
  };
  useEffect(() => {
    reload();
  }, []);

  const weeks = useMemo(() => (analysis ? weekSummaries(analysis) : []), [analysis]);
  const fingerprint = useMemo(() => closureFingerprint(inputs, parameters), [inputs, parameters]);
  const auditActions = useMemo(() => [...new Set(audit.map((entry) => entry.action))].sort(), [audit]);

  if (!analysis) {
    return (
      <section className="panel closure-form">
        <h2>Primero concilie los archivos actuales</h2>
        <p>No se permite cerrar una semana sin análisis vigente.</p>
      </section>
    );
  }

  const closureOf = (period) => closures.find((closure) => closure.week === period);
  const isCurrentClosure = (period) => {
    const closure = closureOf(period);
    return closure?.status === 'CLOSED' && closure.fingerprint === fingerprint;
  };
  const week = weeks.find((item) => item.period === selected);
  const weekFindings = analysis.findings.filter((finding) => findingPeriod(finding) === selected && finding.type !== 'EXCLUDED');
  const selectedClosure = selected ? closureOf(selected) : null;

  const close = async () => {
    if (!week || !weekFindings.length || weekFindings.some(isBlockingPending) || isCurrentClosure(week.period)) {
      setMessage('Cierre bloqueado: seleccione una semana conciliada sin pendientes.');
      return;
    }
    if (week.year == null) {
      setMessage('Este análisis no tiene año operativo. Vuelva a ejecutar la conciliación antes de cerrar.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await saveClosure({ period: week.period, year: week.year, week: week.week, note: note.trim(), fingerprint });
      await reload();
      setNote('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el cierre.');
    } finally {
      setSaving(false);
    }
  };

  const reopen = async () => {
    setSaving(true);
    setMessage('');
    try {
      await reopenClosure(selected, reopenReason);
      await reload();
      setReopenReason('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reabrir el cierre.');
    } finally {
      setSaving(false);
    }
  };

  const exportAudit = () =>
    exportSheetsToExcel(
      [
        {
          name: 'Bitácora',
          rows: audit.map((entry) => ({
            Fecha: entry.at,
            Acción: actionLabel(entry.action),
            Código: entry.action,
            Detalle: entry.detail,
          })),
        },
        {
          name: 'Cierres',
          rows: closures.flatMap((closure) => [
            {
              Período: closure.period ?? `S${closure.week} (sin año, v0.7)`,
              Estado: closure.status,
              'Cerrado el': closure.closedAt,
              Nota: closure.note,
              Huella: closure.fingerprint,
              'Reabierto el': closure.reopenedAt ?? '',
              'Motivo reapertura': closure.reopenReason ?? '',
              Vigente: closure.status === 'CLOSED' && closure.fingerprint === fingerprint ? 'Sí' : 'No',
              Registro: 'Actual',
            },
            ...(closure.history ?? []).map((past) => ({
              Período: closure.period ?? `S${closure.week}`,
              Estado: past.status,
              'Cerrado el': past.closedAt,
              Nota: past.note,
              Huella: past.fingerprint,
              'Reabierto el': past.reopenedAt ?? '',
              'Motivo reapertura': past.reopenReason ?? '',
              Vigente: 'No',
              Registro: 'Historial',
            })),
          ]),
        },
        {
          name: 'Semanas',
          rows: weeks.map((item) => ({
            Período: item.period,
            Casos: item.total,
            Pendientes: item.pending,
            Advertencias: item.warnings,
            Estado: item.pending
              ? 'Bloqueada'
              : isCurrentClosure(item.period)
                ? 'Cerrada · corte vigente'
                : 'Disponible para cerrar',
          })),
        },
      ],
      `auditoria_cierres_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );

  const weekState = (item) => {
    if (item.pending) return 'Bloqueada';
    if (isCurrentClosure(item.period)) return 'Cerrada · corte vigente';
    const closure = closureOf(item.period);
    if (closure?.status === 'REOPENED') return 'Reabierta';
    if (closure) return 'Cierre anterior por revalidar';
    return 'Disponible para cerrar';
  };

  const legacyClosures = closures.filter(isLegacyClosure);
  const visibleAudit = audit.filter((entry) => actionFilter === 'all' || entry.action === actionFilter);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Control de todas las semanas</h2>
            <p>
              El cierre se bloquea por labores sin cobro o con cobro parcial. Los excesos y otras observaciones quedan en
              seguimiento. Cada cierre queda ligado a los archivos y parámetros vigentes (huella {fingerprint}).
            </p>
          </div>
          <button className="button secondary" onClick={exportAudit}>
            <Download size={16} /> Exportar bitácora
          </button>
        </div>
        <div className="week-controls">
          {weeks.map((item) => (
            <button
              key={item.period}
              className={selected === item.period ? 'selected' : ''}
              onClick={() => {
                setSelected(item.period);
                setMessage('');
              }}
            >
              <strong>{periodLongText(item.period, multiYear)}</strong>
              <span>
                {item.pending} pendientes · {item.warnings} advertencias
              </span>
              <small>{weekState(item)}</small>
            </button>
          ))}
        </div>
      </section>
      {week && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>
                {periodLongText(week.period, true)} · {week.pending ? 'Cierre bloqueado' : 'Sin unidades pendientes de cobro'}
              </h2>
              <p>Revise las evidencias antes de cerrar. Los cierres se vinculan a los archivos y reglas actuales.</p>
            </div>
          </div>
          <div className="closure-form">
            <label>
              Comentario de revisión
              <textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button
              className="button primary"
              disabled={saving || week.pending > 0 || isCurrentClosure(week.period)}
              onClick={() => void close()}
            >
              <ShieldCheck />{' '}
              {isCurrentClosure(week.period)
                ? 'Ya cerrada en este corte'
                : week.pending
                  ? 'No se puede cerrar: existen pendientes'
                  : 'Cerrar semana'}
            </button>
            {selectedClosure?.status === 'CLOSED' && (
              <div className="reopen-box">
                <label>
                  Motivo de reapertura (obligatorio)
                  <input
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    placeholder="Ej.: llegó una corrección de Nómina"
                  />
                </label>
                <button className="button secondary" disabled={saving || !reopenReason.trim()} onClick={() => void reopen()}>
                  Reabrir semana
                </button>
              </div>
            )}
            {message && <p role="alert">{message}</p>}
          </div>
          {selectedClosure && (
            <div className="closure-history">
              <h3>
                <History size={16} /> Historial del cierre
              </h3>
              {[...(selectedClosure.history ?? []), selectedClosure].reverse().map((entry, index) => (
                <p key={index}>
                  <strong>{entry.status === 'CLOSED' ? 'Cerrada' : 'Reabierta'}</strong> ·{' '}
                  {entry.closedAt ? new Date(entry.closedAt).toLocaleString('es-NI') : ''}
                  {entry.note ? ` · ${entry.note}` : ''}
                  {entry.reopenedAt
                    ? ` · reabierta ${new Date(entry.reopenedAt).toLocaleString('es-NI')}: ${entry.reopenReason}`
                    : ''}
                  {entry.fingerprint
                    ? ` · huella ${entry.fingerprint}${entry.fingerprint === fingerprint ? ' (vigente)' : ''}`
                    : ''}
                </p>
              ))}
            </div>
          )}
          <FindingsTable
            key={week.period}
            rows={weekFindings}
            onSelect={onSelect}
            multiYear={multiYear}
            exportName={`semana_${week.period}`}
          />
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Bitácora de auditoría</h2>
            <p>Los cierres históricos se conservan; un cambio de datos exige revalidarlos.</p>
          </div>
          <label className="inline-filter">
            Acción
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="all">Todas</option>
              {auditActions.map((action) => (
                <option key={action} value={action}>
                  {actionLabel(action)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="closure-list">
          {closures
            .filter((closure) => !isLegacyClosure(closure))
            .map((closure) => (
              <div key={closure.week}>
                <span>
                  <strong>
                    {periodLongText(closure.period, true)} ·{' '}
                    {closure.status === 'REOPENED'
                      ? 'Reabierta'
                      : closure.fingerprint === fingerprint && !weeks.find((item) => item.period === closure.period)?.pending
                        ? 'Cierre vigente'
                        : 'Histórico · requiere revalidación'}
                  </strong>
                  <small>
                    {new Date(closure.closedAt).toLocaleString('es-NI')} · {closure.note}
                  </small>
                </span>
              </div>
            ))}
          {legacyClosures.map((closure) => (
            <div key={`legacy-${closure.week}`}>
              <span>
                <strong>Semana {closure.week} · cierre v0.7 sin año · requiere revalidación</strong>
                <small>
                  {new Date(closure.closedAt).toLocaleString('es-NI')} · {closure.note}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="timeline">
          {visibleAudit.map((entry) => (
            <div key={entry.id}>
              <i />
              <span>
                <strong>{actionLabel(entry.action)}</strong>
                <small>{new Date(entry.at).toLocaleString('es-NI')}</small>
                <p>{entry.detail}</p>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
