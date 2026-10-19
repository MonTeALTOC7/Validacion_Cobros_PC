import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { FIELDS } from './importers';
import {
  reconcile,
  DEFAULT_RULES,
  STATES,
  DECISIONS,
  reviewStatus,
  makeReview,
  selectedAmount,
  evidenceDate,
  code,
} from './reconciliation';
import { loadReviews, saveReview, loadRules, saveRules, saveEvaluation, exportDecisions, restoreDecisions } from './storage';

const SOURCES = { hm: 'HM', pf: 'Prefactura', program: 'Programación' };
const FIELD_LABELS = {
  ...Object.fromEntries(FIELDS),
  pFact: 'P.FACT',
  service: 'Servicio SAP',
  serviceName: 'Descripción del servicio',
  tariff: 'Tarifa',
  total: 'Importe',
  producer: 'Productor',
  producerName: 'Nombre del productor',
  producerCode: 'Código del productor',
  contractor: 'Contratista',
  contractorCode: 'Código del contratista',
  sourceRow: 'Fila de origen',
  sourceFile: 'Archivo de origen',
  sourceSheet: 'Hoja de origen',
  invoice: 'Factura',
  periodStart: 'Inicio del período',
  periodEnd: 'Fin del período',
  lotArea: 'Área de la suerte',
};
const label = (e) =>
  `${SOURCES[e.source]} · ${e.row.haciendaCode || e.row.hacienda || 'Sin hacienda'} / ${e.row.suerte || 'Sin suerte'} · ${e.row.labor || 'Sin labor'} · ${e.row.document || e.row.pFact || 'Sin documento'} · ${evidenceDate(e) || 'Sin fecha'}`;
