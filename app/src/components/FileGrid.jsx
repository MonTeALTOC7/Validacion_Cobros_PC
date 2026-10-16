import { CircleCheck, CloudUpload, FileSpreadsheet } from 'lucide-react';
import { SKIP_REASON_LABELS } from '../engine/importers';

const FILE_SLOTS = [
  { kind: 'payroll', title: 'Reporte de Nómina', description: 'Base diaria de labores manuales', required: true },
  { kind: 'prefactura', title: 'Reporte de Prefactura', description: 'Cobros y número P.FACT', required: true },
  { kind: 'master', title: 'Cronológico Maestro', description: 'Haciendas, suertes y productores', required: true },
  { kind: 'example', title: 'Ejemplo de control', description: 'Archivo opcional de referencia', required: false },
];

const SOURCE_LABELS = { PRELOADED: 'Precargado', REMOTE: 'Maestro Central', UPLOADED: 'Actualizado' };

export function FileGrid({ files, busy, onFile }) {
  return (
    <div className="file-grid">
      {FILE_SLOTS.map((slot) => {
        const file = files.find((item) => item.kind === slot.kind);
        const reasons = Object.entries(file?.skipReasons ?? {});
        return (
          <label key={slot.kind} className={`file-card ${file ? 'file-ready' : ''}`}>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={busy !== null}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) onFile(slot.kind, selected);
                event.currentTarget.value = '';
              }}
            />
            <div className="file-icon">{file ? <CircleCheck /> : <CloudUpload />}</div>
            <div>
              <div className="file-title">
                {slot.title}
                {slot.required && <span className="required">Requerido</span>}
                {file && <span className="source-badge">{SOURCE_LABELS[file.source] ?? 'Actualizado'}</span>}
              </div>
              <p>{busy === slot.kind ? 'Leyendo y validando estructura…' : file ? file.name : slot.description}</p>
              {file && (
                <div className="file-validation">
                  <span>
                    <CircleCheck size={14} /> Formato reconocido{file.sheet ? ` · hoja ${file.sheet}` : ''}
                  </span>
                  <b>{file.rows.toLocaleString('es-NI')} filas utilizables</b>
                  {file.weekStart && (
                    <b>
                      Semanas {file.weekStart}–{file.weekEnd}
                      {file.years?.length ? ` · años operativos ${file.years.join(', ')}` : ''}
                    </b>
                  )}
                  {file.dateStart && (
                    <b>
                      {file.dateStart} → {file.dateEnd}
                    </b>
                  )}
                  <b>{file.skippedRows ?? 0} no utilizables</b>
                  {reasons.length > 0 && (
                    <small>
                      {reasons.map(([reason, count]) => `${SKIP_REASON_LABELS[reason] ?? reason}: ${count}`).join(' · ')}
                    </small>
                  )}
                  <small>La conciliación determina si los cobros coinciden.</small>
                </div>
              )}
            </div>
            <div className="replace-file">
              <FileSpreadsheet className="file-sheet" />
              <small>{file ? 'Clic para reemplazar' : 'Seleccionar Excel'}</small>
            </div>
          </label>
        );
      })}
    </div>
  );
}
