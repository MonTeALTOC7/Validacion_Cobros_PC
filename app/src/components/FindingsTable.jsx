import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FilterX, Search, SlidersHorizontal } from 'lucide-react';
import { StatusBadge, FlagBadges } from './StatusBadge';
import { STATUS_LABELS, TYPE_LABELS } from '../engine/constants';
import { FLAG_LABELS } from '../engine/reconciliation';
import { findingPeriod } from '../engine/indicators';
import { normalizeText } from '../engine/normalize';
import { comparePeriods, parsePeriodKey } from '../engine/periods';
import { formatCurrency, formatNumber } from '../lib/format';
import { periodText, tariffText } from '../lib/labels';
import { exportRowsToExcel } from '../lib/sheet';
import { findingToExportRow } from '../engine/exports';

const PAGE_SIZE = 25;

const comparePeriodKeys = (a, b) =>
  parsePeriodKey(a) && parsePeriodKey(b) ? comparePeriods(a, b) : String(a).localeCompare(String(b));

const INITIAL_FILTERS = {
  search: '',
  severity: 'all',
  period: 'all',
  hacienda: 'all',
  laborService: 'all',
  status: 'all',
  type: 'all',
  flag: 'all',
};

/**
 * Tabla de hallazgos con filtros, orden, paginación y exportación de la vista.
 * @param rows hallazgos a mostrar
 * @param initialPeriod período preseleccionado ("AAAA-SNN")
 * @param multiYear muestra el año en las semanas cuando los datos abarcan más de un año operativo
 */
