import { Metric, Panel } from '../common';
import { DataTable } from '../common/DataTable';
import { formatCurrency, formatNumber } from '../../lib/format';

const money = (value) => (Number.isFinite(value) ? formatCurrency(value) : 'No disponible');
const rate = (value) => (Number.isFinite(value) ? formatNumber(value, 2) : 'No disponible');

export function caseType(row) {
  const rules = new Set(row.observations.map((observation) => observation.rule));
  if (rules.has('EXTREME')) return 'Tarifa muy diferente';
  if (rules.has('NON_POSITIVE')) return 'Tarifa o importe cero/negativo';
  if (rules.has('CROSS_INVOICE') || rules.has('EXACT_REPEAT')) return 'Posible repetición';
  if (rules.has('PRESENTATION')) return 'Tarifa presentada no reproduce importe';
  if (rules.has('DIFFERENT_RATE')) return 'Misma cantidad con distintas tarifas';
  if (rules.has('REPORTED_OUTLIER') || rules.has('EFFECTIVE_OUTLIER')) return 'Tarifa inusual';
  if (rules.has('INPUT')) return 'Información por verificar';
  return 'Sin señal automática';
}

export function caseExplanation(row, population) {
  const type = caseType(row);
  if (type === 'Tarifa muy diferente') {
    const reference = population?.reported?.median;
    return Number.isFinite(reference)
      ? `La tarifa mostrada en Prefactura es muy diferente de la referencia observada de ${rate(reference)} por ${row.unit || 'unidad'} para este servicio y período. La referencia no es una tarifa autorizada.`
      : 'Esta tarifa se aparta notablemente de su grupo comparable. Falta comprobar la tarifa aplicable.';
  }
  if (type === 'Posible repetición')
    return 'Existen registros documentales coincidentes. Podrían corresponder a trabajos distintos, ajustes o reemisiones.';
  if (type === 'Tarifa presentada no reproduce importe')
    return 'Tarifa × Unidades no reproduce el importe. Podría existir una consolidación SIAGRI, pero todavía no está demostrada.';
  if (type === 'Misma cantidad con distintas tarifas')
    return 'La misma cantidad aparece con tarifas distintas. Puede obedecer a jornadas o condiciones distintas.';
  if (type === 'Tarifa inusual')
    return 'La tarifa mostrada o efectiva está fuera del rango observado en registros comparables. No constituye un error confirmado.';
  if (type === 'Tarifa o importe cero/negativo')
    return 'El origen podría contener un ajuste, crédito, omisión o valor válido; debe verificarse el documento.';
  if (type === 'Información por verificar') return 'Faltan datos suficientes para interpretar correctamente el registro.';
  return 'No se detectó una señal automática; esto no certifica que la tarifa fuera la autorizada.';
}

export function caseNextStep(row) {
  const type = caseType(row);
  if (type === 'Posible repetición') return 'Comprobar la ejecución, la P.FACT definitiva y si hubo anulación o reemisión.';
  if (type === 'Tarifa presentada no reproduce importe')
    return 'Revisar el desglose del cobro en SIAGRI; no recalcular ni sustituir el importe original.';
  if (type === 'Información por verificar' || type === 'Tarifa o importe cero/negativo')
    return 'Consultar el Excel original y solicitar el respaldo de la operación.';
  return 'Verificar la tarifa de origen, vigencia, tipo de jornada y condiciones del servicio.';
}

function CaseCard({ row, population, onOpen }) {
  return (
    <article className="audit-case-card">
      <div className="audit-case-header">
        <div>
          <span className="audit-case-reason">{caseType(row)}</span>
          <strong>{row.producerName || row.producer || 'Productor no informado'}</strong>
          <small>
            {row.hacienda || 'Hacienda sin dato'} · Suerte {row.suerte || 'Sin dato'} · {row.labor} / {row.service}
          </small>
        </div>
        <span className="audit-case-week">{row.period || 'Sin semana'}</span>
      </div>
      <div className="audit-case-values">
        <div>
          <span>Tarifa mostrada</span>
          <strong>{rate(row.tariff)}</strong>
        </div>
        <div>
          <span>Referencia observada</span>
          <strong>{rate(population?.reported?.median)}</strong>
        </div>
        <div>
          <span>Cantidad</span>
          <strong>
            {rate(row.units)} {row.unit}
          </strong>
        </div>
      </div>
      <p>{caseExplanation(row, population)}</p>
      <div className="audit-case-footer">
        <small>
          Importe Prefactura: {money(row.total)} · P.FACT {row.pFact || 'No informada'}
        </small>
        <button type="button" className="button secondary" onClick={() => onOpen(row)}>
          Ver cobro y evidencia
        </button>
      </div>
    </article>
  );
}

