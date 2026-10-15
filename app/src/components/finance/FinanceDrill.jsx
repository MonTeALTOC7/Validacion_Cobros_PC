import { useMemo } from 'react';
import { Filter, Search } from 'lucide-react';
import { DataTable } from '../common/DataTable';
import { DrillDrawer } from '../drill/DrillDrawer';
import { RepetitionGroupDetail, RepetitionGroupsList } from '../drill/RepetitionGroups';
import { Field, LineFields } from '../drill/LineFields';
import { FINANCE_CLASSES, FINANCE_DIMENSIONS, FINANCE_UNIVERSES } from '../../engine/finance';
import { REPETITION_KINDS } from '../../engine/repetitions';
import { STATUS_LABELS } from '../../engine/constants';
import { formatCurrency, formatNumber } from '../../lib/format';
import { periodLongText, periodText, percentText } from '../../lib/labels';
import {
  DIMENSION_TAB_LABELS,
  availableDimensions,
  filtersForSelection,
  groupRows,
  repetitionEvidence,
  rowsOfGroup,
  searchLines,
  totalOf,
  unitTotals,
} from '../../lib/drill';

const money = (value) => formatCurrency(value ?? 0);
const unitsText = (list) => (list.length ? list.map((entry) => `${formatNumber(entry.units)} ${entry.unit}`).join(' · ') : '—');
const groupUnitsText = (group) =>
  Object.entries(group.byUnit)
    .map(([unit, value]) => `${formatNumber(value.units)} ${unit}`)
    .join(' · ');

/** Pestaña que se abre al bajar un nivel, según la dimensión elegida. */
const NEXT_TAB = {
  producer: ['lot', 'labor', 'period'],
  hacienda: ['lot', 'labor', 'period'],
  lot: ['labor', 'service', 'period'],
  labor: ['service', 'lot', 'period'],
  service: ['lot', 'period', 'producer'],
  contractor: ['producer', 'labor'],
  period: ['producer', 'labor', 'lot'],
  invoice: ['labor', 'lot'],
};
export const defaultTab = (rows, lastDimension) => {
  const available = availableDimensions(rows);
  const preferred = (NEXT_TAB[lastDimension] ?? []).find((dimension) => available.includes(dimension));
  return preferred ?? available[0] ?? 'lines';
};

/** Nivel de grupo financiero: crea la entrada de la pila. */
export const groupLevel = ({ title, rows, path = [], tab, noFilterReason = '' }) => ({
  kind: 'group',
  title,
  crumb: title,
  rows,
  path,
  tab: tab ?? defaultTab(rows, path.at(-1)?.dimension),
  search: '',
  noFilterReason,
});

/**
 * Detalle financiero navegable. La pila (stack) y sus cambios viven en FinancePanel para conservar el contexto.
 * context: { allRows, baseFilters, prefacturaById, repetitions, findingByPrefacturaId, payrollByKey, prefactura, multiYear }
 */
export function FinanceDrill({ stack, setStack, context, onApplyFilters }) {
  const current = stack.at(-1);
  const push = (level) => setStack([...stack, level]);
  const replaceCurrent = (patch) => setStack([...stack.slice(0, -1), { ...current, ...patch }]);
  const financeById = useMemo(() => new Map(context.allRows.map((row) => [row.id, row])), [context.allRows]);

  const openLine = (row) => {
    const merged = { ...(context.prefacturaById.get(row.id) ?? {}), ...(financeById.get(row.id) ?? {}), ...row };
    push({ kind: 'line', title: `Línea · fila ${merged.sourceRow}`, crumb: `Fila ${merged.sourceRow}`, row: merged });
  };
  const openRepetitionGroup = (group) =>
    push({
      kind: 'repetition-group',
      title: `${REPETITION_KINDS[group.kind]} · ${group.rows[0].hacienda} · ${group.rows[0].suerte}`,
      crumb: REPETITION_KINDS[group.kind],
      group,
    });

  let body;
  if (current.kind === 'group') {
    body = (
      <GroupLevel
        level={current}
        context={context}
        onTab={(tab) => replaceCurrent({ tab })}
        onSearch={(search) => replaceCurrent({ search })}
        onOpenGroup={(dimension, group) =>
          push(
            groupLevel({
              title: dimension === 'period' ? periodLongText(group.key, context.multiYear) : group.label,
              rows: rowsOfGroup(current.rows, dimension, group.key),
              path: [...current.path, { dimension, key: group.key, label: group.label }],
              noFilterReason: current.noFilterReason,
            }),
          )
        }
        onOpenLine={openLine}
        onApplyFilters={onApplyFilters}
      />
    );
  } else if (current.kind === 'line') {
    body = <LineLevel row={current.row} context={context} onOpenGroup={openRepetitionGroup} />;
  } else if (current.kind === 'repetitions') {
    body = <RepetitionGroupsList groups={current.groups} onOpenGroup={openRepetitionGroup} />;
  } else if (current.kind === 'repetition-group') {
    body = (
      <RepetitionGroupDetail
        group={current.group}
        allGroups={context.repetitions.groups}
        evidence={repetitionEvidence(current.group, context.prefactura, context.payrollByKey)}
        onOpenLine={openLine}
      />
    );
  }

  return (
    <DrillDrawer
      eyebrow="Detalle financiero"
      stack={stack}
      onBack={() => setStack(stack.slice(0, -1))}
      onJump={(index) => setStack(stack.slice(0, index + 1))}
      onClose={() => setStack(null)}
    >
      {body}
    </DrillDrawer>
  );
}

