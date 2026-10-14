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
import { buildApplicationEpisodes, clipEpisodesToRows, loadApplicationRules } from '../../engine/applications';
import { normalizeText } from '../../engine/normalize';
import { ageBucket, buildTrackingRows, laborDisplayName, laborUnitKey, sumUnits } from '../../engine/tracking';
import { downloadBlob, formatCurrency, formatNumber } from '../../lib/format';
import { APPLICATION_RULES_STORAGE_KEY } from '../../engine/applications';
import { comparePeriods, parsePeriodKey } from '../../engine/periods';
import { periodLongText, periodText } from '../../lib/labels';

/** Período de una fila de seguimiento ("AAAA-SNN"); compatible con filas sin año. */
const periodOfRow = (row) => row.period || `S${row.week}`;
const comparePeriodKeys = (a, b) =>
  parsePeriodKey(a) && parsePeriodKey(b) ? comparePeriods(a, b) : String(a).localeCompare(String(b));
export function TrackingPanel({ inputs, startDate, onAudit }) {
  var firstGroup;
  var activeGroup;
  const rows = useMemo(() => buildTrackingRows(inputs, startDate), [inputs, startDate]);
  const [rules, setRules] = useState(loadApplicationRules);
  const [rulesMessage, setRulesMessage] = useState('');
  const episodes = useMemo(() => buildApplicationEpisodes(rows, inputs.master, rules), [rows, inputs.master, rules]);
  const saveRules = (c) => {
    setRules(c);
    try {
      localStorage.setItem(APPLICATION_RULES_STORAGE_KEY, JSON.stringify(c));
      setRulesMessage('Reglas guardadas en este dispositivo. Aplicaciones recalculadas.');
    } catch {
      setRulesMessage('Aplicaciones recalculadas, pero no se pudieron guardar las reglas en este dispositivo.');
    }
    onAudit == null ||
      onAudit('REGLAS_APLICACIONES', JSON.stringify(c)).catch(() =>
        setRulesMessage('Reglas aplicadas; no fue posible registrar el cambio en auditoría.'),
      );
  };
  const [workType, setWorkType] = useState('Manual');
  const [view, setView] = useState('resumen');
  const [weekFrom, setWeekFrom] = useState('');
  const [weekTo, setWeekTo] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [producer, setProducer] = useState('all');
  const [hacienda, setHacienda] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [scope, setScope] = useState('Productores');
  const [selectedLabor, setSelectedLabor] = useState('');
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [search, setSearch] = useState('');
  const [showAllLabors, setShowAllLabors] = useState(false);
  const [detailRows, setDetailRows] = useState(null);
  const [rankingPage, setRankingPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const distributionRef = useRef(null);
  const typeRows = rows.filter(
    (c) =>
      (workType === 'Mecanizada' ? c.classification === 'Mecanizada' : c.classification !== 'Mecanizada') &&
      (scope === 'all' || c.scope === scope),
  );
  const multiYear = new Set(rows.map((row) => row.year).filter((year) => year != null)).size > 1;
  const weeks = [...new Set(typeRows.map(periodOfRow))].sort(comparePeriodKeys);
  const producers = [...new Set(typeRows.map((c) => c.producer))].sort();
  const filtered = typeRows.filter(
    (c) =>
      (!weekFrom || comparePeriodKeys(periodOfRow(c), weekFrom) >= 0) &&
      (!weekTo || comparePeriodKeys(periodOfRow(c), weekTo) <= 0) &&
      (!dateFrom || c.date >= dateFrom) &&
      (!dateTo || c.date <= dateTo) &&
      (producer === 'all' || c.producer === producer) &&
      (hacienda === 'all' || c.hacienda === hacienda) &&
      (ageFilter === 'all' || ageBucket(c.ageDays) === ageFilter),
  );
  const laborGroups = groupEntries(filtered, laborUnitKey).sort(([, c], [, M]) => {
    const U = (ee) => {
      const Ta = PRIORITY_LABORS.indexOf(ee.labor);
      return Ta < 0 ? 10 : Ta + (ee.unit === 'HA' || ee.labor === 'ECR' ? 0 : 5);
    };
    return U(c[0]) - U(M[0]) || c[0].labor.localeCompare(M[0].labor) || c[0].unit.localeCompare(M[0].unit);
  });
  const activeLaborKey = laborGroups.some(([c]) => c === selectedLabor)
    ? selectedLabor
    : (((firstGroup = laborGroups[0]) == null ? undefined : firstGroup[0]) ?? '');
  const laborRows = ((activeGroup = laborGroups.find(([c]) => c === activeLaborKey)) == null ? undefined : activeGroup[1]) ?? [];
  const laborSample = laborRows[0];
  const laborUnit = (laborSample == null ? undefined : laborSample.unit) ?? '';
  const rankingSource = laborRows.filter(
    (c) =>
      (selectedWeek === null || periodOfRow(c) === selectedWeek) &&
      (!search || normalizeText(c.producer + ' ' + lotLabel(c)).includes(normalizeText(search))),
  );
  const laborEpisodes = clipEpisodesToRows(episodes, laborRows);
  const weeklyBars = weeks
    .filter((c) => (!weekFrom || comparePeriodKeys(c, weekFrom) >= 0) && (!weekTo || comparePeriodKeys(c, weekTo) <= 0))
    .map((c) => ({
      week: c,
      rows: laborRows.filter((M) => periodOfRow(M) === c),
    }));
  const maxWeekUnits = Math.max(1, ...weeklyBars.map((c) => sumUnits(c.rows)));
  const ranking = groupEntries(rankingSource, (c) => (producer === 'all' ? c.producer : lotLabel(c))).sort(
    (c, M) => sumUnits(M[1]) - sumUnits(c[1]) || c[0].localeCompare(M[0]),
  );
  const maxRankingUnits = Math.max(1, ...ranking.map(([, c]) => sumUnits(c)));
  const rankingPages = Math.max(1, Math.ceil(ranking.length / 12));
  const currentRankingPage = Math.min(rankingPage, rankingPages);
  const openDetail = (c) => {
    setDetailRows([...c].sort((M, U) => M.date.localeCompare(U.date)));
    setDetailPage(1);
  };
  const resetFilters = () => {
    setWeekFrom('');
    setWeekTo('');
    setDateFrom('');
    setDateTo('');
    setProducer('all');
    setHacienda('all');
    setAgeFilter('all');
    setScope('Productores');
    setSelectedWeek(null);
    setSearch('');
    setRankingPage(1);
  };
  const switchWorkType = (c) => {
    setWorkType(c);
    setSelectedLabor('');
    setShowAllLabors(false);
    resetFilters();
  };
  const exportDetailCsv = () => {
    // Celdas entre comillas; se neutralizan fórmulas (=, +, @, -) para que Excel no las ejecute.
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
        'Archivo',
        'Tarifa',
        'Total',
        'P.FACT',
      ],
      ...rankingSource.map((U) => [
        U.producer,
        U.hacienda,
        U.suerte,
        U.date,
        periodOfRow(U),
        U.labor,
        U.name,
        U.unit,
        U.units,
        U.ageDays ?? '',
        U.ageNote,
        U.source === 'Nómina' ? 'Ejecución en Nómina' : 'Registro mecanizado; fecha de ejecución no confirmada',
        (U.sourceSheet ?? 'REPORTE') + '!' + U.sourceRow,
        U.sourceFile ?? '',
        U.source === 'Prefactura' ? U.tariff : '',
        U.source === 'Prefactura' ? U.amount : '',
        U.pFact ?? '',
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
  const producerGroups = groupEntries(filtered, (c) => c.producer).sort((c, M) => c[0].localeCompare(M[0]));
  const unitGroups = groupEntries(filtered, (c) => c.unit);
  return (
    <div className="execution-dashboard">
      <div className="exec-heading">
        <div>
          <span className="exec-eyebrow">NEGOCIOS DE CAÑA / OPERACIÓN</span>
          <h2>Trabajo realizado</h2>
          <p>Qué hicimos, cuánto y en cuáles suertes.</p>
        </div>
        <div className="exec-switch" aria-label="Tipo de seguimiento">
          <button aria-pressed={workType === 'Manual'} onClick={() => switchWorkType('Manual')}>
            <Sprout size={17} />
            Manuales
          </button>
          <button aria-pressed={workType === 'Mecanizada'} onClick={() => switchWorkType('Mecanizada')}>
            <Tractor size={17} />
            Mecanizadas
          </button>
        </div>
      </div>
      <nav className="exec-local-nav" aria-label="Vistas de labores">
        <button aria-current={view === 'resumen' ? 'page' : undefined} onClick={() => setView('resumen')}>
          Resumen ejecutivo
        </button>
        <button aria-current={view === 'productores' ? 'page' : undefined} onClick={() => setView('productores')}>
          Productores
        </button>
        <button aria-current={view === 'labores' ? 'page' : undefined} onClick={() => setView('labores')}>
          Detalle por labor
        </button>
        <button aria-current={view === 'applications' ? 'page' : undefined} onClick={() => setView('applications')}>
          Aplicaciones por suerte
        </button>
      </nav>
      <div className="exec-toolbar">
        <label>
          <span>Productor</span>
          <select
            value={producer}
            onChange={(c) => {
              setProducer(c.target.value);
              setHacienda('all');
              setSearch('');
              setRankingPage(1);
            }}
          >
            <option value="all">Todos los productores</option>
            {producers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Semana desde</span>
          <select
            value={weekFrom}
            onChange={(c) => {
              setWeekFrom(c.target.value);
              setSelectedWeek(null);
              setRankingPage(1);
            }}
          >
            <option value="">Inicio del período</option>
            {weeks.map((c) => (
              <option key={c} value={c}>
                {periodLongText(c, multiYear)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Semana hasta</span>
          <select
            value={weekTo}
            onChange={(c) => {
              setWeekTo(c.target.value);
              setSelectedWeek(null);
              setRankingPage(1);
            }}
          >
            <option value="">Último registro</option>
            {weeks.map((c) => (
              <option key={c} value={c}>
                {periodLongText(c, multiYear)}
              </option>
            ))}
          </select>
        </label>
        <button className="exec-reset" onClick={resetFilters}>
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
              value={dateFrom}
              onChange={(c) => {
                setDateFrom(c.target.value);
                setRankingPage(1);
              }}
            />
          </label>
          <label>
            Fecha hasta
            <input
              type="date"
              value={dateTo}
              onChange={(c) => {
                setDateTo(c.target.value);
                setRankingPage(1);
              }}
            />
          </label>
          <label>
            Hacienda
            <select
              value={hacienda}
              onChange={(c) => {
                setHacienda(c.target.value);
                setRankingPage(1);
              }}
            >
              <option value="all">Todas las haciendas</option>
              {[...new Set(typeRows.filter((c) => producer === 'all' || c.producer === producer).map((c) => c.hacienda))]
                .sort()
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </label>
          <label>
            Edad al registro
            <select
              value={ageFilter}
              onChange={(c) => {
                setAgeFilter(c.target.value);
                setRankingPage(1);
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
              value={scope}
              onChange={(c) => {
                setScope(c.target.value);
                setProducer('all');
                setHacienda('all');
                setRankingPage(1);
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
      {weekFrom && weekTo && comparePeriodKeys(weekFrom, weekTo) > 0 && (
        <p role="alert">La semana inicial debe ser menor o igual a la final.</p>
      )}
      {dateFrom && dateTo && dateFrom > dateTo && <p role="alert">La fecha inicial debe ser menor o igual a la final.</p>}
      {(dateFrom || dateTo) && (
        <p className="application-caption">
          {'Fechas seleccionadas: '}
          {dateFrom || 'inicio'}
          {' → '}
          {dateTo || 'último registro'}. Se combinan con las semanas y demás filtros.
        </p>
      )}
      {rulesMessage && (
        <p role="status" className="application-caption">
          {rulesMessage}
        </p>
      )}
      {view === 'resumen' && (
        <button
          className="exec-reference-hero"
          onClick={() => {
            setView('labores');
            setShowAllLabors(true);
          }}
        >
          <span>
            <Sprout size={17} />
            {workType === 'Manual' ? 'LABORES MANUALES REGISTRADAS' : 'LABORES MECANIZADAS REPORTADAS'}
          </span>
          <strong>
            {countDistinct(filtered, (c) => c.labor)} <small>labores distintas</small>
          </strong>
          <div className="exec-unit-legend">
            {unitGroups.map(([c, M]) => (
              <span key={c}>
                <b>{formatNumber(sumUnits(M), 1)}</b>
                <small>{c === 'HA' ? 'HA · acumuladas' : c}</small>
              </span>
            ))}
          </div>
          <div className="exec-hero-reach">
            <span>
              <b>{countDistinct(filtered, (c) => c.producer)}</b>Productores
            </span>
            <span>
              <b>{countDistinct(filtered, lotLabel)}</b>Suertes
            </span>
            <span>
              <b>{countDistinct(filtered, periodOfRow)}</b>Semanas con actividad
            </span>
          </div>
          <em>
            {'Ver desglose '}
            <ChevronRight size={14} />
          </em>
        </button>
      )}
      <div className="exec-reach">
        <button onClick={() => setView('productores')}>
          <Users size={18} />
          <b>{countDistinct(filtered, (c) => c.producer)}</b>
          {' productores · ver fichas'}
        </button>
        <span>
          <MapPin size={18} />
          <b>{countDistinct(filtered, lotLabel)}</b>
          {' suertes atendidas'}
        </span>
        <span>
          <Leaf size={18} />
          <b>{countDistinct(filtered, (c) => c.labor)}</b>
          {' labores registradas'}
        </span>
        <span>
          {periodText(weekFrom || weeks[0], multiYear) || '—'}–{periodText(weekTo || weeks.at(-1), multiYear) || '—'}
        </span>
      </div>
      {view === 'applications' ? (
        <ApplicationsView
          key={[workType, weekFrom, weekTo, dateFrom, dateTo, producer, hacienda, ageFilter, scope].join('|')}
          episodes={episodes}
          rows={filtered}
          settings={rules}
          onSettings={saveRules}
          onOpen={openDetail}
        />
      ) : view === 'productores' ? (
        <div className="exec-producer-cards">
          <div className="exec-section-label">
            <h3>Productores atendidos</h3>
            <span>Toque una ficha para desplegar sus labores</span>
          </div>
          {producerGroups.map(([c, M]) => (
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
                    <b>{countDistinct(M, periodOfRow)}</b>Semanas
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
                      setProducer(c);
                      setHacienda('all');
                      setSelectedLabor(U);
                      setView('labores');
                      setSelectedWeek(null);
                      setSearch('');
                      setRankingPage(1);
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
          {!producerGroups.length && <p className="exec-empty">No hay productores con estos filtros.</p>}
        </div>
      ) : (
        <>
          <div className="exec-section-label">
            <h3>Actividad por labor</h3>
            <span>Seleccione una tarjeta para explorar sus resultados</span>
          </div>
          <div className="exec-labor-cards">
            {(showAllLabors ? laborGroups : laborGroups.slice(0, 4)).map(([c, M]) => (
              <button
                key={c}
                className={activeLaborKey === c ? 'exec-labor-card active' : 'exec-labor-card'}
                aria-pressed={activeLaborKey === c}
                onClick={() => {
                  setView('labores');
                  setSelectedLabor(c);
                  setSelectedWeek(null);
                  setSearch('');
                  setRankingPage(1);
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
          {laborGroups.length > 4 && (
            <button className="exec-more" onClick={() => setShowAllLabors(!showAllLabors)}>
              {showAllLabors ? 'Mostrar principales' : 'Ver las ' + laborGroups.length + ' combinaciones de labor y unidad'}
              <ChevronRight size={15} />
            </button>
          )}
          {laborSample ? (
            <>
              <section className="exec-spotlight">
                <div>
                  <span>
                    {laborSample.labor}
                    {' / '}
                    {laborSample.unit}
                  </span>
                  <h3>{laborDisplayName(laborSample)}</h3>
                  <p>
                    {workType === 'Manual' ? 'Cantidad ejecutada registrada' : 'Cantidad mecanizada reportada'}
                    {' · '}
                    {producer === 'all' ? 'todos los productores' : producer}
                  </p>
                </div>
                <div>
                  <strong>
                    {formatNumber(sumUnits(laborRows))}
                    <small>{laborUnit}</small>
                  </strong>
                  <span>
                    {countDistinct(laborRows, lotLabel)}
                    {' suertes · '}
                    {countDistinct(laborRows, periodOfRow)}
                    {' semanas con actividad'}
                  </span>
                </div>
              </section>
              <button className="application-shortcut" onClick={() => setView('applications')}>
                <span>
                  <strong>
                    {laborEpisodes.length}
                    {' grupos de trabajo · '}
                    {laborSample.labor}
                  </strong>
                  <small>
                    {laborEpisodes.filter((c) => c.status === 'COMPLETA').length}
                    {' con área completa estimada · '}
                    {laborEpisodes.filter((c) => c.status === 'PARCIAL').length}
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
                        {laborUnit}
                        {' por semana · pulse una barra para ver dónde se trabajó'}
                      </p>
                    </div>
                    {selectedWeek !== null && (
                      <button
                        className="exec-reset"
                        onClick={() => {
                          setSelectedWeek(null);
                          setRankingPage(1);
                        }}
                      >
                        Quitar {periodText(selectedWeek, multiYear)}
                      </button>
                    )}
                  </div>
                  <div className="exec-week-scroll">
                    <div className="exec-week-bars">
                      {weeklyBars.map((c) => (
                        <button
                          key={c.week}
                          className={selectedWeek === c.week ? 'active' : ''}
                          aria-label={periodLongText(c.week, multiYear) + ': ' + formatNumber(sumUnits(c.rows)) + ' ' + laborUnit}
                          disabled={!c.rows.length}
                          onClick={() => {
                            var M;
                            setSelectedWeek(c.week);
                            setRankingPage(1);
                            (M = distributionRef.current) == null ||
                              M.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                              });
                          }}
                        >
                          <span className="exec-bar-track">
                            <i
                              style={{
                                height: (Math.max(0, sumUnits(c.rows)) / maxWeekUnits) * 100 + '%',
                              }}
                            />
                          </span>
                          <b>{periodText(c.week, multiYear)}</b>
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
                        {laborUnit}
                        {' según edad al registro'}
                      </p>
                    </div>
                  </div>
                  <div className="exec-age-list">
                    {AGE_BUCKETS.map((c) => {
                      const M = laborRows.filter((U) => ageBucket(U.ageDays) === c);
                      return (
                        <button
                          key={c}
                          disabled={!M.length}
                          onClick={() => {
                            setAgeFilter(c);
                            setSelectedWeek(null);
                            setRankingPage(1);
                          }}
                        >
                          <span>{c}</span>
                          <b>
                            {formatNumber(sumUnits(M))}
                            <small>{laborUnit}</small>
                          </b>
                        </button>
                      );
                    })}
                  </div>
                  {ageFilter !== 'all' && (
                    <button className="exec-more" onClick={() => setAgeFilter('all')}>
                      Ver todas las edades
                    </button>
                  )}
                </section>
              </div>
              <section className="panel exec-distribution" ref={distributionRef}>
                <div className="panel-head">
                  <div>
                    <span className="exec-eyebrow">
                      {selectedWeek !== null ? periodLongText(selectedWeek, multiYear).toUpperCase() : 'DISTRIBUCIÓN DEL TRABAJO'}
                    </span>
                    <h3>{producer === 'all' ? '¿A qué productores atendimos?' : 'Trabajo por suerte'}</h3>
                    <p>
                      {laborDisplayName(laborSample)}
                      {' · '}
                      {laborUnit}
                      {producer !== 'all' && ' · ' + producer}
                    </p>
                  </div>
                  <button className="button secondary" onClick={exportDetailCsv}>
                    <ArrowDownToLine size={16} />
                    Exportar detalle
                  </button>
                </div>
                <div className="exec-breadcrumb">
                  {producer !== 'all' && (
                    <button
                      onClick={() => {
                        setProducer('all');
                        setHacienda('all');
                        setSearch('');
                        setRankingPage(1);
                      }}
                    >
                      <ArrowLeft size={15} />
                      Todos los productores
                    </button>
                  )}
                  <input
                    aria-label="Buscar productor o suerte"
                    placeholder={producer === 'all' ? 'Buscar productor…' : 'Buscar hacienda o suerte…'}
                    value={search}
                    onChange={(c) => {
                      setSearch(c.target.value);
                      setRankingPage(1);
                    }}
                  />
                  <span>
                    {ranking.length} {producer === 'all' ? 'productores' : 'suertes'}
                  </span>
                </div>
                <div className="exec-ranking">
                  {ranking.slice((currentRankingPage - 1) * 12, currentRankingPage * 12).map(([c, M], U) => (
                    <div key={c} className="exec-rank-row">
                      <span className="exec-rank-num">{(currentRankingPage - 1) * 12 + U + 1}</span>
                      <button
                        className="exec-rank-main"
                        onClick={() => {
                          producer === 'all'
                            ? (setProducer(c), setHacienda('all'), setSearch(''), setRankingPage(1))
                            : openDetail(M);
                        }}
                      >
                        <span>
                          <strong>{c.replace(' · titular sin confirmar', '')}</strong>
                          <small>
                            {producer === 'all' ? countDistinct(M, lotLabel) + ' suertes · ' : ''}
                            {countDistinct(M, periodOfRow)}
                            {' semanas'}
                            {M.some((ee) => ee.producer.includes('titular sin confirmar')) ? ' · agrupado por hacienda' : ''}
                          </small>
                        </span>
                        <span className="exec-rank-meter">
                          <i
                            style={{
                              width: (Math.max(0, sumUnits(M)) / maxRankingUnits) * 100 + '%',
                            }}
                          />
                        </span>
                      </button>
                      <b className="exec-rank-total">
                        {formatNumber(sumUnits(M))}
                        <small>{laborUnit}</small>
                      </b>
                      <button className="exec-evidence-link" onClick={() => openDetail(M)} aria-label={'Ver detalle de ' + c}>
                        Detalle
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                {!ranking.length && <p className="exec-empty">Sin coincidencias. Quite la búsqueda o la semana seleccionada.</p>}
                {rankingPages > 1 && (
                  <div className="pagination">
                    <button disabled={currentRankingPage === 1} onClick={() => setRankingPage(currentRankingPage - 1)}>
                      Anterior
                    </button>
                    <span>
                      {currentRankingPage}
                      {' / '}
                      {rankingPages}
                    </span>
                    <button disabled={currentRankingPage === rankingPages} onClick={() => setRankingPage(currentRankingPage + 1)}>
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
              <button className="button secondary" onClick={resetFilters}>
                Ver todo el período
              </button>
            </section>
          )}
        </>
      )}
      <footer className="exec-method">
        <p>Las HA representan trabajo acumulado, no superficie única. Cada labor conserva su propia unidad.</p>
        <details>
          <summary>Cómo se interpretan los datos, las aplicaciones y la edad</summary>
          <p>
            Las manuales usan los registros de ejecución de Nómina. Las mecanizadas usan el reporte SIAGRI disponible; sus fechas
            de registro no acreditan el día de ejecución. No se duplican las labores manuales con sus cobros.
          </p>
          <p>
            {'Aplicaciones: agrupación estimada por suerte, labor, servicio, unidad y origen, desde '}
            {startDate}. Se conservan los registros del mismo día juntos; se separan por pausas, ventana máxima o cambio de ciclo
            conocido. No se mezclan servicios distintos ni se convierten D/H, MJO u otras unidades en hectáreas. Los números de
            grupo se recalculan si cambia el historial o las reglas.
          </p>
          <p>
            Edad: días desde la siembra o último corte del maestro, el más reciente. Los ciclos históricos no disponibles se
            muestran “Sin edad”.
          </p>
        </details>
      </footer>
      {detailRows && (
        <>
          <div className="drawer-overlay" onClick={() => setDetailRows(null)} />
          <aside className="drawer exec-detail" role="dialog" aria-modal="true" aria-label="Detalle del trabajo realizado">
            <div className="drawer-head">
              <div>
                <span>TRABAJO REALIZADO / DETALLE</span>
                <h2>{detailRows[0].producer.replace(' · titular sin confirmar', '')}</h2>
              </div>
              <button aria-label="Cerrar detalle" onClick={() => setDetailRows(null)}>
                <X />
              </button>
            </div>
            <div className="drawer-body">
              <div className="exec-detail-total">
                <span>{laborDisplayName(detailRows[0])}</span>
                <strong>
                  {formatNumber(sumUnits(detailRows))}
                  <small>{detailRows[0].unit}</small>
                </strong>
                <p>
                  {countDistinct(detailRows, lotLabel)}
                  {' suertes · '}
                  {countDistinct(detailRows, periodOfRow)}
                  {' semanas'}
                </p>
              </div>
              {detailRows.slice((detailPage - 1) * 30, detailPage * 30).map((c) => (
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
                    {' · '}
                    {periodLongText(periodOfRow(c), true).toLowerCase()}
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
                  {c.source === 'Prefactura' && (
                    <small className="exec-tariff">
                      Tarifa cobrada {formatNumber(c.tariff ?? 0)} · total {formatCurrency(c.amount ?? 0)} · P.FACT{' '}
                      {c.pFact || '—'}
                    </small>
                  )}
                  <details>
                    <summary>Origen del registro</summary>
                    <p>
                      {c.sourceRow != null
                        ? [
                            c.source,
                            ' · ',
                            c.sourceSheet ?? 'REPORTE',
                            '!',
                            c.sourceRow,
                            c.sourceFile ? ' · ' + c.sourceFile : '',
                            ' · ',
                            c.name,
                          ]
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
                <button disabled={detailPage === 1} onClick={() => setDetailPage(detailPage - 1)}>
                  Anterior
                </button>
                <span>
                  {detailPage}
                  {' / '}
                  {Math.ceil(detailRows.length / 30)}
                </span>
                <button disabled={detailPage * 30 >= detailRows.length} onClick={() => setDetailPage(detailPage + 1)}>
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
