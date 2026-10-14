import { STATUS_LABELS } from '../engine/constants';

export function StatusBadge({ status: a, severity: s }) {
  return <span className={`status status-${s}`}>{STATUS_LABELS[a] ?? a}</span>;
}
