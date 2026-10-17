import { useMemo, useState } from 'react';
import { AuditPanel } from '../AuditPanel';
import { EmptyState, Panel } from '../common';
import { AuditWorkQueue, caseExplanation, caseNextStep, caseType } from './AuditWorkQueue';
import { DataTable } from '../common/DataTable';
import { DrillDrawer } from '../drill/DrillDrawer';
import { Field, LineFields } from '../drill/LineFields';
import { analyzeTariffs, AUDIT_DEFAULTS, AUDIT_RULES, filterAuditRows } from '../../engine/audit/tariffAudit';
import { FINANCE_UNIVERSES } from '../../engine/finance';
import { formatCurrency, formatNumber } from '../../lib/format';
import './tariff-audit.css';

const number = (value) => (value == null || !Number.isFinite(value) ? 'No disponible' : formatNumber(value, 4));
const amount = (value) => (value == null || !Number.isFinite(value) ? 'No disponible' : formatCurrency(value));
const percent = (value) => (value == null ? 'Sin ambos períodos' : `${value > 0 ? '+' : ''}${formatNumber(value)} %`);
const range = (side) => (side.from ? `${side.from} → ${side.to}` : 'Sin registros disponibles');
const total = (rows) => rows.reduce((value, row) => value + (Number.isFinite(row.total) ? row.total : 0), 0);
const categories = {
  all: 'Todas las líneas',
  observed: 'Con indicadores para revisar',
  EXTREME: 'Extremos prioritarios',
  statistical: 'Atípicas estadísticas',
  PRESENTATION: 'Presentación SIAGRI',
  repeated: 'Repeticiones documentales',
  insufficient: 'Sin referencia suficiente',
  INPUT: 'Datos sin respaldo suficiente',
  NON_POSITIVE: 'Ceros o negativos',
};
const DEFAULT_FILTERS = { search: '', category: 'observed', service: '', unit: '', contractorCode: '', universe: '', month: '' };
const VIEWS = {
  summary: 'Qué revisar',
  rates: 'Comparar tarifas',
  discrepancies: 'Todos los cobros',
  history: 'Historial y cierres',
};

function LineTable({ rows, onOpen, tableKey = 'lines', compact = false }) {
  return (
    <DataTable
      key={tableKey}
      rows={rows}
      rowKey={(row) => row.auditId}
      pageSize={compact ? 6 : 20}
      onRowClick={onOpen}
      columns={[
        { key: 'sourceRow', label: 'Fila', num: true },
        { key: 'period', label: 'Semana' },
        {
          key: 'hacienda',
          label: 'Hacienda · suerte',
          render: (row) => (
            <span className="drill-wrap">
              {row.hacienda} · {row.suerte}
            </span>
          ),
        },
        { key: 'service', label: 'Labor · servicio', render: (row) => `${row.labor} · ${row.service}` },
        { key: 'unit', label: 'UM' },
        { key: 'tariff', label: 'T. reportada', num: true, render: (row) => number(row.tariff) },
        { key: 'effective', label: 'T. efectiva', num: true, render: (row) => number(row.effective) },
        {
          key: 'total',
          label: 'Importe SIAGRI',
          num: true,
          render: (row) => amount(row.total),
          total: (list) => amount(total(list)),
        },
        { key: 'pFact', label: 'P.FACT' },
        {
          key: 'observations',
          label: 'Indicadores',
          value: (row) => row.observations.length,
          render: (row) => (
            <span className="audit-signals">
              {row.observations.length
                ? [...new Set(row.observations.map((item) => AUDIT_RULES[item.rule]))].join(' · ')
                : row.referenceSufficient
                  ? 'Sin señal detectada'
                  : 'Sin referencia suficiente'}
            </span>
          ),
        },
      ].filter((column) => !compact || ['sourceRow', 'service', 'tariff', 'effective', 'pFact'].includes(column.key))}
    />
  );
}

