import { CircleCheck, ClipboardCheck, FileCheck2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { FileGrid } from './FileGrid';

export function CheckItem({ label: a, value: s, ok: t }) {
  return (
    <div className="health-row">
      <span className={t ? 'health-ok' : 'health-warn'}>{t ? <CircleCheck /> : <TriangleAlert />}</span>
      <strong>{a}</strong>
      <b>{s}</b>
    </div>
  );
}
export function LoadPanel({ inputs: a, busy: s, working: t, ready: n, onFile: i, onAnalyze: r, onReset: l }) {
  return (
    <>
      <section className="panel load-intro">
        <div>
          <span className="eyebrow">ACTUALIZACIÓN SEGURA</span>
          <h2>Cargue los reportes originales de SIAGRI</h2>
          <p>
            Puede sustituir un archivo sin borrar los demás. La aplicación identifica cada versión por su
            huella SHA-256 y guarda el histórico de acciones.
          </p>
        </div>
        <ShieldCheck />
      </section>
      <FileGrid files={a.files} busy={s} onFile={i} />
      <section className="panel action-panel">
        <div>
          <strong>{n ? 'Todo listo para conciliar' : 'Faltan archivos requeridos'}</strong>
          <p>
            {n
              ? 'Se procesarán las filas desde el 1 de enero de 2026.'
              : 'Cargue Nómina, Prefactura y Cronológico Maestro.'}
          </p>
        </div>
        <div>
          <button className="button ghost" onClick={l}>
            Limpiar datos locales
          </button>
          <button className="button primary large" disabled={!n || t || s !== null} onClick={r}>
            {t ? <RefreshCw className="spin" /> : <ClipboardCheck />}{' '}
            {t ? 'Conciliando…' : 'Ejecutar conciliación'}
          </button>
        </div>
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
              <small>Haga clic en cada tarjeta y seleccione el Excel nuevo de SIAGRI.</small>
            </span>
          </div>
          <div>
            <b>2</b>
            <span>
              <strong>Ejecute la conciliación</strong>
              <small>La app valida la estructura, sustituye la versión anterior y recalcula todo.</small>
            </span>
          </div>
          <div>
            <b>3</b>
            <span>
              <strong>Publique la versión</strong>
              <small>
                La integración GitHub permitirá compartir el nuevo corte con todos sus dispositivos.
              </small>
            </span>
          </div>
        </div>
        <div className="github-note">
          <ShieldCheck />
          <span>
            <strong>Precarga multidispositivo habilitada.</strong>
            <small>
              Los Excel publicados en la carpeta datos son descargados por la aplicación. La escritura
              automática al repositorio será el siguiente control de administración.
            </small>
          </span>
        </div>
      </section>
      {!!a.files.length && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Registro de archivos</h2>
              <p>Control de versión y trazabilidad</p>
            </div>
          </div>
          <div className="file-register">
            {a.files.map((o) => (
              <div key={o.kind}>
                <FileCheck2 />
                <span>
                  <strong>{o.name}</strong>
                  <small>
                    {o.kind}
                    {' · '}
                    {o.rows.toLocaleString('es-NI')}
                    {' filas · '}
                    {new Date(o.importedAt).toLocaleString('es-NI')}
                  </small>
                </span>
                <code>{o.hash.slice(0, 12)}…</code>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
