// Solo presentación de resultados del motor; no recalibra referencias ni genera dictámenes.
export const reviewReasons = (row) => {
  const rules = new Set(row.observations.map((item) => item.rule));
  return [
    [['EXTREME', 'REPORTED_OUTLIER', 'EFFECTIVE_OUTLIER', 'NON_POSITIVE'].some((rule) => rules.has(rule)), 'Tarifa inusual'],
    [rules.has('PRESENTATION'), 'Diferencia de presentación SIAGRI'],
    [['EXACT_REPEAT', 'CROSS_INVOICE', 'DIFFERENT_RATE'].some((rule) => rules.has(rule)), 'Posible repetición'],
    [rules.has('INPUT') || !row.referenceSufficient, 'Falta información'],
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
  if (reasons.includes('Posible repetición')) comparisons.push('Hay coincidencias documentales; no confirman un doble cobro.');
  if (row.observations.some((item) => item.rule === 'NON_POSITIVE'))
    comparisons.push('Hay un cero o negativo: podría ser ajuste, crédito o dato ausente normalizado.');
  if (reasons.includes('Falta información'))
    comparisons.push('Faltan datos o una muestra comparable suficiente; no es posible certificar la tarifa.');
  return {
    found: reasons.join(' · ') || 'Sin señal detectada; no certifica la tarifa',
    why:
      comparisons.join(' ') || 'No se detectó una señal con esta configuración; la tarifa autorizada sigue sin estar disponible.',
    actions: [
      'Comprobar tarifa de origen, vigencia, unidad de medida y condiciones/jornada con el responsable.',
      ...(reasons.includes('Diferencia de presentación SIAGRI')
        ? ['Solicitar el desglose de cantidades e importes consolidados; no reclamar una diferencia solo por la multiplicación.']
        : []),
      ...(reasons.includes('Posible repetición')
        ? ['Contrastar ejecución, P.FACT, anulaciones o reemisiones en los registros coincidentes.']
        : []),
      ...(reasons.includes('Falta información')
        ? ['Completar los datos faltantes o aportar respaldo comparable antes de concluir.']
        : []),
    ],
  };
}
