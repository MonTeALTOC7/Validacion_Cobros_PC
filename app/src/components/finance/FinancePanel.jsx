import { useMemo, useState } from 'react';
import { Download, Landmark, Search, Undo2 } from 'lucide-react';
import { DataTable } from '../common/DataTable';
import { Metric, ShareBar } from '../common';
import {
  FINANCE_CLASSES,
  FINANCE_CLASS_ORDER,
  FINANCE_DIMENSIONS,
  FINANCE_UNIVERSES,
  aggregateFinance,
  buildFinanceRows,
  financeSummary,
  invoiceSummaries,
  pendingByProducer,
} from '../../engine/finance';
import { isBlockingPending } from '../../engine/indicators';
import { normalizeText } from '../../engine/normalize';
import { comparePeriods } from '../../engine/periods';
import { buildTariffProfile, tariffKey, tariffValueKey } from '../../engine/tariffs';
import { classifyRepetitions } from '../../engine/repetitions';
import { formatCurrency, formatNumber } from '../../lib/format';
import { periodLongText, periodText, percentText } from '../../lib/labels';
import { exportSheetsToExcel } from '../../lib/sheet';
import { payrollIndex } from '../../lib/drill';
import { FinanceDrill, groupLevel } from './FinanceDrill';

const SCOPE_LABELS = { PRODUCERS: 'Productores', INTERNAL: 'CASUR interno', BOTH: 'Ambos universos' };

const VIEWS = [
  ['executive', 'Resumen ejecutivo'],
  ['producers', 'Productores y fincas'],
  ['labors', 'Labores y servicios'],
  ['lots', 'Suertes'],
  ['tariffs', 'Tarifas'],
  ['invoices', 'Prefacturas'],
];

const money = (value) => formatCurrency(value ?? 0);
const perHaText = (value) => (value == null ? '—' : formatCurrency(value));
const sumTotal = (rows) => money(rows.reduce((total, row) => total + row.total, 0));