function GroupLevel({ level, context, onTab, onSearch, onOpenGroup, onOpenLine, onApplyFilters }) {
  const rows = level.rows;
  const total = totalOf(rows);
  const dimensions = useMemo(() => availableDimensions(rows), [rows]);
  const tab = level.tab === 'lines' || dimensions.includes(level.tab) ? level.tab : (dimensions[0] ?? 'lines');
  const groups = useMemo(() => (tab === 'lines' ? [] : groupRows(rows, tab)), [rows, tab]);
  const lines = useMemo(() => searchLines(rows, level.search), [rows, level.search]);
  const selection = useMemo(
    () =>
      level.noFilterReason
        ? { filters: null, reason: level.noFilterReason }
        : filtersForSelection(context.allRows, context.baseFilters, level.path, rows),
    [level, context, rows],
  );
  const lots = new Set(rows.map((row) => row.lot)).size;

  return (
    <div className="drill-section">
      <div className="detail-grid drill-tiles">
        <div className="detail">
          <span>Total</span>
          <strong data-drill-total={total}>{money(total)}</strong>
        </div>
        <div className="detail">
          <span>Líneas</span>
          <strong>{rows.length.toLocaleString('es-NI')}</strong>
        </div>
        <div className="detail">
          <span>Prefacturas</span>
          <strong>{new Set(rows.filter((row) => row.pFact).map((row) => row.invoiceKey)).size}</strong>
        </div>
        <div className="detail">
          <span>Suertes · semanas</span>
          <strong>
            {lots} · {new Set(rows.map((row) => row.period)).size}
          </strong>
        </div>
      </div>
      <p className="drill-units">
        <span>Cantidades por unidad:</span> {unitsText(unitTotals(rows))}
      </p>
      <div className="drill-apply">
        {selection.filters ? (
          <button type="button" className="button secondary" onClick={() => onApplyFilters(selection.filters, level.title)}>
            <Filter size={15} /> Aplicar como filtro
          </button>
        ) : (
          <>
            <button type="button" className="button secondary" disabled aria-describedby="drill-apply-reason">
              <Filter size={15} /> Aplicar como filtro
            </button>
            <small id="drill-apply-reason">{selection.reason}</small>
          </>
        )}
      </div>
      <div className="segmented drill-tabs" role="tablist" aria-label="Desglose">
        {dimensions.map((dimension) => (
          <button key={dimension} role="tab" aria-pressed={tab === dimension} onClick={() => onTab(dimension)}>
            {DIMENSION_TAB_LABELS[dimension]}
          </button>
        ))}
        <button role="tab" aria-pressed={tab === 'lines'} onClick={() => onTab('lines')}>
          Líneas
        </button>
      </div>
      {tab === 'lines' ? (
        <>
          <label className="drill-search">
            <Search size={15} />
            <input
              value={level.search}
              placeholder="Buscar productor, suerte, servicio, P.FACT, fila…"
              onChange={(event) => onSearch(event.target.value)}
              aria-label="Buscar líneas"
            />
          </label>
          {level.search && (
            <p className="drill-note">
              {lines.length.toLocaleString('es-NI')} de {rows.length.toLocaleString('es-NI')} líneas · total de la búsqueda{' '}
              {money(totalOf(lines))} · {unitsText(unitTotals(lines))}. El total del nivel no cambia.
            </p>
          )}
          <DataTable
            key={`lines-${level.search}`}
            rows={lines}
            rowKey={(row) => row.id}
            pageSize={25}
            onRowClick={onOpenLine}
            columns={[
              { key: 'period', label: 'Semana', render: (row) => periodText(row.period, context.multiYear) },
              {
                key: 'lot',
                label: 'Suerte',
                render: (row) => <span className="drill-wrap">{`${row.hacienda} · ${row.suerte}`}</span>,
              },
              { key: 'service', label: 'Labor · servicio', render: (row) => `${row.labor} · ${row.service}` },
              { key: 'units', label: 'Cantidad', num: true, render: (row) => `${formatNumber(row.units)} ${row.unit}` },
              { key: 'tariff', label: 'Tarifa', num: true, render: (row) => formatNumber(row.tariff) },
              {
                key: 'total',
                label: 'Total',
                num: true,
                render: (row) => money(row.total),
                total: (list) => money(totalOf(list)),
              },
              { key: 'pFact', label: 'P.FACT' },
              { key: 'sourceRow', label: 'Fila', num: true, render: (row) => <code>{row.sourceRow}</code> },
              { key: 'date', label: 'Fecha' },
              {
                key: 'producerName',
                label: 'Productor',
                render: (row) => <span className="drill-wrap">{row.producerName}</span>,
              },
              { key: 'contractorCode', label: 'Contratista' },
            ]}
          />
        </>
      ) : (
        <DataTable
          key={tab}
          rows={groups}
          pageSize={20}
          initialSort={tab === 'period' ? undefined : { key: 'total', direction: 'desc' }}
          onRowClick={(group) => onOpenGroup(tab, group)}
          columns={[
            {
              key: 'label',
              label: FINANCE_DIMENSIONS[tab].label,
              value: (group) => (tab === 'period' ? group.key : group.label),
              render: (group) => <strong>{tab === 'period' ? periodLongText(group.key, context.multiYear) : group.label}</strong>,
            },
            ...(tab === 'lot'
              ? [
                  {
                    key: 'area',
                    label: 'Área ha',
                    num: true,
                    render: (group) => (group.lotsWithArea ? formatNumber(group.area) : '—'),
                  },
                  {
                    key: 'perHa',
                    label: 'Prefact. C$/ha',
                    num: true,
                    render: (group) => (group.perHa == null ? '—' : money(group.perHa)),
                  },
                ]
              : []),
            {
              key: 'total',
              label: 'Total',
              num: true,
              render: (group) => money(group.total),
              total: (list) => money(list.reduce((sum, group) => sum + group.total, 0)),
            },
            {
              key: 'share',
              label: '% del nivel',
              num: true,
              value: (group) => group.total,
              render: (group) => percentText(total ? (group.total / total) * 100 : 0),
            },
            {
              key: 'units',
              label: 'Cantidades',
              value: (group) => groupUnitsText(group),
              render: (group) => <span className="drill-wrap">{groupUnitsText(group)}</span>,
            },
            { key: 'rows', label: 'Líneas', num: true },
          ]}
        />
      )}
    </div>
  );
}

