import { FileSearch } from 'lucide-react';

export function Panel({ title: a, subtitle: s, children: t }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{a}</h2>
          <p>{s}</p>
        </div>
      </div>
      {t}
    </section>
  );
}
export function EmptyState({ onNavigate: a }) {
  return (
    <div className="empty-state">
      <FileSearch />
      <h3>Todavía no hay resultados</h3>
      <p>Cargue Nómina, Prefactura y Maestro, y ejecute la conciliación.</p>
      <button className="button primary" onClick={a}>
        Ir a cargar archivos
      </button>
    </div>
  );
}
