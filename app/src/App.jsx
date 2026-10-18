import { useState } from 'react';
import {
  ChartColumn,
  CircleCheck,
  ClipboardCheck,
  Download,
  FileSearch,
  Landmark,
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
import { TariffAuditPanel } from './components/audit/TariffAuditPanel';
import { FindingDrawer } from './components/FindingDrawer';
import { FindingsTable } from './components/FindingsTable';
import { ImportReviewDrawer } from './components/ImportReviewDrawer';
import { LoadPanel } from './components/LoadPanel';
import { ParametersPanel } from './components/ParametersPanel';
import { PublishTrackingPanel } from './components/PublishTrackingPanel';
import { SummaryPanel } from './components/SummaryPanel';
import { EmptyState, Panel } from './components/common';
import { FinancePanel } from './components/finance/FinancePanel';
import { ReviewPanel } from './components/review/ReviewPanel';
import { TrackingPanel } from './components/tracking/TrackingPanel';
import { APP_VERSION, BUILD_DATE } from './engine/constants';
import { exportAuditWorkbook } from './engine/exports';
import { useConciliador } from './state/useConciliador';
import { MechanizedPanel } from './mechanized/MechanizedPanel';

// IMPORTANTE: el orden importa. La vista pública "Seguimiento de Labores" de la App Maestra
// (modules/labores/index.html) oculta con CSS todas las pestañas salvo la 4.ª (nth-child(4)).
// Seguimiento de labores debe seguir siendo la cuarta.
const NAV_ITEMS = [
  { id: 'summary', label: 'Resumen', icon: LayoutDashboard },
  { id: 'reconciliation', label: 'Conciliación', icon: ClipboardCheck },
  { id: 'review', label: 'Revisión por Correo', icon: FileSearch },
  { id: 'tracking', label: 'Seguimiento de labores', icon: ChartColumn },
  { id: 'finance', label: 'Financiero', icon: Landmark },
  { id: 'tps', label: 'Paquetes TPS', icon: Sprout },
  { id: 'audit', label: 'Auditoría de tarifas y cobros', icon: ShieldCheck },
  { id: 'load', label: 'Actualizar archivos', icon: Upload },
  { id: 'parameters', label: 'Parámetros', icon: Settings },
  { id: 'mechanized', label: 'Cobros mecanizados', icon: FileSearch },
];

const initialView = () => (typeof window !== 'undefined' && window.location.hash === '#tracking' ? 'tracking' : 'summary');

export function App() {
  const app = useConciliador();
  const [view, setView] = useState(initialView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const { analysis, inputs, parameters, multiYear, notice } = app;

  const navigate = (id) => {
    setView(id);
    setMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img className="casur-logo" src="./casur-logo.png" alt="CASUR · Compañía Azucarera del Sur" />
          <div>
            <strong>Conciliador</strong>
            <span>Negocios de Caña · Nómina y cobros</span>
          </div>
        </div>
        <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
          <X />
        </button>
        <nav>
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
              <item.icon size={19} />
              {item.label}
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
          <span title={BUILD_DATE ? `Compilado el ${BUILD_DATE}` : undefined}>CASUR · v{APP_VERSION}</span>
        </div>
      </aside>
      {menuOpen && <div className="nav-overlay" onClick={() => setMenuOpen(false)} />}
      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
            <Menu />
          </button>
          <div>
            <h1>{NAV_ITEMS.find((item) => item.id === view)?.label}</h1>
            <p>
              {analysis
                ? `Último análisis: ${new Date(analysis.generatedAt).toLocaleString('es-NI')}`
                : 'Cargue los archivos SIAGRI para comenzar'}
            </p>
          </div>
          <div className="operator">
            <span>Departamento Negocios de Caña</span>
            <strong className="signature-name">Carlos Tijerino</strong>
          </div>
          <div className="top-actions">
            {analysis && view !== 'tracking' && view !== 'finance' && view !== 'mechanized' && (
              <>
                <button className="button secondary" onClick={() => window.print()}>
                  <Printer size={17} /> PDF
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    exportAuditWorkbook(analysis, inputs, { parameters, quality: app.quality });
                    app.setNotice({ kind: 'ok', text: 'Informe Excel generado. Revise la carpeta de descargas.' });
                  }}
                >
                  <Download size={17} /> Excel
                </button>
              </>
            )}
          </div>
        </header>
        <div className="content">
          {notice && (
            <div className={`notice ${notice.kind}`}>
              <span>
                {notice.kind === 'ok' ? <CircleCheck /> : <TriangleAlert />}
                {notice.text}
              </span>
              <button onClick={() => app.setNotice(null)} aria-label="Cerrar aviso">
                <X />
              </button>
            </div>
          )}
          {view === 'summary' && (
            <SummaryPanel
              analysis={analysis}
              inputs={inputs}
              quality={app.quality}
              multiYear={multiYear}
              onNavigate={navigate}
              onSelect={setSelectedFinding}
            />
          )}
          {view === 'reconciliation' && (
            <Panel
              title="Conciliación semanal"
              subtitle="La Nómina es la base; P.FACT demuestra el cobro. La columna Tarifa muestra las tarifas cobradas en la Prefactura."
            >
              {analysis ? (
                <FindingsTable
                  rows={analysis.findings.filter((finding) => finding.type === 'DIRECT' || finding.type === 'UNCLASSIFIED')}
                  onSelect={setSelectedFinding}
                  multiYear={multiYear}
                  exportName="conciliacion"
                />
              ) : (
                <EmptyState onNavigate={() => navigate('load')} />
              )}
            </Panel>
          )}
          {view === 'review' && (
            <ReviewPanel inputs={inputs} workspace={app.reviewWorkspace} onWorkspace={app.saveReview} onAudit={app.audit} />
          )}
          {view === 'tracking' && <TrackingPanel inputs={inputs} startDate={parameters.startDate} onAudit={app.audit} />}
          {view === 'finance' && (
            <FinancePanel inputs={inputs} analysis={analysis} startDate={parameters.startDate} parameters={parameters} />
          )}
          {view === 'tps' && (
            <Panel
              title="Paquetes de siembra TPS"
              subtitle="RYA 19084/19085 es la cantidad principal; corte y descargue corroboran."
            >
              {analysis ? (
                <FindingsTable
                  rows={analysis.findings.filter((finding) => ['TPS', 'EXTERNAL_TPS', 'TPS_STAGE'].includes(finding.type))}
                  onSelect={setSelectedFinding}
                  multiYear={multiYear}
                  exportName="paquetes_tps"
                />
              ) : (
                <EmptyState onNavigate={() => navigate('load')} />
              )}
            </Panel>
          )}
          {view === 'audit' && (
            <TariffAuditPanel
              analysis={analysis}
              inputs={inputs}
              parameters={parameters}
              multiYear={multiYear}
              onSelect={setSelectedFinding}
            />
          )}
          {view === 'load' && (
            <>
              {app.lastUpdate && (
                <section className="panel closure-form">
                  <h3>Resultado de la última actualización</h3>
                  <p>{app.lastUpdate}</p>
                  <small>Guardado en este dispositivo. Publicar el programa no sube los Excel que haya cargado localmente.</small>
                </section>
              )}
              <LoadPanel
                inputs={inputs}
                busy={app.busyKind}
                working={app.working}
                ready={app.ready}
                startDate={parameters.startDate}
                quality={app.quality}
                atypicalTariffPct={parameters.atypicalTariffPct}
                masterSource={app.masterSource}
                remoteMaster={app.remoteMaster}
                published={app.published}
                onFile={app.importFile}
                onAnalyze={async () => {
                  if (await app.analyze()) navigate('summary');
                }}
                onReset={async () => {
                  if (await app.resetLocal()) navigate('load');
                }}
                onUseRemoteMaster={app.switchToRemoteMaster}
                onLoadPublished={app.loadPublished}
                onBackup={() => app.downloadBackup()}
                onRestore={app.restoreBackup}
              />
              <PublishTrackingPanel inputs={inputs} startDate={parameters.startDate} />
            </>
          )}
          {view === 'parameters' && <ParametersPanel parameters={parameters} onSave={app.updateParameters} />}
          {view === 'mechanized' && <MechanizedPanel prefactura={inputs.prefactura} onLoadPrefactura={() => navigate('load')} />}
        </div>
      </main>
      {selectedFinding && (
        <FindingDrawer finding={selectedFinding} inputs={inputs} multiYear={multiYear} onClose={() => setSelectedFinding(null)} />
      )}
      {app.pendingImport && (
        <ImportReviewDrawer
          key={app.pendingImport.kind + app.pendingImport.metadata.hash}
          name={app.pendingImport.metadata.name}
          metadata={app.pendingImport.metadata}
          previous={app.pendingImport.previous}
          incoming={app.pendingImport.incoming}
          sameFile={app.pendingImport.sameFile}
          queueLabel={app.pendingImport.queueLabel}
          onConfirm={app.confirmImport}
          onCancel={app.cancelImport}
        />
      )}
    </div>
  );
}
