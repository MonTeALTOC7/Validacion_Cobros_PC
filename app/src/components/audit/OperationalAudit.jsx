import { useMemo, useState } from 'react';
import { filterAuditRows } from '../../engine/audit/tariffAudit';
import { FINANCE_UNIVERSES } from '../../engine/finance';
import { formatCurrency, formatNumber } from '../../lib/format';
import { caseGuidance, observedReference, reviewReasons, reviewRows, trend } from './operationalPresentation';

const value = (number) => (Number.isFinite(number) ? formatNumber(number, 2) : 'No disponible');
const text = (item) => (item === null || item === undefined || item === '' ? 'No disponible' : String(item));

function References({ population }) {
  return (
    <>
      <span>Reportada: {value(observedReference(population, 'reported'))}</span>
      <span>Efectiva: {value(observedReference(population, 'effective'))}</span>
      <small>{population?.month ?? 'Sin período'} · observadas, no autorizadas</small>
    </>
  );
}

export function OperationalQueue({ audit, onOpen, onTotal }) {
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(0);
  const candidates = useMemo(() => reviewRows(audit.rows), [audit]);
  const populations = useMemo(() => new Map(audit.populations.map((item) => [item.key, item])), [audit]);
  const rows = filterAuditRows(candidates, { search }).filter((row) => !reason || reviewReasons(row).includes(reason));
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const currentPage = Math.min(page, pages - 1);
  const visible = rows.slice(currentPage * 8, currentPage * 8 + 8);
  const select = (next) => {
    setReason(next);
    setSearch('');
    setPage(0);
  };
  return (
    <section className="operational-queue" aria-label="Bandeja de revisión">
      <div className="tariff-review-overview">
        <button className="tariff-review-counter" aria-pressed={!reason} onClick={() => select('')}>
          <strong>{candidates.length}</strong>
          <span>Casos para revisar</span>
          <small>Registros únicos · incluye falta de respaldo</small>
        </button>
        <button
          className="tariff-review-counter"
          aria-pressed={reason === 'Comparables insuficientes'}
          onClick={() => select('Comparables insuficientes')}
        >
          <strong>{candidates.filter((row) => reviewReasons(row).includes('Comparables insuficientes')).length}</strong>
          <span>Comparables insuficientes</span>
          <small>Subconjunto · no sumar al total de casos</small>
        </button>
        <button className="tariff-review-total" onClick={onTotal}>
          <span>Importe informado de toda la Prefactura</span>
          <strong>{formatCurrency(audit.summary.total)}</strong>
          <small>No representa sobrecobro ni exposición · ver desglose</small>
        </button>
      </div>
      <div className="tariff-review-toolbar">
        <label>
          Buscar un cobro
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Productor, hacienda, CMN, P.FACT o fila 1376"
          />
        </label>
        <label>
          Motivo de revisión
          <select
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos los motivos</option>
            {[
              'Tarifa inusual',
              'Diferencia de presentación SIAGRI',
              'Posible repetición documental',
              'Igual cantidad con tarifas diferentes',
              'Datos de origen incompletos',
              'Comparables insuficientes',
            ].map((label) => (
              <option key={label}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="tariff-review-caption" data-tariff-review-count={rows.length}>
        {rows.length} registros únicos en esta selección. Primero los extremos detectados por el motor; después otras señales y
        falta de respaldo. Varias señales no multiplican el importe.
      </p>
      <div className="tariff-review-table-scroll">
        <table className="tariff-review-table">
          <caption>Cobros que requieren revisión · referencias del mismo mes y población</caption>
          <thead>
            <tr>
              {[
                'Productor / hacienda / suerte',
                'Labor / servicio',
                'Semana / cantidad',
                'Tarifa reportada',
                'Tarifa efectiva',
                'Referencia observada',
                'Motivo / acción',
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.auditId} data-tariff-review-id={row.auditId}>
                <td>
                  <strong>{text(row.producerName)}</strong>
                  <span>
                    {text(row.producerCode)} · {text(row.hacienda)}
                  </span>
                  <span>Suerte {text(row.suerte)}</span>
                </td>
                <td>
                  <strong>{text(row.labor)}</strong>
                  <span>{text(row.service)}</span>
                </td>
                <td>
                  <span>{text(row.period)}</span>
                  <strong>
                    {value(row.units)} {text(row.unit)}
                  </strong>
                </td>
                <td>{value(row.tariff)}</td>
                <td>{value(row.effective)}</td>
                <td>
                  <References population={populations.get(row.populationKey)} />
                </td>
                <td>
                  <div className="tariff-review-badges">
                    {reviewReasons(row).map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  <button
                    className="link-button"
                    aria-label={`Abrir evidencia de fila ${row.sourceRow}`}
                    onClick={() => onOpen(row)}
                  >
                    Abrir evidencia →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tariff-review-mobile">
        {visible.map((row) => (
          <article className="tariff-review-card" key={row.auditId} data-tariff-review-id={row.auditId}>
            <header>
              <strong>{text(row.producerName)}</strong>
              <span>
                {text(row.producerCode)} · {text(row.hacienda)} · Suerte {text(row.suerte)}
              </span>
            </header>
            <div className="tariff-review-badges">
              {reviewReasons(row).map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <dl>
              <div>
                <dt>Labor · servicio</dt>
                <dd>
                  {text(row.labor)} · {text(row.service)}
                </dd>
              </div>
              <div>
                <dt>Semana · cantidad</dt>
                <dd>
                  {text(row.period)} · {value(row.units)} {text(row.unit)}
                </dd>
              </div>
              <div>
                <dt>Tarifa reportada</dt>
                <dd>{value(row.tariff)}</dd>
              </div>
              <div>
                <dt>Tarifa efectiva</dt>
                <dd>{value(row.effective)}</dd>
              </div>
              <div className="tariff-review-wide">
                <dt>Referencia observada · no autorizada</dt>
                <dd>
                  <References population={populations.get(row.populationKey)} />
                </dd>
              </div>
            </dl>
            <button
              className="button secondary"
              aria-label={`Abrir evidencia de fila ${row.sourceRow}`}
              onClick={() => onOpen(row)}
            >
              Abrir evidencia →
            </button>
          </article>
        ))}
      </div>
      {!rows.length && <p className="tariff-review-caption">No hay registros que coincidan. Cambie el motivo o la búsqueda.</p>}
      <nav className="tariff-review-pagination" aria-label="Páginas de cobros">
        <button className="button secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          Anterior
        </button>
        <span aria-live="polite">
          Página {currentPage + 1} de {pages}
        </span>
        <button className="button secondary" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>
          Siguiente
        </button>
      </nav>
    </section>
  );
}

export function CaseExplanation({ row, population }) {
  const guidance = caseGuidance(row, population);
  return (
    <section className="case-explanation" aria-label="Guía para investigar el cobro">
      <header className="case-identity">
        <strong>
          {text(row.producerCode)} · {text(row.producerName)}
        </strong>
        <span>
          Hacienda {text(row.haciendaCode)} · {text(row.hacienda)} · suerte {text(row.suerte)}
        </span>
        <span>
          {text(row.labor)} · servicio {text(row.service)} · {text(row.period)}
        </span>
        <span>
          {value(row.units)} {text(row.unit)} · reportada {value(row.tariff)} · efectiva {value(row.effective)}
        </span>
        <span>
          P.FACT {text(row.pFact)} · {text(row.sourceSheet)}!{text(row.sourceRow)}
        </span>
      </header>
      <h3>Qué se detectó</h3>
      <p>
        <strong>{guidance.found}</strong>
      </p>
      <h3>Por qué merece revisión</h3>
      <p>{guidance.why}</p>
      <h3>Con qué registros se comparó</h3>
      <p>
        {text(row.service)} · {text(row.labor)} · {text(row.unit)} · contratista {text(row.contractorCode)} ·{' '}
        {FINANCE_UNIVERSES[row.universe] ?? 'Universo no disponible'} · {text(population?.month)}.
      </p>
      <div className="case-references">
        {['reported', 'effective'].map((metric) => (
          <p key={metric}>
            <strong>
              {metric === 'reported' ? 'Reportada' : 'Efectiva'}: {value(observedReference(population, metric))}
            </strong>
            <br />
            {population?.[metric]?.n ?? 0} muestras · {population?.[metric]?.weeks ?? 0} semanas.{' '}
            {!population?.[metric]?.sufficient ? 'Sin referencia suficiente.' : 'Referencia observada, no autorizada.'}
          </p>
        ))}
      </div>
      <p>
        Jornada: {text(row.jornada)} · base: {text(row.billingBase)}.{' '}
        {population?.exploratory && 'Jornada/base desconocida: puede haber mezcla no identificada.'} Comparación del mismo mes, no
        una tarifa histórica oficial.
      </p>
      <h3>Qué corresponde verificar</h3>
      <ul>
        {guidance.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
      <p className="audit-note">
        Importe informado: {Number.isFinite(row.total) ? formatCurrency(row.total) : 'No disponible'}. No se calcula deuda, daño
        ni sobrecobro supuesto.
      </p>
      <h3>Evidencia original de Prefactura</h3>
    </section>
  );
}

export function OperationalEvolution({ series, periods, audit, onOpen }) {
  if (!series) return null;
  const ordered = [...periods].sort((a, b) => a.month.localeCompare(b.month));
  const label = trend(
    series.before.effectiveMedian,
    series.after.effectiveMedian,
    series.sufficient && !!series.service && !!series.unit && !!series.contractorCode,
  );
  return (
    <section className="operational-evolution">
      <div className="evolution-head">
        <span>Evolución observada de la tarifa efectiva</span>
        <h3>{label}</h3>
        <p>
          Tarifa reportada:{' '}
          {trend(
            series.before.reportedMedian,
            series.after.reportedMedian,
            series.sufficient && !!series.service && !!series.unit && !!series.contractorCode,
          )}
          .
        </p>
        <p>
          Antes de {audit.config.cutoff} → Desde {audit.config.cutoff}. Comparación descriptiva; no acredita un reajuste
          autorizado. No se impone 4,6 %.
        </p>
        <p>
          Jornada: {series.jornada} · base: {series.billingBase}. Si no están informadas, puede haber operaciones de condiciones
          distintas.
        </p>
      </div>
      <div className="evolution-periods">
        {ordered.map((group, index) => {
          const previous = ordered[index - 1];
          const unusual = audit.rows.filter(
            (row) =>
              row.populationKey === group.key &&
              row.observations.some((item) => ['EXTREME', 'REPORTED_OUTLIER', 'EFFECTIVE_OUTLIER'].includes(item.rule)),
          ).length;
          return (
            <article key={group.key} className="evolution-month">
              <header>
                <strong>{group.month}</strong>
                <span>
                  {!group.effective.sufficient
                    ? 'Muestra insuficiente'
                    : previous
                      ? trend(
                          previous.effective.median,
                          group.effective.median,
                          previous.effective.sufficient && group.effective.sufficient,
                        )
                      : 'Primer período disponible'}
                </span>
              </header>
              {previous && (
                <p>
                  Reportada:{' '}
                  {trend(
                    previous.reported.median,
                    group.reported.median,
                    previous.reported.sufficient && group.reported.sufficient,
                  )}
                  .
                </p>
              )}
              <p>
                Reportada observada <strong>{value(observedReference(group, 'reported'))}</strong>
                <br />
                Efectiva observada <strong>{value(observedReference(group, 'effective'))}</strong> / {group.unit}
              </p>
              <p>
                {group.from ?? 'Sin fecha'} → {group.to ?? 'Sin fecha'}
                <br />
                {group.effective.n} muestras efectivas · {group.effective.weeks} semanas
              </p>
              <p>
                {unusual
                  ? `${unusual} registros con tarifa inusual para investigar`
                  : 'Sin señal estadística detectada; no certifica las tarifas'}
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  onOpen(
                    audit.rows.filter((row) => row.populationKey === group.key),
                    `Comparables · ${group.service} · ${group.month}`,
                  )
                }
              >
                Ver registros de {group.month}
              </button>
            </article>
          );
        })}
      </div>
      <p className="tariff-review-caption">
        Los valores centrales observados son medianas descriptivas, no tarifas aprobadas. «Se mantuvo» compara a 2 decimales; no
        define tolerancia comercial. No se rellenan meses ausentes. Los cambios son entre períodos disponibles.
      </p>
    </section>
  );
}
