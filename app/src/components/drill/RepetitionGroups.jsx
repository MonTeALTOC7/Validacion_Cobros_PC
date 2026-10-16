import { useMemo, useState } from 'react';
import { DataTable } from '../common/DataTable';
import { REPETITION_KINDS } from '../../engine/repetitions';
import { FINANCE_UNIVERSES } from '../../engine/finance';
import { formatCurrency, formatNumber } from '../../lib/format';
import { distinctRepetitionLines, unitTotals } from '../../lib/drill';

const KIND_NOTES = {
  DUPLICADO_EXACTO: 'Líneas idénticas en todos los campos leídos, incluidos Total y P.FACT.',
  COBRO_EN_OTRA_PREFACTURA: 'Mismo lote, fecha, servicio, cantidad, tarifa y total con P.FACT distinto.',
  MISMA_CANTIDAD_TARIFA_DISTINTA: 'Misma clave de cobro y misma cantidad con tarifas distintas (p. ej. tarifa normal y doble).',
  VARIAS_LINEAS_MISMA_CLAVE: 'Misma clave de cobro con cantidades distintas; es habitual y se informa como dato.',
};
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const dayOf = (iso) => (iso ? DAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()] : '');
const unitsText = (list) => (list.length ? list.map((entry) => `${formatNumber(entry.units)} ${entry.unit}`).join(' · ') : '—');
const money = (value) => formatCurrency(value ?? 0);

/** Lista de grupos de repetición con resumen por tipo y líneas distintas (sin doble conteo). */
export function RepetitionGroupsList({ groups, onOpenGroup }) {
  const kinds = useMemo(() => Object.keys(REPETITION_KINDS).filter((kind) => groups.some((g) => g.kind === kind)), [groups]);
  const [kind, setKind] = useState('all');
  const shown = kind === 'all' ? groups : groups.filter((group) => group.kind === kind);
  const distinct = distinctRepetitionLines(shown);
  const summary = kinds.map((key) => {
    const list = groups.filter((group) => group.kind === key);
    return {
      key,
      groups: list.length,
      extraRows: list.reduce((total, group) => total + group.extraRows, 0),
      extraAmount: list.reduce((total, group) => total + group.extraAmount, 0),
    };
  });
  const multi = new Map();
  groups.forEach((group) => group.rows.forEach((row) => multi.set(row.id, (multi.get(row.id) ?? 0) + 1)));
  const shared = [...multi.values()].filter((count) => count > 1).length;

  return (
    <div className="drill-section">
      <div className="detail-grid drill-tiles">
        {summary.map((entry) => (
          <div key={entry.key} className="detail">
            <span>{REPETITION_KINDS[entry.key]}</span>
            <strong>
              {entry.groups} grupo(s)
              {entry.extraRows ? ` · ${entry.extraRows} copia(s) extra · ${money(entry.extraAmount)}` : ''}
            </strong>
          </div>
        ))}
        <div className="detail">
          <span>Líneas distintas en la vista</span>
          <strong>
            {distinct.count} · {money(distinct.amount)}
          </strong>
        </div>
      </div>
      <p className="drill-note">
        Las copias extra están incluidas en el total informado y no se descuentan. Una línea puede pertenecer a más de un grupo
        {shared ? ` (${shared} en esta lista)` : ''}; en “Líneas distintas” se cuenta una sola vez. Esta vista no califica los
        casos: abra un grupo para revisar sus líneas y la Nómina relacionada.
      </p>
      {kinds.length > 1 && (
        <div className="segmented drill-tabs" role="tablist">
          <button aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
            Todos ({groups.length})
          </button>
          {kinds.map((key) => (
            <button key={key} aria-pressed={kind === key} onClick={() => setKind(key)}>
              {REPETITION_KINDS[key]} ({groups.filter((group) => group.kind === key).length})
            </button>
          ))}
        </div>
      )}
      <DataTable
        rows={shown.map((group, index) => ({
          ...group,
          key: `${group.kind}-${group.rows.map((row) => row.id).join('-')}`,
          index,
        }))}
        rowKey={(group) => group.key}
        pageSize={20}
        onRowClick={onOpenGroup}
        columns={[
          { key: 'kind', label: 'Tipo', render: (group) => REPETITION_KINDS[group.kind] },
          { key: 'date', label: 'Fecha', value: (group) => group.rows[0].date, render: (group) => group.rows[0].date },
          {
            key: 'lot',
            label: 'Suerte',
            value: (group) => `${group.rows[0].hacienda} ${group.rows[0].suerte}`,
            render: (group) => `${group.rows[0].hacienda} · ${group.rows[0].suerte}`,
          },
          {
            key: 'service',
            label: 'Labor · servicio',
            value: (group) => group.rows[0].service,
            render: (group) => `${group.rows[0].labor} · ${group.rows[0].service}`,
          },
          {
            key: 'units',
            label: 'Cantidad',
            num: true,
            value: (group) => group.rows[0].units,
            render: (group) => unitsText(unitTotals(group.rows)),
          },
          {
            key: 'pfact',
            label: 'P.FACT',
            value: (group) => group.rows[0].pFact,
            render: (group) => [...new Set(group.rows.map((row) => row.pFact))].join(' / '),
          },
          {
            key: 'rowsList',
            label: 'Filas',
            value: (group) => group.rows[0].sourceRow,
            render: (group) => group.rows.map((row) => row.sourceRow).join(' / '),
          },
          {
            key: 'extraAmount',
            label: 'Copias extra',
            num: true,
            render: (group) => (group.extraRows ? money(group.extraAmount) : '—'),
            total: (rows) => money(rows.reduce((total, group) => total + group.extraAmount, 0)),
          },
        ]}
      />
    </div>
  );
}