const money = (n) => n.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function download(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mecanizadas-decisiones.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CaseDrawer({ item, result, review, onClose, onSave }) {
  const [links, setLinks] = useState(review?.links || [item.anchor.id]);
  const [state, setState] = useState('pending'),
    [notes, setNotes] = useState('');
  const [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const close = useRef(null);
  useEffect(() => {
    const escape = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  const status = reviewStatus(review, item, result.evidence);
  const relatedIds = new Set(item.related.map((e) => e.id));
  const selected = result.evidence.filter((e) => links.includes(e.id) || relatedIds.has(e.id));
  const searchResults = query.trim()
    ? result.evidence.filter((e) => !selected.includes(e) && label(e).toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : [];
  const toggle = (id) => setLinks((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  return (
    <div className="mec-overlay" onClick={onClose}>
      <section
        className="mec-drawer mec-case-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Conciliación documental"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
          if (e.key === 'Tab') {
            const controls = [
              ...e.currentTarget.querySelectorAll('button:not(:disabled), summary, input:not(:disabled), select, textarea'),
            ].filter((el) => el.getClientRects().length);
            const first = controls[0],
              last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="mec-heading">
          <div>
            <small>CASO · EVIDENCIA Y DECISIÓN</small>
            <h2>
              {item.anchor.row.hacienda || item.anchor.row.haciendaCode} · Suerte {item.anchor.row.suerte}
            </h2>
          </div>
          <button ref={close} disabled={busy} aria-label="Cerrar conciliación" onClick={onClose}>
            <X />
          </button>
        </div>
        <p>
          {item.anchor.row.producer || 'Productor no informado'} · {item.anchor.row.labor} · Zona{' '}
          {item.anchor.row.zone || 'no informada'} · {evidenceDate(item.anchor) || 'Sin fecha'} · Semana SIAGRI{' '}
          {item.anchor.row.week || '—'} / {item.anchor.row.year || '—'}
        </p>
        <p className="mec-note">
          <strong>Motor: {STATES[item.state]}</strong>
          <br />
          Decisión: {review ? DECISIONS[review.state] : 'Sin revisión humana'}
          {status.stale && ' · REQUIERE NUEVA REVISIÓN: cambió la evidencia o la configuración.'}
        </p>
        {item.warnings.map((warning) => (
          <p key={warning} className="mec-warning">
            {warning}
          </p>
        ))}
        <h3>Evaluación documental</h3>
        {!item.matches.length && <p>No hay coincidencias dentro de las reglas actuales.</p>}
        {item.matches.map((m) => (
          <p key={m.id}>
            <strong>{m.strong ? 'Fuerte' : 'Candidata'}</strong> · {label(result.evidence.find((e) => e.id === m.id))}
            {[...(review?.history || [])]
              .reverse()
              .find((h) => ['discarded', 'confirmed'].includes(h.state) && h.links.includes(m.id))?.state === 'discarded' && (
              <strong> · Sugerencia descartada por el revisor</strong>
            )}
            <br />
            {m.reason}
          </p>
        ))}
        <h3>Vínculos y respaldos exactos</h3>
        <p>
          Marque cada evidencia que respalda su decisión. Un vínculo manual puede abarcar otras suertes o labores; documente el
          motivo. Las cantidades originales no se redistribuyen.
        </p>
        <label>
          Buscar otras evidencias
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Fuente, hacienda, suerte, documento…" />
        </label>
        {searchResults.length === 30 && <small>Primeros 30 resultados; refine la búsqueda.</small>}
        {[...selected, ...searchResults].map((e) => (
          <article className="mec-evidence-card" key={e.id}>
            <label className="mec-check">
              <input
                type="checkbox"
                aria-label={`Vincular ${label(e)}`}
                checked={links.includes(e.id)}
                disabled={e.id === item.anchor.id || busy}
                onChange={() => toggle(e.id)}
              />
              <strong>{label(e)}</strong>
            </label>
            <p>
              {e.source === 'program'
                ? `Superficie del evento: ${e.workQuantity ?? 'ambigua'} ${e.row.unit || ''} · ${e.lines.length} líneas de productos`
                : `${e.row.units ?? '—'} ${e.row.unit || ''}`}
              {e.source === 'pf' && ` · Importe C$ ${money(Number(e.row.total) || 0)}`}
            </p>
            {e.classification && <p>{e.classification.reason}</p>}
            {e.ambiguous && <p className="mec-warning">Identidad ambigua: {e.lines.length} líneas; confirmación bloqueada.</p>}
            <details>
              <summary>Campos y originales · {e.lines.length} líneas</summary>
              {e.lines.map((row, i) => (
                <div key={i}>
                  <h4>
                    Línea {i + 1} · {row.sourceFile} / {row.sourceSheet} / fila {row.sourceRow ?? '—'}
                  </h4>
                  <dl>
                    {Object.entries(row)
                      .filter(([k, v]) => k !== 'id' && k !== 'original' && v != null && typeof v !== 'object')
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt>{FIELD_LABELS[k] || k}</dt>
                          <dd>{String(v)}</dd>
                        </div>
                      ))}
                  </dl>
                  {row.original && (
                    <dl>
                      {row.original.map((c) => (
                        <div key={c.column}>
                          <dt>{c.header}</dt>
                          <dd>{String(c.value ?? '')}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              ))}
            </details>
          </article>
        ))}
        {review?.links.some((id) => !result.evidence.some((e) => e.id === id)) && (
          <p className="mec-warning">
            Hay respaldos anteriores que ya no están cargados. Sus originales permanecen en el historial; vuelva a seleccionar
            evidencias vigentes.
          </p>
        )}
        <h3>Registrar revisión</h3>
        <label>
          Decisión manual
          <select aria-label="Decisión manual" value={state} onChange={(e) => setState(e.target.value)}>
            {Object.entries(DECISIONS).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Observación de revisión
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Motivo y referencias documentales de la decisión"
          />
        </label>
        <p>
          Confirmar Prefacturado documenta respaldo de facturación; no acredita pago recibido. Descartar registra las evidencias
          seleccionadas como sugerencias rechazadas; el caso sigue pendiente hasta completar la revisión.
        </p>
        <button
          className="mec-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const currentLinks = links.filter((id) => result.evidence.some((e) => e.id === id));
              await onSave(makeReview(item, result.evidence, { state, links: currentLinks, notes }, review));
              setNotes('');
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Guardar decisión
        </button>
        {error && <p role="alert">{error}</p>}
        <h3>Historial de revisión</h3>
        {!review && <p>Sin decisiones registradas.</p>}
        {[...(review?.history || [])].reverse().map((h) => (
          <details key={h.id}>
            <summary>
              {h.at} · {DECISIONS[h.state]} · {h.links.length} evidencias
            </summary>
            <p>{h.notes}</p>
            <pre className="mec-json">{JSON.stringify(h.snapshots, null, 2)}</pre>
          </details>
        ))}
      </section>
    </div>
  );
}

export function ReconciliationBoard({ sources, prefactura }) {
  const [rules, setRules] = useState(DEFAULT_RULES),
    [reviews, setReviews] = useState([]),
    [ready, setReady] = useState(false);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all'),
    [fields, setFields] = useState({}),
    [page, setPage] = useState(0);
  const [draft, setDraft] = useState(DEFAULT_RULES),
    [alternatives, setAlternatives] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([loadReviews(), loadRules()])
      .then(([r, s]) => {
        if (!active) return;
        setReviews(r);
        if (s) {
          setRules(s);
          setDraft(s);
          setAlternatives(s.alternatives.map((p) => p.join('=')).join(','));
        }
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  const result = useMemo(
    () => reconcile({ hm: sources.hm?.rows || [], program: sources.program?.rows || [], prefactura }, rules),
    [sources, prefactura, rules],
  );
  useEffect(() => {
    if (ready) saveEvaluation(result).catch((e) => setError(`No se pudo persistir la evaluación: ${e.message}`));
  }, [result, ready]);
  const reviewMap = new Map(reviews.map((r) => [r.caseId, r]));
  const categories = {
    located: [
      'Trabajos con Prefactura localizada',
      (c) =>
        (c.executed && c.related.some((e) => e.source === 'pf')) ||
        reviewStatus(reviewMap.get(c.id), c, result.evidence).confirmed,
    ],
    confirmed: ['Prefacturados confirmados manualmente', (c) => reviewStatus(reviewMap.get(c.id), c, result.evidence).confirmed],
    missing: [
      'Ejecución sin Prefactura localizada',
      (c) => c.state === 'missing' && !reviewStatus(reviewMap.get(c.id), c, result.evidence).confirmed,
    ],
    pfOnly: ['Prefacturas sin HM', (c) => c.state === 'pfOnly'],
    notExecuted: ['Programaciones no ejecutadas', (c) => c.state === 'notExecuted'],
    candidate: ['Coincidencias candidatas', (c) => c.state === 'candidate' || c.matches.some((m) => !m.strong)],
    duplicate: ['Posibles duplicidades', (c) => c.state === 'duplicate'],
    pending: [
      'Casos pendientes de revisión',
      (c) =>
        !reviewMap.has(c.id) ||
        ['pending', 'reopened', 'discarded'].includes(reviewMap.get(c.id)?.state) ||
        reviewStatus(reviewMap.get(c.id), c, result.evidence).stale,
    ],
  };
  const filtered = result.cases.filter(
    (c) =>
      (!categories[filter] || categories[filter][1](c)) &&
      Object.entries(fields).every(([key, value]) => {
        if (!value) return true;
        if (key === 'state') return c.state === value;
        if (key === 'source') return c.related.some((e) => e.source === value);
        if (key === 'from') return evidenceDate(c.anchor) >= value;
        if (key === 'to') return !!evidenceDate(c.anchor) && evidenceDate(c.anchor) <= value;
        if (['zone', 'suerte', 'labor'].includes(key)) return c.related.some((e) => code(e.row[key]) === code(value));
        return c.related.some((e) =>
          String(
            key === 'producer'
              ? e.row.producer || e.row.producerName || e.row.producerCode || ''
              : key === 'hacienda'
                ? `${e.row.haciendaCode || ''} ${e.row.hacienda || ''}`
                : e.row[key] || '',
          )
            .toLowerCase()
            .includes(value.toLowerCase()),
        );
      }),
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  const item = result.cases.find((c) => c.id === selected);
  const orphaned = reviews.filter((r) => !result.cases.some((c) => c.id === r.caseId));
  const setField = (k, v) => {
    setFields({ ...fields, [k]: v });
    setPage(0);
  };
  return (
    <section className="mec-reconciliation" aria-label="Motor de conciliación">
      <div className="mec-heading">
        <div>
          <small>ETAPA B · REVISIÓN DOCUMENTAL</small>
          <h3>Conciliación de mecanizadas</h3>
        </div>
        <span>
          {result.cases.length} casos · {result.counts.movements} movimientos HM · {result.counts.events} eventos candidatos ·{' '}
          {result.counts.pfLines} líneas PF
        </span>
      </div>
      <p>
        Los estados calculados orientan la revisión. Ninguno confirma deuda, fraude ni pago. HR, KM y HA permanecen separados.
      </p>
      <div className="mec-kpis">
        {Object.entries(categories).map(([key, [title, predicate]]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setFields({});
              setPage(0);
            }}
          >
            <strong>{result.cases.filter(predicate).length}</strong>
            <span>{title}</span>
            <small>casos · abrir bandeja</small>
          </button>
        ))}
      </div>
      <p className="mec-note">
        Importe documental disponible: C$ {money(result.pfAmount)} ({result.counts.pfLines} líneas PF, incluye excluidas).
        Respaldo confirmado vigente: C$ {money(selectedAmount(reviews, result))}. Cada línea se cuenta una vez, aunque respalde
        varios movimientos. Posibles duplicados de origen requieren revisión.
      </p>
      <details className="mec-rules">
        <summary>Reglas, cobertura y equivalencias candidatas</summary>
        <div className="mec-controls">
          <label>
            Tolerancia ± días
            <input
              type="number"
              min="0"
              max="366"
              value={draft.tolerance}
              onChange={(e) => setDraft({ ...draft, tolerance: Number(e.target.value) })}
            />
          </label>
          <label>
            Alternativas candidatas
            <input
              value={alternatives}
              placeholder="FTS=MEC (solo si autoriza la sugerencia)"
              onChange={(e) => setAlternatives(e.target.value)}
            />
          </label>
        </div>
        <p>
          No hay equivalencias predeterminadas. Cada par es una sugerencia revisable, nunca una confirmación ni conversión de
          labor.
        </p>
        <fieldset>
          <legend>Cobertura de Prefactura declarada por el revisor</legend>
          <p>
            Declare el alcance acreditado por sus documentos, incluyendo la tolerancia temporal. Los extremos observados del
            archivo no bastan.
          </p>
          <div className="mec-controls">
            {[
              ['start', 'Desde', 'date'],
              ['end', 'Hasta', 'date'],
              ['zones', 'Zonas (coma; * todas)', 'text'],
              ['note', 'Referencia que acredita cobertura', 'text'],
            ].map(([key, title, type]) => (
              <label key={key}>
                {title}
                <input
                  type={type}
                  value={draft.coverage[key]}
                  onChange={(e) => setDraft({ ...draft, coverage: { ...draft.coverage, [key]: e.target.value } })}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <button
          disabled={!ready}
          onClick={async () => {
            try {
              const pairs = alternatives
                .split(',')
                .filter((s) => s.trim())
                .map((p) =>
                  p
                    .toUpperCase()
                    .split('=')
                    .map((s) => s.trim()),
                );
              if (pairs.some((p) => p.length !== 2 || !p[0] || !p[1] || p[0] === p[1]))
                throw new Error('Use pares LABOR=LABOR separados por coma.');
              if (draft.coverage.start && draft.coverage.end && draft.coverage.start > draft.coverage.end)
                throw new Error('Intervalo de cobertura inválido.');
              const next = { ...draft, alternatives: pairs };
              reconcile({}, next);
              await saveRules(next);
              setRules(next);
              setMessage('Reglas guardadas; las decisiones afectadas requieren nueva revisión.');
              setError('');
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Aplicar reglas
        </button>
      </details>
      <div className="mec-actions">
        <button
          disabled={!ready}
          onClick={async () => {
            try {
              download(await exportDecisions());
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Exportar decisiones e historial
        </button>
        <label>
          Restaurar respaldo local
          <input
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 50000000) throw new Error('Respaldo demasiado grande (máximo 50 MB).');
                const count = await restoreDecisions(JSON.parse(await file.text()));
                setReviews(await loadReviews());
                setMessage(`${count} decisiones restauradas; duplicados idénticos omitidos.`);
                setError('');
              } catch (err) {
                setError(err.message);
              }
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mec-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!!orphaned.length && (
        <details className="mec-warning">
          <summary>{orphaned.length} decisiones sin caso vigente: requieren revisión, no cuentan como confirmadas</summary>
          {orphaned.map((r) => (
            <details key={r.caseId}>
              <summary>
                {r.at} · {DECISIONS[r.state]} · {r.notes}
              </summary>
              <pre className="mec-json">{JSON.stringify(r.history, null, 2)}</pre>
            </details>
          ))}
        </details>
      )}
      <h3>Bandeja de conciliación · {filtered.length} casos</h3>
      <div className="mec-controls">
        {[
          ['producer', 'Productor'],
          ['hacienda', 'Hacienda'],
          ['suerte', 'Suerte'],
          ['zone', 'Zona'],
          ['labor', 'Labor'],
          ['from', 'Fecha desde'],
          ['to', 'Fecha hasta'],
        ].map(([key, title]) => (
          <label key={key}>
            {title}
            <input
              type={['from', 'to'].includes(key) ? 'date' : 'text'}
              value={fields[key] || ''}
              onChange={(e) => setField(key, e.target.value)}
            />
          </label>
        ))}
        <label>
          Fuente del caso
          <select value={fields.source || ''} onChange={(e) => setField('source', e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(SOURCES).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado calculado
          <select value={fields.state || ''} onChange={(e) => setField('state', e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATES).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setFilter('all');
            setFields({});
            setPage(0);
          }}
        >
          Mostrar todos los casos
        </button>
      </div>
      <div className="mec-scroll">
        <table className="mec-cases">
          <thead>
            <tr>
              <th>Trabajo / documento</th>
              <th>Fecha · zona</th>
              <th>Estado calculado</th>
              <th>Revisión humana</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(currentPage * 25, currentPage * 25 + 25).map((c) => {
              const r = reviewMap.get(c.id),
                status = reviewStatus(r, c, result.evidence);
              return (
                <tr key={c.id}>
                  <td>
                    <strong>
                      {c.anchor.row.hacienda || c.anchor.row.haciendaCode} / {c.anchor.row.suerte}
                    </strong>
                    <small>
                      {c.anchor.row.labor} · {SOURCES[c.anchor.source]} ·{' '}
                      {c.anchor.row.document || c.anchor.row.pFact || 'Sin documento'}
                    </small>
                  </td>
                  <td>
                    {evidenceDate(c.anchor) || 'Sin fecha'}
                    <small>Zona {c.anchor.row.zone || 'no informada'}</small>
                  </td>
                  <td>{STATES[c.state]}</td>
                  <td>{status.stale ? 'Requiere nueva revisión' : r ? DECISIONS[r.state] : 'Pendiente de revisión'}</td>
                  <td>
                    <button disabled={!ready} aria-label={`Revisar ${label(c.anchor)}`} onClick={() => setSelected(c.id)}>
                      Revisar <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filtered.length && <p>No hay casos con estos filtros.</p>}
      <div className="mec-pagination">
        <button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
          Casos anteriores
        </button>
        <span>
          Página {currentPage + 1} / {Math.max(1, Math.ceil(filtered.length / 25))} · 25 casos por página
        </span>
        <button disabled={(currentPage + 1) * 25 >= filtered.length} onClick={() => setPage(currentPage + 1)}>
          Más casos
        </button>
      </div>
      {item && (
        <CaseDrawer
          key={item.id + item.signature}
          item={item}
          result={result}
          review={reviewMap.get(item.id)}
          onClose={() => setSelected(null)}
          onSave={async (review) => {
            await saveReview(review);
            setReviews(await loadReviews());
          }}
        />
      )}
    </section>
  );
}
