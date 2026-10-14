import { useRef, useState } from 'react';
import {
  CircleCheck,
  ClipboardCheck,
  CloudUpload,
  Database,
  Download,
  FileCheck2,
  History,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { FileGrid } from './FileGrid';
import { isRemoteMasterFile } from '../data/remoteMaster';

export function CheckItem({ label, value, ok }) {
  return (
    <div className="health-row">
      <span className={ok ? 'health-ok' : 'health-warn'}>{ok ? <CircleCheck /> : <TriangleAlert />}</span>
      <strong>{label}</strong>
      <b>{value}</b>
    </div>
  );
}

const SEVERITY_LABELS = { critical: 'Crítico', warning: 'Revisar', info: 'Informativo' };

export function LoadPanel({
  inputs,
  busy,
  working,
  ready,
  startDate,
  quality = [],
  masterSource,
  remoteMaster,
  published,
  onFile,
  onAnalyze,
  onReset,
  onUseRemoteMaster,
  onLoadPublished,
  onBackup,
  onRestore,
}) {
  const restoreInput = useRef(null);
  const [restoring, setRestoring] = useState(false);
  const masterFile = inputs.files.find((file) => file.kind === 'master');
  const usingRemote = isRemoteMasterFile(masterFile);

  return (
    <>
      <section className="panel load-intro">
        <div>
          <span className="eyebrow">ACTUALIZACIÓN SEGURA</span>
          <h2>Cargue los reportes originales de SIAGRI</h2>
          <p>
            Puede sustituir un archivo sin borrar los demás. La aplicación identifica cada versión por su huella SHA-256, muestra
            qué filas cambian antes de confirmar y guarda el histórico de acciones.
          </p>
        </div>
        <ShieldCheck />
      </section>

      {published?.differs && (
        <section className="panel notice-panel">
          <CloudUpload />
          <div>
            <strong>Hay datos publicados más recientes en el sitio</strong>
            <p>
              Versión publicada {published.version}
              {published.stored ? ` · este dispositivo usa ${published.stored}` : ''}. Se cargan con la misma comprobación previa
              (filas agregadas/retiradas) y debe confirmar cada archivo.
            </p>
          </div>
          <button className="button primary" disabled={busy !== null} onClick={onLoadPublished}>
            Revisar y cargar
          </button>
        </section>
      )}

      <FileGrid files={inputs.files} busy={busy} onFile={onFile} />

      <section className="panel master-source">
        <Database />
        <div>
          <strong>Fuente del Maestro: {usingRemote ? 'Maestro Central (App Maestra)' : 'archivo Excel importado'}</strong>
          <p>
            {usingRemote
              ? `Versión ${masterFile?.version ?? masterFile?.name ?? '—'}. Se actualiza automáticamente al abrir la aplicación; un cambio de versión exige revalidar los cierres.`
              : masterSource === 'FILE'
                ? 'Usted importó un Maestro en Excel; prevalece sobre el Maestro Central hasta que elija volver a usarlo.'
                : 'Se usará el Maestro Central cuando esté disponible.'}
            {remoteMaster && !usingRemote
              ? ` Maestro Central disponible: ${remoteMaster.version}${remoteMaster.origin === 'CACHE' ? ' (respaldo local)' : ''}.`
              : ''}
          </p>
        </div>
        {!usingRemote && remoteMaster && (
          <button className="button secondary" disabled={busy !== null} onClick={onUseRemoteMaster}>
            Usar Maestro Central
          </button>
        )}
      </section>

      <section className="panel action-panel">
        <div>
          <strong>{ready ? 'Todo listo para conciliar' : 'Faltan archivos requeridos'}</strong>
          <p>
            {ready
              ? `Se procesarán las filas desde la semana operativa que contiene el ${startDate} (la semana no se parte por la fecha).`
              : 'Cargue Nómina, Prefactura y Cronológico Maestro.'}
          </p>
        </div>
        <div>
          <button className="button primary large" disabled={!ready || working || busy !== null} onClick={onAnalyze}>
            {working ? <RefreshCw className="spin" /> : <ClipboardCheck />} {working ? 'Conciliando…' : 'Ejecutar conciliación'}
          </button>
        </div>
      </section>

      {quality.length > 0 && (
        <section className="panel quality-panel">
          <div className="panel-head">
            <div>
              <h2>Calidad de datos</h2>
              <p>Problemas detectados en los reportes cargados. Nada se corrige ni se elimina automáticamente.</p>
            </div>
          </div>
          <div className="quality-list">
            {quality.map((item) => (
              <details key={item.id} className={`quality-item quality-${item.severity}`}>
                <summary>
                  <span
                    className={`status status-${item.severity === 'critical' ? 'critical' : item.severity === 'warning' ? 'warning' : 'info'}`}
                  >
                    {SEVERITY_LABELS[item.severity]}
                  </span>
                  <strong>{item.title}</strong>
                  <b>{item.count.toLocaleString('es-NI')}</b>
                </summary>
                <p>{item.detail}</p>
                {item.examples.length > 0 && (
                  <div className="table-wrap compact-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Origen</th>
                          <th>Fila</th>
                          <th>Semana</th>
                          <th>Lote</th>
                          <th>Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.examples.map((example, index) => (
                          <tr key={index}>
                            <td>{[example.source, example.file].filter(Boolean).join(' · ')}</td>
                            <td>{example.row ?? '—'}</td>
                            <td>{example.period ?? '—'}</td>
                            <td>{example.lot ?? '—'}</td>
                            <td>{example.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {item.count > item.examples.length && (
                      <small className="muted">Se muestran {item.examples.length} ejemplos.</small>
                    )}
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="panel backup-panel">
        <div className="panel-head">
          <div>
            <h2>Respaldo de este dispositivo</h2>
            <p>Incluye archivos procesados, resultados, parámetros, revisión por correo, cierres y bitácora de auditoría.</p>
          </div>
        </div>
        <div className="backup-actions">
          <button className="button secondary" onClick={onBackup}>
            <Download size={16} /> Descargar respaldo
          </button>
          <button className="button secondary" disabled={restoring} onClick={() => restoreInput.current?.click()}>
            <Upload size={16} /> Restaurar respaldo
          </button>
          <input
            ref={restoreInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              setRestoring(true);
              try {
                await onRestore(file);
              } finally {
                setRestoring(false);
              }
            }}
          />
          <button className="button ghost" onClick={onReset}>
            Limpiar datos locales
          </button>
        </div>
        <small className="muted">
          Restaurar o limpiar descarga antes un respaldo automático del estado actual. Los datos viven solo en este navegador.
        </small>
      </section>

      <section className="panel update-guide">
        <div className="panel-head">
          <div>
            <h2>Cómo actualizar cada semana</h2>
            <p>La información queda bajo su control.</p>
          </div>
        </div>
        <div className="update-steps">
          <div>
            <b>1</b>
            <span>
              <strong>Reemplace los reportes</strong>
              <small>
                Haga clic en cada tarjeta y seleccione el Excel nuevo de SIAGRI. Revise las filas agregadas y retiradas.
              </small>
            </span>
          </div>
          <div>
            <b>2</b>
            <span>
              <strong>Confirme y revise la calidad</strong>
              <small>La conciliación se recalcula al confirmar. Revise “Calidad de datos” y los pendientes del Resumen.</small>
            </span>
          </div>
          <div>
            <b>3</b>
            <span>
              <strong>Cierre y respalde</strong>
              <small>Cierre las semanas sin pendientes en “Auditoría y cierres” y descargue un respaldo.</small>
            </span>
          </div>
        </div>
        <div className="github-note">
          <History />
          <span>
            <strong>Precarga multidispositivo.</strong>
            <small>
              Los Excel publicados en la carpeta datos/ se cargan automáticamente en dispositivos sin datos, y en los demás se
              ofrecen con “Revisar y cargar” cuando cambia su versión.
            </small>
          </span>
        </div>
      </section>

      {!!inputs.files.length && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Registro de archivos</h2>
              <p>Control de versión y trazabilidad</p>
            </div>
          </div>
          <div className="file-register">
            {inputs.files.map((file) => (
              <div key={file.kind}>
                <FileCheck2 />
                <span>
                  <strong>{file.name}</strong>
                  <small>
                    {file.kind} · {file.rows.toLocaleString('es-NI')} filas · {new Date(file.importedAt).toLocaleString('es-NI')}
                  </small>
                </span>
                <code>{String(file.hash).slice(0, 18)}…</code>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
