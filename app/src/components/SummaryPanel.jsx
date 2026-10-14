import { useState } from 'react';
import {
  ChartColumn,
  CircleCheck,
  Database,
  FileSearch,
  History,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { FindingsTable } from './FindingsTable';
import { CheckItem } from './LoadPanel';
import { StatusBadge } from './StatusBadge';
import {
  collectionState,
  coverageStats,
  isBlockingPending,
  unitTotalsByState,
  weekSummaries,
} from '../engine/indicators';
import { formatNumber } from '../lib/format';

export function SummaryPanel({ analysis: a, inputs: s, onNavigate: t, onSelect: n }) {
  const [i, r] = useState('');
  const [l, o] = useState('');
  const [x, m] = useState('all');
  const [f, S] = useState('all');
  const [A, E] = useState('');
  const [D, I] = useState(null);
  const v = (a == null ? undefined : a.findings) ?? [];
  const N = [...new Set(v.filter((p) => p.type !== 'EXCLUDED').map((p) => p.week))].sort((p, u) => p - u);
  const g = v.filter((p) => (!i || p.week >= Number(i)) && (!l || p.week <= Number(l)));
  const d = [...new Set(g.filter((p) => p.type !== 'EXCLUDED').map((p) => p.hacienda))].sort();
  const R = g.filter((p) => x === 'all' || p.hacienda === x);
  const O = [
    ...new Map(R.filter((p) => p.type !== 'EXCLUDED').map((p) => [p.labor + '|' + p.service, p])).entries(),
  ].sort(([, p], [, u]) => p.labor.localeCompare(u.labor) || p.service.localeCompare(u.service));
  const C = a
    ? {
        ...a,
        findings: R.filter((p) => f === 'all' || p.labor + '|' + p.service === f),
      }
    : null;
  const y = (p, u = null) => {
    E(p);
    I(u);
    setTimeout(() => {
      var T;
      return (T = document.getElementById('summary-drill')) == null
        ? undefined
        : T.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
    }, 0);
  };
  if (!C)
    return (
      <div className="welcome">
        <div className="welcome-copy">
          <span className="eyebrow">CONTROL SEMANAL CASUR</span>
          <h2>Verifique que cada labor de Nómina haya sido cobrada correctamente.</h2>
          <p>
            Importe los reportes originales de SIAGRI. La aplicación concilia unidades, reconoce paquetes TPS,
            clasifica contratistas y conserva la evidencia de cada revisión.
          </p>
          <div className="welcome-actions">
            <button className="button primary large" onClick={() => t('load')}>
              <Upload size={18} />
              {' Cargar archivos'}
            </button>
            <span>
              <ShieldCheck />
              {' Base preparada para varios dispositivos'}
            </span>
          </div>
        </div>
        <div className="welcome-visual">
          <div className="visual-card">
            <Database />
            <strong>{s.files.length}/4</strong>
            <span>archivos preparados</span>
          </div>
          <div className="flow">
            <span>Nómina</span>
            <i>→</i>
            <span>Reglas</span>
            <i>→</i>
            <span>Prefactura</span>
          </div>
        </div>
      </div>
    );
  const _ = C.findings.filter((p) => p.type === 'DIRECT' || p.type === 'TPS');
  const P = coverageStats(_);
  const h = C.findings.filter(
    (p) =>
      !isBlockingPending(p) &&
      p.type !== 'EXCLUDED' &&
      (p.severity === 'warning' || p.status === 'COBRO_EXCESO'),
  );
  const L = _.filter((p) => p.status === 'COBRO_EXCESO' && collectionState(p) === 'COBRADO');
  const F = unitTotalsByState(_, 'pending');
  const j = unitTotalsByState(_, 'excess');
  const w = (
    A === 'excess'
      ? L
      : A === 'followups'
        ? h
        : _.filter((p) =>
            A === 'unpaid'
              ? collectionState(p) === 'SIN_COBRO'
              : A === 'partial'
                ? collectionState(p) === 'PARCIAL'
                : A === 'covered'
                  ? collectionState(p) === 'COBRADO'
                  : A === 'all'
                    ? collectionState(p) !== 'SIN_BASE_NOMINA'
                    : isBlockingPending(p),
          )
  ).filter((p) => D === null || p.week === D);
  const z = {
    pending: 'Pendientes de cobro',
    unpaid: 'Nómina sin prefacturar',
    partial: 'Cobros parciales',
    covered: 'Cobrado / cubierto',
    excess: 'Cobros en exceso · seguimiento',
    followups: 'Observaciones secundarias',
    all: 'Casos de Nómina',
  }[A];
  const B = _.filter(isBlockingPending).slice(0, 8);
  const k = weekSummaries(C)
    .filter((p) => p.pending > 0)
    .map((p) => ({
      ...p,
      critical: p.pending,
    }));
  return (
    <>
      <div className="period-strip">
        <div>
          <History />
          <span>
            Período visible
            <strong>
              {'Semanas '}
              {i || N[0] || '—'}–{l || N.at(-1) || '—'}
              {x !== 'all' ? ' · ' + x : ''}
            </strong>
          </span>
        </div>
        <div>
          {'Archivos completos: '}
          {C.coverage.payrollRows.toLocaleString('es-NI')}
          {' filas Nómina · '}
          {C.coverage.prefacturaRows.toLocaleString('es-NI')}
          {' filas Prefactura'}
        </div>
      </div>
      <div className="summary-filters">
        <label>
          Semana desde
          <select
            value={i}
            onChange={(p) => {
              r(p.target.value);
              m('all');
              S('all');
              I(null);
            }}
          >
            <option value="">Todas</option>
            {N.map((p) => (
              <option key={p} value={p}>
                {'Semana '}
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Semana hasta
          <select
            value={l}
            onChange={(p) => {
              o(p.target.value);
              m('all');
              S('all');
              I(null);
            }}
          >
            <option value="">Todas</option>
            {N.map((p) => (
              <option key={p} value={p}>
                {'Semana '}
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hacienda
          <select
            value={x}
            onChange={(p) => {
              m(p.target.value);
              S('all');
            }}
          >
            <option value="all">Todas las haciendas</option>
            {d.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Labor / servicio
          <select value={f} onChange={(p) => S(p.target.value)}>
            <option value="all">Todas las labores</option>
            {O.map(([p, u]) => (
              <option key={p} value={p}>
                {u.labor}
                {' · '}
                {u.service}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          onClick={() => {
            r('');
            o('');
            m('all');
            S('all');
            I(null);
            E('');
          }}
        >
          Restablecer
        </button>
      </div>
      {i && l && Number(i) > Number(l) && (
        <p role="alert">La semana inicial debe ser menor o igual a la final.</p>
      )}
      <div className="kpi-grid">
        <SummaryKpi
          title="Cobertura de cobro"
          value={P.base ? `${formatNumber(P.percent, 1)}%` : '—'}
          note={`${P.covered} de ${P.base} casos de Nómina cubiertos · ver detalle`}
          tone="green"
          icon={CircleCheck}
          onClick={() => y('all')}
        />
        <SummaryKpi
          title="Sin prefacturar"
          value={P.unpaid.toString()}
          note="Nómina sin cobro acreditado · ver detalle"
          tone="red"
          icon={TriangleAlert}
          onClick={() => y('unpaid')}
        />
        <SummaryKpi
          title="Cobro parcial"
          value={P.partial.toString()}
          note="Falta cobrar parte de las unidades · ver detalle"
          tone="red"
          icon={FileSearch}
          onClick={() => y('partial')}
        />
        <SummaryKpi
          title="Cobrado / cubierto"
          value={P.covered.toString()}
          note="Incluye cobros con exceso u observación"
          tone="green"
          icon={ChartColumn}
          onClick={() => y('covered')}
        />
      </div>
      <div className="collection-lanes">
        <button className="collection-lane pending" onClick={() => y('pending')}>
          <span>POR GESTIONAR · PRIORIDAD</span>
          <strong>
            {P.unpaid + P.partial} <small>casos pendientes</small>
          </strong>
          <p>
            {P.unpaid}
            {' sin prefacturar · '}
            {P.partial}
            {' parciales'}
          </p>
          <div>
            {F.map(([p, u]) => (
              <b key={p}>
                {formatNumber(u)} {p}
                <small>por cobrar</small>
              </b>
            ))}
          </div>
          <em>Ver pendientes y evidencia →</em>
        </button>
        <button className="collection-lane excess" onClick={() => y('excess')}>
          <span>YA COBRADO · SEGUIMIENTO</span>
          <strong>
            {L.length} <small>casos con exceso</small>
          </strong>
          <p>No reducen la cobertura ni bloquean el cierre por sí solos.</p>
          <div>
            {j.map(([p, u]) => (
              <b key={p}>
                +{formatNumber(u)} {p}
                <small>sobre Nómina</small>
              </b>
            ))}
          </div>
          <em>Ver excesos y evidencia →</em>
        </button>
      </div>
      <p className="summary-method">
        Casos agrupados por semana, suerte y servicio. Cantidades separadas por unidad; las cifras cambian con
        los filtros. Un exceso ya está incluido en “Cobrado / cubierto”.
      </p>
      {A && (
        <section id="summary-drill" className="panel summary-drill">
          <div className="panel-head">
            <div>
              <h2>
                {z}
                {D !== null ? ' · semana ' + D : ''}
              </h2>
              <p>
                {w.length}
                {' casos según los filtros del resumen. Seleccione una fila para abrir la evidencia.'}
              </p>
            </div>
            <button className="button secondary" onClick={() => E('')}>
              Cerrar detalle
            </button>
          </div>
          <FindingsTable key={[A, D, i, l, x, f].join('|')} rows={w} onSelect={n} />
        </section>
      )}
      <details className="collection-followups">
        <summary>
          {'Otras observaciones y excesos · '}
          {h.length}
          {' casos de seguimiento'}
        </summary>
        <p>
          Estas observaciones no se contabilizan como Nómina sin cobro ni reducen por sí solas la cobertura.
        </p>
        <button className="button secondary" onClick={() => y('followups')}>
          Abrir seguimiento completo
        </button>
      </details>
      <div className="summary-grid">
        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>Pendientes por semana</h2>
              <p>Todas las semanas pendientes dentro de los filtros. Seleccione una para ver su evidencia.</p>
            </div>
          </div>
          <div className="week-chart">
            {!k.length && <p>No hay semanas con pendientes bloqueantes.</p>}
            {k.map((p) => (
              <button
                key={p.week}
                className="week-bar"
                onClick={() => y('pending', p.week)}
                aria-label={`Ver ${p.critical} pendientes de la semana ${p.week}`}
              >
                <div className="bar-track">
                  <span
                    style={{
                      height: `${Math.max(5, p.total ? (p.critical / p.total) * 100 : 0)}%`,
                    }}
                  />
                </div>
                <strong>S{p.week}</strong>
                <small>{p.critical}</small>
              </button>
            ))}
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-red" />
              {' Sin cobro o cobro parcial'}
            </span>
            <span>Haga clic en una semana para investigar</span>
          </div>
        </section>
        <section className="panel health-panel">
          <div className="panel-head">
            <div>
              <h2>Salud de la carga</h2>
              <p>Archivos completos · estos controles no cambian con los filtros</p>
            </div>
          </div>
          <CheckItem label="Archivos reconocidos" value={`${s.files.length} de 4`} ok={s.files.length >= 3} />
          <CheckItem
            label="Nómina procesada"
            value={`${C.coverage.payrollRows.toLocaleString('es-NI')} filas`}
            ok={true}
          />
          <CheckItem
            label="Prefactura procesada"
            value={`${C.coverage.prefacturaRows.toLocaleString('es-NI')} filas`}
            ok={true}
          />
          <CheckItem
            label="Servicios sin clasificar"
            value={C.unknownServices.length.toString()}
            ok={!C.unknownServices.length}
          />
          <CheckItem
            label="Repeticiones para revisar"
            value={C.duplicateGroups.toString()}
            ok={!C.duplicateGroups}
          />
          <CheckItem
            label="Mecanizadas separadas"
            value={C.mechanizedRows.toLocaleString('es-NI')}
            ok={true}
          />
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Atención prioritaria</h2>
            <p>Solo Nómina sin cobro o con unidades pendientes. Los excesos no se incluyen aquí.</p>
          </div>
          <button className="link-button" onClick={() => t('reconciliation')}>
            Ver conciliación completa
          </button>
        </div>
        {B.length ? (
          <div className="priority-list">
            {B.map((p) => (
              <button key={p.id} onClick={() => n(p)}>
                <span className={`priority-dot ${p.severity}`} />
                <span>
                  <strong>
                    {p.hacienda}
                    {' · '}
                    {p.suerte}
                  </strong>
                  <small>
                    {'Semana '}
                    {p.week}
                    {' · '}
                    {p.service}
                    {' · '}
                    {p.pFacts.join(', ') || 'sin P.FACT'}
                  </small>
                </span>
                <StatusBadge status={p.status} severity={p.severity} />
                <b>
                  {formatNumber(p.difference)} {p.unit}
                </b>
              </button>
            ))}
          </div>
        ) : (
          <div className="all-clear">
            <CircleCheck />
            {' No hay casos prioritarios.'}
          </div>
        )}
      </section>
    </>
  );
}
function SummaryKpi({ title: a, value: s, note: t, tone: n, icon: i, onClick: r }) {
  const l = (
    <>
      <div className={`kpi-icon ${n}`}>
        <i />
      </div>
      <div>
        <span>{a}</span>
        <strong>{s}</strong>
        <small>{t}</small>
      </div>
    </>
  );
  return r ? (
    <button className="kpi kpi-action" onClick={r}>
      {l}
    </button>
  ) : (
    <article className="kpi">{l}</article>
  );
}