function LineLevel({ row, context, onOpenGroup }) {
  const kinds = context.repetitions.byId.get(row.id) ?? [];
  const finding = context.findingByPrefacturaId.get(row.id);
  return (
    <div className="drill-section">
      <LineFields row={row}>
        <Field label="Tipo de labor · universo">
          {[FINANCE_CLASSES[row.financeClass], FINANCE_UNIVERSES[row.universe]].filter(Boolean).join(' · ')}
        </Field>
      </LineFields>
      <h3>Repeticiones</h3>
      {kinds.length ? (
        <ul className="drill-list">
          {kinds.map((kind) => {
            const group = context.repetitions.groups.find((item) => item.kind === kind && item.rows.some((r) => r.id === row.id));
            return (
              <li key={kind}>
                {REPETITION_KINDS[kind]} · {group?.rows.length ?? 0} línea(s){' '}
                {group && (
                  <button type="button" className="link-button" onClick={() => onOpenGroup(group)}>
                    Ver grupo y Nómina relacionada
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="drill-note">Esta línea no pertenece a ningún grupo de repetición.</p>
      )}
      <h3>Conciliación</h3>
      {finding ? (
        <p className="explanation">
          <strong>{STATUS_LABELS[finding.status] ?? finding.status}.</strong> {finding.explanation}
        </p>
      ) : (
        <p className="drill-note">
          La línea no forma parte de un caso de conciliación contra Nómina (universo {FINANCE_UNIVERSES[row.universe] ?? '—'}).
        </p>
      )}
    </div>
  );
}