/** Módulo financiero: montos de Prefactura por productor, finca, suerte, labor, semana y tarifa. */
export function FinancePanel({ inputs, analysis, startDate, parameters }) {
  const allRows = useMemo(() => buildFinanceRows(inputs, startDate), [inputs, startDate]);
  const periods = useMemo(() => [...new Set(allRows.map((row) => row.period))].sort(comparePeriods), [allRows]);
  const multiYear = new Set(allRows.map((row) => row.year)).size > 1;
  const [view, setView] = useState('executive');
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    producer: 'all',
    hacienda: 'all',
    financeClass: 'all',
    contractor: 'all',
    universe: 'all',
    search: '',
  });
  const [producerDimension, setProducerDimension] = useState('producer');
  const [laborDimension, setLaborDimension] = useState('service');
  // Pila del detalle (null = cerrado) y último "Aplicar como filtro" para poder deshacerlo.
  const [drill, setDrill] = useState(null);
  const [applied, setApplied] = useState(null);

  const setFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));
  const options = useMemo(
    () => ({
      producers: [...new Set(allRows.map((row) => row.producerName))].sort(),
      haciendas: [...new Set(allRows.map((row) => row.hacienda))].sort(),
      classes: FINANCE_CLASS_ORDER.filter((key) => allRows.some((row) => row.financeClass === key)),
      contractors: [...new Set(allRows.map((row) => row.contractorCode || 'SIN CÓDIGO'))].sort(),
    }),
    [allRows],
  );

  const rows = useMemo(() => {
    const search = normalizeText(filters.search);
    return allRows.filter(
      (row) =>
        (!filters.from || comparePeriods(row.period, filters.from) >= 0) &&
        (!filters.to || comparePeriods(row.period, filters.to) <= 0) &&
        (filters.producer === 'all' || row.producerName === filters.producer) &&
        (filters.hacienda === 'all' || row.hacienda === filters.hacienda) &&
        (filters.financeClass === 'all' || row.financeClass === filters.financeClass) &&
        (filters.contractor === 'all' || (row.contractorCode || 'SIN CÓDIGO') === filters.contractor) &&
        (filters.universe === 'all' || row.universe === filters.universe) &&
        (!search ||
          normalizeText(
            `${row.producerName} ${row.hacienda} ${row.suerte} ${row.labor} ${row.service} ${row.serviceName} ${row.pFact}`,
          ).includes(search)),
    );
  }, [allRows, filters]);

  const summary = useMemo(() => financeSummary(rows), [rows]);
  // Posibles duplicados dentro de la vista filtrada: se informan aparte y NO se descuentan del total.
  const repetitionView = useMemo(() => {
    const billedIds = new Set(rows.map((row) => row.id));
    return classifyRepetitions(inputs.prefactura.filter((row) => billedIds.has(row.id)));
  }, [rows, inputs.prefactura]);
  const repetitions = repetitionView.summary;
  // Contexto del detalle: mismas filas que la página, más el origen de cada línea y la Nómina por clave.
  const drillContext = useMemo(
    () => ({
      allRows,
      baseFilters: filters,
      multiYear,
      prefactura: inputs.prefactura,
      prefacturaById: new Map(inputs.prefactura.map((row) => [row.id, row])),
      repetitions: classifyRepetitions(inputs.prefactura),
      findingByPrefacturaId: new Map(
        (analysis?.findings ?? []).flatMap((finding) => (finding.prefacturaRowIds ?? []).map((id) => [id, finding])).reverse(),
      ),
      payrollByKey: payrollIndex(inputs.payroll),
    }),
    [allRows, filters, multiYear, inputs.prefactura, inputs.payroll, analysis],
  );
  const pending = useMemo(
    () => (analysis ? pendingByProducer(analysis.findings, allRows, isBlockingPending) : new Map()),
    [analysis, allRows],
  );
  const producerGroups = useMemo(
    () => aggregateFinance(rows, FINANCE_DIMENSIONS[producerDimension].keyOf, FINANCE_DIMENSIONS[producerDimension].labelOf),
    [rows, producerDimension],
  );
  const laborGroups = useMemo(
    () => aggregateFinance(rows, FINANCE_DIMENSIONS[laborDimension].keyOf, FINANCE_DIMENSIONS[laborDimension].labelOf),
    [rows, laborDimension],
  );
  const lotGroups = useMemo(() => aggregateFinance(rows, FINANCE_DIMENSIONS.lot.keyOf, FINANCE_DIMENSIONS.lot.labelOf), [rows]);
  const invoices = useMemo(() => invoiceSummaries(rows), [rows]);
  const tariffProfiles = useMemo(
    () => [...buildTariffProfile(rows, parameters.atypicalTariffPct).values()].sort((a, b) => a.service.localeCompare(b.service)),
    [rows, parameters.atypicalTariffPct],
  );

  if (!allRows.length) {
    return (
      <section className="panel">
        <h2>Sin prefacturas cargadas</h2>
        <p>Cargue el reporte de Prefactura en “Actualizar archivos” para habilitar el análisis financiero.</p>
      </section>
    );
  }

  const overall = summary.overall;
  const lastChange =
    summary.lastPeriod && summary.previousPeriod && summary.previousPeriod.total
      ? ((summary.lastPeriod.total - summary.previousPeriod.total) / summary.previousPeriod.total) * 100
      : null;
  const maxClass = Math.max(1, ...summary.byClass.map((group) => group.total));
  const maxPeriod = Math.max(1, ...summary.byPeriod.map((group) => group.total));
  const activeFilters = Object.entries(filters).filter(([key, value]) =>
    key === 'search' || key === 'from' || key === 'to' ? !!value : value !== 'all',
  ).length;

  const rowsFor = (dimension, key) => rows.filter((row) => FINANCE_DIMENSIONS[dimension].keyOf(row) === key);
  /** Abre el detalle de un grupo de la página (productor, finca, suerte, labor, servicio, semana, P.FACT). */
  const openGroup = (dimension, key, title) =>
    setDrill([groupLevel({ title, rows: rowsFor(dimension, key), path: [{ dimension, key, label: title }] })]);
  /** Abre el detalle de un indicador: las mismas filas con las que se calcula. */
  const openRoot = (title, subset, tab, noFilterReason = '') =>
    setDrill([groupLevel({ title, rows: subset, tab, noFilterReason })]);
  const openTariff = (profile, value) =>
    openRoot(
      `${profile.service} · ${profile.unit} · tarifa ${formatNumber(value.tariff)}`,
      // Mismo criterio de agrupación que la tabla de tarifas (servicio|UM y tarifa a 2 decimales).
      rows.filter((row) => tariffKey(row) === profile.key && tariffValueKey(row.tariff) === tariffValueKey(value.tariff)),
      'lines',
      'Una tarifa no tiene filtro equivalente en la página.',
    );
  const applyFromDrill = (nextFilters, title) => {
    setApplied({ previous: filters, title });
    setFilters(nextFilters);
    setDrill(null);
  };
  const undoApplied = () => {
    setFilters(applied.previous);
    setApplied(null);
  };

  const exportAll = () => {
    const groupSheet = (groups, labelName) =>
      groups.map((group) => ({
        [labelName]: group.label,
        Total: group.total,
        '% del total': overall.total ? round2((group.total / overall.total) * 100) : 0,
        Prefacturas: group.invoices,
        Productores: group.producers,
        Fincas: group.haciendas,
        Suertes: group.lots,
        'Área física (ha)': group.area,
        'Suertes con área': group.lotsWithArea,
        'Prefacturado C$ por ha de suerte (no es costo total)': group.perHa ?? '',
        'HA trabajadas': group.haUnits,
        'Prefacturado C$ por HA trabajada (UM HA)': group.perHaWorked ?? '',
        ...Object.fromEntries(FINANCE_CLASS_ORDER.map((key) => [FINANCE_CLASSES[key], group.byClass[key] ?? 0])),
        'Primera semana': group.firstPeriod,
        'Última semana': group.lastPeriod,
        Tarifas: group.tariffs.join(' / '),
      }));
    exportSheetsToExcel(
      [
        {
          name: 'Resumen',
          rows: [
            {
              'Generado el': new Date().toISOString(),
              'Semanas incluidas': `${periods[0] ?? ''} → ${periods.at(-1) ?? ''}`,
              'Filtros activos': JSON.stringify(filters),
              'Total facturado': overall.total,
              Prefacturas: overall.invoices,
              Productores: overall.producers,
              Fincas: overall.haciendas,
              Suertes: overall.lots,
              'Área física (ha)': overall.area,
              'Prefacturado C$ por ha de suerte (no es costo total)': overall.perHa ?? '',
              'HA trabajadas': overall.haUnits,
              'Prefacturado C$ por HA trabajada (UM HA)': overall.perHaWorked ?? '',
              Fuente: 'Columna Total de la Prefactura SIAGRI (sin recalcular ni descontar)',
              ...Object.fromEntries(summary.byUniverse.map((group) => [`Universo · ${group.label}`, group.total])),
              'Posibles duplicados exactos (copias, sin descontar)': repetitions.DUPLICADO_EXACTO.extraAmount,
              'Mismo cobro en otra prefactura (copias, sin descontar)': repetitions.COBRO_EN_OTRA_PREFACTURA.extraAmount,
              'Ámbito de conciliación (solo Nómina)': SCOPE_LABELS[parameters.scope] ?? parameters.scope,
            },
          ],
        },
        {
          name: 'Por productor',
          rows: groupSheet(
            aggregateFinance(rows, FINANCE_DIMENSIONS.producer.keyOf, FINANCE_DIMENSIONS.producer.labelOf),
            'Productor',
          ),
        },
        {
          name: 'Por finca',
          rows: groupSheet(
            aggregateFinance(rows, FINANCE_DIMENSIONS.hacienda.keyOf, FINANCE_DIMENSIONS.hacienda.labelOf),
            'Finca',
          ),
        },
        { name: 'Por suerte', rows: groupSheet(lotGroups, 'Suerte') },
        {
          name: 'Por labor',
          rows: groupSheet(aggregateFinance(rows, FINANCE_DIMENSIONS.labor.keyOf, FINANCE_DIMENSIONS.labor.labelOf), 'Labor'),
        },
        {
          name: 'Por servicio',
          rows: groupSheet(
            aggregateFinance(rows, FINANCE_DIMENSIONS.service.keyOf, FINANCE_DIMENSIONS.service.labelOf),
            'Servicio',
          ),
        },
        { name: 'Por semana', rows: groupSheet(summary.byPeriod, 'Semana') },
        {
          name: 'Tarifas',
          rows: tariffProfiles.flatMap((profile) =>
            profile.values.map((value) => ({
              Servicio: profile.service,
              Nombre: profile.serviceName,
              UM: profile.unit,
              Tarifa: value.tariff,
              Filas: value.rows,
              '% de filas del servicio': round2(value.share),
              Unidades: round2(value.units),
              Total: round2(value.amount),
              'Primera semana': value.firstPeriodKey,
              'Última semana': value.lastPeriodKey,
              'Poco frecuente': value.atypical ? 'Sí' : 'No',
            })),
          ),
        },
        {
          name: 'Prefacturas',
          rows: invoices.map((invoice) => ({
            'P.FACT': invoice.pFact,
            'Año operativo': invoice.year ?? '',
            'Número repetido en otro productor/año': invoice.reusedNumber ? 'Sí' : 'No',
            Productor: invoice.producerName,
            Código: invoice.producerCode,
            Finca: invoice.haciendas,
            Semanas: invoice.periods.join(', '),
            Desde: invoice.firstDate,
            Hasta: invoice.lastDate,
            Líneas: invoice.lines,
            Suertes: invoice.lots,
            Tipos: invoice.classes,
            Total: invoice.total,
          })),
        },
        { name: 'Detalle', rows: rows.map(detailExportRow) },
      ],
      `financiero_prefacturas_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const groupColumns = (labelName, withPending) => [
    { key: 'label', label: labelName, render: (group) => <strong>{group.label}</strong>, value: (group) => group.label },
    { key: 'total', label: 'Total', num: true, render: (group) => money(group.total), total: sumTotalGroups },
    {
      key: 'share',
      label: '% total',
      num: true,
      value: (group) => group.total,
      render: (group) => (
        <span className="share-cell">
          {percentText(overall.total ? (group.total / overall.total) * 100 : 0)}
          <ShareBar value={group.total} max={overall.total} />
        </span>
      ),
    },
    { key: 'lots', label: 'Suertes', num: true },
    { key: 'area', label: 'Área ha', num: true, render: (group) => (group.lotsWithArea ? formatNumber(group.area) : '—') },
    { key: 'perHa', label: 'Prefact. C$/ha suerte', num: true, render: (group) => perHaText(group.perHa) },
    ...['MANUAL', 'MECANIZADA', 'TPS'].map((key) => ({
      key: `class-${key}`,
      label: FINANCE_CLASSES[key].replace(' (siembra)', ''),
      num: true,
      value: (group) => group.byClass[key] ?? 0,
      render: (group) => (group.byClass[key] ? money(group.byClass[key]) : '—'),
    })),
    {
      key: 'other',
      label: 'Otros',
      num: true,
      value: (group) => otherAmount(group),
      render: (group) => (otherAmount(group) ? money(otherAmount(group)) : '—'),
    },
    { key: 'invoices', label: 'Prefacturas', num: true },
    { key: 'lastPeriod', label: 'Última semana', render: (group) => periodText(group.lastPeriod, multiYear) },
    ...(withPending
      ? [
          {
            key: 'pending',
            label: 'Pendiente en Nómina',
            value: (group) => pending.get(group.label)?.cases ?? 0,
            render: (group) => {
              const entry = pending.get(group.label);
              return entry ? (
                <span className="pending-cell">
                  {entry.cases} caso(s) ·{' '}
                  {Object.entries(entry.byUnit)
                    .map(([unit, units]) => `${formatNumber(units)} ${unit}`)
                    .join(' · ')}
                </span>
              ) : (
                '—'
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div className="finance-module">
      <div className="exec-heading">
        <div>
          <span className="exec-eyebrow">NEGOCIOS DE CAÑA / FINANCIERO</span>
          <h2>Cobros por prefactura</h2>
          <p>
            Montos facturados a productores según la columna Total de la Prefactura SIAGRI ({periodLongText(periods[0], true)} –{' '}
            {periodLongText(periods.at(-1), true)}).
          </p>
        </div>
        <button className="button secondary" onClick={exportAll}>
          <Download size={16} /> Exportar Excel
        </button>
      </div>
      <nav className="exec-local-nav" aria-label="Vistas financieras">
        {VIEWS.map(([id, label]) => (
          <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="exec-toolbar finance-toolbar">
        <label>
          <span>Semana desde</span>
          <select value={filters.from} onChange={(event) => setFilter('from', event.target.value)}>
            <option value="">Inicio</option>
            {periods.map((period) => (
              <option key={period} value={period}>
                {periodLongText(period, multiYear)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Semana hasta</span>
          <select value={filters.to} onChange={(event) => setFilter('to', event.target.value)}>
            <option value="">Última</option>
            {periods.map((period) => (
              <option key={period} value={period}>
                {periodLongText(period, multiYear)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Productor</span>
          <select value={filters.producer} onChange={(event) => setFilter('producer', event.target.value)}>
            <option value="all">Todos</option>
            {options.producers.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Finca</span>
          <select value={filters.hacienda} onChange={(event) => setFilter('hacienda', event.target.value)}>
            <option value="all">Todas</option>
            {options.haciendas.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Tipo de labor</span>
          <select value={filters.financeClass} onChange={(event) => setFilter('financeClass', event.target.value)}>
            <option value="all">Todos</option>
            {options.classes.map((key) => (
              <option key={key} value={key}>
                {FINANCE_CLASSES[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Contratista</span>
          <select value={filters.contractor} onChange={(event) => setFilter('contractor', event.target.value)}>
            <option value="all">Todos</option>
            {options.contractors.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Universo</span>
          <select value={filters.universe} onChange={(event) => setFilter('universe', event.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(FINANCE_UNIVERSES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="finance-search">
          <span>Buscar</span>
          <span className="search-box">
            <Search size={15} />
            <input
              value={filters.search}
              placeholder="Productor, suerte, servicio, P.FACT"
              onChange={(event) => setFilter('search', event.target.value)}
            />
          </span>
        </label>
        <button
          className="exec-reset"
          disabled={!activeFilters}
          onClick={() => {
            setApplied(null);
            setFilters({
              from: '',
              to: '',
              producer: 'all',
              hacienda: 'all',
              financeClass: 'all',
              contractor: 'all',
              universe: 'all',
              search: '',
            });
          }}
        >
          Restablecer {activeFilters ? `(${activeFilters})` : ''}
        </button>
        {applied && (
          <button className="exec-reset drill-undo" onClick={undoApplied} title="Vuelve a los filtros anteriores">
            <Undo2 size={14} /> Deshacer filtro de “{applied.title}”
          </button>
        )}
      </div>

      <div className="metric-grid">
        <Metric
          label="Total informado por SIAGRI"
          value={money(overall.total)}
          note={`${overall.rows.toLocaleString('es-NI')} líneas de prefactura · columna Total, sin descontar posibles duplicados`}
          tone="primary"
          onClick={() => openRoot('Total informado por SIAGRI', rows, 'producer')}
        />
        <Metric
          label="Prefacturas"
          value={overall.invoices.toLocaleString('es-NI')}
          note={`${overall.producers} productores · ${overall.haciendas} fincas`}
          onClick={() => openRoot('Prefacturas de la vista', rows, 'invoice')}
        />
        <Metric
          label="Prefacturado por ha de suerte"
          value={perHaText(overall.perHa)}
          note={`Monto de Prefactura ÷ ${formatNumber(overall.area)} ha físicas (${overall.lotsWithArea} de ${overall.lots} suertes con área). No es el costo total de producción por hectárea.`}
          onClick={() => openRoot('Prefacturado por suerte', rows, 'lot')}
        />
        <Metric
          label="Prefacturado por HA trabajada"
          value={perHaText(overall.perHaWorked)}
          note={`Monto de líneas con UM HA ÷ ${formatNumber(overall.haUnits)} HA de trabajo acumulado. No equivale a área física.`}
          onClick={() =>
            openRoot(
              'Líneas con UM HA',
              rows.filter((row) => row.unit === 'HA'),
              'service',
              'Las líneas con UM HA no tienen un filtro equivalente en la página.',
            )
          }
        />
        <Metric
          label={`Última semana · ${periodText(summary.lastPeriod?.key, multiYear)}`}
          value={money(summary.lastPeriod?.total)}
          note={
            lastChange == null
              ? 'Sin semana anterior para comparar'
              : `${lastChange >= 0 ? '+' : ''}${formatNumber(lastChange, 1)} % vs. semana anterior · promedio 4 sem. ${money(summary.lastFourAverage)}`
          }
          tone={lastChange != null && lastChange < 0 ? 'warning' : ''}
          onClick={
            summary.lastPeriod
              ? () => openGroup('period', summary.lastPeriod.key, periodLongText(summary.lastPeriod.key, multiYear))
              : undefined
          }
        />
      </div>

      {(repetitions.DUPLICADO_EXACTO.extraRows > 0 || repetitions.COBRO_EN_OTRA_PREFACTURA.extraRows > 0) && (
        <div className="alert-strip warning finance-duplicates">
          <span>
            <strong>Posibles duplicados incluidos en el total (sin descontar mientras no se validen):</strong>{' '}
            {repetitions.DUPLICADO_EXACTO.extraRows} copia(s) exacta(s) por {money(repetitions.DUPLICADO_EXACTO.extraAmount)}
            {repetitions.COBRO_EN_OTRA_PREFACTURA.extraRows > 0 &&
              ` · ${repetitions.COBRO_EN_OTRA_PREFACTURA.extraRows} cobro(s) repetido(s) en otra prefactura por ${money(repetitions.COBRO_EN_OTRA_PREFACTURA.extraAmount)}`}
            {repetitions.MISMA_CANTIDAD_TARIFA_DISTINTA.groups > 0 &&
              ` · ${repetitions.MISMA_CANTIDAD_TARIFA_DISTINTA.groups} grupo(s) con misma cantidad y tarifas distintas (revisar)`}
            .
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() =>
              setDrill([
                {
                  kind: 'repetitions',
                  title: 'Repeticiones en Prefactura',
                  crumb: 'Repeticiones',
                  groups: repetitionView.groups.filter((group) => group.kind !== 'VARIAS_LINEAS_MISMA_CLAVE'),
                },
              ])
            }
          >
            Ver grupos y evidencia
          </button>
        </div>
      )}

      <section className="panel finance-universes">
        <div className="panel-head">
          <div>
            <h3>Universos del total</h3>
            <p>
              El total suma montos que la conciliación trata por separado. El ámbito de conciliación (
              {SCOPE_LABELS[parameters.scope] ?? parameters.scope}) solo filtra la Nómina; la Prefactura se incluye completa
              porque toda corresponde a productores. Compare con la conciliación solo el universo “Conciliable contra Nómina”.
            </p>
          </div>
        </div>
        <div className="bar-list">
          {summary.byUniverse.map((group) => (
            <button key={group.key} className="bar-row" onClick={() => setFilter('universe', group.key)}>
              <span>{group.label}</span>
              <ShareBar value={group.total} max={overall.total} />
              <b>{money(group.total)}</b>
              <small>{percentText(overall.total ? (group.total / overall.total) * 100 : 0)}</small>
            </button>
          ))}
        </div>
      </section>

      {view === 'executive' && (
        <>
          <div className="finance-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Distribución por tipo de labor</h3>
                  <p>Clasificación con las mismas reglas de la conciliación.</p>
                </div>
              </div>
              <div className="bar-list">
                {summary.byClass.map((group) => (
                  <button key={group.key} className="bar-row" onClick={() => setFilter('financeClass', group.key)}>
                    <span>{group.label}</span>
                    <ShareBar value={group.total} max={maxClass} />
                    <b>{money(group.total)}</b>
                    <small>{percentText(overall.total ? (group.total / overall.total) * 100 : 0)}</small>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Concentración</h3>
                  <p>Participación de los mayores productores en el total facturado.</p>
                </div>
              </div>
              <div className="concentration">
                <Metric
                  label="Principal productor"
                  value={percentText(summary.topProducerShare * 100)}
                  note={summary.byProducer[0]?.label}
                />
                <Metric
                  label="5 principales"
                  value={percentText(summary.top5ProducerShare * 100)}
                  note={`de ${summary.byProducer.length} productores`}
                />
                <Metric
                  label="Contratistas"
                  value={summary.byContractor.length}
                  note={summary.byContractor
                    .map((group) => `${group.label}: ${percentText(overall.total ? (group.total / overall.total) * 100 : 0, 0)}`)
                    .join(' · ')}
                />
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Facturación semanal</h3>
                <p>Total por semana operativa. Pulse una barra para ver su detalle.</p>
              </div>
            </div>
            <div className="exec-week-scroll">
              <div className="exec-week-bars finance-bars">
                {summary.byPeriod.map((group) => (
                  <button
                    key={group.key}
                    aria-label={`${periodLongText(group.key, multiYear)}: ${money(group.total)}`}
                    onClick={() => openGroup('period', group.key, periodLongText(group.key, multiYear))}
                  >
                    <span className="exec-bar-track">
                      <i style={{ height: `${(Math.max(0, group.total) / maxPeriod) * 100}%` }} />
                    </span>
                    <b>{periodText(group.key, multiYear)}</b>
                    <small>{formatNumber(group.total / 1000, 0)} mil</small>
                  </button>
                ))}
              </div>
            </div>
          </section>
          <div className="finance-grid">
            <RankingPanel
              title="Principales productores"
              groups={summary.byProducer.slice(0, 10)}
              total={overall.total}
              onOpen={(group) => openGroup('producer', group.key, group.label)}
            />
            <RankingPanel
              title="Principales labores"
              groups={summary.byLabor.slice(0, 10)}
              total={overall.total}
              onOpen={(group) => openGroup('labor', group.key, group.label)}
            />
          </div>
          {pending.size > 0 && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Nómina pendiente de prefacturar por productor</h3>
                  <p>
                    Casos de la conciliación sin cobro o con cobro parcial (todo el período conciliado, ámbito{' '}
                    {SCOPE_LABELS[parameters.scope] ?? parameters.scope}; no cambia con los filtros de esta página). Se expresan
                    en unidades; no se valorizan porque la tarifa de un mismo servicio varía.
                  </p>
                </div>
              </div>
              <DataTable
                rowKey={(entry) => entry.producer}
                initialSort={{ key: 'cases', direction: 'desc' }}
                rows={[...pending.values()]}
                columns={[
                  { key: 'producer', label: 'Productor', render: (entry) => <strong>{entry.producer}</strong> },
                  { key: 'cases', label: 'Casos', num: true },
                  {
                    key: 'units',
                    label: 'Unidades pendientes',
                    value: (entry) => Object.values(entry.byUnit).reduce((a, b) => a + b, 0),
                    render: (entry) =>
                      Object.entries(entry.byUnit)
                        .map(([unit, units]) => `${formatNumber(units)} ${unit}`)
                        .join(' · '),
                  },
                ]}
                pageSize={10}
              />
            </section>
          )}
        </>
      )}

      {view === 'producers' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>{producerDimension === 'producer' ? 'Facturación por productor' : 'Facturación por finca'}</h3>
              <p>Pulse una fila para ver el desglose por labor, suerte, semana y prefactura.</p>
            </div>
            <div className="segmented">
              <button aria-pressed={producerDimension === 'producer'} onClick={() => setProducerDimension('producer')}>
                Productor
              </button>
              <button aria-pressed={producerDimension === 'hacienda'} onClick={() => setProducerDimension('hacienda')}>
                Finca
              </button>
            </div>
          </div>
          <DataTable
            key={producerDimension}
            rows={producerGroups}
            columns={groupColumns(producerDimension === 'producer' ? 'Productor' : 'Finca', producerDimension === 'producer')}
            onRowClick={(group) => openGroup(producerDimension, group.key, group.label)}
          />
        </section>
      )}

      {view === 'labors' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>{laborDimension === 'service' ? 'Facturación por servicio' : 'Facturación por labor'}</h3>
              <p>Tarifa media = total ÷ unidades de la misma UM. Las tarifas listadas son las observadas en la Prefactura.</p>
            </div>
            <div className="segmented">
              <button aria-pressed={laborDimension === 'service'} onClick={() => setLaborDimension('service')}>
                Servicio
              </button>
              <button aria-pressed={laborDimension === 'labor'} onClick={() => setLaborDimension('labor')}>
                Labor
              </button>
            </div>
          </div>
          <DataTable
            key={laborDimension}
            rows={laborGroups}
            onRowClick={(group) => openGroup(laborDimension, group.key, group.label)}
            columns={[
              {
                key: 'label',
                label: laborDimension === 'service' ? 'Servicio' : 'Labor',
                render: (group) => <strong>{group.label}</strong>,
              },
              { key: 'total', label: 'Total', num: true, render: (group) => money(group.total), total: sumTotalGroups },
              {
                key: 'units',
                label: 'Unidades',
                value: (group) => Object.values(group.byUnit).reduce((total, unit) => total + unit.units, 0),
                render: (group) =>
                  Object.entries(group.byUnit)
                    .map(([unit, value]) => `${formatNumber(value.units)} ${unit}`)
                    .join(' · '),
              },
              {
                key: 'avgTariff',
                label: 'Tarifa media',
                num: true,
                value: (group) => averageTariff(group),
                render: (group) => (averageTariff(group) == null ? 'Varias UM' : formatNumber(averageTariff(group))),
              },
              {
                key: 'tariffs',
                label: 'Tarifas observadas',
                value: (group) => group.tariffs.length,
                render: (group) => <span className="tariff-chips">{tariffRange(group.tariffs)}</span>,
              },
              { key: 'producers', label: 'Productores', num: true },
              { key: 'lots', label: 'Suertes', num: true },
              { key: 'rows', label: 'Líneas', num: true },
            ]}
          />
        </section>
      )}

      {view === 'lots' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Facturación por suerte</h3>
              <p>
                Área física de la suerte (Maestro; si falta, la informada en Prefactura). HA trabajadas = unidades con UM HA.
                “Prefact. C$/ha” es el monto de Prefactura por hectárea física, no el costo total de producción.
              </p>
            </div>
          </div>
          <DataTable
            rows={lotGroups}
            onRowClick={(group) => openGroup('lot', group.key, group.label)}
            columns={[
              { key: 'label', label: 'Finca · suerte', render: (group) => <strong>{group.label}</strong> },
              {
                key: 'producer',
                label: 'Productor',
                value: (group) => producerOfLot(rows, group.key),
                render: (group) => producerOfLot(rows, group.key),
              },
              { key: 'total', label: 'Total', num: true, render: (group) => money(group.total), total: sumTotalGroups },
              {
                key: 'area',
                label: 'Área ha',
                num: true,
                render: (group) => (group.lotsWithArea ? formatNumber(group.area) : '—'),
              },
              { key: 'perHa', label: 'Prefact. C$/ha', num: true, render: (group) => perHaText(group.perHa) },
              { key: 'haUnits', label: 'HA trabajadas', num: true, render: (group) => formatNumber(group.haUnits) },
              {
                key: 'cycles',
                label: 'Veces el área',
                num: true,
                value: (group) => (group.area ? group.haUnits / group.area : null),
                render: (group) => (group.area && group.haUnits ? formatNumber(group.haUnits / group.area, 1) : '—'),
              },
              { key: 'invoices', label: 'Prefacturas', num: true },
              { key: 'lastPeriod', label: 'Última semana', render: (group) => periodText(group.lastPeriod, multiYear) },
            ]}
          />
          <small className="muted">
            “Veces el área” = HA trabajadas ÷ área física: indica trabajo acumulado sobre la suerte (varias labores o pases), no
            un número de aplicaciones.
          </small>
        </section>
      )}

      {view === 'tariffs' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Tarifas cobradas por servicio y UM</h3>
              <p>
                Tarifas observadas en la Prefactura, con su frecuencia y las semanas en que aparecen. “Poco frecuente” = menos del{' '}
                {parameters.atypicalTariffPct ?? 5} % de las filas del servicio (indicador para revisar, no implica error).
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>UM</th>
                  <th className="num">Tarifa</th>
                  <th className="num">Filas</th>
                  <th className="num">% filas</th>
                  <th className="num">Unidades</th>
                  <th className="num">Total</th>
                  <th>Semanas</th>
                  <th>Revisión</th>
                </tr>
              </thead>
              <tbody>
                {tariffProfiles.flatMap((profile) =>
                  profile.values.map((value, index) => (
                    <tr
                      key={`${profile.key}-${value.tariff}`}
                      className={`clickable ${index === 0 ? 'group-start' : ''}`}
                      tabIndex={0}
                      onClick={() => openTariff(profile, value)}
                      onKeyDown={(event) => event.key === 'Enter' && openTariff(profile, value)}
                    >
                      <td>
                        {index === 0 && (
                          <>
                            <strong>{profile.service}</strong>
                            <small>{profile.serviceName}</small>
                          </>
                        )}
                      </td>
                      <td>{index === 0 ? profile.unit : ''}</td>
                      <td className={`num ${value.atypical ? 'tariff-atypical' : ''}`}>{formatNumber(value.tariff)}</td>
                      <td className="num">{value.rows}</td>
                      <td className="num">{percentText(value.share)}</td>
                      <td className="num">{formatNumber(value.units)}</td>
                      <td className="num">{money(value.amount)}</td>
                      <td>
                        {periodText(value.firstPeriodKey, multiYear)} → {periodText(value.lastPeriodKey, multiYear)}
                      </td>
                      <td>
                        {value.atypical ? (
                          <span className="flag flag-info">Poco frecuente</span>
                        ) : index === 0 ? (
                          'Más frecuente'
                        ) : (
                          ''
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'invoices' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Prefacturas emitidas</h3>
              <p>Una fila por número P.FACT. Pulse para ver sus líneas con origen en el archivo.</p>
            </div>
          </div>
          <DataTable
            rows={invoices}
            rowKey={(invoice) => invoice.key}
            onRowClick={(invoice) => openGroup('invoice', invoice.key, `Prefactura ${invoice.pFact} · ${invoice.producerName}`)}
            columns={[
              {
                key: 'pFact',
                label: 'P.FACT',
                render: (invoice) => (
                  <strong title={invoice.reusedNumber ? 'El mismo número aparece con otro productor o año' : undefined}>
                    {invoice.pFact}
                    {invoice.reusedNumber ? ` · ${invoice.year}` : ''}
                  </strong>
                ),
              },
              { key: 'producerName', label: 'Productor' },
              { key: 'haciendas', label: 'Finca' },
              {
                key: 'periods',
                label: 'Semanas',
                value: (invoice) => invoice.periods[0],
                render: (invoice) => invoice.periods.map((p) => periodText(p, multiYear)).join(', '),
              },
              { key: 'lastDate', label: 'Fechas', render: (invoice) => `${invoice.firstDate} → ${invoice.lastDate}` },
              { key: 'lines', label: 'Líneas', num: true },
              { key: 'classes', label: 'Tipos' },
              { key: 'total', label: 'Total', num: true, render: (invoice) => money(invoice.total), total: sumTotal },
            ]}
          />
        </section>
      )}

      <footer className="exec-method">
        <p>
          <Landmark size={14} /> Fuente: columna Total de la Prefactura (SIAGRI), sin recalcular. Período desde la semana
          operativa que contiene el {startDate}. Las HA trabajadas son trabajo acumulado y no se suman con el área física de las
          suertes.
        </p>
      </footer>

      {drill && <FinanceDrill stack={drill} setStack={setDrill} context={drillContext} onApplyFilters={applyFromDrill} />}
    </div>
  );
}

const round2 = (value) => Math.round(value * 100) / 100;
const sumTotalGroups = (groups) => money(groups.reduce((total, group) => total + group.total, 0));
const otherAmount = (group) =>
  Object.entries(group.byClass)
    .filter(([key]) => !['MANUAL', 'MECANIZADA', 'TPS'].includes(key))
    .reduce((total, [, value]) => total + value, 0);
const averageTariff = (group) => {
  const units = Object.entries(group.byUnit);
  if (units.length !== 1) return null;
  const [, value] = units[0];
  return value.units ? value.amount / value.units : null;
};
const tariffRange = (tariffs) => {
  if (!tariffs.length) return '—';
  if (tariffs.length <= 4) return tariffs.map((tariff) => formatNumber(tariff)).join(' / ');
  return `${formatNumber(tariffs[0])} – ${formatNumber(tariffs.at(-1))} (${tariffs.length} valores)`;
};
const producerOfLot = (rows, lot) =>
  [...new Set(rows.filter((row) => row.lot === lot).map((row) => row.producerName))].join(' / ');

const detailExportRow = (row) => ({
  Semana: row.period,
  Fecha: row.date,
  Productor: row.producerName,
  'Código productor': row.producerCode,
  Finca: row.hacienda,
  Suerte: row.suerte,
  'Área suerte (ha)': row.lotArea ?? '',
  'Fuente área': row.lotAreaSource,
  Labor: row.labor,
  Servicio: row.service,
  'Nombre servicio': row.serviceName,
  UM: row.unit,
  Unidades: row.units,
  Tarifa: row.tariff,
  Total: row.total,
  'P.FACT': row.pFact,
  Contratista: row.contractorCode,
  Tipo: FINANCE_CLASSES[row.financeClass],
  Universo: FINANCE_UNIVERSES[row.universe],
  Archivo: row.sourceFile,
  Fila: row.sourceRow,
});

function RankingPanel({ title, groups, total, onOpen }) {
  const max = Math.max(1, ...groups.map((group) => group.total));
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          <p>Pulse para ver el detalle.</p>
        </div>
      </div>
      <div className="bar-list">
        {groups.map((group, index) => (
          <button key={group.key} className="bar-row" onClick={() => onOpen(group)}>
            <span>
              <em>{index + 1}</em> {group.label}
            </span>
            <ShareBar value={group.total} max={max} />
            <b>{formatCurrency(group.total)}</b>
            <small>{percentText(total ? (group.total / total) * 100 : 0)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
