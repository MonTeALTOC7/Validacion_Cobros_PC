import { useEffect, useRef } from 'react';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';

/**
 * Panel lateral de detalle con niveles: ruta de navegación, Volver y Cerrar.
 * La página de origen queda montada debajo, de modo que sus filtros y selecciones no cambian.
 * stack: [{ title, ... }] del nivel más general al actual. children: contenido del nivel actual.
 */
export function DrillDrawer({ eyebrow, stack, onBack, onJump, onClose, children }) {
  const panel = useRef(null);
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const close = useRef(onClose);
  close.current = onClose;
  const current = stack.at(-1);

  // Escape cierra; al cerrar, el foco vuelve al control que abrió el detalle.
  useEffect(() => {
    const previous = opener.current;
    const onKey = (event) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  useEffect(() => {
    panel.current?.focus();
    panel.current?.scrollTo?.({ top: 0 });
  }, [stack.length]);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside
        ref={panel}
        className="drawer drawer-wide drill-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
        tabIndex={-1}
      >
        <div className="drawer-head drill-head">
          <div className="drill-head-main">
            <span>{eyebrow}</span>
            {stack.length > 1 && (
              <nav className="drill-crumbs" aria-label="Ruta del detalle">
                {stack.slice(0, -1).map((level, index) => (
                  <span key={index}>
                    <button type="button" onClick={() => onJump(index)}>
                      {level.crumb ?? level.title}
                    </button>
                    <ChevronRight size={12} aria-hidden="true" />
                  </span>
                ))}
              </nav>
            )}
            <h2>{current.title}</h2>
          </div>
          <div className="drill-head-actions">
            {stack.length > 1 && (
              <button type="button" className="drill-back" onClick={onBack}>
                <ArrowLeft size={16} /> Volver
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Cerrar detalle">
              <X />
            </button>
          </div>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}