/** Detalle de un grupo: sus líneas, las demás líneas de la clave y la Nómina de la misma clave, sin conclusiones. */
export function RepetitionGroupDetail({ group, allGroups, evidence, onOpenLine }) {
  const otherKinds = (row) =>
    allGroups
      // Dentro de un mismo tipo una línea pertenece a un solo grupo: se listan los demás tipos.
      .filter((other) => other.kind !== group.kind && other.rows.some((item) => item.id === row.id))
      .map((other) => REPETITION_KINDS[other.kind]);
  const lineColumns = [
    { key: 'sourceRow', label: 'Fila', num: true, render: (row) => <code>{row.sourceRow}</code> },
    { key: 'pFact', label: 'P.FACT' },
    { key: 'date', label: 'Fecha' },
    { key: 'units', label: 'Cantidad', num: true, render: (row) => `${formatNumber(row.units)} ${row.unit}` },
    { key: 'tariff', label: 'Tarifa', num: true, render: (row) => formatNumber(row.tariff) },
    {
      key: 'total',
      label: 'Total',
      num: true,
      render: (row) => money(row.total),
      total: (rows) => money(rows.reduce((total, row) => total + row.total, 0)),
    },
    { key: 'contractorCode', label: 'Contratista' },
  ];
  // Tres partes separadas: los registros que forman el grupo, la evidencia disponible y la interpretación (que no se hace).
  return (
    <div className="drill-section">
      <h3>1 · Registros repetidos en Prefactura</h3>
      <p className="explanation">
        <strong>{REPETITION_KINDS[group.kind]}.</strong> Criterio del grupo: {KIND_NOTES[group.kind]} {group.rows.length} línea(s)
        {group.extraRows
          ? `; ${group.extraRows} copia(s) extra por ${money(group.extraAmount)}, incluidas en el total informado sin descontar.`
          : '.'}
      </p>
      <DataTable
        rows={group.rows}
        rowKey={(row) => row.id}
        onRowClick={onOpenLine}
        pageSize={20}
        columns={[
          ...lineColumns,
          {
            key: 'others',
            label: 'También en',
            value: (row) => otherKinds(row).join(', '),
            render: (row) => otherKinds(row).join(', ') || '—',
          },
        ]}
      />
      <h3>2 · Evidencia disponible: Nómina de la misma clave</h3>
      <p className="drill-note">
        Clave de conciliación: año {group.rows[0].year ?? '—'}, semana {group.rows[0].week}, {group.rows[0].hacienda} · suerte{' '}
        {group.rows[0].suerte}, {group.rows[0].labor} · {group.rows[0].service}, {group.rows[0].unit}.
      </p>
      {!evidence.payrollApplies ? (
        <p className="explanation">
          Nómina no registra este tipo de labor ({FINANCE_UNIVERSES[evidence.universe] ?? evidence.universe}): no hay evidencia de
          Nómina para comparar. Se requiere la documentación de la labor (por ejemplo, la orden de trabajo).
        </p>
      ) : evidence.payrollRows.length ? (
        <>
          <p className="explanation">
            Nómina registra {unitsText(evidence.payrollUnits)} en {evidence.payrollRows.length} fila(s). Las{' '}
            {evidence.keyLines.length} línea(s) de Prefactura de la clave suman {unitsText(evidence.keyUnits)} (
            {money(evidence.keyAmount)}).
          </p>
          <DataTable
            rows={evidence.payrollRows}
            rowKey={(row) => row.id}
            pageSize={20}
            columns={[
              { key: 'sourceRow', label: 'Fila', num: true, render: (row) => <code>{row.sourceRow}</code> },
              { key: 'date', label: 'Fecha', render: (row) => `${row.date} ${dayOf(row.date)}` },
              { key: 'worker', label: 'Trabajador' },
              { key: 'units', label: 'Cantidad', num: true, render: (row) => `${formatNumber(row.units)} ${row.unit}` },
              {
                key: 'payrollTariff',
                label: 'Tarifa Nómina',
                num: true,
                render: (row) => (Number.isFinite(row.payrollTariff) ? formatNumber(row.payrollTariff) : '—'),
              },
              { key: 'doc', label: 'Documento' },
            ]}
          />
        </>
      ) : (
        <p className="explanation">
          No hay filas de Nómina con esta clave. Las {evidence.keyLines.length} línea(s) de Prefactura de la clave suman{' '}
          {unitsText(evidence.keyUnits)} ({money(evidence.keyAmount)}).
        </p>
      )}
      <details className="drill-details">
        <summary>Todas las líneas de Prefactura de la clave ({evidence.keyLines.length})</summary>
        <DataTable
          rows={evidence.keyLines}
          rowKey={(row) => row.id}
          onRowClick={onOpenLine}
          pageSize={20}
          columns={lineColumns}
        />
      </details>
      <h3>3 · Interpretación</h3>
      <p className="explanation drill-interpretation">
        La aplicación no califica este grupo ni concluye si hay un cobro indebido: la coincidencia de campos no lo demuestra y
        puede haber justificación operativa. Los registros y la evidencia se muestran para revisión; la interpretación corresponde
        a la auditoría operativa, que se trabaja por separado.
      </p>
    </div>
  );
}
