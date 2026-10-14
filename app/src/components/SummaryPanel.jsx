import { useMemo, useState } from 'react';
import { ChartColumn, CircleCheck, Database, FileSearch, History, ShieldCheck, TriangleAlert, Upload } from 'lucide-react';
import { FindingsTable } from './FindingsTable';
import { CheckItem } from './LoadPanel';
import { FlagBadges, StatusBadge } from './StatusBadge';
import {
  collectionState,
  coverageStats,
  findingPeriod,
  isBlockingPending,
  unitTotalsByState,
  weekSummaries,
  pendingBreakdown,
} from '../engine/indicators';
import { comparePeriods, parsePeriodKey } from '../engine/periods';
import { formatCurrency, formatNumber } from '../lib/format';
import { periodLongText, periodText } from '../lib/labels';

const DRILL_TITLES = {
  pending: 'Pendientes de cobro',
  unpaid: 'Nómina sin prefacturar',
  partial: 'Cobros parciales',
  covered: 'Cobrado / cubierto',
  excess: 'Cobros en exceso · seguimiento',
  followups: 'Observaciones secundarias',
  duplicates: 'Posibles duplicados de Prefactura',
  all: 'Casos de Nómina',
};

const comparePeriodKeys = (a, b) =>
  parsePeriodKey(a) && parsePeriodKey(b) ? comparePeriods(a, b) : String(a).localeCompare(String(b));

