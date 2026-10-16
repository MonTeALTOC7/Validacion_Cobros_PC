import { FileSearch } from 'lucide-react';

export function Panel({ title, subtitle, actions, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  onNavigate,
  title = 'Todavía no hay resultados',
  text = 'Cargue Nómina, Prefactura y Maestro, y ejecute la conciliación.',
}) {
  return (
    <div className="empty-state">
      <FileSearch />
      <h3>{title}</h3>
      <p>{text}</p>
      {onNavigate && (
        <button className="button primary" onClick={onNavigate}>
          Ir a cargar archivos
        </button>
      )}
    </div>
  );
}

/** Tarjeta de indicador compacta. */
export function Metric({ label, value, note, tone = '', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`metric ${tone ? `metric-${tone}` : ''} ${onClick ? 'metric-action' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </Tag>
  );
}

/** Barra horizontal proporcional (para rankings y distribuciones). */
export function ShareBar({ value, max, tone = 'primary' }) {
  const width = max > 0 ? Math.max(1, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className="share-bar" aria-hidden="true">
      <i className={`share-${tone}`} style={{ width: `${width}%` }} />
    </span>
  );
}
