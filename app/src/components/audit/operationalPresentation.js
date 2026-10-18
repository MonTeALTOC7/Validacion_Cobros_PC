// Solo presentación de resultados del motor; no recalibra referencias ni genera dictámenes.
import { filterAuditRows } from '../../engine/audit/tariffAudit';

export const reviewReasons = (row) => {
  const rules = new Set(row.observations.map((item) => item.rule));
  return [
    [['EXTREME', 'REPORTED_OUTLIER', 'EFFECTIVE_OUTLIER', 'NON_POSITIVE'].some((rule) => rules.has(rule)), 'Tarifa inusual'],
    [rules.has('PRESENTATION'), 'Diferencia de presentación SIAGRI'],
    [['EXACT_REPEAT', 'CROSS_INVOICE'].some((rule) => rules.has(rule)), 'Posible repetición documental'],
    [rules.has('DIFFERENT_RATE'), 'Igual cantidad con tarifas diferentes'],
    [rules.has('INPUT'), 'Datos de origen incompletos'],
    [!row.referenceSufficient, 'Comparables insuficientes'],
  ]
    .filter(([active]) => active)
    .map(([, label]) => label);
};

export const reviewRows = (rows) =>
  [...new Map(rows.filter((row) => reviewReasons(row).length).map((row) => [row.auditId, row])).values()].sort(
    (a, b) =>
      Number(b.observations.some((item) => item.rule === 'EXTREME')) -
        Number(a.observations.some((item) => item.rule === 'EXTREME')) ||
      Number(b.observations.length > 0) - Number(a.observations.length > 0) ||
      (a.sourceRow ?? 0) - (b.sourceRow ?? 0),
  );

export const filterReviewRows = (rows, { search = '', reason = '' } = {}) =>
  filterAuditRows(reviewRows(rows), { search }).filter((row) => !reason || reviewReasons(row).includes(reason));

export const observedReference = (population, metric) => {
  const ref = population?.[metric];
  return ref?.sufficient && Number.isFinite(ref.median) ? ref.median : null;
};

export function trend(before, after, sufficient) {
  if (!sufficient || !Number.isFinite(before) || !Number.isFinite(after) || before <= 0) return 'Muestra insuficiente';
  // Igualdad a la precisión visible, no tolerancia contractual ni nueva regla del motor.
  if (before.toFixed(2) === after.toFixed(2)) return 'Se mantuvo a 2 decimales';
  return after > before ? 'Subió' : 'Bajó';
}

export function caseGuidance(row, population) {
  const reasons = reviewReasons(row);
  const comparisons = row.observations
    .filter((item) => ['REPORTED_OUTLIER', 'EFFECTIVE_OUTLIER'].includes(item.rule))
    .map((item) => {
      const label = item.metric === 'tariff' ? 'reportada' : 'efectiva';
      const ref = observedReference(population, item.metric === 'tariff' ? 'reported' : 'effective');
      return `La tarifa ${label} está ${ref != null && row[item.metric] < ref ? 'por debajo' : 'por encima'} del intervalo observado en su población comparable.`;
    });
  if (reasons.includes('Diferencia de presentación SIAGRI'))
    comparisons.push(
      'Tarifa × unidades no reproduce el total; puede ser un promedio SIAGRI. Esto no demuestra su causa ni valida el cobro.',
    );
  if (reasons.includes('Posible repetición documental'))
    comparisons.push('Hay coincidencias documentales; no confirman un doble cobro.');
  if (reasons.includes('Igual cantidad con tarifas diferentes'))
    comparisons.push(
      'Coinciden cantidades con tarifas distintas; pueden corresponder a condiciones o jornadas diferentes. La tarifa distinta no constituye por sí sola evidencia de cobro duplicado.',
    );
  if (row.observations.some((item) => item.rule === 'NON_POSITIVE'))
    comparisons.push('Hay un cero o negativo: podría ser ajuste, crédito o dato ausente normalizado.');
  if (reasons.includes('Datos de origen incompletos'))
    comparisons.push(
      'El motor detectó datos de origen faltantes o inválidos. Verificar los campos señalados en el documento original.',
    );
  if (reasons.includes('Comparables insuficientes'))
    comparisons.push(
      'No hay una referencia comparable suficiente según los criterios del motor; esto no implica por sí solo que el registro original esté incompleto.',
    );
  return {
    found: reasons.join(' · ') || 'Sin señal detectada; no certifica la tarifa',
    why:
      comparisons.join(' ') || 'No se detectó una señal con esta configuración; la tarifa autorizada sigue sin estar disponible.',
    actions: [
      'Comprobar tarifa de origen, vigencia, unidad de medida y condiciones/jornada con el responsable.',
      ...(reasons.includes('Diferencia de presentación SIAGRI')
        ? ['Solicitar el desglose de cantidades e importes consolidados; no reclamar una diferencia solo por la multiplicación.']
        : []),
      ...(reasons.includes('Posible repetición documental')
        ? ['Contrastar ejecución, P.FACT, anulaciones o reemisiones en los registros coincidentes.']
        : []),
      ...(reasons.includes('Igual cantidad con tarifas diferentes')
        ? [
            'Contrastar jornadas, condiciones y desglose de tarifas; no tratar la diferencia de tarifa como duplicación confirmada.',
          ]
        : []),
      ...(reasons.includes('Datos de origen incompletos')
        ? ['Completar o corregir el respaldo de los campos faltantes o inválidos en la fuente antes de concluir.']
        : []),
      ...(reasons.includes('Comparables insuficientes')
        ? [
            'Revisar cobertura, dimensiones y tamaño de la muestra; solicitar comparables válidos, sin completar datos originales por inferencia.',
          ]
        : []),
    ],
  };
}
