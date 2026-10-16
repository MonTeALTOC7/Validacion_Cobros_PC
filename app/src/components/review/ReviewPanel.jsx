import { useState, useMemo, useRef } from 'react';
import { CircleCheck, CloudUpload, Download, FileSearch, FileSpreadsheet, Search, TriangleAlert } from 'lucide-react';
import { ImportReviewDrawer } from '../ImportReviewDrawer';
import { ReviewFindingDrawer } from './ReviewFindingDrawer';
import { exportReviewWorkbook } from '../../engine/exports';
import { diffRows, parseReviewFile } from '../../engine/importers';
import { normalizeText } from '../../engine/normalize';
import { REVIEW_STATUS_LABELS, isReviewComparable, runReview } from '../../engine/review';
import { formatCurrency, formatNumber } from '../../lib/format';
export function ReviewPanel({ inputs, workspace, onWorkspace, onAudit }) {
  const [reading, setReading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [weekFilter, setWeekFilter] = useState('all');
  const [haciendaFilter, setHaciendaFilter] = useState('all');
  const [laborFilter, setLaborFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [groupFilter, setGroupFilter] = useState('all');
  const [pending, setPending] = useState(null);
  const [okMessage, setOkMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const tableRef = useRef(null);
  const focusGroup = (u) => {
    var T;
    setGroupFilter(u);
    setStatusFilter('all');
    setSearch('');
    setWeekFilter('all');
    setHaciendaFilter('all');
    setLaborFilter('all');
    (T = tableRef.current) == null ||
      T.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
  };
  const review = useMemo(
    () =>
      workspace && inputs.payroll.length
        ? runReview(inputs, workspace.rows, workspace.requestedWeekStart, workspace.requestedWeekEnd)
        : null,
    [inputs, workspace],
  );
  const filtered = useMemo(
    () =>
      ((review == null ? undefined : review.findings) ?? []).filter((u) => {
        const T = `${u.labor}|${u.services.join(',')}|${u.serviceNames.join(',')}`;
        const q = normalizeText(
          `${u.hacienda} ${u.suerte} ${u.labor} ${u.services.join(' ')} ${u.serviceNames.join(' ')} ${REVIEW_STATUS_LABELS[u.status]}`,
        );
        return (
          (!search || q.includes(normalizeText(search))) &&
          (statusFilter === 'all' || u.status === statusFilter) &&
          (groupFilter === 'all' ||
            (groupFilter === 'covered'
              ? isReviewComparable(u)
              : groupFilter === 'followup'
                ? ['warning', 'info'].includes(u.severity)
                : u.severity === groupFilter)) &&
          (weekFilter === 'all' || u.week === Number(weekFilter)) &&
          (haciendaFilter === 'all' || u.hacienda === haciendaFilter) &&
          (laborFilter === 'all' || T === laborFilter)
        );
      }),
    [review, search, statusFilter, weekFilter, haciendaFilter, laborFilter, groupFilter],
  );
  const weeks = [...new Set(((review == null ? undefined : review.findings) ?? []).map((u) => u.week))].sort((u, T) => u - T);
  const haciendas = [...new Set(((review == null ? undefined : review.findings) ?? []).map((u) => u.hacienda))].sort();
  const laborOptions = [
    ...new Map(
      ((review == null ? undefined : review.findings) ?? []).map((u) => {
        const T = `${u.labor}|${u.services.join(',')}|${u.serviceNames.join(',')}`;
        const q = u.services.length ? u.services.join(', ') : u.serviceNames.join(', ') || 'sin código de servicio';
        return [
          T,
          {
            key: T,
            label: `${u.labor} · ${q}`,
          },
        ];
      }),
    ).values(),
  ].sort((u, T) => u.label.localeCompare(T.label));
  const updatePeriod = async (u, T) => {
    !workspace ||
      !u ||
      !T ||
      u > T ||
      (await onWorkspace({
        ...workspace,
        requestedWeekStart: u,
        requestedWeekEnd: T,
      }),
      setWeekFilter('all'),
      await onAudit('PERIODO_REVISION_ACTUALIZADO', `Semanas ${u}-${T} para ${workspace.file.name}.`));
  };
  const readFile = async (u) => {
    setReading(true);
    setErrorMessage('');
    setOkMessage('');
    try {
      const T = await parseReviewFile(u);
      const q = {
        file: T.file,
        rows: T.rows,
        requestedWeekStart: T.file.weekStart,
        requestedWeekEnd: T.file.weekEnd,
      };
      setPending(q);
    } catch (T) {
      setErrorMessage((T instanceof Error ? T.message : 'No se pudo leer el archivo.') + ' Se conserva la revisión anterior.');
    } finally {
      setReading(false);
    }
  };
  return inputs.payroll.length ? (
    <div className="review-module">
      {errorMessage && (
        <div className="notice error" role="alert">
          {errorMessage}
        </div>
      )}
      {okMessage && (
        <div className="notice ok" role="status">
          {okMessage}
        </div>
      )}
      {pending && (
        <ImportReviewDrawer
          name={pending.file.name}
          previous={(workspace == null ? undefined : workspace.rows) ?? []}
          incoming={pending.rows}
          metadata={pending.file}
          sameFile={(workspace == null ? undefined : workspace.file.hash) === pending.file.hash}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const u = diffRows((workspace == null ? undefined : workspace.rows) ?? [], pending.rows);
            await onWorkspace(pending);
            const T =
              pending.file.name +
              ': formato reconocido; ' +
              pending.rows.length +
              ' filas, ' +
              u.added +
              ' agregadas/modificadas, ' +
              u.removed +
              ' retiradas/modificadas. Semanas ' +
              pending.file.weekStart +
              '–' +
              pending.file.weekEnd +
              '. Confirme debajo el período indicado en el correo.';
            setOkMessage(T);
            setPending(null);
            focusGroup('all');
            setSelected(null);
            await onAudit('ARCHIVO_REVISION_CARGADO', T);
          }}
        />
      )}
      <section className="panel review-intro">
        <div>
          <span className="eyebrow">DEPARTAMENTO NEGOCIOS DE CAÑA</span>
          <h2>Revisión por Correo</h2>
          <p>
            Compare el Excel enviado por correo contra todas las labores manuales registradas en Nómina para las semanas
            solicitadas.
          </p>
        </div>
        <label className="button primary">
          <CloudUpload size={17} /> {reading ? 'Validando…' : workspace ? 'Reemplazar Excel' : 'Cargar Excel'}
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={reading}
            onChange={(u) => {
              var q;
              const T = (q = u.target.files) == null ? undefined : q[0];
              T && readFile(T);
              u.currentTarget.value = '';
            }}
          />
        </label>
      </section>
      {workspace ? (
        <>
          <section className="panel review-source">
            <div className="review-file">
              <FileSpreadsheet />
              <span>
                <strong>{workspace.file.name}</strong>
                <small>
                  {workspace.file.source === 'PRELOADED'
                    ? 'Precargado para Revisión por Correo'
                    : 'Actualizado por Carlos Tijerino'}
                  {' · '}
                  {workspace.file.rows}
                  {' filas · semanas '}
                  {workspace.file.weekStart}–{workspace.file.weekEnd}
                </small>
                <code>
                  {'SHA256 '}
                  {workspace.file.hash.slice(0, 16)}…
                </code>
              </span>
              <CircleCheck />
            </div>
            <div className="review-period">
              <div>
                <strong>Período indicado en el correo</strong>
                <small>Es independiente de las semanas contenidas físicamente en el Excel.</small>
              </div>
              <label>
                Desde
                <input
                  type="number"
                  min="1"
                  max="53"
                  value={workspace.requestedWeekStart}
                  onChange={(u) => void updatePeriod(Number(u.target.value), workspace.requestedWeekEnd)}
                />
              </label>
              <label>
                Hasta
                <input
                  type="number"
                  min="1"
                  max="53"
                  value={workspace.requestedWeekEnd}
                  onChange={(u) => void updatePeriod(workspace.requestedWeekStart, Number(u.target.value))}
                />
              </label>
            </div>
          </section>
          {review && (
            <>
              {(review.outsidePeriodRows > 0 || review.unexpectedContractorRows > 0) && (
                <div className="review-alert">
                  <TriangleAlert />
                  <span>
                    <strong>El archivo requiere atención antes de aprobarse.</strong>
                    <small>
                      {review.outsidePeriodRows
                        ? `${review.outsidePeriodRows} filas están fuera de las semanas ${review.requestedWeekStart}–${review.requestedWeekEnd}. `
                        : ''}
                      {review.unexpectedContractorRows ? `${review.unexpectedContractorRows} filas no pertenecen a CS9999.` : ''}
                    </small>
                  </span>
                </div>
              )}
              <div className="kpi-grid review-kpis">
                <ReviewKpi
                  title="Cubiertas en archivo"
                  value={review.findings.filter(isReviewComparable).length}
                  note="Incluye exceso; no significa cantidad exacta"
                  tone="green"
                  onClick={() => focusGroup('covered')}
                />
                <ReviewKpi
                  title="Sin incluir / parciales"
                  value={review.critical}
                  note="Unidades de Nómina aún no cubiertas"
                  tone="red"
                  onClick={() => focusGroup('critical')}
                />
                <ReviewKpi
                  title="Seguimientos"
                  value={review.warnings}
                  note="Excesos y otras observaciones"
                  tone="blue"
                  onClick={() => focusGroup('followup')}
                />
                <ReviewKpi
                  title="Total recibido"
                  value={formatCurrency(review.total)}
                  note={`${review.reviewRows} filas en el Excel`}
                  tone="blue"
                  onClick={() => focusGroup('all')}
                />
              </div>
              <div ref={tableRef} className="review-tools">
                <strong>
                  {'Vista: '}
                  {groupFilter === 'critical'
                    ? 'Pendientes'
                    : groupFilter === 'followup'
                      ? 'Seguimientos secundarios'
                      : groupFilter === 'covered'
                        ? 'Cubiertas en archivo'
                        : 'Todos los resultados'}
                </strong>
                <button className="button secondary" onClick={() => focusGroup('all')}>
                  Limpiar todos los filtros
                </button>
              </div>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Resultado de la revisión</h2>
                    <p>Seleccione una fila para desplegar el detalle y las evidencias de ambos archivos.</p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      exportReviewWorkbook(review, workspace);
                      onAudit('INFORME_REVISION_EXPORTADO', workspace.file.name);
                    }}
                  >
                    <Download size={16} />
                    {' Descargar informe'}
                  </button>
                </div>
                <div className="review-tools">
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      placeholder="Buscar hacienda, suerte, labor o servicio"
                      value={search}
                      onChange={(u) => setSearch(u.target.value)}
                    />
                  </div>
                  <select aria-label="Filtrar por semana" value={weekFilter} onChange={(u) => setWeekFilter(u.target.value)}>
                    <option value="all">Todas las semanas</option>
                    {weeks.map((u) => (
                      <option key={u} value={u}>
                        {'Semana '}
                        {u}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar por hacienda"
                    value={haciendaFilter}
                    onChange={(u) => setHaciendaFilter(u.target.value)}
                  >
                    <option value="all">Todas las haciendas</option>
                    {haciendas.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar por labor y servicio"
                    value={laborFilter}
                    onChange={(u) => setLaborFilter(u.target.value)}
                  >
                    <option value="all">Todas las labores / servicios</option>
                    {laborOptions.map((u) => (
                      <option key={u.key} value={u.key}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar por resultado"
                    value={statusFilter}
                    onChange={(u) => setStatusFilter(u.target.value)}
                  >
                    <option value="all">Todos los resultados</option>
                    {Object.entries(REVIEW_STATUS_LABELS).map(([u, T]) => (
                      <option key={u} value={u}>
                        {T}
                      </option>
                    ))}
                  </select>
                  <span>
                    {filtered.length}
                    {' resultados'}
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="review-table">
                    <thead>
                      <tr>
                        <th>Semana</th>
                        <th>Hacienda / suerte</th>
                        <th>Labor / servicio</th>
                        <th>Resultado</th>
                        <th className="num">Nómina</th>
                        <th className="num">Excel recibido</th>
                        <th className="num">Diferencia</th>
                        <th className="num">Tarifa</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u) => (
                        <tr
                          key={u.id}
                          tabIndex={0}
                          onClick={() => setSelected(u)}
                          onKeyDown={(T) => {
                            T.key === 'Enter' && setSelected(u);
                          }}
                        >
                          <td>
                            <strong>{u.week}</strong>
                          </td>
                          <td>
                            <strong>{u.hacienda}</strong>
                            <small>
                              {'Suerte '}
                              {u.suerte}
                            </small>
                          </td>
                          <td>
                            <strong>
                              {u.labor}
                              {' · '}
                              {u.services.join(', ') || 'sin código'}
                            </strong>
                            <small>
                              {u.serviceNames.join(', ') || (u.unit === u.reviewUnit ? u.unit : `${u.unit} → ${u.reviewUnit}`)}
                            </small>
                          </td>
                          <td>
                            <span className={`review-status ${u.severity}`}>{REVIEW_STATUS_LABELS[u.status]}</span>
                            <small>{u.explanation}</small>
                          </td>
                          <td className="num">{formatNumber(u.payrollUnits)}</td>
                          <td className="num">{formatNumber(u.reviewUnits)}</td>
                          <td
                            className={`num ${u.severity === 'critical' && u.difference < -0.01 ? 'difference' : u.difference > 0.01 ? 'surplus' : ''}`}
                          >
                            {formatNumber(u.difference)}
                          </td>
                          <td className="num">{formatNumber(u.tariff, 2)}</td>
                          <td className="num">{formatCurrency(u.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && <div className="empty-table">No hay resultados con estos filtros.</div>}
                </div>
              </section>
            </>
          )}
        </>
      ) : (
        <section className="panel review-empty">
          <FileSpreadsheet />
          <h3>Cargue el Excel recibido por correo</h3>
          <p>Debe contener la hoja REPORTE y las columnas SEM., Nombre Hacienda, STE., LAB, UM, TARIFA, TOTAL y UND.</p>
        </section>
      )}
      {selected && workspace && (
        <ReviewFindingDrawer finding={selected} inputs={inputs} workspace={workspace} onClose={() => setSelected(null)} />
      )}
    </div>
  ) : (
    <div className="empty-state">
      <FileSearch />
      <h3>Falta el reporte de Nómina</h3>
      <p>Este control utiliza la Nómina vigente de la aplicación como base esperada.</p>
    </div>
  );
}
function ReviewKpi({ title, value, note, tone, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`review-kpi ${tone}`}>
      <span>{title}</span>
      <strong>{typeof value == 'number' ? value.toLocaleString('es-NI') : value}</strong>
      <small>
        {note}
        {' →'}
      </small>
    </button>
  );
}
