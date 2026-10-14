import { useState, useMemo, useRef } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Leaf,
  MapPin,
  SlidersHorizontal,
  Sprout,
  Tractor,
  Users,
  X,
} from 'lucide-react';
import { ApplicationsView } from './ApplicationsView';
import { AGE_BUCKETS, PRIORITY_LABORS, countDistinct, groupEntries, lotLabel } from './helpers';
import {
  buildApplicationEpisodes,
  clipEpisodesToRows,
  loadApplicationRules,
} from '../../engine/applications';
import { normalizeText } from '../../engine/normalize';
import {
  ageBucket,
  buildTrackingRows,
  laborDisplayName,
  laborUnitKey,
  sumUnits,
} from '../../engine/tracking';
import { downloadBlob, formatNumber } from '../../lib/format';

export function TrackingPanel({ inputs: a, startDate: s, onAudit: t }) {
  var Pa;
  var Ia;
  const n = useMemo(() => buildTrackingRows(a, s), [a, s]);
  const [i, r] = useState(loadApplicationRules);
  const [l, o] = useState('');
  const x = useMemo(() => buildApplicationEpisodes(n, a.master, i), [n, a.master, i]);
  const m = (c) => {
    r(c);
    try {
      localStorage.setItem('casur-application-rules-v1', JSON.stringify(c));
      o('Reglas guardadas en este dispositivo. Aplicaciones recalculadas.');
    } catch {
      o('Aplicaciones recalculadas, pero no se pudieron guardar las reglas en este dispositivo.');
    }
    t == null ||
      t('REGLAS_APLICACIONES', JSON.stringify(c)).catch(() =>
        o('Reglas aplicadas; no fue posible registrar el cambio en auditoría.'),
      );
  };
  const [f, S] = useState('Manual');
  const [A, E] = useState('resumen');
  const [D, I] = useState('');
  const [v, N] = useState('');
  const [g, d] = useState('');
  const [R, O] = useState('');
  const [C, y] = useState('all');
  const [_, P] = useState('all');
  const [h, L] = useState('all');
  const [F, j] = useState('Productores');
  const [w, z] = useState('');
  const [B, k] = useState(null);
  const [p, u] = useState('');
  const [T, q] = useState(false);
  const [se, V] = useState(null);
  const [de, X] = useState(1);
  const [ue, Oe] = useState(1);
  const ze = useRef(null);
  const he = n.filter(
    (c) =>
      (f === 'Mecanizada' ? c.classification === 'Mecanizada' : c.classification !== 'Mecanizada') &&
      (F === 'all' || c.scope === F),
  );
  const K = [...new Set(he.map((c) => c.week))].sort((c, M) => c - M);
  const ra = [...new Set(he.map((c) => c.producer))].sort();
  const ie = he.filter(
    (c) =>
      (!D || c.week >= Number(D)) &&
      (!v || c.week <= Number(v)) &&
      (!g || c.date >= g) &&
      (!R || c.date <= R) &&
      (C === 'all' || c.producer === C) &&
      (_ === 'all' || c.hacienda === _) &&
      (h === 'all' || ageBucket(c.ageDays) === h),
  );
  const ge = groupEntries(ie, laborUnitKey).sort(([, c], [, M]) => {
    const U = (ee) => {
      const Ta = PRIORITY_LABORS.indexOf(ee.labor);
      return Ta < 0 ? 10 : Ta + (ee.unit === 'HA' || ee.labor === 'ECR' ? 0 : 5);
    };
    return U(c[0]) - U(M[0]) || c[0].labor.localeCompare(M[0].labor) || c[0].unit.localeCompare(M[0].unit);
  });
  const la = ge.some(([c]) => c === w) ? w : (((Pa = ge[0]) == null ? undefined : Pa[0]) ?? '');
  const je = ((Ia = ge.find(([c]) => c === la)) == null ? undefined : Ia[1]) ?? [];
  const pe = je[0];
  const Se = (pe == null ? undefined : pe.unit) ?? '';
  const Ea = je.filter(
    (c) =>
      (B === null || c.week === B) &&
      (!p || normalizeText(c.producer + ' ' + lotLabel(c)).includes(normalizeText(p))),
  );
  const ca = clipEpisodesToRows(x, je);
  const Oa = K.filter((c) => (!D || c >= Number(D)) && (!v || c <= Number(v))).map((c) => ({
    week: c,
    rows: je.filter((M) => M.week === c),
  }));
  const Ss = Math.max(1, ...Oa.map((c) => sumUnits(c.rows)));
  const we = groupEntries(Ea, (c) => (C === 'all' ? c.producer : lotLabel(c))).sort(
    (c, M) => sumUnits(M[1]) - sumUnits(c[1]) || c[0].localeCompare(M[0]),
  );
  const ys = Math.max(1, ...we.map(([, c]) => sumUnits(c)));
  const Be = Math.max(1, Math.ceil(we.length / 12));
  const ve = Math.min(de, Be);
  const oa = (c) => {
    V([...c].sort((M, U) => M.date.localeCompare(U.date)));
    Oe(1);
  };
  const da = () => {
    I('');
    N('');
    d('');
    O('');
    y('all');
    P('all');
    L('all');
    j('Productores');
    k(null);
    u('');
    X(1);
  };
  const wa = (c) => {
    S(c);
    z('');
    q(false);
    da();
  };
  const Ns = () => {
    const c = (U) =>
      '"' +
      String(U ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const M = [
      [
        'Productor',
        'Hacienda',
        'Suerte',
        'Fecha de registro',
        'Semana',
        'Labor',
        'Descripción',
        'Unidad',
        'Cantidad',
        'Edad días',
        'Nota de edad',
        'Origen de fecha',
        'Fila',
      ],
      ...Ea.map((U) => [
        U.producer,
        U.hacienda,
        U.suerte,
        U.date,
        U.week,
        U.labor,
        U.name,
        U.unit,
        U.units,
        U.ageDays ?? '',
        U.ageNote,
        U.source === 'Nómina'
          ? 'Ejecución en Nómina'
          : 'Registro mecanizado; fecha de ejecución no confirmada',
        'REPORTE!' + U.sourceRow,
      ]),
    ];
    downloadBlob(
      new Blob(
        [
          '\uFEFF' +
            M.map((U) => U.map(c).join(';')).join(`\r
`),
        ],
        {
          type: 'text/csv;charset=utf-8;',
        },
      ),
      'Labores_realizadas_CASUR.csv',
    );
  };
  const Da = groupEntries(ie, (c) => c.producer).sort((c, M) => c[0].localeCompare(M[0]));
  const Cs = groupEntries(ie, (c) => c.unit);
  return (
    <div className="execution-dashboard">
      <div className="exec-heading">
        <div>
          <span className="exec-eyebrow">NEGOCIOS DE CAÑA / OPERACIÓN</span>
          <h2>Trabajo realizado</h2>
          <p>Qué hicimos, cuánto y en cuáles suertes.</p>
        </div>
        <div className="exec-switch" aria-label="Tipo de seguimiento">
          <button aria-pressed={f === 'Manual'} onClick={() => wa('Manual')}>
            <Sprout size={17} />
            Manuales
          </button>
          <button aria-pressed={f === 'Mecanizada'} onClick={() => wa('Mecanizada')}>
            <Tractor size={17} />
            Mecanizadas
          </button>
        </div>
      </div>
      <nav className="exec-local-nav" aria-label="Vistas de labores">
        <button aria-current={A === 'resumen' ? 'page' : undefined} onClick={() => E('resumen')}>
          Resumen ejecutivo
        </button>
        <button aria-current={A === 'productores' ? 'page' : undefined} onClick={() => E('productores')}>
          Productores
        </button>
        <button aria-current={A === 'labores' ? 'page' : undefined} onClick={() => E('labores')}>
          Detalle por labor
        </button>
        <button aria-current={A === 'applications' ? 'page' : undefined} onClick={() => E('applications')}>
          Aplicaciones por suerte
        </button>
      </nav>
      <div className="exec-toolbar">
        <label>
          <span>Productor</span>
          <select
            value={C}
            onChange={(c) => {
              y(c.target.value);
              P('all');
              u('');
              X(1);
            }}
          >
            <option value="all">Todos los productores</option>
            {ra.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Semana desde</span>
          <select
            value={D}
            onChange={(c) => {
              I(c.target.value);
              k(null);
              X(1);
            }}
          >
            <option value="">Inicio del período</option>
            {K.map((c) => (
              <option key={c} value={c}>
                {'Semana '}
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Semana hasta</span>
          <select
            value={v}
            onChange={(c) => {
              N(c.target.value);
              k(null);
              X(1);
            }}
          >
            <option value="">Último registro</option>
            {K.map((c) => (
              <option key={c} value={c}>
                {'Semana '}
                {c}
              </option>
            ))}
          </select>
        </label>
        <button className="exec-reset" onClick={da}>
          Restablecer
        </button>
      </div>
      <details className="exec-refine">
        <summary>
          <SlidersHorizontal size={15} />
          Afinar vista: fechas, hacienda, edad y ámbito
        </summary>
        <div>
          <label>
            Fecha desde
            <input
              type="date"
              value={g}
              onChange={(c) => {
                d(c.target.value);
                X(1);
              }}
            />
          </label>
          <label>
            Fecha hasta
            <input
              type="date"
              value={R}
              onChange={(c) => {
                O(c.target.value);
                X(1);
              }}
            />
          </label>
          <label>
            Hacienda
            <select
              value={_}
              onChange={(c) => {
                P(c.target.value);
                X(1);
              }}
            >
              <option value="all">Todas las haciendas</option>
              {[...new Set(he.filter((c) => C === 'all' || c.producer === C).map((c) => c.hacienda))]
                .sort()
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </label>
          <label>
            Edad al registro
            <select
              value={h}
              onChange={(c) => {
                L(c.target.value);
                X(1);
              }}
            >
              <option value="all">Todas las edades</option>
              {AGE_BUCKETS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Ámbito
            <select
              value={F}
              onChange={(c) => {
                j(c.target.value);
                y('all');
                P('all');
                X(1);
              }}
            >
              <option>Productores</option>
              <option>CASUR / otro ámbito</option>
              <option>Sin maestro · revisar</option>
              <option value="all">Todos los ámbitos</option>
            </select>
          </label>
        </div>
      </details>
      {D && v && Number(D) > Number(v) && (
        <p role="alert">La semana inicial debe ser menor o igual a la final.</p>
      )}
      {g && R && g > R && <p role="alert">La fecha inicial debe ser menor o igual a la final.</p>}
      {(g || R) && (
        <p className="application-caption">
          {'Fechas seleccionadas: '}
          {g || 'inicio'}
          {' → '}
          {R || 'último registro'}. Se combinan con las semanas y demás filtros.
        </p>
      )}
      {l && (
        <p role="status" className="application-caption">
          {l}
        </p>
      )}
      {A === 'resumen' && (
        <button
          className="exec-reference-hero"
          onClick={() => {
            E('labores');
            q(true);
          }}
        >
          <span>
            <Sprout size={17} />
            {f === 'Manual' ? 'LABORES MANUALES REGISTRADAS' : 'LABORES MECANIZADAS REPORTADAS'}
          </span>
          <strong>
            {countDistinct(ie, (c) => c.labor)} <small>labores distintas</small>
          </strong>
          <div className="exec-unit-legend">
            {Cs.map(([c, M]) => (
              <span key={c}>
                <b>{formatNumber(sumUnits(M), 1)}</b>
                <small>{c === 'HA' ? 'HA · acumuladas' : c}</small>
              </span>
            ))}
          </div>
          <div className="exec-hero-reach">
            <span>
              <b>{countDistinct(ie, (c) => c.producer)}</b>Productores
            </span>
            <span>
              <b>{countDistinct(ie, lotLabel)}</b>Suertes
            </span>
            <span>
              <b>{countDistinct(ie, (c) => c.week)}</b>Semanas con actividad
            </span>
          </div>
          <em>
            {'Ver desglose '}
            <ChevronRight size={14} />
          </em>
        </button>
      )}
      <div className="exec-reach">
        <button onClick={() => E('productores')}>
          <Users size={18} />
          <b>{countDistinct(ie, (c) => c.producer)}</b>
          {' productores · ver fichas'}
        </button>
        <span>
          <MapPin size={18} />
          <b>{countDistinct(ie, lotLabel)}</b>
          {' suertes atendidas'}
        </span>
        <span>
          <Leaf size={18} />
          <b>{countDistinct(ie, (c) => c.labor)}</b>
          {' labores registradas'}
        </span>
        <span>
          S{D || K[0] || '—'}–S{v || K.at(-1) || '—'}
        </span>
      </div>
      {A === 'applications' ? (
        <ApplicationsView
          key={[f, D, v, g, R, C, _, h, F].join('|')}
          episodes={x}
          rows={ie}
          settings={i}
          onSettings={m}
          onOpen={oa}
        />
      ) : A === 'productores' ? (
        <div className="exec-producer-cards">
          <div className="exec-section-label">
            <h3>Productores atendidos</h3>
            <span>Toque una ficha para desplegar sus labores</span>
          </div>
          {Da.map(([c, M]) => (
            <details key={c} className="exec-producer-card">
              <summary>
                <span>
                  <strong>{c.replace(' · titular sin confirmar', '')}</strong>
                  <small>
                    {countDistinct(M, (U) => U.hacienda)}
                    {' haciendas · '}
                    {countDistinct(M, lotLabel)}
                    {' suertes · '}
                    {[...new Set(M.map((U) => U.labor))].join(', ')}
                  </small>
                </span>
                <b>
                  {countDistinct(M, (U) => U.labor)}
                  <small>LABORES ▾</small>
                </b>
              </summary>
              <div className="exec-producer-body">
                <div className="exec-producer-stats">
                  <span>
                    <b>{countDistinct(M, lotLabel)}</b>Suertes
                  </span>
                  <span>
                    <b>{countDistinct(M, (U) => U.week)}</b>Semanas
                  </span>
                  {groupEntries(M, (U) => U.unit).map(([U, ee]) => (
                    <span key={U}>
                      <b>{formatNumber(sumUnits(ee), 1)}</b>
                      {U === 'HA' ? 'HA acumuladas' : U}
                    </span>
                  ))}
                </div>
                <h4>Labores realizadas</h4>
                {groupEntries(M, laborUnitKey).map(([U, ee]) => (
                  <button
                    key={U}
                    className="exec-producer-labor"
                    onClick={() => {
                      y(c);
                      P('all');
                      z(U);
                      E('labores');
                      k(null);
                      u('');
                      X(1);
                    }}
                  >
                    <span>
                      <strong>
                        {ee[0].labor}
                        {' · '}
                        {laborDisplayName(ee[0])}
                      </strong>
                      <small>
                        {countDistinct(ee, lotLabel)}
                        {' suertes · ver distribución'}
                      </small>
                    </span>
                    <b>
                      {formatNumber(sumUnits(ee))}
                      <small>{ee[0].unit}</small>
                    </b>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </details>
          ))}
          {!Da.length && <p className="exec-empty">No hay productores con estos filtros.</p>}
        </div>
      ) : (
        <>
          <div className="exec-section-label">
            <h3>Actividad por labor</h3>
            <span>Seleccione una tarjeta para explorar sus resultados</span>
          </div>
          <div className="exec-labor-cards">
            {(T ? ge : ge.slice(0, 4)).map(([c, M]) => (
              <button
                key={c}
                className={la === c ? 'exec-labor-card active' : 'exec-labor-card'}
                aria-pressed={la === c}
                onClick={() => {
                  E('labores');
                  z(c);
                  k(null);
                  u('');
                  X(1);
                }}
              >
                <span className="exec-card-top">
                  <span>{M[0].labor}</span>
                  <ArrowUpRight size={19} />
                </span>
                <span className="exec-labor-name">{laborDisplayName(M[0])}</span>
                <strong>
                  {formatNumber(sumUnits(M), 2)} <small>{M[0].unit}</small>
                </strong>
                <span className="exec-card-bottom">
                  {countDistinct(M, (U) => U.producer)}
                  {' productores '}
                  <i />
                  {countDistinct(M, lotLabel)}
                  {' suertes'}
                </span>
              </button>
            ))}
          </div>
          {ge.length > 4 && (
            <button className="exec-more" onClick={() => q(!T)}>
              {T ? 'Mostrar principales' : 'Ver las ' + ge.length + ' combinaciones de labor y unidad'}
              <ChevronRight size={15} />
            </button>
          )}
          {pe ? (
            <>
              <section className="exec-spotlight">
                <div>
                  <span>
                    {pe.labor}
                    {' / '}
                    {pe.unit}
                  </span>
                  <h3>{laborDisplayName(pe)}</h3>
                  <p>
                    {f === 'Manual' ? 'Cantidad ejecutada registrada' : 'Cantidad mecanizada reportada'}
                    {' · '}
                    {C === 'all' ? 'todos los productores' : C}
                  </p>
                </div>
                <div>
                  <strong>
                    {formatNumber(sumUnits(je))}
                    <small>{Se}</small>
                  </strong>
                  <span>
                    {countDistinct(je, lotLabel)}
                    {' suertes · '}
                    {countDistinct(je, (c) => c.week)}
                    {' semanas con actividad'}
                  </span>
                </div>
              </section>
              <button className="application-shortcut" onClick={() => E('applications')}>
                <span>
                  <strong>
                    {ca.length}
                    {' grupos de trabajo · '}
                    {pe.labor}
                  </strong>
                  <small>
                    {ca.filter((c) => c.status === 'COMPLETA').length}
                    {' con área completa estimada · '}
                    {ca.filter((c) => c.status === 'PARCIAL').length}
                    {' parciales · abrir vista de todas las aplicaciones por suerte'}
                  </small>
                </span>
                <ChevronRight size={19} />
              </button>
              <div className="exec-analysis-grid">
                <section className="panel exec-trend">
                  <div className="panel-head">
                    <div>
                      <h3>Evolución semanal</h3>
                      <p>
                        {Se}
                        {' por semana · pulse una barra para ver dónde se trabajó'}
                      </p>
                    </div>
                    {B !== null && (
                      <button
                        className="exec-reset"
                        onClick={() => {
                          k(null);
                          X(1);
                        }}
                      >
                        Quitar S{B}
                      </button>
                    )}
                  </div>
                  <div className="exec-week-scroll">
                    <div className="exec-week-bars">
                      {Oa.map((c) => (
                        <button
                          key={c.week}
                          className={B === c.week ? 'active' : ''}
                          aria-label={'Semana ' + c.week + ': ' + formatNumber(sumUnits(c.rows)) + ' ' + Se}
                          disabled={!c.rows.length}
                          onClick={() => {
                            var M;
                            k(c.week);
                            X(1);
                            (M = ze.current) == null ||
                              M.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                              });
                          }}
                        >
                          <span className="exec-bar-track">
                            <i
                              style={{
                                height: (Math.max(0, sumUnits(c.rows)) / Ss) * 100 + '%',
                              }}
                            />
                          </span>
                          <b>S{c.week}</b>
                          <small>{formatNumber(sumUnits(c.rows), 1)}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="panel exec-age">
                  <div className="panel-head">
                    <div>
                      <h3>Edad de la caña</h3>
                      <p>
                        {Se}
                        {' según edad al registro'}
                      </p>
                    </div>
                  </div>
                  <div className="exec-age-list">
                    {AGE_BUCKETS.map((c) => {
                      const M = je.filter((U) => ageBucket(U.ageDays) === c);
                      return (
                        <button
                          key={c}
                          disabled={!M.length}
                          onClick={() => {
                            L(c);
                            k(null);
                            X(1);
                          }}
                        >
                          <span>{c}</span>
                          <b>
                            {formatNumber(sumUnits(M))}
                            <small>{Se}</small>
                          </b>
                        </button>
                      );
                    })}
                  </div>
                  {h !== 'all' && (
                    <button className="exec-more" onClick={() => L('all')}>
                      Ver todas las edades
                    </button>
                  )}
                </section>
              </div>
              <section className="panel exec-distribution" ref={ze}>
                <div className="panel-head">
                  <div>
                    <span className="exec-eyebrow">
                      {B !== null ? 'SEMANA ' + B : 'DISTRIBUCIÓN DEL TRABAJO'}
                    </span>
                    <h3>{C === 'all' ? '¿A qué productores atendimos?' : 'Trabajo por suerte'}</h3>
                    <p>
                      {laborDisplayName(pe)}
                      {' · '}
                      {Se}
                      {C !== 'all' && ' · ' + C}
                    </p>
                  </div>
                  <button className="button secondary" onClick={Ns}>
                    <ArrowDownToLine size={16} />
                    Exportar detalle
                  </button>
                </div>
                <div className="exec-breadcrumb">
                  {C !== 'all' && (
                    <button
                      onClick={() => {
                        y('all');
                        P('all');
                        u('');
                        X(1);
                      }}
                    >
                      <ArrowLeft size={15} />
                      Todos los productores
                    </button>
                  )}
                  <input
                    aria-label="Buscar productor o suerte"
                    placeholder={C === 'all' ? 'Buscar productor…' : 'Buscar hacienda o suerte…'}
                    value={p}
                    onChange={(c) => {
                      u(c.target.value);
                      X(1);
                    }}
                  />
                  <span>
                    {we.length} {C === 'all' ? 'productores' : 'suertes'}
                  </span>
                </div>
                <div className="exec-ranking">
                  {we.slice((ve - 1) * 12, ve * 12).map(([c, M], U) => (
                    <div key={c} className="exec-rank-row">
                      <span className="exec-rank-num">{(ve - 1) * 12 + U + 1}</span>
                      <button
                        className="exec-rank-main"
                        onClick={() => {
                          C === 'all' ? (y(c), P('all'), u(''), X(1)) : oa(M);
                        }}
                      >
                        <span>
                          <strong>{c.replace(' · titular sin confirmar', '')}</strong>
                          <small>
                            {C === 'all' ? countDistinct(M, lotLabel) + ' suertes · ' : ''}
                            {countDistinct(M, (ee) => ee.week)}
                            {' semanas'}
                            {M.some((ee) => ee.producer.includes('titular sin confirmar'))
                              ? ' · agrupado por hacienda'
                              : ''}
                          </small>
                        </span>
                        <span className="exec-rank-meter">
                          <i
                            style={{
                              width: (Math.max(0, sumUnits(M)) / ys) * 100 + '%',
                            }}
                          />
                        </span>
                      </button>
                      <b className="exec-rank-total">
                        {formatNumber(sumUnits(M))}
                        <small>{Se}</small>
                      </b>
                      <button
                        className="exec-evidence-link"
                        onClick={() => oa(M)}
                        aria-label={'Ver detalle de ' + c}
                      >
                        Detalle
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                {!we.length && (
                  <p className="exec-empty">Sin coincidencias. Quite la búsqueda o la semana seleccionada.</p>
                )}
                {Be > 1 && (
                  <div className="pagination">
                    <button disabled={ve === 1} onClick={() => X(ve - 1)}>
                      Anterior
                    </button>
                    <span>
                      {ve}
                      {' / '}
                      {Be}
                    </span>
                    <button disabled={ve === Be} onClick={() => X(ve + 1)}>
                      Siguiente
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="panel exec-empty">
              <Sprout size={30} />
              <h3>No hay labores con estos filtros</h3>
              <p>Pruebe otro período, productor o ámbito.</p>
              <button className="button secondary" onClick={da}>
                Ver todo el período
              </button>
            </section>
          )}
        </>
      )}
      <footer className="exec-method">
        <p>
          Las HA representan trabajo acumulado, no superficie única. Cada labor conserva su propia unidad.
        </p>
        <details>
          <summary>Cómo se interpretan los datos, las aplicaciones y la edad</summary>
          <p>
            Las manuales usan los registros de ejecución de Nómina. Las mecanizadas usan el reporte SIAGRI
            disponible; sus fechas de registro no acreditan el día de ejecución. No se duplican las labores
            manuales con sus cobros.
          </p>
          <p>
            {'Aplicaciones: agrupación estimada por suerte, labor, servicio, unidad y origen, desde '}
            {s}. Se conservan los registros del mismo día juntos; se separan por pausas, ventana máxima o
            cambio de ciclo conocido. No se mezclan servicios distintos ni se convierten D/H, MJO u otras
            unidades en hectáreas. Los números de grupo se recalculan si cambia el historial o las reglas.
          </p>
          <p>
            Edad: días desde la siembra o último corte del maestro, el más reciente. Los ciclos históricos no
            disponibles se muestran “Sin edad”.
          </p>
        </details>
      </footer>
      {se && (
        <>
          <div className="drawer-overlay" onClick={() => V(null)} />
          <aside
            className="drawer exec-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del trabajo realizado"
          >
            <div className="drawer-head">
              <div>
                <span>TRABAJO REALIZADO / DETALLE</span>
                <h2>{se[0].producer.replace(' · titular sin confirmar', '')}</h2>
              </div>
              <button aria-label="Cerrar detalle" onClick={() => V(null)}>
                <X />
              </button>
            </div>
            <div className="drawer-body">
              <div className="exec-detail-total">
                <span>{laborDisplayName(se[0])}</span>
                <strong>
                  {formatNumber(sumUnits(se))}
                  <small>{se[0].unit}</small>
                </strong>
                <p>
                  {countDistinct(se, lotLabel)}
                  {' suertes · '}
                  {countDistinct(se, (c) => c.week)}
                  {' semanas'}
                </p>
              </div>
              {se.slice((ue - 1) * 30, ue * 30).map((c) => (
                <article key={c.id} className="exec-work-event">
                  <div>
                    <strong>
                      {c.hacienda}
                      {' · '}
                      {c.suerte}
                    </strong>
                    <b>
                      {formatNumber(c.units)}
                      <small>{c.unit}</small>
                    </b>
                  </div>
                  <p>
                    {c.date}
                    {' · semana '}
                    {c.week}
                    {' · '}
                    {c.labor}
                    {' / '}
                    {c.service}
                  </p>
                  <small>
                    {'Edad: '}
                    {c.ageDays === null
                      ? 'no disponible'
                      : c.ageDays + ' días (' + formatNumber(c.ageDays / 30.4375, 1) + ' meses)'}
                    {c.source === 'Prefactura' ? ' · fecha de registro, ejecución no confirmada' : ''}
                  </small>
                  <details>
                    <summary>Origen del registro</summary>
                    <p>
                      {c.sourceRow != null
                        ? ['REPORTE!', c.sourceRow, ' · ', c.name]
                        : [c.source || 'Seguimiento', ' · ', c.name]}
                    </p>
                    <p>
                      {c.ageNote}
                      {c.ageBase ? ' · base ' + c.ageBase : ''}
                    </p>
                  </details>
                </article>
              ))}
              <div className="pagination">
                <button disabled={ue === 1} onClick={() => Oe(ue - 1)}>
                  Anterior
                </button>
                <span>
                  {ue}
                  {' / '}
                  {Math.ceil(se.length / 30)}
                </span>
                <button disabled={ue * 30 >= se.length} onClick={() => Oe(ue + 1)}>
                  Siguiente
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