export function FindingsTable({ rows, onSelect, initialPeriod = null, multiYear = false, exportName = 'conciliacion_vista' }) {
  const [filters, setFilters] = useState({ ...INITIAL_FILTERS, period: initialPeriod ?? 'all' });
  const [sort, setSort] = useState('week-desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (initialPeriod) {
      setFilters((current) => ({ ...current, period: initialPeriod }));
      setPage(1);
    }
  }, [initialPeriod]);

  const setFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  };

  const options = useMemo(
    () => ({
      periods: [...new Set(rows.map(findingPeriod))].sort((a, b) => comparePeriodKeys(b, a)),
      haciendas: [...new Set(rows.map((row) => row.hacienda))].sort(),
      laborServices: [
        ...new Map(
          rows.map((row) => [
            `${row.labor}|${row.service}`,
            { key: `${row.labor}|${row.service}`, labor: row.labor, service: row.service },
          ]),
        ).values(),
      ].sort((a, b) => a.labor.localeCompare(b.labor) || a.service.localeCompare(b.service)),
      statuses: [...new Set(rows.map((row) => row.status))].sort(),
      types: [...new Set(rows.map((row) => row.type))].sort(),
      flags: [...new Set(rows.flatMap((row) => row.flags ?? []))].sort(),
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const search = normalizeText(filters.search);
    return rows
      .filter((row) => {
        if (search) {
          const haystack = normalizeText(
            `${row.hacienda} ${row.suerte} ${row.service} ${row.labor} ${row.pFacts.join(' ')} ${row.status} ${STATUS_LABELS[row.status] ?? ''}`,
          );
          if (!haystack.includes(search)) return false;
        }
        return (
          (filters.severity === 'all' || row.severity === filters.severity) &&
          (filters.period === 'all' || findingPeriod(row) === filters.period) &&
          (filters.hacienda === 'all' || row.hacienda === filters.hacienda) &&
          (filters.laborService === 'all' || `${row.labor}|${row.service}` === filters.laborService) &&
          (filters.status === 'all' || row.status === filters.status) &&
          (filters.type === 'all' || row.type === filters.type) &&
          (filters.flag === 'all' || (row.flags ?? []).includes(filters.flag))
        );
      })
      .sort((a, b) => {
        const byPeriod = comparePeriodKeys(findingPeriod(a), findingPeriod(b));
        if (sort === 'week-asc') return byPeriod || a.hacienda.localeCompare(b.hacienda);
        if (sort === 'difference') return Math.abs(b.difference) - Math.abs(a.difference);
        if (sort === 'amount') return b.amount - a.amount;
        if (sort === 'hacienda') return a.hacienda.localeCompare(b.hacienda) || -byPeriod;
        return -byPeriod || a.hacienda.localeCompare(b.hacienda);
      });
  }, [rows, filters, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeFilters = Object.entries(filters).filter(([key, value]) => (key === 'search' ? !!value : value !== 'all')).length;
  const totals = useMemo(
    () => ({
      amount: filtered.reduce((total, row) => total + (row.amount || 0), 0),
    }),
    [filtered],
  );

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setSort('week-desc');
    setPage(1);
  };

  const filterSelect = (name, label, values, renderLabel, allLabel = 'Todos') => (
    <label>
      <span>{label}</span>
      <select
        aria-label={`Filtrar por ${label.toLowerCase()}`}
        value={filters[name]}
        onChange={(event) => setFilter(name, event.target.value)}
      >
        <option value="all">{allLabel}</option>
        {values.map((value) => (
          <option key={value.key ?? value} value={value.key ?? value}>
            {renderLabel(value)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <div className="table-tools">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Buscar"
            placeholder="Buscar hacienda, servicio, P.FACT o estado"
            value={filters.search}
            onChange={(event) => setFilter('search', event.target.value)}
          />
        </div>
        <span className="result-count">
          {filtered.length.toLocaleString('es-NI')} resultados · {formatCurrency(totals.amount)}
        </span>
        <button
          className="button secondary compact"
          disabled={!filtered.length}
          onClick={() =>
            exportRowsToExcel(
              filtered.map(findingToExportRow),
              'Hallazgos',
              `${exportName}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            )
          }
        >
          <Download size={15} /> Exportar vista
        </button>
      </div>
      <div className="advanced-filters">
        <div className="filter-title">
          <SlidersHorizontal size={16} />
          <strong>Filtros de control</strong>
        </div>
        {filterSelect('period', 'Semana', options.periods, (period) => periodText(period, multiYear), 'Todas')}
        {filterSelect('hacienda', 'Hacienda', options.haciendas, (hacienda) => hacienda, 'Todas')}
        {filterSelect('laborService', 'Labor / servicio', options.laborServices, (item) => `${item.labor} · ${item.service}`)}
        {filterSelect('status', 'Resultado', options.statuses, (status) => STATUS_LABELS[status] ?? status)}
        {options.types.length > 1 && filterSelect('type', 'Tipo', options.types, (type) => TYPE_LABELS[type] ?? type)}
        {options.flags.length > 0 && filterSelect('flag', 'Bandera', options.flags, (flag) => FLAG_LABELS[flag] ?? flag, 'Todas')}
        <label>
          <span>Prioridad</span>
          <select
            aria-label="Filtrar por prioridad"
            value={filters.severity}
            onChange={(event) => setFilter('severity', event.target.value)}
          >
            <option value="all">Todas</option>
            <option value="critical">Sin cobro / parciales</option>
            <option value="warning">Advertencias</option>
            <option value="ok">Conciliados</option>
            <option value="info">Informativos</option>
          </select>
        </label>
        <label>
          <span>Ordenar</span>
          <select aria-label="Ordenar resultados" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="week-desc">Semana reciente</option>
            <option value="week-asc">Semana antigua</option>
            <option value="difference">Mayor diferencia</option>
            <option value="amount">Mayor monto</option>
            <option value="hacienda">Hacienda A–Z</option>
          </select>
        </label>
        <button className="clear-filters" disabled={!activeFilters} onClick={resetFilters}>
          <FilterX size={15} /> Limpiar {activeFilters ? `(${activeFilters})` : ''}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Semana</th>
              <th>Hacienda / suerte</th>
              <th>Labor / servicio</th>
              <th>Estado</th>
              <th className="num">Nómina</th>
              <th className="num">Prefactura</th>
              <th className="num">Diferencia</th>
              <th className="num">Tarifa</th>
              <th>P.FACT</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(row)}
                tabIndex={0}
                onKeyDown={(event) => event.key === 'Enter' && onSelect(row)}
              >
                <td>
                  <strong>{periodText(findingPeriod(row), multiYear)}</strong>
                </td>
                <td>
                  <strong>{row.hacienda}</strong>
                  <small>Suerte {row.suerte}</small>
                </td>
                <td>
                  <strong>{row.labor}</strong>
                  <small>
                    {row.service} · {row.unit}
                  </small>
                </td>
                <td>
                  <StatusBadge status={row.status} severity={row.severity} />
                  <FlagBadges flags={row.flags} />
                </td>
                <td className="num">{formatNumber(row.payrollUnits)}</td>
                <td className="num">{formatNumber(row.billedUnits)}</td>
                <td
                  className={`num ${row.severity === 'critical' && row.difference < -0.01 ? 'difference' : row.difference > 0.01 ? 'surplus' : ''}`}
                >
                  {formatNumber(row.difference)}
                </td>
                <td className={`num ${(row.flags ?? []).includes('TARIFA_POCO_FRECUENTE') ? 'tariff-atypical' : ''}`}>
                  {tariffText(row)}
                </td>
                <td>{row.pFacts.join(', ') || '—'}</td>
                <td className="num">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <div className="empty-table">No hay resultados con estos filtros.</div>}
      </div>
      <div className="pagination">
        <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
          <ChevronLeft size={16} /> Anterior
        </button>
        <span>
          Página {currentPage} de {pageCount}
        </span>
        <button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
          Siguiente <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}
