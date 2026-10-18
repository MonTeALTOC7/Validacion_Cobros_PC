import { useEffect, useMemo, useRef, useState } from 'react';
import { Tractor, FileSpreadsheet, CalendarDays, ArrowUpRight, X, Search } from 'lucide-react';
import { FIELDS, openSource, openTSV, suggestMapping, normalizeSource } from './importers';
import { inventory, coverage } from './model';
import { loadSources, saveSource } from './storage';
import './mechanized.css';

const LABELS = { hm: 'Horas Máquina', program: 'Programación de insumos' };
const FUTURE = [
  'Trabajos con Prefactura localizada',
  'Prefacturados confirmados',
  'Trabajos sin cobro localizado',
  'Prefacturas sin HM',
  'Programaciones por comprobar',
  'Posibles errores de registro',
  'Posibles duplicados',
  'Casos pendientes de validación',
];
const display = (value) => (value === '' || value == null ? '—' : String(value));

function Importer({ kind, onClose, onImport }) {
  const [source, setSource] = useState(null),
    [sheet, setSheet] = useState(0),
    [header, setHeader] = useState(0);
  const [mapping, setMapping] = useState({}),
    [preview, setPreview] = useState(null),
    [error, setError] = useState('');
  const [paste, setPaste] = useState(''),
    [busy, setBusy] = useState(false);
  const matrix = source?.sheets[sheet]?.matrix ?? [];
  const headers = matrix[header] ?? [];
  function configure(next, index = 0, row = 0) {
    setSource(next);
    setSheet(index);
    setHeader(row);
    setPreview(null);
    setError('');
    setMapping(suggestMapping(next.sheets[index].matrix[row] ?? [], kind));
  }
  async function action(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setPreview(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mec-import" aria-label={`Importar ${LABELS[kind]}`}>
      <div className="mec-heading">
        <div>
          <small>IMPORTACIÓN LOCAL</small>
          <h3>{LABELS[kind]}</h3>
        </div>
        <button onClick={onClose} disabled={busy} aria-label="Cerrar importación">
          <X size={18} />
        </button>
      </div>
      <p>
        {kind === 'hm'
          ? 'Seleccione una sola hoja del reporte. Revise el mapeo antes de incorporar registros HR.'
          : 'Asigne las columnas de su formato real. La programación no demuestra ejecución ni deuda.'}
      </p>
      <label>
        Archivo Excel
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files[0];
            if (file)
              action(async () => {
                const next = await openSource(file);
                const preferred = next.sheets.findIndex((s) => s.name === 'REPORTE');
                configure(next, Math.max(0, preferred));
              });
          }}
        />
      </label>
      {kind === 'program' && (
        <details>
          <summary>Pegar rango de Excel (TSV)</summary>
          <textarea
            aria-label="Rango de Excel"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Pegue los encabezados y las filas aquí"
          />
          <button disabled={busy || !paste.trim()} onClick={() => action(() => configure(openTSV(paste)))}>
            Leer rango
          </button>
        </details>
      )}
      {source && (
        <>
          <div className="mec-controls">
            <label>
              Hoja
              <select value={sheet} disabled={busy} onChange={(e) => configure(source, Number(e.target.value))}>
                {source.sheets.map((s, i) => (
                  <option value={i} key={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fila de encabezados
              <input
                type="number"
                min="1"
                max={matrix.length}
                value={header + 1}
                disabled={busy}
                onChange={(e) => configure(source, sheet, Math.max(0, Math.min(matrix.length - 1, Number(e.target.value) - 1)))}
              />
            </label>
          </div>
          <div className="mec-mapping">
            {FIELDS.map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  aria-label={label}
                  disabled={busy}
                  value={mapping[key] ?? ''}
                  onChange={(e) => {
                    setMapping({ ...mapping, [key]: e.target.value === '' ? undefined : Number(e.target.value) });
                    setPreview(null);
                  }}
                >
                  {<option value="">Sin asignar</option>}
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {display(h)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p>Vista previa: primeras 5 filas. Las columnas repetidas se distinguen por su número.</p>
          <div className="mec-scroll">
            <table>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>
                      {i + 1}. {display(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.slice(header + 1, header + 6).map((r, i) => (
                  <tr key={i}>
                    {headers.map((_, j) => (
                      <td key={j}>{display(r[j] instanceof Date ? r[j].toISOString().slice(0, 10) : r[j])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="mec-primary"
            disabled={busy}
            onClick={() => action(async () => setPreview(await normalizeSource(source, sheet, header, mapping, kind)))}
          >
            {busy ? 'Procesando…' : 'Validar importación'}
          </button>
        </>
      )}
      {preview && (
        <div className="mec-validation">
          <strong>
            {preview.rows.length} filas admitidas · {preview.rejected.length} excluidas · {preview.duplicateRows} repeticiones
            exactas
          </strong>
          <p>
            Las repeticiones se conservan para revisión. Incorporar reemplaza únicamente la fuente {LABELS[kind]} de este módulo.
          </p>
          {!!preview.rejected.length && (
            <details>
              <summary>Ver todas las exclusiones</summary>
              <ul>
                {preview.rejected.map((r) => (
                  <li key={r.sourceRow}>
                    Fila {r.sourceRow}: {r.reasons.join('; ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            className="mec-primary"
            disabled={busy || !preview.rows.length}
            onClick={() => action(() => onImport(kind, preview))}
          >
            Incorporar {preview.rows.length} registros
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mec-error">
          {error}
        </p>
      )}
    </section>
  );
}

function Inspector({ row, onClose }) {
  const close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="mec-overlay" onClick={onClose}>
      <section
        className="mec-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Evidencia original"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Tab') {
            const controls = [
              ...e.currentTarget.querySelectorAll('button, summary, [href], input, select, textarea, [tabindex="0"]'),
            ];
            const first = controls[0],
              last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="mec-heading">
          <div>
            <small>EVIDENCIA ORIGINAL · {row.source}</small>
            <h2>
              {row.hacienda || row.haciendaCode} · {row.suerte}
            </h2>
          </div>
          <button ref={close} aria-label="Cerrar evidencia" onClick={onClose}>
            <X />
          </button>
        </div>
        <p className="mec-note">
          Pendiente de conciliación. Esta ficha muestra el registro importado; no confirma ejecución ni respaldo de cobro.
        </p>
        <dl>
          {[
            ['Labor', row.labor],
            ['Descripción', row.laborName || row.serviceName],
            ['Fecha', row.date],
            ['Período', row.period || `${row.periodStart || ''} ${row.periodEnd || ''}`],
            ['Cantidad', `${display(row.units)} ${row.unit || ''}`],
            ['Documento / P.FACT', row.document],
            ['Productor', row.producer],
            ['Servicio SAP', row.service],
            ['Tarifa', row.tariff],
            ['Importe', row.total],
            ['Contratista', row.contractor],
            ['Máquina', row.machine],
            ['Archivo', row.sourceFile],
            ['Hoja', row.sourceSheet],
            ['Fila', row.sourceRow],
          ].map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{display(value)}</dd>
            </div>
          ))}
        </dl>
        {row.original && (
          <details>
            <summary>Todas las celdas originales</summary>
            <dl>
              {row.original.map((c) => (
                <div key={c.column}>
                  <dt>
                    {c.column}. {c.header || 'Sin encabezado'}
                  </dt>
                  <dd>{display(c.value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        <p>Vínculos, decisiones e historial estarán disponibles tras la aprobación de la Etapa B.</p>
      </section>
    </div>
  );
}

export function MechanizedPanel({ prefactura = [], onLoadPrefactura }) {
  const [sources, setSources] = useState({}),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [importKind, setImportKind] = useState(null),
    [selected, setSelected] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('Todas'),
    [query, setQuery] = useState(''),
    [labors, setLabors] = useState('MEC,ZGC,CCH');
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    loadSources()
      .then((data) => {
        if (active) {
          setSources(data);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(`No se pudo abrir el almacenamiento local: ${e.message}`);
      });
    return () => {
      active = false;
    };
  }, []);
  const rows = useMemo(
    () => inventory(sources.hm?.rows ?? [], prefactura, sources.program?.rows ?? [], labors),
    [sources, prefactura, labors],
  );
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (sourceFilter === 'Todas' || r.source === sourceFilter) &&
          [r.hacienda, r.haciendaCode, r.suerte, r.labor, r.producer, r.document, r.machine]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [rows, sourceFilter, query],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 50)),
    currentPage = Math.min(page, pages - 1);
  const cards = [
    ['HM', 'Horas Máquina', Tractor],
    ['Prefactura', 'Líneas de Prefactura', FileSpreadsheet],
    ['Programación', 'Registros programados', CalendarDays],
  ];
  return (
    <div className="mec-module">
      <section className="mec-hero">
        <div>
          <span className="mec-eyebrow">CASUR / CONTROL DOCUMENTAL</span>
          <h2>
            Validación de cobros
            <br />
            mecanizados
          </h2>
          <p>
            Reúna las fuentes. Inspeccione la evidencia.
            <br />
            Prepare la revisión de cada trabajo.
          </p>
        </div>
        <div className="mec-stage">
          <Tractor size={38} />
          <strong>Etapa A</strong>
          <span>Prototipo de importación</span>
          <small>Conciliación aún no evaluada</small>
        </div>
      </section>
      <div className="mec-sources">
        {cards.map(([key, title, Icon]) => {
          const data = rows.filter((r) => r.source === key);
          return (
            <button
              className={`mec-source ${sourceFilter === key ? 'selected' : ''}`}
              key={key}
              onClick={() => {
                setSourceFilter(key);
                setPage(0);
              }}
            >
              <div>
                <Icon size={20} />
                <ArrowUpRight size={18} />
              </div>
              <strong>{data.length.toLocaleString('es-NI')}</strong>
              <span>{title}</span>
              <small>{coverage(data)}</small>
            </button>
          );
        })}
      </div>
      <div className="mec-actions">
        <button className="mec-primary" disabled={!ready} onClick={() => setImportKind('hm')}>
          Importar Horas Máquina
        </button>
        <button disabled={!ready} onClick={() => setImportKind('program')}>
          Importar / pegar programación
        </button>
        <button onClick={onLoadPrefactura}>Cargar Prefactura existente</button>
      </div>
      <p className="mec-note">
        HR y HA se conservan por separado. Programar no demuestra ejecución. Las fuentes locales se guardan solo en este
        navegador.
      </p>
      {error && (
        <p role="alert" className="mec-error">
          {error}
        </p>
      )}
      {importKind && (
        <Importer
          key={importKind}
          kind={importKind}
          onClose={() => setImportKind(null)}
          onImport={async (kind, data) => {
            await saveSource(kind, data);
            setSources((s) => ({ ...s, [kind]: data }));
            setImportKind(null);
            setPage(0);
          }}
        />
      )}
      <details className="mec-roadmap">
        <summary>Indicadores de conciliación · disponibles en Etapa B</summary>
        <div className="mec-kpis">
          {FUTURE.map((label) => (
            <div key={label}>
              <strong>—</strong>
              <span>{label}</span>
              <small>No evaluado</small>
            </div>
          ))}
        </div>
      </details>
      <section className="mec-inbox">
        <div className="mec-heading">
          <div>
            <small>FUENTES Y TRAZABILIDAD</small>
            <h3>Bandeja de evidencia</h3>
          </div>
          <span>{filtered.length} registros</span>
        </div>
        <div className="mec-controls">
          <label className="mec-search">
            <span>
              <Search size={15} /> Buscar evidencia
            </span>
            <input
              placeholder="Productor, hacienda, suerte, labor, documento…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            Fuente
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(0);
              }}
            >
              {['Todas', ...cards.map((c) => c[0])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label title="Filtro explícito de códigos; no crea equivalencias entre labores.">
            Labores de Prefactura
            <input
              value={labors}
              onChange={(e) => {
                setLabors(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        <p className="mec-subtle">
          Filtro inicial MEC, ZGC, CCH; agregue otros códigos separados por coma. FTS no se convierte en MEC. Fechas mostradas:
          extremos observados, no cobertura garantizada.
        </p>
        <div className="mec-scroll" tabIndex="0" aria-label="Tabla de evidencia desplazable">
          <table>
            <thead>
              <tr>
                {['Fuente', 'Hacienda / suerte', 'Labor', 'Fecha / período', 'Cantidad', 'Documento', 'Evidencia'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(currentPage * 50, currentPage * 50 + 50).map((r) => (
                <tr key={r.inventoryKey}>
                  <td>
                    <span className="mec-badge">{r.source}</span>
                  </td>
                  <td>
                    <strong>{r.hacienda || r.haciendaCode}</strong>
                    <small>
                      {r.haciendaCode} · Suerte {r.suerte}
                    </small>
                  </td>
                  <td>
                    {r.labor}
                    <small>{r.laborName || r.serviceName}</small>
                  </td>
                  <td>{display(r.date || r.period)}</td>
                  <td>
                    {display(r.units)} <small>{r.unit}</small>
                  </td>
                  <td>{display(r.document)}</td>
                  <td>
                    <button onClick={() => setSelected(r)} aria-label={`Ver evidencia ${r.source} fila ${r.sourceRow}`}>
                      Ver <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="mec-empty">
            <FileSpreadsheet size={30} />
            <strong>{rows.length ? 'No hay registros con estos filtros' : 'Comience por incorporar sus fuentes'}</strong>
            <p>Las cifras y la bandeja se actualizarán con los archivos cargados.</p>
          </div>
        )}
        <div className="mec-pagination">
          <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
            Anterior
          </button>
          <span>
            Página {currentPage + 1} de {pages} · 50 filas por página
          </span>
          <button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>
            Siguiente
          </button>
        </div>
      </section>
      {selected && <Inspector row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
