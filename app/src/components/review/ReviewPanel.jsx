import { useState, useMemo, useRef } from 'react';
import {
  CircleCheck,
  CloudUpload,
  Download,
  FileSearch,
  FileSpreadsheet,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { ImportReviewDrawer } from '../ImportReviewDrawer';
import { ReviewFindingDrawer } from './ReviewFindingDrawer';
import { exportReviewWorkbook } from '../../engine/exports';
import { diffRows, parseReviewFile } from '../../engine/importers';
import { normalizeText } from '../../engine/normalize';
import { REVIEW_STATUS_LABELS, isReviewComparable, runReview } from '../../engine/review';
import { formatCurrency, formatNumber } from '../../lib/format';

export function ReviewPanel({ inputs: a, workspace: s, onWorkspace: t, onAudit: n }) {
  const [i, r] = useState(false);
  const [l, o] = useState('');
  const [x, m] = useState('all');
  const [f, S] = useState('all');
  const [A, E] = useState('all');
  const [D, I] = useState('all');
  const [v, N] = useState(null);
  const [g, d] = useState('all');
  const [R, O] = useState(null);
  const [C, y] = useState('');
  const [_, P] = useState('');
  const h = useRef(null);
  const L = (u) => {
    var T;
    d(u);
    m('all');
    o('');
    S('all');
    E('all');
    I('all');
    (T = h.current) == null ||
      T.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
  };
  const F = useMemo(
    () => (s && a.payroll.length ? runReview(a, s.rows, s.requestedWeekStart, s.requestedWeekEnd) : null),
    [a, s],
  );
  const j = useMemo(
    () =>
      ((F == null ? undefined : F.findings) ?? []).filter((u) => {
        const T = `${u.labor}|${u.services.join(',')}|${u.serviceNames.join(',')}`;
        const q = normalizeText(
          `${u.hacienda} ${u.suerte} ${u.labor} ${u.services.join(' ')} ${u.serviceNames.join(' ')} ${REVIEW_STATUS_LABELS[u.status]}`,
        );
        return (
          (!l || q.includes(normalizeText(l))) &&
          (x === 'all' || u.status === x) &&
          (g === 'all' ||
            (g === 'covered'
              ? isReviewComparable(u)
              : g === 'followup'
                ? ['warning', 'info'].includes(u.severity)
                : u.severity === g)) &&
          (f === 'all' || u.week === Number(f)) &&
          (A === 'all' || u.hacienda === A) &&
          (D === 'all' || T === D)
        );
      }),
    [F, l, x, f, A, D, g],
  );
  const w = [...new Set(((F == null ? undefined : F.findings) ?? []).map((u) => u.week))].sort(
    (u, T) => u - T,
  );
  const z = [...new Set(((F == null ? undefined : F.findings) ?? []).map((u) => u.hacienda))].sort();
  const B = [
    ...new Map(
      ((F == null ? undefined : F.findings) ?? []).map((u) => {
        const T = `${u.labor}|${u.services.join(',')}|${u.serviceNames.join(',')}`;
        const q = u.services.length
          ? u.services.join(', ')
          : u.serviceNames.join(', ') || 'sin código de servicio';
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
  const k = async (u, T) => {
    !s ||
      !u ||
      !T ||
      u > T ||
      (await t({
        ...s,
        requestedWeekStart: u,
        requestedWeekEnd: T,
      }),
      S('all'),
      await n('PERIODO_REVISION_ACTUALIZADO', `Semanas ${u}-${T} para ${s.file.name}.`));
  };
  const p = async (u) => {
    r(true);
    P('');
    y('');
    try {
      const T = await parseReviewFile(u);
      const q = {
        file: T.file,
        rows: T.rows,
        requestedWeekStart: T.file.weekStart,
        requestedWeekEnd: T.file.weekEnd,
      };
      O(q);
    } catch (T) {
      P(
        (T instanceof Error ? T.message : 'No se pudo leer el archivo.') +
          ' Se conserva la revisión anterior.',
      );
    } finally {
      r(false);
    }
  };
  return a.payroll.length ? (
    <div className="review-module">
      {_ && (
        <div className="notice error" role="alert">
          {_}
        </div>
      )}
      {C && (
        <div className="notice ok" role="status">
          {C}
        </div>
      )}
      {R && (
        <ImportReviewDrawer
          name={R.file.name}
          previous={(s == null ? undefined : s.rows) ?? []}
          incoming={R.rows}
          skipped={R.file.skippedRows}
          sameFile={(s == null ? undefined : s.file.hash) === R.file.hash}
          onCancel={() => O(null)}
          onConfirm={async () => {
            const u = diffRows((s == null ? undefined : s.rows) ?? [], R.rows);
            await t(R);
            const T =
              R.file.name +
              ': formato reconocido; ' +
              R.rows.length +
              ' filas, ' +
              u.added +
              ' agregadas/modificadas, ' +
              u.removed +
              ' retiradas/modificadas. Semanas ' +
              R.file.weekStart +
              '–' +
              R.file.weekEnd +
              '. Confirme debajo el período indicado en el correo.';
            y(T);
            O(null);
            L('all');
            N(null);
            await n('ARCHIVO_REVISION_CARGADO', T);
          }}
        />
      )}
      <section className="panel review-intro">
        <div>
          <span className="eyebrow">DEPARTAMENTO NEGOCIOS DE CAÑA</span>
          <h2>Revisión por Correo</h2>
          <p>
            Compare el Excel enviado por correo contra todas las labores manuales registradas en Nómina para
            las semanas solicitadas.
          </p>
        </div>
        <label className="button primary">
          <CloudUpload size={17} /> {i ? 'Validando…' : s ? 'Reemplazar Excel' : 'Cargar Excel'}
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={i}
            onChange={(u) => {
              var q;
              const T = (q = u.target.files) == null ? undefined : q[0];
              T && p(T);
              u.currentTarget.value = '';
            }}
          />
        </label>
      </section>
      {s ? (
        <>
          <section className="panel review-source">
            <div className="review-file">
              <FileSpreadsheet />
              <span>
                <strong>{s.file.name}</strong>
                <small>
                  {s.file.source === 'PRELOADED'
                    ? 'Precargado para Revisión por Correo'
                    : 'Actualizado por Carlos Tijerino'}
                  {' · '}
                  {s.file.rows}
                  {' filas · semanas '}
                  {s.file.weekStart}–{s.file.weekEnd}
                </small>
                <code>
                  {'SHA256 '}
                  {s.file.hash.slice(0, 16)}…
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
                  value={s.requestedWeekStart}
                  onChange={(u) => void k(Number(u.target.value), s.requestedWeekEnd)}
                />
              </label>
              <label>
                Hasta
                <input
                  type="number"
                  min="1"
                  max="53"
                  value={s.requestedWeekEnd}
                  onChange={(u) => void k(s.requestedWeekStart, Number(u.target.value))}
                />
              </label>
            </div>
          </section>
          {F && (
            <>
              {(F.outsidePeriodRows > 0 || F.unexpectedContractorRows > 0) && (
                <div className="review-alert">
                  <TriangleAlert />
                  <span>
                    <strong>El archivo requiere atención antes de aprobarse.</strong>
                    <small>
                      {F.outsidePeriodRows
                        ? `${F.outsidePeriodRows} filas están fuera de las semanas ${F.requestedWeekStart}–${F.requestedWeekEnd}. `
                        : ''}
                      {F.unexpectedContractorRows
                        ? `${F.unexpectedContractorRows} filas no pertenecen a CS9999.`
                        : ''}
                    </small>
                  </span>
                </div>
              )}
              <div className="kpi-grid review-kpis">
                <ReviewKpi
                  title="Cubiertas en archivo"
                  value={F.findings.filter(isReviewComparable).length}
                  note="Incluye exceso; no significa cantidad exacta"
                  tone="green"
                  onClick={() => L('covered')}
                />
                <ReviewKpi
                  title="Sin incluir / parciales"
                  value={F.critical}
                  note="Unidades de Nómina aún no cubiertas"
                  tone="red"
                  onClick={() => L('critical')}
                />
                <ReviewKpi
                  title="Seguimientos"
                  value={F.warnings}
                  note="Excesos y otras observaciones"
                  tone="blue"
                  onClick={() => L('followup')}
                />
                <ReviewKpi
                  title="Total recibido"
                  value={formatCurrency(F.total)}
                  note={`${F.reviewRows} filas en el Excel`}
                  tone="blue"
                  onClick={() => L('all')}
                />
              </div>
              <div ref={h} className="review-tools">
                <strong>
                  {'Vista: '}
                  {g === 'critical'
                    ? 'Pendientes'
                    : g === 'followup'
                      ? 'Seguimientos secundarios'
                      : g === 'covered'
                        ? 'Cubiertas en archivo'
                        : 'Todos los resultados'}
                </strong>
                <button className="button secondary" onClick={() => L('all')}>
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
                      exportReviewWorkbook(F, s);
                      n('INFORME_REVISION_EXPORTADO', s.file.name);
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
                      value={l}
                      onChange={(u) => o(u.target.value)}
                    />
                  </div>
                  <select aria-label="Filtrar por semana" value={f} onChange={(u) => S(u.target.value)}>
                    <option value="all">Todas las semanas</option>
                    {w.map((u) => (
                      <option key={u} value={u}>
                        {'Semana '}
                        {u}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Filtrar por hacienda" value={A} onChange={(u) => E(u.target.value)}>
                    <option value="all">Todas las haciendas</option>
                    {z.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar por labor y servicio"
                    value={D}
                    onChange={(u) => I(u.target.value)}
                  >
                    <option value="all">Todas las labores / servicios</option>
                    {B.map((u) => (
                      <option key={u.key} value={u.key}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Filtrar por resultado" value={x} onChange={(u) => m(u.target.value)}>
                    <option value="all">Todos los resultados</option>
                    {Object.entries(REVIEW_STATUS_LABELS).map(([u, T]) => (
                      <option key={u} value={u}>
                        {T}
                      </option>
                    ))}
                  </select>
                  <span>
                    {j.length}
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
                      {j.map((u) => (
                        <tr
                          key={u.id}
                          tabIndex={0}
                          onClick={() => N(u)}
                          onKeyDown={(T) => {
                            T.key === 'Enter' && N(u);
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
                              {u.serviceNames.join(', ') ||
                                (u.unit === u.reviewUnit ? u.unit : `${u.unit} → ${u.reviewUnit}`)}
                            </small>
                          </td>
                          <td>
                            <span className={`review-status ${u.severity}`}>
                              {REVIEW_STATUS_LABELS[u.status]}
                            </span>
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
                  {!j.length && <div className="empty-table">No hay resultados con estos filtros.</div>}
                </div>
              </section>
            </>
          )}
        </>
      ) : (
        <section className="panel review-empty">
          <FileSpreadsheet />
          <h3>Cargue el Excel recibido por correo</h3>
          <p>
            Debe contener la hoja REPORTE y las columnas SEM., Nombre Hacienda, STE., LAB, UM, TARIFA, TOTAL y
            UND.
          </p>
        </section>
      )}
      {v && s && <ReviewFindingDrawer finding={v} inputs={a} workspace={s} onClose={() => N(null)} />}
    </div>
  ) : (
    <div className="empty-state">
      <FileSearch />
      <h3>Falta el reporte de Nómina</h3>
      <p>Este control utiliza la Nómina vigente de la aplicación como base esperada.</p>
    </div>
  );
}
function ReviewKpi({ title: a, value: s, note: t, tone: n, onClick: i }) {
  return (
    <button type="button" onClick={i} className={`review-kpi ${n}`}>
      <span>{a}</span>
      <strong>{typeof s == 'number' ? s.toLocaleString('es-NI') : s}</strong>
      <small>
        {t}
        {' →'}
      </small>
    </button>
  );
}
