import { STATUS_LABELS } from '../engine/constants';
import { FLAG_LABELS } from '../engine/reconciliation';

export function StatusBadge({ status, severity }) {
  return <span className={`status status-${severity}`}>{STATUS_LABELS[status] ?? status}</span>;
}

const FLAG_TONES = {
  DUPLICADO_POTENCIAL: 'warning',
  REPETICION_RESPALDADA: 'info',
  LOTE_NO_ENCONTRADO: 'warning',
  TARIFA_POCO_FRECUENTE: 'info',
  FECHA_FUERA_DE_SEMANA: 'warning',
};

/** Banderas de revisión de un hallazgo (no cambian su estado de cobro). */
export function FlagBadges({ flags }) {
  if (!flags?.length) return null;
  return (
    <span className="flag-list">
      {flags.map((flag) => (
        <span key={flag} className={`flag flag-${FLAG_TONES[flag] ?? 'info'}`} title={FLAG_LABELS[flag] ?? flag}>
          {FLAG_LABELS[flag] ?? flag}
        </span>
      ))}
    </span>
  );
}
