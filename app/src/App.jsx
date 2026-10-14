import { useState, useEffect } from 'react';
import {
  ChartColumn,
  CircleCheck,
  ClipboardCheck,
  Download,
  FileSearch,
  LayoutDashboard,
  Menu,
  Printer,
  Settings,
  ShieldCheck,
  Sprout,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { AuditPanel } from './components/AuditPanel';
import { FindingDrawer } from './components/FindingDrawer';
import { FindingsTable } from './components/FindingsTable';
import { ImportReviewDrawer } from './components/ImportReviewDrawer';
import { LoadPanel } from './components/LoadPanel';
import { ParametersPanel } from './components/ParametersPanel';
import { PublishTrackingPanel } from './components/PublishTrackingPanel';
import { SummaryPanel } from './components/SummaryPanel';
import { EmptyState, Panel } from './components/common';
import { ReviewPanel } from './components/review/ReviewPanel';
import { TrackingPanel } from './components/tracking/TrackingPanel';
import {
  EMPTY_INPUTS,
  loadPreloadedInputs,
  loadPreloadedReview,
  refreshMasterFromPreload,
} from './data/preload';
import { APP_VERSION, DEFAULT_PARAMETERS } from './engine/constants';
import { exportAuditWorkbook } from './engine/exports';
import {
  diffRows,
  parseExampleFile,
  parseMasterFile,
  parsePayrollFile,
  parsePrefacturaFile,
} from './engine/importers';
import { isBlockingPending } from './engine/indicators';
import { cleanCode, hashId, normalizeSuerte, normalizeText } from './engine/normalize';
import { runReconciliation } from './engine/reconciliation';
import {
  appendAudit,
  clearLocalData,
  db,
  loadAnalysis,
  loadInputs,
  loadParameters,
  loadReviewWorkspace,
  saveAnalysis,
  saveInputs,
  saveParameters,
  saveReviewWorkspace,
} from './storage/db';

const NAV_ITEMS = [
  {
    id: 'summary',
    label: 'Resumen',
    icon: LayoutDashboard,
  },
  {
    id: 'reconciliation',
    label: 'Conciliación',
    icon: ClipboardCheck,
  },
  {
    id: 'review',
    label: 'Revisión por Correo',
    icon: FileSearch,
  },
  {
    id: 'tracking',
    label: 'Seguimiento de labores',
    icon: ChartColumn,
  },
  {
    id: 'tps',
    label: 'Paquetes TPS',
    icon: Sprout,
  },
  {
    id: 'audit',
    label: 'Auditoría y cierres',
    icon: ShieldCheck,
  },
  {
    id: 'load',
    label: 'Actualizar archivos',
    icon: Upload,
  },
  {
    id: 'parameters',
    label: 'Parámetros',
    icon: Settings,
  },
];
export function App() {
  var B;
  const [__hydrated, __setHydrated] = useState(false);
  const [a, s] = useState(() =>
    typeof window < 'u' && window.location.hash === '#tracking' ? 'tracking' : 'summary',
  );
  const [t, n] = useState(false);
  const [i, r] = useState(EMPTY_INPUTS);
  const [l, o] = useState(null);
  const [x, m] = useState(DEFAULT_PARAMETERS);
  const [f, S] = useState(null);
  const [A, E] = useState(false);
  const [D, I] = useState(null);
  const [v, N] = useState(null);
  const [g, d] = useState(null);
  const [R, O] = useState(null);
  const [C, y] = useState(null);
  const [_, P] = useState('');
  useEffect(() => {
    (async () => {
      const [k, p, u, T] = await Promise.all([
        loadInputs(),
        loadAnalysis(),
        loadParameters(),
        loadReviewWorkspace(),
      ]);
      const q = {
        ...DEFAULT_PARAMETERS,
        ...u,
      };
      m(q);
      const se = await db.values.get('last-update');
      if ((se && P(String(se.value)), T)) d(T);
      else
        try {
          const V = await loadPreloadedReview();
          V && (d(V), await saveReviewWorkspace(V));
        } catch {}
      if (k) {
        const V = await refreshMasterFromPreload(k);
        if ((r(V), V !== k && (await saveInputs(V)), p)) {
          const de = runReconciliation(V, q);
          o(de);
          await saveAnalysis(de);
        }
        return;
      }
      try {
        const V = await loadPreloadedInputs();
        if (!V) return;
        r(V);
        await saveInputs(V);
        const de = runReconciliation(V, q);
        o(de);
        await saveAnalysis(de);
        await appendAudit({
          id: hashId('preload', Date.now()),
          at: new Date().toISOString(),
          action: 'DATOS_PRECARGADOS',
          detail: `${V.files.length} archivos reconocidos y conciliados automáticamente.`,
        });
        O({
          kind: 'ok',
          text: 'Datos iniciales precargados, reconocidos y conciliados correctamente.',
        });
      } catch (V) {
        O({
          kind: 'error',
          text: V instanceof Error ? V.message : 'No fue posible cargar los datos iniciales.',
        });
      }
    })().finally(() => __setHydrated(true));
  }, []);
  useEffect(() => {
    if (!__hydrated) return;
    (async () => {
      const CK = 'casur-remote-master-cache-v1';
      const pv = (v) => {
        if (typeof v !== 'string') return null;
        const mm = v.match(/^(\d{4})\.(\d{2})\.(\d{2})-([a-zA-Z0-9]+)\.(\d+)$/);
        if (!mm) return null;
        const y = +mm[1];
        const mo = +mm[2];
        const dd = +mm[3];
        const sq = +mm[5];
        if (
          y < 2020 ||
          y > 2100 ||
          mo < 1 ||
          mo > 12 ||
          dd < 1 ||
          dd > 31 ||
          !Number.isSafeInteger(sq) ||
          sq < 0
        )
          return null;
        const dt = new Date(Date.UTC(y, mo - 1, dd));
        return dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== dd
          ? null
          : {
              date: y * 10000 + mo * 100 + dd,
              seq: sq,
            };
      };
      const cv = (x, y) => {
        if (x === y) return 0;
        const px = pv(x);
        const py = pv(y);
        if (!px || !py) return null;
        return px.date !== py.date
          ? px.date > py.date
            ? 1
            : -1
          : px.seq !== py.seq
            ? px.seq > py.seq
              ? 1
              : -1
            : 0;
      };
      const adapt = (json) => {
        if (!json || !json.meta || !pv(json.meta.dataVersion) || !Array.isArray(json.producers)) return null;
        const rows = [];
        for (const p of json.producers)
          for (const d of p.details || []) {
            const hc = cleanCode(p.code);
            const hn = normalizeText(p.name);
            const su = normalizeSuerte(d.suerte);
            if (!hc || !hn || !su) continue;
            rows.push({
              id: 'master:cronologico:' + hc + '|' + su,
              sourceRow: null,
              sheet: 'cronologico.json',
              haciendaCode: hc,
              hacienda: hn,
              suerte: su,
              tenure: normalizeText(d.tenencia || ''),
              erp: cleanCode(d.erp || ''),
              zone: String(d.zona ?? '').trim(),
              status: String(d.estado ?? '').trim(),
              plantingDate: d.fSiembra || '',
              lastCutDate: d.fUltCte || '',
              area: Number(d.area) || 0,
              producerScope: normalizeText(String(d.zona ?? '')).includes('PRODUCTOR'),
            });
          }
        return rows.length
          ? {
              rows,
              version: json.meta.dataVersion,
            }
          : null;
      };
      const apply = (rows, label) => {
        r((cur) => ({
          ...cur,
          master: rows,
          files: [
            ...cur.files.filter((f) => f.kind !== 'master'),
            {
              kind: 'master',
              name: label,
              size: 0,
              modified: Date.now(),
              importedAt: new Date().toISOString(),
              hash: 'remote',
              rows: rows.length,
              source: 'REMOTE',
              validation: 'RECOGNIZED',
              dateStart: undefined,
              dateEnd: undefined,
              weekStart: undefined,
              weekEnd: undefined,
              skippedRows: 0,
            },
          ],
        }));
      };
      let used = false;
      try {
        const resp = await fetch(
          'https://montealtoc7.github.io/Negocios_de_Cana_CASUR_APP/modules/produccion/data/cronologico.json',
          {
            cache: 'no-store',
          },
        );
        if (resp.ok) {
          const j = await resp.json();
          const ad = adapt(j);
          if (ad) {
            let cachedVer = null;
            let cachedRows = null;
            try {
              const cr = localStorage.getItem(CK);
              if (cr) {
                const cj = JSON.parse(cr);
                if (cj && Array.isArray(cj.rows) && cj.rows.length) {
                  cachedVer = cj.version;
                  cachedRows = cj.rows;
                }
              }
            } catch (e) {}
            if (!cachedVer) {
              try {
                localStorage.setItem(CK, JSON.stringify(ad));
              } catch (e) {}
              apply(ad.rows, 'Maestro Central · ' + ad.version);
              used = true;
            } else {
              const cmp = cv(ad.version, cachedVer);
              if (cmp === 1) {
                try {
                  localStorage.setItem(CK, JSON.stringify(ad));
                } catch (e) {}
                apply(ad.rows, 'Maestro Central · ' + ad.version);
                used = true;
              } else if (cmp === 0) {
                apply(ad.rows, 'Maestro Central · ' + ad.version);
                used = true;
              } else {
                apply(cachedRows, 'Maestro Central · ' + cachedVer + ' · Respaldo local');
                used = true;
              }
            }
          }
        }
      } catch (e) {}
      if (!used) {
        try {
          const cr = localStorage.getItem(CK);
          if (cr) {
            const cj = JSON.parse(cr);
            if (cj && Array.isArray(cj.rows) && cj.rows.length)
              apply(cj.rows, 'Maestro Central · ' + cj.version + ' · Respaldo local');
          }
        } catch (e) {}
      }
    })();
  }, [__hydrated]);
  const h = ['payroll', 'prefactura', 'master'].every((k) => i.files.some((p) => p.kind === k));
  const L = async (k, p) => {
    const u = {
      id: hashId(k, Date.now(), p),
      at: new Date().toISOString(),
      action: k,
      detail: p,
    };
    await appendAudit(u);
  };
  const F = async (k, p) => {
    S(k);
    O(null);
    try {
      let u = {
        ...i,
      };
      let T;
      if (k === 'payroll') {
        const q = await parsePayrollFile(p);
        u = {
          ...u,
          payroll: q.rows,
        };
        T = q.file;
      } else if (k === 'prefactura') {
        const q = await parsePrefacturaFile(p);
        u = {
          ...u,
          prefactura: q.rows,
        };
        T = q.file;
      } else if (k === 'master') {
        const q = await parseMasterFile(p);
        u = {
          ...u,
          master: q.rows,
        };
        T = q.file;
      } else T = (await parseExampleFile(p)).file;
      u.files = [...u.files.filter((q) => q.kind !== k), T];
      y({
        kind: k,
        next: u,
        metadata: T,
        previous: k === 'example' ? [] : i[k],
        incoming: k === 'example' ? [] : u[k],
      });
    } catch (u) {
      O({
        kind: 'error',
        text: u instanceof Error ? u.message : 'No fue posible leer el archivo.',
      });
    } finally {
      S(null);
    }
  };
  const j = async () => {
    if (!C) return;
    const { next: k, metadata: p, previous: u, incoming: T } = C;
    const q = diffRows(u, T);
    const V = ['payroll', 'prefactura', 'master'].every((K) => k.files.some((ra) => ra.kind === K))
      ? runReconciliation(k, x)
      : null;
    const de = (K) => [K.week, K.hacienda, K.suerte, K.labor, K.service, K.unit].join('|');
    const X = new Set(((l == null ? undefined : l.findings) ?? []).filter(isBlockingPending).map(de));
    const ue = new Set(((V == null ? undefined : V.findings) ?? []).filter(isBlockingPending).map(de));
    const Oe = [...X].filter((K) => !ue.has(K)).length;
    const ze = [...ue].filter((K) => !X.has(K)).length;
    const he =
      p.name +
      ': ' +
      p.rows +
      ' filas reconocidas; ' +
      q.added +
      ' agregadas/modificadas, ' +
      q.removed +
      ' retiradas/modificadas, ' +
      q.unchanged +
      ' sin cambios; ' +
      (p.skippedRows ?? 0) +
      ' no utilizables. ' +
      (V
        ? 'Conciliación actualizada: ' +
          V.findings.filter(isBlockingPending).length +
          ' pendientes bloqueantes. ' +
          Oe +
          ' casos dejan de ser pendientes (por conciliación o retiro de registros); ' +
          ze +
          ' pendientes nuevos.'
        : 'Faltan archivos para conciliar.');
    await db.transaction('rw', db.values, async () => {
      await saveInputs(k);
      V ? await saveAnalysis(V) : await db.values.delete('analysis');
      await db.values.put({
        key: 'last-update',
        value: he,
        updatedAt: new Date().toISOString(),
      });
    });
    r(k);
    o(V);
    y(null);
    P(he);
    await L('ACTUALIZACION_CONFIRMADA', he);
    O({
      kind: 'ok',
      text: he,
    });
  };
  const w = async () => {
    if (h) {
      E(true);
      O(null);
      await new Promise((k) => setTimeout(k, 50));
      try {
        const k = runReconciliation(i, x);
        o(k);
        await saveAnalysis(k);
        await L(
          'CONCILIACION_EJECUTADA',
          `${k.findings.length} resultados; semanas ${k.coverage.startWeek}-${k.coverage.endWeek}.`,
        );
        O({
          kind: 'ok',
          text: 'Conciliación terminada y guardada en este dispositivo.',
        });
        s('summary');
      } catch (k) {
        O({
          kind: 'error',
          text: k instanceof Error ? k.message : 'Ocurrió un error durante la conciliación.',
        });
      } finally {
        E(false);
      }
    }
  };
  const z = async () => {
    window.confirm('¿Borrar archivos, resultados, cierres y auditoría guardados en este dispositivo?') &&
      (await clearLocalData(),
      r(EMPTY_INPUTS),
      o(null),
      d(null),
      m(DEFAULT_PARAMETERS),
      O({
        kind: 'ok',
        text: 'Espacio local limpiado.',
      }),
      s('load'));
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${t ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img className="casur-logo" src="./casur-logo.png" alt="CASUR · Compañía Azucarera del Sur" />
          <div>
            <strong>Conciliador</strong>
            <span>Negocios de Caña · Nómina y cobros</span>
          </div>
        </div>
        <button className="mobile-close" onClick={() => n(false)}>
          <X />
        </button>
        <nav>
          {NAV_ITEMS.map((k) => (
            <button
              key={k.id}
              className={a === k.id ? 'active' : ''}
              onClick={() => {
                N(null);
                s(k.id);
                n(false);
              }}
            >
              <k.icon size={19} />
              {k.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-card">
            <span className="signature-name">Carlos Tijerino</span>
            <small>Departamento Negocios de Caña</small>
            <small>Administrador de la conciliación</small>
          </div>
          <div className="privacy">
            <ShieldCheck size={17} />
            <span>
              Datos controlados
              <br />
              <small>Precarga desde GitHub</small>
            </span>
          </div>
          <span>CASUR · v{APP_VERSION}</span>
        </div>
      </aside>
      {t && <div className="nav-overlay" onClick={() => n(false)} />}
      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => n(true)}>
            <Menu />
          </button>
          <div>
            <h1>{(B = NAV_ITEMS.find((k) => k.id === a)) == null ? undefined : B.label}</h1>
            <p>
              {l
                ? `Último análisis: ${new Date(l.generatedAt).toLocaleString('es-NI')}`
                : 'Cargue los archivos SIAGRI para comenzar'}
            </p>
          </div>
          <div className="operator">
            <span>Departamento Negocios de Caña</span>
            <strong className="signature-name">Carlos Tijerino</strong>
          </div>
          <div className="top-actions">
            {l && a !== 'tracking' && (
              <>
                <button className="button secondary" onClick={() => window.print()}>
                  <Printer size={17} />
                  {' PDF'}
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    exportAuditWorkbook(l, i);
                    O({
                      kind: 'ok',
                      text: 'Informe Excel generado. Revise la carpeta de descargas.',
                    });
                  }}
                >
                  <Download size={17} />
                  {' Excel'}
                </button>
              </>
            )}
          </div>
        </header>
        <div className="content">
          {R && (
            <div className={`notice ${R.kind}`}>
              <span>
                {R.kind === 'ok' ? <CircleCheck /> : <TriangleAlert />}
                {R.text}
              </span>
              <button onClick={() => O(null)}>
                <X />
              </button>
            </div>
          )}
          {a === 'summary' && (
            <SummaryPanel
              analysis={l}
              inputs={i}
              onNavigate={s}
              onSelect={I}
              onWeekClick={(k) => {
                N(k);
                s('reconciliation');
              }}
            />
          )}
          {a === 'reconciliation' && (
            <Panel
              title={v ? 'Pendientes de la semana ' + v : 'Conciliación semanal'}
              subtitle="La Nómina es la base; P.FACT demuestra el cobro."
            >
              {l ? (
                <FindingsTable
                  rows={l.findings.filter((k) =>
                    v ? k.week === v && isBlockingPending(k) : k.type === 'DIRECT',
                  )}
                  onSelect={I}
                  initialWeek={v}
                />
              ) : (
                <EmptyState onNavigate={() => s('load')} />
              )}
            </Panel>
          )}
          {a === 'review' && (
            <ReviewPanel
              inputs={i}
              workspace={g}
              onWorkspace={async (k) => {
                d(k);
                await saveReviewWorkspace(k);
              }}
              onAudit={L}
            />
          )}
          {a === 'tps' && (
            <Panel
              title="Paquetes de siembra TPS"
              subtitle="RYA 19084/19085 es la cantidad principal; corte y descargue corroboran."
            >
              {l ? (
                <FindingsTable
                  rows={l.findings.filter((k) => k.type === 'TPS' || k.type === 'EXTERNAL_TPS')}
                  onSelect={I}
                />
              ) : (
                <EmptyState onNavigate={() => s('load')} />
              )}
            </Panel>
          )}
          {a === 'tracking' && <TrackingPanel inputs={i} startDate={x.startDate} onAudit={L} />}
          {a === 'audit' && <AuditPanel analysis={l} inputs={i} parameters={x} onSelect={I} />}
          {a === 'load' && (
            <>
              {_ && (
                <section className="panel closure-form">
                  <h3>Resultado de la última actualización</h3>
                  <p>{_}</p>
                  <small>
                    Guardado en este dispositivo. Publicar el programa no sube los Excel que haya cargado
                    localmente.
                  </small>
                </section>
              )}
              <LoadPanel inputs={i} busy={f} working={A} ready={h} onFile={F} onAnalyze={w} onReset={z} />
              <PublishTrackingPanel inputs={i} startDate={x.startDate} />
            </>
          )}
          {a === 'parameters' && (
            <ParametersPanel
              parameters={x}
              setParameters={m}
              onSave={async (k) => {
                await saveParameters(k);
                m(k);
                o(null);
                await L('PARAMETROS_ACTUALIZADOS', JSON.stringify(k));
                O({
                  kind: 'ok',
                  text: 'Parámetros guardados. Ejecute nuevamente la conciliación.',
                });
              }}
            />
          )}
        </div>
      </main>
      {D && <FindingDrawer finding={D} inputs={i} onClose={() => I(null)} />}
      {C && (
        <ImportReviewDrawer
          name={C.metadata.name}
          previous={C.previous}
          incoming={C.incoming}
          skipped={C.metadata.skippedRows}
          sameFile={
            i.files.some((k) => k.kind === C.kind && k.hash === C.metadata.hash) &&
            diffRows(C.previous, C.incoming).added === 0 &&
            diffRows(C.previous, C.incoming).removed === 0
          }
          onConfirm={j}
          onCancel={() => y(null)}
        />
      )}
    </div>
  );
}
