import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Tabla genérica con orden por columna, paginación y fila de totales.
 * columns: [{ key, label, num?, render?(row), value?(row) (para ordenar), total?(rows) }]
 */
export function DataTable({
  columns,
  rows,
  pageSize = 25,
  initialSort,
  onRowClick,
  rowKey = (row) => row.key,
  emptyText = 'Sin registros.',
  footer = true,
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return rows;
    const valueOf = column.value ?? ((row) => row[column.key]);
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * direction;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize);
  const hasTotals = footer && columns.some((column) => column.total);

  const toggleSort = (column) => {
    setPage(1);
    setSort((previous) =>
      previous?.key === column.key
        ? { key: column.key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: column.num ? 'desc' : 'asc' },
    );
  };

  return (
    <>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.num ? 'num' : ''}>
                  <button
                    type="button"
                    className="sort-button"
                    onClick={() => toggleSort(column)}
                    aria-label={`Ordenar por ${column.label}`}
                  >
                    {column.label}
                    {sort?.key === column.key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (event) => event.key === 'Enter' && onRowClick(row) : undefined}
                className={onRowClick ? 'clickable' : ''}
              >
                {columns.map((column) => (
                  <td key={column.key} className={column.num ? 'num' : ''}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasTotals && sorted.length > 0 && (
            <tfoot>
              <tr>
                {columns.map((column, index) => (
                  <td key={column.key} className={column.num ? 'num' : ''}>
                    {column.total ? column.total(sorted) : index === 0 ? `Total (${sorted.length})` : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
        {!visible.length && <div className="empty-table">{emptyText}</div>}
      </div>
      {pages > 1 && (
        <div className="pagination">
          <button disabled={current <= 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft size={16} /> Anterior
          </button>
          <span>
            Página {current} de {pages} · {sorted.length.toLocaleString('es-NI')} filas
          </span>
          <button disabled={current >= pages} onClick={() => setPage(current + 1)}>
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}
