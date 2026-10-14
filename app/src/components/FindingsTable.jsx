import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, FilterX, Search, SlidersHorizontal } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { STATUS_LABELS } from '../engine/constants';
import { normalizeText } from '../engine/normalize';
import { formatCurrency, formatNumber } from '../lib/format';

const PAGE_SIZE = 25;
export function FindingsTable({ rows: a, onSelect: s, initialWeek: t = null }) {
  const [n, i] = useState('');
  const [r, l] = useState('all');
  const [o, x] = useState(t ? String(t) : 'all');
  const [m, f] = useState('all');
  const [S, A] = useState('all');
  const [E, D] = useState('all');
  const [I, v] = useState('week-desc');
  const [N, g] = useState(1);
  useEffect(() => {
    t && (x(String(t)), g(1));
  }, [t]);
  const d = useMemo(
    () => ({
      weeks: [...new Set(a.map((h) => h.week))].sort((h, L) => L - h),
      haciendas: [...new Set(a.map((h) => h.hacienda))].sort(),
      laborServices: [
        ...new Map(
          a.map((h) => [
            `${h.labor}|${h.service}`,
            {
              key: `${h.labor}|${h.service}`,
              labor: h.labor,
              service: h.service,
            },
          ]),
        ).values(),
      ].sort((h, L) => h.labor.localeCompare(L.labor) || h.service.localeCompare(L.service)),
      statuses: [...new Set(a.map((h) => h.status))].sort(),
    }),
    [a],
  );
  const R = useMemo(
    () =>
      a
        .filter((h) => {
          const L = normalizeText(
            `${h.hacienda} ${h.suerte} ${h.service} ${h.labor} ${h.pFacts.join(' ')} ${h.status}`,
          );
          return (
            (!n || L.includes(normalizeText(n))) &&
            (r === 'all' || h.severity === r) &&
            (o === 'all' || h.week === Number(o)) &&
            (m === 'all' || h.hacienda === m) &&
            (S === 'all' || `${h.labor}|${h.service}` === S) &&
            (E === 'all' || h.status === E)
          );
        })
        .sort((h, L) =>
          I === 'week-asc'
            ? h.week - L.week || h.hacienda.localeCompare(L.hacienda)
            : I === 'difference'
              ? Math.abs(L.difference) - Math.abs(h.difference)
              : I === 'hacienda'
                ? h.hacienda.localeCompare(L.hacienda) || L.week - h.week
                : L.week - h.week || h.hacienda.localeCompare(L.hacienda),
        ),
    [a, n, r, o, m, S, E, I],
  );
  const O = Math.max(1, Math.ceil(R.length / PAGE_SIZE));
  const C = Math.min(N, O);
  const y = R.slice((C - 1) * PAGE_SIZE, C * PAGE_SIZE);
  const _ = [n, r !== 'all', o !== 'all', m !== 'all', S !== 'all', E !== 'all'].filter(Boolean).length;
  const P = () => {
    i('');
    l('all');
    x('all');
    f('all');
    A('all');
    D('all');
    v('week-desc');
    g(1);
  };
  return (
    <>
      <div className="table-tools">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Buscar"
            placeholder="Buscar hacienda, servicio o P.FACT"
            value={n}
            onChange={(h) => {
              i(h.target.value);
              g(1);
            }}
          />
        </div>
        <span className="result-count">
          {R.length.toLocaleString('es-NI')}
          {' resultados'}
        </span>
      </div>
      <div className="advanced-filters">
        <div className="filter-title">
          <SlidersHorizontal size={16} />
          <strong>Filtros de control</strong>
        </div>
        <label>
          <span>Semana</span>
          <select
            aria-label="Filtrar por semana"
            value={o}
            onChange={(h) => {
              x(h.target.value);
              g(1);
            }}
          >
            <option value="all">Todas</option>
            {d.weeks.map((h) => (
              <option key={h} value={h}>
                {'Semana '}
                {h}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Hacienda</span>
          <select
            aria-label="Filtrar por hacienda"
            value={m}
            onChange={(h) => {
              f(h.target.value);
              g(1);
            }}
          >
            <option value="all">Todas</option>
            {d.haciendas.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Labor / servicio</span>
          <select
            aria-label="Filtrar por labor y servicio"
            value={S}
            onChange={(h) => {
              A(h.target.value);
              g(1);
            }}
          >
            <option value="all">Todos</option>
            {d.laborServices.map((h) => (
              <option key={h.key} value={h.key}>
                {h.labor}
                {' · '}
                {h.service}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Resultado</span>
          <select
            aria-label="Filtrar por resultado"
            value={E}
            onChange={(h) => {
              D(h.target.value);
              g(1);
            }}
          >
            <option value="all">Todos</option>
            {d.statuses.map((h) => (
              <option key={h} value={h}>
                {STATUS_LABELS[h] ?? h}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Prioridad</span>
          <select
            aria-label="Filtrar por prioridad"
            value={r}
            onChange={(h) => {
              l(h.target.value);
              g(1);
            }}
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
          <select aria-label="Ordenar resultados" value={I} onChange={(h) => v(h.target.value)}>
            <option value="week-desc">Semana reciente</option>
            <option value="week-asc">Semana antigua</option>
            <option value="difference">Mayor diferencia</option>
            <option value="hacienda">Hacienda A–Z</option>
          </select>
        </label>
        <button className="clear-filters" disabled={!_} onClick={P}>
          <FilterX size={15} />
          {' Limpiar '}
          {_ ? `(${_})` : ''}
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
              <th>P.FACT</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {y.map((h) => (
              <tr
                key={h.id}
                onClick={() => s(h)}
                tabIndex={0}
                onKeyDown={(L) => {
                  L.key === 'Enter' && s(h);
                }}
              >
                <td>
                  <strong>{h.week}</strong>
                </td>
                <td>
                  <strong>{h.hacienda}</strong>
                  <small>
                    {'Suerte '}
                    {h.suerte}
                  </small>
                </td>
                <td>
                  <strong>{h.labor}</strong>
                  <small>
                    {h.service}
                    {' · '}
                    {h.unit}
                  </small>
                </td>
                <td>
                  <StatusBadge status={h.status} severity={h.severity} />
                </td>
                <td className="num">{formatNumber(h.payrollUnits)}</td>
                <td className="num">{formatNumber(h.billedUnits)}</td>
                <td
                  className={`num ${h.severity === 'critical' && h.difference < -0.01 ? 'difference' : h.difference > 0.01 ? 'surplus' : ''}`}
                >
                  {formatNumber(h.difference)}
                </td>
                <td>{h.pFacts.join(', ') || '—'}</td>
                <td className="num">{formatCurrency(h.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!y.length && <div className="empty-table">No hay resultados con estos filtros.</div>}
      </div>
      <div className="pagination">
        <button disabled={C <= 1} onClick={() => g(C - 1)}>
          <ChevronLeft size={16} />
          {' Anterior'}
        </button>
        <span>
          {'Página '}
          {C}
          {' de '}
          {O}
        </span>
        <button disabled={C >= O} onClick={() => g(C + 1)}>
          {'Siguiente '}
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}