export function SummaryPanel({ analysis, inputs, quality = [], multiYear, onNavigate, onSelect }) {
  const [fromPeriod, setFromPeriod] = useState('');
  const [toPeriod, setToPeriod] = useState('');
  const [hacienda, setHacienda] = useState('all');
  const [laborService, setLaborService] = useState('all');
  const [drill, setDrill] = useState('');
  const [drillPeriod, setDrillPeriod] = useState(null);

  const findings = analysis?.findings ?? [];
  const periods = useMemo(
    () => [...new Set(findings.filter((f) => f.type !== 'EXCLUDED').map(findingPeriod))].sort(comparePeriodKeys),
    [findings],
  );
  const inPeriod = findings.filter(
    (f) =>
      (!fromPeriod || comparePeriodKeys(findingPeriod(f), fromPeriod) >= 0) &&
      (!toPeriod || comparePeriodKeys(findingPeriod(f), toPeriod) <= 0),
  );
  const haciendas = [...new Set(inPeriod.filter((f) => f.type !== 'EXCLUDED').map((f) => f.hacienda))].sort();
  const inHacienda = inPeriod.filter((f) => hacienda === 'all' || f.hacienda === hacienda);
  const laborServices = [
    ...new Map(inHacienda.filter((f) => f.type !== 'EXCLUDED').map((f) => [f.labor + '|' + f.service, f])).entries(),
  ].sort(([, a], [, b]) => a.labor.localeCompare(b.labor) || a.service.localeCompare(b.service));
  const scoped = inHacienda.filter((f) => laborService === 'all' || f.labor + '|' + f.service === laborService);

  const openDrill = (kind, period = null) => {
    setDrill(kind);
    setDrillPeriod(period);
    setTimeout(() => document.getElementById('summary-drill')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const resetFilters = () => {
    setFromPeriod('');
    setToPeriod('');
    setHacienda('all');
    setLaborService('all');
    setDrillPeriod(null);
    setDrill('');
  };

  if (!analysis) {
    return (
      <div className="welcome">
        <div className="welcome-copy">
          <span className="eyebrow">CONTROL SEMANAL CASUR</span>
          <h2>Verifique que cada labor de Nómina haya sido cobrada correctamente.</h2>
          <p>
            Importe los reportes originales de SIAGRI. La aplicación concilia unidades, reconoce paquetes TPS, clasifica
            contratistas y conserva la evidencia de cada revisión.
          </p>
          <div className="welcome-actions">
            <button className="button primary large" onClick={() => onNavigate('load')}>
              <Upload size={18} /> Cargar archivos
            </button>
            <span>
              <ShieldCheck /> Base preparada para varios dispositivos
            </span>
          </div>
        </div>
        <div className="welcome-visual">
          <div className="visual-card">
            <Database />
            <strong>{inputs.files.length}/4</strong>
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
  }

  const payrollCases = scoped.filter((f) => f.type === 'DIRECT' || f.type === 'TPS');
  const coverage = coverageStats(payrollCases);
  const followups = scoped.filter(
    (f) => !isBlockingPending(f) && f.type !== 'EXCLUDED' && (f.severity === 'warning' || f.status === 'COBRO_EXCESO'),
  );
  const excess = payrollCases.filter((f) => f.status === 'COBRO_EXCESO' && collectionState(f) === 'COBRADO');
  const duplicates = scoped.filter((f) =>
    ['DUPLICADO_POTENCIAL', 'REPETICION_RESPALDADA', 'COBRO_EN_OTRA_PREFACTURA'].some((flag) => (f.flags ?? []).includes(flag)),
  );
  const pendingUnits = unitTotalsByState(payrollCases, 'pending');
  const excessUnits = unitTotalsByState(payrollCases, 'excess');
  const pendingAmountBilled = scoped.reduce((total, f) => total + (f.amount || 0), 0);

  const drillRows = (() => {
    let list;
    if (drill === 'excess') list = excess;
    else if (drill === 'followups') list = followups;
    else if (drill === 'duplicates') list = duplicates;
    else {
      list = payrollCases.filter((f) => {
        const state = collectionState(f);
        if (drill === 'unpaid') return state === 'SIN_COBRO';
        if (drill === 'partial') return state === 'PARCIAL';
        if (drill === 'covered') return state === 'COBRADO';
        if (drill === 'all') return state !== 'SIN_BASE_NOMINA';
        return isBlockingPending(f);
      });
    }
    return list.filter((f) => drillPeriod === null || findingPeriod(f) === drillPeriod);
  })();

  const priority = payrollCases.filter(isBlockingPending).slice(0, 8);
  const pendingWeeks = weekSummaries({ findings: scoped }).filter((week) => week.pending > 0);
  const breakdown = pendingBreakdown({ findings: scoped, coverage: analysis.coverage });
  const billedPeriods = new Set(analysis.coverage.billedPeriods ?? []);
  const hasCoverageInfo = billedPeriods.size > 0;
  const qualityIssues = quality.filter((item) => item.severity !== 'info');

  return (
    <>
      <div className="period-strip">
        <div>
          <History />
          <span>
            Período visible
            <strong>
              {periodText(fromPeriod || periods[0], multiYear) || '—'} –{' '}
              {periodText(toPeriod || periods.at(-1), multiYear) || '—'}
              {hacienda !== 'all' ? ' · ' + hacienda : ''}
            </strong>
          </span>
        </div>
        <div>
          Archivos completos: {analysis.coverage.payrollRows.toLocaleString('es-NI')} filas Nómina ·{' '}
          {analysis.coverage.prefacturaRows.toLocaleString('es-NI')} filas Prefactura
          {analysis.startPeriod ? ` · desde ${periodLongText(analysis.startPeriod, true)}` : ''}
        </div>
      </div>
      <div className="summary-filters">
        <label>
          Semana desde
          <select
            value={fromPeriod}
            onChange={(event) => {
              setFromPeriod(event.target.value);
              setHacienda('all');
              setLaborService('all');
              setDrillPeriod(null);
            }}
          >
            <option value="">Todas</option>
            {periods.map((period) => (
              <option key={period} value={period}>
                {periodLongText(period, multiYear)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Semana hasta
          <select
            value={toPeriod}
            onChange={(event) => {
              setToPeriod(event.target.value);
              setHacienda('all');
              setLaborService('all');
              setDrillPeriod(null);
            }}
          >
            <option value="">Todas</option>
            {periods.map((period) => (
              <option key={period} value={period}>
                {periodLongText(period, multiYear)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hacienda
          <select
            value={hacienda}
            onChange={(event) => {
              setHacienda(event.target.value);
              setLaborService('all');
            }}
          >
            <option value="all">Todas las haciendas</option>
            {haciendas.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Labor / servicio
          <select value={laborService} onChange={(event) => setLaborService(event.target.value)}>
            <option value="all">Todas las labores</option>
            {laborServices.map(([key, finding]) => (
              <option key={key} value={key}>
                {finding.labor} · {finding.service}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary" onClick={resetFilters}>
          Restablecer
        </button>
      </div>
      {fromPeriod && toPeriod && comparePeriodKeys(fromPeriod, toPeriod) > 0 && (
        <p role="alert">La semana inicial debe ser menor o igual a la final.</p>
      )}
      <div className="kpi-grid">
        <SummaryKpi
          title="Cobertura de cobro"
          value={coverage.base ? `${formatNumber(coverage.percent, 1)}%` : '—'}
          note={`${coverage.covered} de ${coverage.base} casos de Nómina cubiertos · ver detalle`}
          tone="green"
          icon={CircleCheck}
          onClick={() => openDrill('all')}
        />
        <SummaryKpi
          title="Sin prefacturar"
          value={coverage.unpaid.toString()}
          note={
            hasCoverageInfo
              ? `${breakdown.inBilledWeeks} en semanas ya prefacturadas · ${breakdown.inUnbilledWeeks} en semanas aún sin Prefactura (después de ${periodText(breakdown.lastBilledPeriod, multiYear)}) · ver detalle`
              : 'Nómina sin cobro acreditado · ver detalle'
          }
          tone="red"
          icon={TriangleAlert}
          onClick={() => openDrill('unpaid')}
        />
        <SummaryKpi
          title="Cobro parcial"
          value={coverage.partial.toString()}
          note="Falta cobrar parte de las unidades · ver detalle"
          tone="red"
          icon={FileSearch}
          onClick={() => openDrill('partial')}
        />
        <SummaryKpi
          title="Cobrado / cubierto"
          value={coverage.covered.toString()}
          note={`Incluye cobros con exceso u observación · ${formatCurrency(pendingAmountBilled)} prefacturado en la vista`}
          tone="green"
          icon={ChartColumn}
          onClick={() => openDrill('covered')}
        />
      </div>
      <div className="collection-lanes">
        <button className="collection-lane pending" onClick={() => openDrill('pending')}>
          <span>POR GESTIONAR · PRIORIDAD</span>
          <strong>
            {coverage.unpaid + coverage.partial} <small>casos pendientes</small>
          </strong>
          <p>
            {coverage.unpaid} sin prefacturar · {coverage.partial} parciales
          </p>
          <div>
            {pendingUnits.map(([unit, units]) => (
              <b key={unit}>
                {formatNumber(units)} {unit}
                <small>por cobrar</small>
              </b>
            ))}
          </div>
          <em>Ver pendientes y evidencia →</em>
        </button>
        <button className="collection-lane excess" onClick={() => openDrill('excess')}>
          <span>YA COBRADO · SEGUIMIENTO</span>
          <strong>
            {excess.length} <small>casos con exceso</small>
          </strong>
          <p>No reducen la cobertura ni bloquean el cierre por sí solos.</p>
          <div>
            {excessUnits.map(([unit, units]) => (
              <b key={unit}>
                +{formatNumber(units)} {unit}
                <small>sobre Nómina</small>
              </b>
            ))}
          </div>
          <em>Ver excesos y evidencia →</em>
        </button>
      </div>
      {(analysis.duplicateExtraRows > 0 || duplicates.length > 0) && (
        <button className="alert-strip warning" onClick={() => openDrill('duplicates')}>
          <TriangleAlert size={18} />
          <span>
            <strong>Posibles duplicados en Prefactura (incluidos en el total, sin descontar):</strong>{' '}
            {analysis.duplicateExtraRows ?? analysis.duplicateGroups} copia(s) exacta(s) por{' '}
            {formatCurrency(analysis.duplicateExtraAmount ?? 0)}
            {analysis.repetitions?.COBRO_EN_OTRA_PREFACTURA?.extraRows > 0 &&
              ` · ${analysis.repetitions.COBRO_EN_OTRA_PREFACTURA.extraRows} cobro(s) repetido(s) en otra prefactura por ${formatCurrency(analysis.repetitions.COBRO_EN_OTRA_PREFACTURA.extraAmount)}`}
            . {duplicates.length} caso(s) conciliable(s) afectados en esta vista. No se eliminan: revise si son doble registro.
          </span>
          <em>Ver casos →</em>
        </button>
      )}
      <p className="summary-method">
        Casos agrupados por año operativo, semana, suerte y servicio. Cantidades separadas por unidad; las cifras cambian con los
        filtros. La cobertura cuenta casos, no unidades. Un exceso ya está incluido en “Cobrado / cubierto”.
      </p>
      {drill && (
        <section id="summary-drill" className="panel summary-drill">
          <div className="panel-head">
            <div>
              <h2>
                {DRILL_TITLES[drill]}
                {drillPeriod !== null ? ' · ' + periodLongText(drillPeriod, multiYear) : ''}
              </h2>
              <p>{drillRows.length} casos según los filtros del resumen. Seleccione una fila para abrir la evidencia.</p>
            </div>
            <button className="button secondary" onClick={() => setDrill('')}>
              Cerrar detalle
            </button>
          </div>
          <FindingsTable
            key={[drill, drillPeriod, fromPeriod, toPeriod, hacienda, laborService].join('|')}
            rows={drillRows}
            onSelect={onSelect}
            multiYear={multiYear}
            exportName={`resumen_${drill}`}
          />
        </section>
      )}
      <details className="collection-followups">
        <summary>Otras observaciones y excesos · {followups.length} casos de seguimiento</summary>
        <p>Estas observaciones no se contabilizan como Nómina sin cobro ni reducen por sí solas la cobertura.</p>
        <button className="button secondary" onClick={() => openDrill('followups')}>
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
            {!pendingWeeks.length && <p>No hay semanas con pendientes bloqueantes.</p>}
            {pendingWeeks.map((week) => (
              <button
                key={week.period}
                className="week-bar"
                onClick={() => openDrill('pending', week.period)}
                aria-label={`Ver ${week.pending} pendientes de ${periodLongText(week.period, multiYear)}`}
              >
                <div className="bar-track">
                  <span
                    className={hasCoverageInfo && !billedPeriods.has(week.period) ? 'bar-unbilled' : ''}
                    style={{ height: `${Math.max(5, week.total ? (week.pending / week.total) * 100 : 0)}%` }}
                  />
                </div>
                <strong>{periodText(week.period, multiYear)}</strong>
                <small>{week.pending}</small>
              </button>
            ))}
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-red" /> Sin cobro o cobro parcial en semana ya prefacturada
            </span>
            {hasCoverageInfo && (
              <span>
                <i className="legend-unbilled" /> Semana aún sin Prefactura
              </span>
            )}
            <span>Haga clic en una semana para investigar</span>
          </div>
        </section>
        {hasCoverageInfo && breakdown.periods.length > 0 && (
          <section className="panel pending-breakdown">
            <div className="panel-head">
              <div>
                <h2>Pendientes por semana y cobertura de Prefactura</h2>
                <p>
                  Última semana con Prefactura: {periodLongText(breakdown.lastBilledPeriod, true)}. Los pendientes de semanas
                  posteriores no son necesariamente faltas de cobro: el reporte todavía no las cubre.
                </p>
              </div>
            </div>
            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th>Prefactura</th>
                    <th className="num">Sin cobro</th>
                    <th className="num">Parcial</th>
                    <th>Unidades pendientes</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.periods.map((entry) => (
                    <tr key={entry.period} className="clickable" onClick={() => openDrill('pending', entry.period)}>
                      <td>
                        <strong>{periodLongText(entry.period, multiYear)}</strong>
                      </td>
                      <td>{entry.covered ? 'Prefacturada' : <span className="flag flag-info">Aún sin Prefactura</span>}</td>
                      <td className="num">{entry.unpaid}</td>
                      <td className="num">{entry.partial}</td>
                      <td>
                        {Object.entries(entry.byUnit)
                          .map(([unit, units]) => `${formatNumber(units)} ${unit}`)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section className="panel health-panel">
          <div className="panel-head">
            <div>
              <h2>Salud de la carga</h2>
              <p>Archivos completos · estos controles no cambian con los filtros</p>
            </div>
          </div>
          <CheckItem label="Archivos reconocidos" value={`${inputs.files.length} de 4`} ok={inputs.files.length >= 3} />
          <CheckItem
            label="Nómina procesada"
            value={`${analysis.coverage.payrollRows.toLocaleString('es-NI')} filas`}
            ok={true}
          />
          <CheckItem
            label="Prefactura procesada"
            value={`${analysis.coverage.prefacturaRows.toLocaleString('es-NI')} filas`}
            ok={true}
          />
          <CheckItem
            label="Servicios sin clasificar"
            value={analysis.unknownServices.length.toString()}
            ok={!analysis.unknownServices.length}
          />
          <CheckItem
            label="Repeticiones para revisar"
            value={analysis.duplicateGroups.toString()}
            ok={!analysis.duplicateGroups}
          />
          <CheckItem label="Mecanizadas separadas" value={analysis.mechanizedRows.toLocaleString('es-NI')} ok={true} />
          <CheckItem label="Alertas de calidad de datos" value={qualityIssues.length.toString()} ok={!qualityIssues.length} />
          {quality.length > 0 && (
            <button className="link-button" onClick={() => onNavigate('load')}>
              Ver calidad de datos →
            </button>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Atención prioritaria</h2>
            <p>Solo Nómina sin cobro o con unidades pendientes. Los excesos no se incluyen aquí.</p>
          </div>
          <button className="link-button" onClick={() => onNavigate('reconciliation')}>
            Ver conciliación completa
          </button>
        </div>
        {priority.length ? (
          <div className="priority-list">
            {priority.map((finding) => (
              <button key={finding.id} onClick={() => onSelect(finding)}>
                <span className={`priority-dot ${finding.severity}`} />
                <span>
                  <strong>
                    {finding.hacienda} · {finding.suerte}
                  </strong>
                  <small>
                    {periodLongText(findingPeriod(finding), multiYear)} · {finding.service} ·{' '}
                    {finding.pFacts.join(', ') || 'sin P.FACT'}
                  </small>
                </span>
                <span>
                  <StatusBadge status={finding.status} severity={finding.severity} />
                  <FlagBadges flags={finding.flags} />
                </span>
                <b>
                  {formatNumber(finding.difference)} {finding.unit}
                </b>
              </button>
            ))}
          </div>
        ) : (
          <div className="all-clear">
            <CircleCheck /> No hay casos prioritarios.
          </div>
        )}
      </section>
    </>
  );
}

function SummaryKpi({ title, value, note, tone, icon: Icon, onClick }) {
  const content = (
    <>
      <div className={`kpi-icon ${tone}`}>
        <Icon />
      </div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </>
  );
  return onClick ? (
    <button className="kpi kpi-action" onClick={onClick}>
      {content}
    </button>
  ) : (
    <article className="kpi">{content}</article>
  );
}