export function AuditWorkQueue({ audit, onOpenLine, onShowCategory, onOpenGroup, onViewRates }) {
  const populations = new Map(audit.populations.map((item) => [item.key, item]));
  const urgent = audit.rows
    .filter((row) => row.observations.some((item) => item.rule === 'EXTREME'))
    .sort((a, b) => {
      const deviation = (row) =>
        Math.max(
          0,
          ...row.observations
            .filter((item) => item.rule === 'REPORTED_OUTLIER' || item.rule === 'EFFECTIVE_OUTLIER')
            .map((item) => (item.ratio > 0 ? Math.max(item.ratio, 1 / item.ratio) : 0)),
        );
      return deviation(b) - deviation(a);
    });

  return (
    <div className="audit-operational-summary">
      <div className="audit-intro">
        <div>
          <span className="audit-eyebrow">CONTROL DE TARIFAS · PREFACTURA</span>
          <h2>¿Qué cobros tenemos que revisar?</h2>
          <p>
            Empezamos por las tarifas más llamativas. Cada caso indica de dónde salió, con qué se comparó y qué debemos comprobar.
            Una alerta no significa que exista un cobro incorrecto.
          </p>
        </div>
        <button type="button" className="button secondary" onClick={onViewRates}>
          Comparar tarifas por período
        </button>
      </div>
      <div className="metric-grid audit-metrics audit-brief-metrics">
        <Metric
          label="Extremos prioritarios"
          value={audit.summary.priority}
          note="Tarifas muy distintas · abrir casos"
          tone="warning"
          onClick={() => onShowCategory('EXTREME')}
        />
        <Metric
          label="Otros registros con señales"
          value={audit.summary.observed - audit.summary.priority}
          note="No necesariamente son errores de cobro"
          onClick={() => onShowCategory('observed')}
        />
        <Metric
          label="Repeticiones documentales"
          value={audit.summary.repeated}
          note="Posibles coincidencias por comprobar"
          onClick={() => onShowCategory('repeated')}
        />
        <Metric
          label="Presentación SIAGRI"
          value={audit.summary.presentation}
          note="La tarifa mostrada no reproduce el total"
          onClick={() => onShowCategory('PRESENTATION')}
        />
      </div>
      <Panel
        title="Revisar primero"
        subtitle={`${urgent.length} registros con tarifas muy diferentes frente a su propio servicio y período. Abre el caso para conocer el origen.`}
      >
        <div className="audit-queue-table">
          <DataTable
            rows={urgent}
            rowKey={(row) => row.auditId}
            pageSize={8}
            onRowClick={onOpenLine}
            columns={[
              {
                key: 'producerName',
                label: 'Productor',
                render: (row) => row.producerName || row.producer || 'Sin dato',
              },
              {
                key: 'hacienda',
                label: 'Hacienda / Suerte',
                render: (row) => `${row.hacienda || 'Sin dato'} · ${row.suerte || 'Sin dato'}`,
              },
              {
                key: 'service',
                label: 'Labor / servicio',
                render: (row) => `${row.labor} · ${row.service}`,
              },
              { key: 'period', label: 'Semana' },
              {
                key: 'tariff',
                label: 'Tarifa mostrada',
                num: true,
                render: (row) => rate(row.tariff),
              },
              {
                key: 'reference',
                label: 'Referencia observada',
                num: true,
                value: (row) => populations.get(row.populationKey)?.reported?.median,
                render: (row) => rate(populations.get(row.populationKey)?.reported?.median),
              },
              { key: 'reason', label: 'Motivo', render: (row) => caseType(row) },
              {
                key: 'sourceRow',
                label: 'Revisar',
                render: () => <span className="audit-open-label">Abrir evidencia →</span>,
              },
            ]}
          />
        </div>
        <div className="audit-queue-cards">
          {urgent.slice(0, 8).map((row) => (
            <CaseCard key={row.auditId} row={row} population={populations.get(row.populationKey)} onOpen={onOpenLine} />
          ))}
        </div>
        <div className="audit-queue-footer">
          <span>No es una lista de errores confirmados. Falta contrastar condiciones y tarifa autorizada.</span>
          <button type="button" className="button secondary" onClick={() => onShowCategory('EXTREME')}>
            Ver los {urgent.length} casos
          </button>
        </div>
      </Panel>
      <div className="audit-operational-bottom">
        <button type="button" className="audit-bottom-action" onClick={() => onOpenGroup(audit.rows, 'Prefactura completa')}>
          <span>Importe informado por SIAGRI</span>
          <strong>{money(audit.summary.total)}</strong>
          <small>{audit.summary.lines.toLocaleString('es-NI')} registros originales · ver desglose</small>
        </button>
        <button type="button" className="audit-bottom-action" onClick={() => onShowCategory('insufficient')}>
          <span>Información insuficiente para comparar</span>
          <strong>{audit.summary.insufficient} registros</strong>
          <small>Revisar cantidad, servicio o tamaño de la muestra</small>
        </button>
      </div>
      <p className="audit-legal-note">
        El valor de una tarifa observada no es una tarifa aprobada. Sin el tarifario CASUR no se puede calcular cuánto debió
        cobrarse ni declarar una diferencia económica confirmada.
      </p>
    </div>
  );
}