export function TariffAuditPanel(props) {
  const { inputs } = props;
  const [view, setView] = useState('summary');
  const [config, setConfig] = useState(AUDIT_DEFAULTS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [stack, setStack] = useState(null);
  const [seriesKey, setSeriesKey] = useState('');
  const audit = useMemo(() => analyzeTariffs(inputs.prefactura, config), [inputs.prefactura, config]);
  const rows = useMemo(() => filterAuditRows(audit.rows, filters), [audit, filters]);
  const changeFilter = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }));
  const showCategory = (category) => {
    setFilters({ ...DEFAULT_FILTERS, category });
    setView('discrepancies');
  };
  const openGroup = (list, title) => setStack([{ title, rows: list, kind: 'group', dimension: 'producerName' }]);
  const openLine = (row) => setStack([{ title: `Prefactura · fila ${row.sourceRow}`, kind: 'line', row }]);
  const source = inputs.files?.find((file) => file.kind === 'prefactura');
  const series = audit.history.find((item) => item.key === seriesKey) ?? audit.history[0];
  const periods = audit.populations.filter((item) => item.comparableKey === series?.key);

  return (
    <div className="tariff-audit-module">
      <nav className="exec-local-nav" aria-label="Vistas de auditoría">
        {Object.entries(VIEWS).map(([key, label]) => (
          <button
            key={key}
            aria-current={view === key ? 'page' : undefined}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === 'history' ? (
        <AuditPanel {...props} />
      ) : (
        <>
          <section className="audit-scope" aria-label="Alcance de la auditoría">
            <div>
              <span className="audit-eyebrow">PREFACTURA SIAGRI · ANÁLISIS EXPLORATORIO</span>
              <h2>Revisión de cobros de Prefactura</h2>
              <p>Encuentra tarifas inusuales y consulta el cobro original. No son errores confirmados.</p>
            </div>
            <div className="audit-coverage">
              <strong>{range(audit.coverage)}</strong>
              <span>{audit.summary.lines.toLocaleString('es-NI')} líneas · fechas reales de Prefactura</span>
              <small>Importes informados, no pagos confirmados</small>
            </div>
          </section>
          {!audit.rows.length ? (
            <EmptyState
              title="Cargue una Prefactura SIAGRI"
              text="Esta auditoría utiliza las filas de Prefactura disponibles. No requiere Nómina ni una conciliación ejecutada."
            />
          ) : (
            <>
              {view === 'summary' && (
                <AuditWorkQueue
                  audit={audit}
                  onOpenLine={openLine}
                  onShowCategory={showCategory}
                  onOpenGroup={openGroup}
                  onViewRates={() => setView('rates')}
                />
              )}
              {view === 'rates' && (
                <Panel
                  title="Tarifas y vigencias observadas"
                  subtitle="Mes calendario de la fecha de Prefactura; no representa una vigencia contractual ni necesariamente el día de ejecución."
                >
                  <label className="audit-series">
                    <span>Serie comparable</span>
                    <select value={series?.key ?? ''} onChange={(event) => setSeriesKey(event.target.value)}>
                      {audit.history.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.service} · {item.labor} · {item.unit} · {item.contractorCode || 'Sin contratista'} ·{' '}
                          {FINANCE_UNIVERSES[item.universe]} · {item.jornada} · {item.billingBase}
                        </option>
                      ))}
                    </select>
                  </label>
                  {series && (
                    <>
                      <p className="audit-note">
                        Comparación dentro de la misma serie. Las medianas excluyen copias exactas; las líneas e importes
                        originales permanecen completos. Jornada/base no informada implica una comparación exploratoria,
                        potencialmente mixta.
                      </p>
                      <div className="audit-comparison">
                        {[
                          ['before', `Antes de ${config.cutoff}`],
                          ['after', `Desde ${config.cutoff}`],
                        ].map(([key, label]) => (
                          <button
                            key={key}
                            className="audit-period-card"
                            onClick={() =>
                              openGroup(
                                audit.rows.filter((row) => series[key].rowIds.includes(row.auditId)),
                                label,
                              )
                            }
                            disabled={!series[key].rows}
                          >
                            <span>{label}</span>
                            <strong>{number(series[key].effectiveMedian)}</strong>
                            <small>Mediana efectiva · {number(series[key].reportedMedian)} reportada</small>
                            <small>
                              {range(series[key])} · {series[key].samples} muestras positivas
                            </small>
                          </button>
                        ))}
                        <div className="audit-period-card">
                          <span>Cambio observado de medianas</span>
                          <strong>{percent(series.effectiveChange)}</strong>
                          <small>Efectiva · reportada {percent(series.reportedChange)}</small>
                          <small>
                            {series.sufficient
                              ? 'Muestras suficientes; composición/jornada por verificar'
                              : 'Muestra limitada o falta uno de los períodos'}
                          </small>
                        </div>
                      </div>
                      <p className="audit-history-help">
                        Mira cómo cambió la tarifa típica observada por mes, para el mismo servicio, unidad y contratista.
                        No es una tarifa aprobada. Toca un mes para ver las muestras, sus límites y el origen.
                      </p>
                      <div className="audit-history-table">
                        <DataTable
                          key={series.key}
                          rows={periods}
                          onRowClick={(group) =>
                            openGroup(
                              audit.rows.filter((row) => row.populationKey === group.key),
                              `Comparables · ${group.service} · ${group.month}`,
                            )
                          }
                          columns={[
                            { key: 'month', label: 'Mes observado' },
                            {
                              key: 'reported',
                              label: 'Tarifa mostrada típica',
                              num: true,
                              value: (group) => group.reported.median,
                              render: (group) => number(group.reported.median),
                            },
                            {
                              key: 'effective',
                              label: 'Tarifa efectiva típica',
                              num: true,
                              value: (group) => group.effective.median,
                              render: (group) => number(group.effective.median),
                            },
                            { key: 'rows', label: 'Líneas originales', num: true },
                            {
                              key: 'n',
                              label: 'Muestras efectivas',
                              num: true,
                              value: (group) => group.effective.n,
                              render: (group) => group.effective.n,
                            },
                            {
                              key: 'mad',
                              label: 'MAD efectiva',
                              num: true,
                              value: (group) => group.effective.mad,
                              render: (group) => number(group.effective.mad),
                            },
                            {
                              key: 'reference',
                              label: 'Referencia',
                              render: (group) =>
                                group.effective.sufficient
                                  ? `${number(group.effective.lower)} → ${number(group.effective.upper)} · exploratoria`
                                  : group.effective.reason,
                            },
                          ]}
                        />
                      </div>
                    </>
                  )}
                </Panel>
              )}
              {view === 'discrepancies' && (
                <Panel
                  title="Discrepancias e indicadores"
                  subtitle="Una fila por registro original, aunque active varias señales. La búsqueda no recalibra la referencia."
                >
                  <div className="audit-filters">
                    <label className="audit-search">
                      <span>Buscar evidencia</span>
                      <input
                        value={filters.search}
                        onChange={(event) => changeFilter('search', event.target.value)}
                        placeholder="Productor, hacienda, suerte, labor, semana, P.FACT, fila…"
                      />
                    </label>
                    <label>
                      <span>Indicador</span>
                      <select value={filters.category} onChange={(event) => changeFilter('category', event.target.value)}>
                        {Object.entries(categories).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {[
                      ['service', 'Servicio'],
                      ['unit', 'UM'],
                      ['contractorCode', 'Contratista'],
                      ['universe', 'Universo'],
                      ['month', 'Mes'],
                    ].map(([key, label]) => (
                      <label key={key}>
                        <span>{label}</span>
                        <select value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)}>
                          <option value="">Todos</option>
                          {[...new Set(audit.rows.map((row) => row[key]).filter(Boolean))].sort().map((value) => (
                            <option key={value} value={value}>
                              {key === 'universe' ? FINANCE_UNIVERSES[value] : value}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <button className="button ghost" onClick={() => setFilters({ ...DEFAULT_FILTERS, category: 'all' })}>
                      Restablecer filtros
                    </button>
                  </div>
                  <p className="audit-result" data-audit-count={rows.length}>
                    {rows.length.toLocaleString('es-NI')} líneas distintas · {amount(total(rows))} informado en la selección ·
                    diferencia económica no verificable.
                  </p>
                  <LineTable rows={rows} onOpen={openLine} tableKey={JSON.stringify(filters)} />
                  <button
                    className="button secondary"
                    disabled={!rows.length}
                    onClick={() => openGroup(rows, categories[filters.category])}
                  >
                    Desglosar selección
                  </button>
                </Panel>
              )}
              <details className="panel audit-method">
                <summary>Metodología, configuración local y límites de la fuente</summary>
                <p>
                  Referencia fija de toda la Prefactura por servicio + labor + UM + contratista + universo + mes + jornada/base si
                  se conocen. Mínimo {config.minSamples} muestras positivas en {config.minWeeks} semanas operativas. Intervalo:
                  mediana ± máximo de ({config.robustZ} × 1,4826 × MAD, {config.zeroMadRelative * 100} % de la mediana,{' '}
                  {config.rateTolerance}). MAD es la mediana de las desviaciones absolutas. Extremos: razón menor que 1/
                  {config.extremeRatio} o mayor que {config.extremeRatio}. Estas señales no son exigencias contractuales.
                </p>
                <p>
                  {audit.summary.excludedTrainingCopies} copias exactas excluidas solo del entrenamiento. Las repeticiones entre
                  P.FACT requieren respaldo; las coincidencias con distinta tarifa pueden representar jornadas distintas. No se
                  suman señales como si fueran nuevos importes.
                </p>
                <p>
                  Archivo: {source?.name || 'Origen por línea'} · SHA-256: <code>{source?.hash || 'No disponible'}</code>.{' '}
                  {source?.skippedRows ?? 0} filas descartadas por el importador actual; no forman parte de esta auditoría. El
                  importador puede convertir tarifa/importe vacío o inválido a cero; la celda cruda no se conserva. Verifique el
                  Excel original para resolverlo.
                </p>
                <p>
                  Faltan tarifario autorizado, jornada/base confirmada y documentación definitiva. No se reconstruye «Cambios de
                  pagos y cobros» ni se usan estados de Revisión por Correo como dictamen económico. El botón Excel superior
                  conserva el informe general de conciliación, no exporta este análisis exploratorio.
                </p>
                <form
                  className="audit-settings"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    setConfig({ ...config, minSamples: Number(data.get('minSamples')), robustZ: Number(data.get('robustZ')) });
                    setStack(null);
                  }}
                >
                  <label>
                    <span>Mínimo de muestras</span>
                    <input
                      name="minSamples"
                      type="number"
                      min="3"
                      max="1000"
                      step="1"
                      defaultValue={config.minSamples}
                      required
                    />
                  </label>
                  <label>
                    <span>Umbral robusto</span>
                    <input name="robustZ" type="number" min="1" max="20" step="0.1" defaultValue={config.robustZ} required />
                  </label>
                  <button className="button secondary">Recalcular auditoría</button>
                  <small>Solo esta sesión y este módulo; no cambia parámetros de conciliación ni cierres.</small>
                </form>
              </details>
            </>
          )}
        </>
      )}
      {stack && <AuditDetail stack={stack} setStack={setStack} audit={audit} source={source} />}
    </div>
  );
}

function AuditDetail({ stack, setStack, audit, source }) {
  const current = stack.at(-1);
  const push = (level) => setStack([...stack, level]);
  const openLine = (row) =>
    push({ title: `Prefactura · fila ${row.sourceRow}`, crumb: `Fila ${row.sourceRow}`, kind: 'line', row });
  const openRows = (rows, title) => push({ title, rows, kind: 'group', dimension: 'lines' });
  const row = current.row;
  const population = row && audit.populations.find((item) => item.key === row.populationKey);
  const dimensions = {
    producerName: 'Productor',
    hacienda: 'Hacienda',
    suerte: 'Suerte',
    labor: 'Labor',
    service: 'Servicio',
    period: 'Semana',
    pFact: 'P.FACT',
    lines: 'Líneas',
  };
  const groups = useMemo(() => {
    if (current.kind !== 'group' || current.dimension === 'lines') return [];
    const grouped = new Map();
    current.rows.forEach((item) => {
      const dimension = current.dimension;
      // Nunca fusionar suertes de fincas diferentes ni P.FACT de productores/años diferentes.
      const parts =
        dimension === 'suerte'
          ? [item.hacienda, item.suerte]
          : dimension === 'pFact'
            ? [item.year, item.producerCode || item.producerName, item.pFact]
            : dimension === 'producerName'
              ? [item.producerCode, item.producerName]
              : [item[dimension]];
      const key = JSON.stringify(parts);
      if (!grouped.has(key))
        grouped.set(key, { key, label: parts.filter(Boolean).join(' · ') || 'Sin dato', rows: [], total: 0 });
      const group = grouped.get(key);
      group.rows.push(item);
      group.total += Number.isFinite(item.total) ? item.total : 0;
    });
    return [...grouped.values()];
  }, [current]);
  return (
    <DrillDrawer
      eyebrow="Evidencia de auditoría · sin dictamen económico"
      stack={stack}
      onBack={() => setStack(stack.slice(0, -1))}
      onJump={(index) => setStack(stack.slice(0, index + 1))}
      onClose={() => setStack(null)}
    >
      {current.kind === 'group' ? (
        <div className="audit-detail">
          <div className="detail-grid">
            <Field label="Importe SIAGRI de líneas distintas">
              <span data-audit-total={total(current.rows)}>{amount(total(current.rows))}</span>
            </Field>
            <Field label="Líneas originales">{current.rows.length}</Field>
          </div>
          <p className="audit-note">
            Importe informado, no pago confirmado ni diferencia exigible. Cambiar el desglose no cambia los comparables.
          </p>
          <div className="segmented drill-tabs" aria-label="Desglose de auditoría">
            {Object.entries(dimensions).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={current.dimension === key}
                onClick={() => setStack([...stack.slice(0, -1), { ...current, dimension: key }])}
              >
                {label}
              </button>
            ))}
          </div>
          {current.dimension === 'lines' ? (
            <LineTable rows={current.rows} onOpen={openLine} tableKey={current.title} />
          ) : (
            <DataTable
              key={`${stack.length}:${current.dimension}`}
              rows={groups}
              onRowClick={(group) =>
                push({
                  title: group.label,
                  rows: group.rows,
                  kind: 'group',
                  dimension:
                    current.dimension === 'producerName' ? 'hacienda' : current.dimension === 'hacienda' ? 'suerte' : 'lines',
                })
              }
              columns={[
                { key: 'label', label: dimensions[current.dimension] },
                {
                  key: 'count',
                  label: 'Líneas',
                  num: true,
                  value: (group) => group.rows.length,
                  render: (group) => group.rows.length,
                },
                {
                  key: 'total',
                  label: 'Importe SIAGRI',
                  num: true,
                  render: (group) => amount(group.total),
                  total: (list) => amount(list.reduce((value, group) => value + group.total, 0)),
                },
              ]}
            />
          )}
        </div>
      ) : (
        <div className="audit-detail">
          <p className="audit-note">
            Tarifa autorizada no disponible / importe esperado no verificable. Una señal estadística o de presentación no confirma
            un error económico.
          </p>
          <div className="audit-case-guidance">
            <h3>Qué encontramos</h3>
            <strong>{caseType(row)}</strong>
            <p>{caseExplanation(row, population)}</p>
            <h3>Qué debes revisar</h3>
            <p>{caseNextStep(row)}</p>
            <p className="audit-case-support">
              La comparación es descriptiva. Tarifa oficial y diferencia económica: todavía no verificables.
            </p>
          </div>
          <LineFields row={row}>
            <Field label="Tarifa reportada · precisión original">{String(row.tariff ?? 'No disponible')}</Field>
            <Field label="Tarifa efectiva · Total / Unidades">{number(row.effective)}</Field>
            <Field label="Importe · precisión original">{String(row.total ?? 'No disponible')}</Field>
            <Field label="Diferencia de presentación · Total − Tarifa × Unidades">{number(row.presentationDifference)}</Field>
            <Field label="Universo">{FINANCE_UNIVERSES[row.universe]}</Field>
            <Field label="Jornada · base">
              {row.jornada} · {row.billingBase}
            </Field>
            <Field label="SHA-256 del archivo">{source?.hash ?? 'No disponible'}</Field>
          </LineFields>
          <h3>Señales independientes</h3>
          {row.observations.length ? (
            <ul className="audit-observations">
              {row.observations.map((item) => (
                <li key={item.key}>
                  <strong>{AUDIT_RULES[item.rule]}</strong>
                  <p>{item.explanation}</p>
                  {item.ratio != null && (
                    <small>
                      Razón frente a mediana: {number(item.ratio)} · {item.metric === 'tariff' ? 'reportada' : 'efectiva'}
                    </small>
                  )}
                  {item.repetitionKey && (
                    <button
                      className="link-button"
                      onClick={() => {
                        const group = audit.repetitions.find((entry) => entry.key === item.repetitionKey);
                        openRows(group.rows, AUDIT_RULES[item.rule]);
                      }}
                    >
                      Ver registros coincidentes
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No se detectaron señales con esta configuración. Esto no certifica la tarifa.</p>
          )}
          <h3>Referencia estadística · {population.month}</h3>
          <p>
            {row.service} · {row.labor} · {row.unit} · {row.contractorCode} · {FINANCE_UNIVERSES[row.universe]} · {row.jornada} ·{' '}
            {row.billingBase}. {population.excludedCopies} copias excluidas.{' '}
            {population.exploratory && 'Jornada/base desconocida: puede haber mezcla no identificada.'}
          </p>
          {['reported', 'effective'].map((metric) => {
            const ref = population[metric];
            return (
              <div className="audit-reference" key={metric}>
                <strong>{metric === 'reported' ? 'Tarifa reportada' : 'Tarifa efectiva'}</strong>
                <p>
                  {ref.n} muestras · {ref.weeks} semanas · mediana {number(ref.median)} · MAD {number(ref.mad)}
                </p>
                <p>{ref.sufficient ? `Intervalo ${number(ref.lower)} → ${number(ref.upper)} · ${ref.method}` : ref.reason}</p>
                <button
                  className="button secondary"
                  disabled={!ref.rowIds.length}
                  onClick={() => {
                    const ids = new Set(ref.rowIds);
                    openRows(
                      audit.rows.filter((entry) => ids.has(entry.auditId)),
                      `Muestra ${metric === 'reported' ? 'reportada' : 'efectiva'} · ${population.month}`,
                    );
                  }}
                >
                  Ver muestra comparable
                </button>
              </div>
            );
          })}
        </div>
      )}
    </DrillDrawer>
  );
}
