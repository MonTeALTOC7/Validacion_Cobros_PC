import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { DataTable } from '../common/DataTable';
import { DrillDrawer } from './DrillDrawer';
import { LineFields } from './LineFields';
import { RepetitionGroupDetail, RepetitionGroupsList } from './RepetitionGroups';
import { assessDataQuality, hasAllRecords } from '../../engine/quality';
import { REPETITION_KINDS, classifyRepetitions } from '../../engine/repetitions';
import { normalizeText } from '../../engine/normalize';
import { payrollIndex, repetitionEvidence } from '../../lib/drill';

const REPETITION_PREFIX = 'repetition-';

/** Raíz del detalle de una alerta de calidad: grupos de repetición o todos los registros afectados. */
const rootLevel = (issue, inputs, atypicalTariffPct) => {
  if (issue.id.startsWith(REPETITION_PREFIX)) {
    const kind = issue.id.slice(REPETITION_PREFIX.length);
    return {
      kind: 'repetitions',
      title: issue.title,
      crumb: REPETITION_KINDS[kind] ?? 'Repeticiones',
      groups: classifyRepetitions(inputs.prefactura).groups.filter((group) => group.kind === kind),
    };
  }
  const full = assessDataQuality(inputs, { atypicalTariffPct, fullItems: true }).find((item) => item.id === issue.id);
  return {
    kind: 'items',
    title: issue.title,
    crumb: 'Registros',
    detail: issue.detail,
    count: issue.count,
    items: full?.items ?? full?.examples ?? issue.examples,
    complete: !!full?.items || hasAllRecords(issue),
    search: '',
  };
};

/** Detalle de una alerta de Calidad de datos con todos sus registros (no solo los ejemplos). */
export function QualityDrill({ issue, inputs, atypicalTariffPct, onClose }) {
  const [stack, setStack] = useState(() => [rootLevel(issue, inputs, atypicalTariffPct)]);
  const current = stack.at(-1);
  const push = (level) => setStack([...stack, level]);
  const byId = useMemo(() => {
    const map = new Map();
    inputs.prefactura.forEach((row) => map.set(row.id, { row, source: 'Prefactura' }));
    inputs.payroll.forEach((row) => map.set(row.id, { row, source: 'Nómina' }));
    return map;
  }, [inputs]);
  const payrollByKey = useMemo(() => payrollIndex(inputs.payroll), [inputs.payroll]);
  const allGroups = useMemo(() => classifyRepetitions(inputs.prefactura).groups, [inputs.prefactura]);
  const openLine = (row, source = 'Prefactura') =>
    push({ kind: 'line', title: `${source} · fila ${row.sourceRow}`, crumb: `Fila ${row.sourceRow}`, row, source });
  const openGroup = (group) =>
    push({
      kind: 'repetition-group',
      title: `${REPETITION_KINDS[group.kind]} · ${group.rows[0].hacienda} · ${group.rows[0].suerte}`,
      crumb: 'Grupo',
      group,
    });

  let body = null;
  if (current.kind === 'repetitions') body = <RepetitionGroupsList groups={current.groups} onOpenGroup={openGroup} />;
  else if (current.kind === 'repetition-group')
    body = (
      <RepetitionGroupDetail
        group={current.group}
        allGroups={allGroups}
        evidence={repetitionEvidence(current.group, inputs.prefactura, payrollByKey)}
        onOpenLine={(row) => openLine(row, 'Prefactura')}
      />
    );
  else if (current.kind === 'line') body = <LineFields row={current.row} source={current.source} />;
  else if (current.kind === 'items')
    body = (
      <ItemsLevel
        level={current}
        onSearch={(search) => setStack([...stack.slice(0, -1), { ...current, search }])}
        onOpen={(item) => {
          const found = item.rowId && byId.get(item.rowId);
          if (found) openLine(found.row, found.source);
        }}
      />
    );

  return (
    <DrillDrawer
      eyebrow="Calidad de datos"
      stack={stack}
      onBack={() => setStack(stack.slice(0, -1))}
      onJump={(index) => setStack(stack.slice(0, index + 1))}
      onClose={onClose}
    >
      {body}
    </DrillDrawer>
  );
}

function ItemsLevel({ level, onSearch, onOpen }) {
  const search = normalizeText(level.search);
  const items = search
    ? level.items.filter((item) =>
        normalizeText([item.source, item.file, item.row, item.period, item.date, item.lot, item.detail].join(' ')).includes(
          search,
        ),
      )
    : level.items;
  return (
    <div className="drill-section">
      <p className="explanation">{level.detail}</p>
      <p className="drill-note">
        {level.complete
          ? `${level.items.length.toLocaleString('es-NI')} registro(s) afectados${level.count !== level.items.length ? ` (la alerta cuenta ${level.count})` : ''}. ${level.items.some((item) => item.rowId) ? 'Seleccione uno para ver su origen.' : 'Las filas descartadas al importar no se guardan: se indica su archivo y fila.'}`
          : `Solo hay ${level.items.length} ejemplo(s) de los ${level.count.toLocaleString('es-NI')} registros de esta alerta: las filas descartadas al importar no se guardan y el importador conserva hasta 20 ejemplos por archivo. Para verlos todos, revise el archivo de origen.`}
      </p>
      <label className="drill-search">
        <Search size={15} />
        <input
          value={level.search}
          placeholder="Buscar archivo, fila, semana, lote o detalle…"
          onChange={(event) => onSearch(event.target.value)}
          aria-label="Buscar registros"
        />
      </label>
      <DataTable
        key={level.search}
        rows={items.map((item, index) => ({ ...item, key: `${item.rowId ?? 'x'}-${index}` }))}
        pageSize={25}
        onRowClick={(item) => item.rowId && onOpen(item)}
        footer={false}
        columns={[
          { key: 'source', label: 'Origen', render: (item) => item.source ?? '—' },
          { key: 'file', label: 'Archivo', render: (item) => item.file || '—' },
          { key: 'row', label: 'Fila', num: true, render: (item) => (item.row ? <code>{item.row}</code> : '—') },
          { key: 'period', label: 'Semana', render: (item) => item.period ?? '—' },
          { key: 'date', label: 'Fecha', render: (item) => item.date ?? '—' },
          { key: 'lot', label: 'Lote', render: (item) => item.lot ?? '—' },
          { key: 'detail', label: 'Detalle' },
        ]}
      />
    </div>
  );
}
