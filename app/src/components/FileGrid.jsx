import { CircleCheck, CloudUpload, FileSpreadsheet } from 'lucide-react';

const FILE_SLOTS = [
  {
    kind: 'payroll',
    title: 'Reporte de Nómina',
    description: 'Base diaria de labores manuales',
    required: true,
  },
  {
    kind: 'prefactura',
    title: 'Reporte de Prefactura',
    description: 'Cobros y número P.FACT',
    required: true,
  },
  {
    kind: 'master',
    title: 'Cronológico Maestro',
    description: 'Haciendas, suertes y productores',
    required: true,
  },
  {
    kind: 'example',
    title: 'Ejemplo de control',
    description: 'Archivo opcional de referencia',
    required: false,
  },
];
export function FileGrid({ files: a, busy: s, onFile: t }) {
  return (
    <div className="file-grid">
      {FILE_SLOTS.map((n) => {
        const i = a.find((r) => r.kind === n.kind);
        return (
          <label key={n.kind} className={`file-card ${i ? 'file-ready' : ''}`}>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={s !== null}
              onChange={(r) => {
                var o;
                const l = (o = r.target.files) == null ? undefined : o[0];
                l && t(n.kind, l);
                r.currentTarget.value = '';
              }}
            />
            <div className="file-icon">{i ? <CircleCheck /> : <CloudUpload />}</div>
            <div>
              <div className="file-title">
                {n.title}
                {n.required && <span className="required">Requerido</span>}
                {i && (
                  <span className="source-badge">
                    {i.source === 'PRELOADED' ? 'Precargado' : 'Actualizado'}
                  </span>
                )}
              </div>
              <p>{s === n.kind ? 'Leyendo y validando estructura…' : i ? i.name : n.description}</p>
              {i && (
                <div className="file-validation">
                  <span>
                    <CircleCheck size={14} />
                    {' Formato reconocido'}
                  </span>
                  <b>
                    {i.rows.toLocaleString('es-NI')}
                    {' filas utilizables'}
                  </b>
                  {i.weekStart && (
                    <b>
                      {'Semanas '}
                      {i.weekStart}–{i.weekEnd}
                    </b>
                  )}
                  {i.dateStart && (
                    <b>
                      {i.dateStart}
                      {' → '}
                      {i.dateEnd}
                    </b>
                  )}
                  <b>
                    {i.skippedRows ?? 0}
                    {' no utilizables'}
                  </b>
                  <small>La conciliación determina si los cobros coinciden.</small>
                </div>
              )}
            </div>
            <div className="replace-file">
              <FileSpreadsheet className="file-sheet" />
              <small>{i ? 'Clic para reemplazar' : 'Seleccionar Excel'}</small>
            </div>
          </label>
        );
      })}
    </div>
  );
}
