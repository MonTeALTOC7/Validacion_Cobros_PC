// Motor de conciliación Nómina → Prefactura.
//
// - DIRECT: servicios manuales; Nómina (base) contra Prefactura CS9999 por
//   año operativo/semana/hacienda/suerte/labor/servicio/UM.
// - TPS: paquete de siembra SIE_INV contra las etapas de siembra de Nómina. Cada fila de Nómina
//   respalda como máximo un paquete validado (se consume en orden cronológico).
// - Excepciones: TPS externo, AAM, CS2661 y CAP/Vuelos Verdes; otros contratistas quedan
//   "Fuera de alcance" (visibles, no se descartan en silencio).
// - Servicios sin regla y etapas de siembra sin paquete se muestran como hallazgos informativos.
//
// Banderas (no cambian el estado de cobro): duplicado potencial / repetición respaldada,
// lote no encontrado en el Maestro, tarifa poco frecuente, fecha fuera de su semana oficial.
import {
  CASUR_CONTRACTOR,
  DEFAULT_PARAMETERS,
  DIRECT_SERVICES,
  MECHANIZED_SERVICES,
  TPS_BILLED_SERVICE,
  TPS_CONFIRMED_EXCEPTIONS,
  TPS_CUT_SERVICES,
  TPS_RYA_SERVICES,
  TPS_STAGE_SERVICES,
  TPS_UNLOAD_SERVICES,
} from './constants';
import { groupBy, hashId, lotKey, normalizeText, round, sumBy, withinTolerance } from './normalize';
import {
  buildOfficialCalendar,
  comparePeriods,
  createWeekIndex,
  isInPeriodRange,
  periodKey,
  resolveStartPeriod,
} from './periods';
import { buildTariffProfile, distinctTariffs, isAtypicalTariff } from './tariffs';
import { classifyRepetitions, exactExtraCopies } from './repetitions';

export const FLAG_LABELS = {
  DUPLICADO_POTENCIAL: 'Duplicado potencial',
  REPETICION_RESPALDADA: 'Repetición respaldada',
  COBRO_EN_OTRA_PREFACTURA: 'Mismo cobro en otra prefactura',
  MISMA_CANTIDAD_TARIFA_DISTINTA: 'Misma cantidad, tarifas distintas',
  LOTE_NO_ENCONTRADO: 'Lote no encontrado',
  TARIFA_POCO_FRECUENTE: 'Tarifa poco frecuente',
  FECHA_FUERA_DE_SEMANA: 'Fecha fuera de su semana',
};

export const toleranceForUnit = (unit, parameters) =>
  ({ 'D-H': parameters.toleranceDH, HA: parameters.toleranceHA, MJO: parameters.toleranceMJO, PAQ: parameters.tolerancePAQ })[
    unit
  ] ?? 0.01;

/** Clave de conciliación directa (incluye año operativo para no mezclar zafras). */
export const directKey = (row) => [row.year, row.week, row.hacienda, row.suerte, row.labor, row.service, row.unit].join('|');

/**
 * Búsqueda en el Maestro: exacta por hacienda+suerte; si no existe, primera suerte de la hacienda
 * (FALLBACK_HACIENDA); si tampoco, MISSING. Ante claves repetidas (p. ej. hojas Productores y REPORTE)
 * se prefiere la fila de ámbito productores, igual que en Seguimiento.
 */
export const createMasterLookup = (master) => {
  const byLot = new Map();
  const byHacienda = new Map();
  master.forEach((row) => {
    const key = lotKey(row.hacienda, row.suerte);
    if (!byLot.has(key) || row.producerScope) byLot.set(key, row);
    const list = byHacienda.get(row.hacienda) ?? [];
    list.push(row);
    byHacienda.set(row.hacienda, list);
  });
  return (hacienda, suerte) => {
    const exact = byLot.get(lotKey(hacienda, suerte));
    if (exact) return { status: 'EXACT', row: exact };
    const fallback = byHacienda.get(normalizeText(hacienda))?.[0];
    return fallback ? { status: 'FALLBACK_HACIENDA', row: fallback } : { status: 'MISSING', row: undefined };
  };
};

export const directStatus = (payrollUnits, billedUnits, tolerance) => {
  if (withinTolerance(payrollUnits, billedUnits, tolerance)) return { status: 'CONCILIADO', severity: 'ok' };
  if (payrollUnits > 0 && billedUnits === 0) return { status: 'NOMINA_SIN_COBRO', severity: 'critical' };
  if (payrollUnits === 0 && billedUnits > 0) return { status: 'COBRO_SIN_NOMINA', severity: 'warning' };
  if (billedUnits < payrollUnits) return { status: 'COBRO_PARCIAL', severity: 'critical' };
  return { status: 'COBRO_EXCESO', severity: 'info' };
};

// ---------------------------------------------------------------------------------------------
// Repeticiones de Prefactura (ver repetitions.js)

/** Compatibilidad con v0.8 inicial: resumen de duplicados exactos (id → tamaño de grupo y copias extra). */
export const findDuplicateRows = (prefactura) => {
  const repetitions = classifyRepetitions(prefactura);
  const exact = repetitions.groups.filter((group) => group.kind === 'DUPLICADO_EXACTO');
  const groupSizeById = new Map();
  exact.forEach((group) => group.rows.forEach((row) => groupSizeById.set(row.id, group.rows.length)));
  return {
    groupSizeById,
    groupsCount: exact.length,
    extraRows: repetitions.summary.DUPLICADO_EXACTO.extraRows,
    extraAmount: repetitions.summary.DUPLICADO_EXACTO.extraAmount,
    repetitions,
  };
};

// ---------------------------------------------------------------------------------------------
// Contexto compartido por las reglas

const createContext = (inputs, parameters, prefactura, payroll) => {
  const lookupMaster = createMasterLookup(inputs.master);
  const calendar = buildOfficialCalendar(inputs.prefactura);
  const tariffProfile = buildTariffProfile(prefactura, parameters.atypicalTariffPct);
  const duplicates = findDuplicateRows(prefactura);
  const outsideWeek = (row) => {
    const range = calendar.get(periodKey(row.year, row.week));
    return !!range && (row.date < range.start || row.date > range.end);
  };
  const confirmedTps = new Set(parameters.tpsConfirmedExceptions ?? [...TPS_CONFIRMED_EXCEPTIONS]);
  return {
    lookupMaster,
    calendar,
    tariffProfile,
    duplicates,
    outsideWeek,
    confirmedTps,
    weekIndex: createWeekIndex([...payroll, ...prefactura]),
  };
};

/** Campos comunes añadidos a cada hallazgo (al final, para conservar el orden de los campos v0.7). */
const traceFields = (sample, payrollRows, billedRows, context) => {
  const flags = [];
  const duplicateRows = exactExtraCopies(billedRows, context.duplicates.repetitions);
  const kinds = new Set(billedRows.flatMap((row) => context.duplicates.repetitions.byId.get(row.id) ?? []));
  if (kinds.has('COBRO_EN_OTRA_PREFACTURA')) flags.push('COBRO_EN_OTRA_PREFACTURA');
  if (kinds.has('MISMA_CANTIDAD_TARIFA_DISTINTA')) flags.push('MISMA_CANTIDAD_TARIFA_DISTINTA');
  if (billedRows.some((row) => isAtypicalTariff(context.tariffProfile, row))) flags.push('TARIFA_POCO_FRECUENTE');
  if ([...payrollRows, ...billedRows].some(context.outsideWeek)) flags.push('FECHA_FUERA_DE_SEMANA');
  return {
    year: sample.year,
    period: periodKey(sample.year, sample.week),
    tariffs: distinctTariffs(billedRows),
    duplicateRows,
    flags,
  };
};

const applyMasterAndDuplicateFlags = (finding, masterStatus, parameters) => {
  const flags = [...finding.flags];
  let { status, severity, explanation } = finding;
  if (masterStatus === 'MISSING') flags.push('LOTE_NO_ENCONTRADO');
  if (masterStatus === 'FALLBACK_HACIENDA' && !parameters.includeHistoricalInactive) {
    flags.push('LOTE_NO_ENCONTRADO');
    if (severity === 'ok' || severity === 'info') severity = 'warning';
    explanation +=
      ' La suerte no está en el Maestro vigente y el parámetro de suertes históricas está desactivado: revise el lote.';
  }
  if (finding.duplicateRows > 0) {
    flags.unshift(status === 'CONCILIADO' ? 'REPETICION_RESPALDADA' : 'DUPLICADO_POTENCIAL');
    explanation +=
      status === 'CONCILIADO'
        ? ` Prefactura incluye ${finding.duplicateRows} fila(s) idéntica(s), pero la Nómina respalda la misma cantidad.`
        : ` Prefactura incluye ${finding.duplicateRows} fila(s) idéntica(s) (mismo P.FACT, fecha, unidades y tarifa): posible doble registro.`;
  }
  if (flags.includes('COBRO_EN_OTRA_PREFACTURA')) {
    explanation +=
      ' Una fila de Prefactura tiene un cobro idéntico (fecha, lote, servicio, cantidad, tarifa y total) en otro P.FACT: verifique si se facturó dos veces.';
  }
  if (flags.includes('MISMA_CANTIDAD_TARIFA_DISTINTA')) {
    explanation +=
      ' En el mismo P.FACT hay líneas con la misma cantidad y tarifas distintas: verifique si corresponden a tarifas distintas legítimas (p. ej. normal y doble) o a un doble cobro.';
  }
  return { ...finding, status, severity, explanation, flags: [...new Set(flags)] };
};

// ---------------------------------------------------------------------------------------------
// Conciliación directa

export const reconcileDirect = (payroll, prefactura, parameters, context) => {
  const payrollGroups = groupBy(
    payroll.filter((row) => DIRECT_SERVICES.has(row.service)),
    directKey,
  );
  const billedGroups = groupBy(
    prefactura.filter((row) => row.contractorCode === CASUR_CONTRACTOR && DIRECT_SERVICES.has(row.service)),
    directKey,
  );
  return Array.from(new Set([...payrollGroups.keys(), ...billedGroups.keys()])).map((key) => {
    const payrollRows = payrollGroups.get(key) ?? [];
    const billedRows = billedGroups.get(key) ?? [];
    const sample = payrollRows[0] ?? billedRows[0];
    const payrollUnits = round(sumBy(payrollRows, (row) => row.units));
    const billedUnits = round(sumBy(billedRows, (row) => row.units));
    const base = directStatus(payrollUnits, billedUnits, toleranceForUnit(sample.unit, parameters));
    const master = context.lookupMaster(sample.hacienda, sample.suerte);
    let status = base.status;
    let severity = base.severity;
    let explanation = `Nómina ${payrollUnits} ${sample.unit}; Prefactura ${billedUnits} ${sample.unit}.`;
    if (master.status === 'FALLBACK_HACIENDA' && status === 'CONCILIADO' && parameters.includeHistoricalInactive) {
      status = 'SUERTE_HISTORICA_DADA_DE_BAJA';
      severity = 'info';
      explanation += ' La suerte no está en el Maestro vigente; se validó por Hacienda como registro histórico.';
    } else if (master.status === 'MISSING') {
      explanation += ' La Hacienda/Suerte no aparece en el Maestro vigente.';
    }
    if (billedRows.some((row) => !row.pFact.trim())) {
      status = 'PREFACTURA_SIN_NUMERO';
      severity = 'critical';
      explanation += ' Hay filas sin número P.FACT: no acreditan prefactura emitida y bloquean el cierre.';
    }
    const finding = {
      id: hashId('direct', key),
      type: 'DIRECT',
      status,
      severity,
      week: sample.week,
      date: sample.date,
      haciendaCode: sample.haciendaCode,
      hacienda: sample.hacienda,
      suerte: sample.suerte,
      labor: sample.labor,
      service: sample.service,
      unit: sample.unit,
      payrollUnits,
      billedUnits,
      difference: round(billedUnits - payrollUnits),
      tariff: billedRows[0]?.tariff ?? 0,
      amount: round(
        sumBy(billedRows, (row) => row.total),
        2,
      ),
      pFacts: [...new Set(billedRows.map((row) => row.pFact))],
      contractor: billedRows[0]?.contractorCode ?? CASUR_CONTRACTOR,
      explanation,
      masterStatus: master.status,
      payrollRowIds: payrollRows.map((row) => row.id),
      prefacturaRowIds: billedRows.map((row) => row.id),
      ...traceFields(sample, payrollRows, billedRows, context),
    };
    return applyMasterAndDuplicateFlags(finding, master.status, parameters);
  });
};

// ---------------------------------------------------------------------------------------------
// Paquetes TPS

const tpsVerdict = ({ ryaMatches, otherStageMatches, confirmedByBusiness }) => {
  if (ryaMatches && otherStageMatches) {
    return {
      status: 'PAQUETE_TPS_VALIDADO_RYA_CORROBORADO',
      severity: 'ok',
      explanation: 'La cantidad TPS coincide con RYA y al menos otra etapa de siembra.',
    };
  }
  if (ryaMatches) {
    return {
      status: 'PAQUETE_TPS_VALIDADO_RYA',
      severity: 'info',
      explanation: 'La cantidad TPS coincide con RYA; corte o descargue están incompletos.',
    };
  }
  if (otherStageMatches) {
    return {
      status: 'PAQUETE_TPS_VALIDADO_UNA_ETAPA_CON_ADVERTENCIA',
      severity: 'warning',
      explanation: 'Una etapa de siembra coincide, pero RYA está ausente o incompleta.',
    };
  }
  if (confirmedByBusiness) {
    return {
      status: 'TPS_COBRADO_CON_DIFERENCIA_NOMINA',
      severity: 'warning',
      explanation: 'Siembra y cobro confirmados por negocio; la evidencia RYA de Nómina está incompleta.',
    };
  }
  return {
    status: 'PAQUETE_TPS_REQUIERE_REVISION',
    severity: 'warning',
    explanation: 'Ninguna etapa de cantidad coincide con los PAQ cobrados.',
  };
};

export const reconcileTps = (payroll, prefactura, parameters, context) => {
  const billedPackages = prefactura.filter(
    (row) => row.contractorCode === CASUR_CONTRACTOR && row.labor === 'TPS' && row.service === TPS_BILLED_SERVICE,
  );
  const chronological = [...billedPackages].sort(
    (a, b) =>
      context.weekIndex(a.year, a.week) - context.weekIndex(b.year, b.week) ||
      a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id),
  );
  const stageRowsByLot = groupBy(
    payroll.filter((row) => TPS_STAGE_SERVICES.has(row.service)),
    (row) => `${row.hacienda}|${row.suerte}`,
  );
  const consumed = new Set();
  const results = new Map();
  for (const billed of chronological) {
    const billedIndex = context.weekIndex(billed.year, billed.week);
    const stageRows = (stageRowsByLot.get(`${billed.hacienda}|${billed.suerte}`) ?? []).filter((row) => {
      if (consumed.has(row.id)) return false;
      const index = context.weekIndex(row.year, row.week);
      return index >= billedIndex - parameters.tpsWeeksBefore && index <= billedIndex + parameters.tpsWeeksAfter;
    });
    const stageUnits = (services) =>
      round(
        sumBy(
          stageRows.filter((row) => services.has(row.service)),
          (row) => row.units,
        ),
      );
    const stageRya = stageUnits(TPS_RYA_SERVICES);
    const stageCut = stageUnits(TPS_CUT_SERVICES);
    const stageUnload = stageUnits(TPS_UNLOAD_SERVICES);
    const tolerance = parameters.tolerancePAQ;
    const ryaMatches = withinTolerance(stageRya, billed.units, tolerance);
    const otherStageMatches =
      withinTolerance(stageCut, billed.units, tolerance) || withinTolerance(stageUnload, billed.units, tolerance);
    const verdict = tpsVerdict({
      ryaMatches,
      otherStageMatches,
      confirmedByBusiness: context.confirmedTps.has(`${billed.pFact}|${billed.hacienda}|${billed.suerte}`),
    });
    if (ryaMatches || otherStageMatches) stageRows.forEach((row) => consumed.add(row.id));
    let explanation = verdict.explanation;
    const weeks = [...new Set(stageRows.map((row) => row.week))];
    if (
      (verdict.status === 'PAQUETE_TPS_VALIDADO_RYA' || verdict.status === 'PAQUETE_TPS_VALIDADO_RYA_CORROBORADO') &&
      weeks.some((week) => week !== billed.week)
    ) {
      explanation += ` Ciclo observado en semana(s) ${weeks.join(', ')}.`;
    }
    const master = context.lookupMaster(billed.hacienda, billed.suerte);
    const finding = {
      id: hashId('tps', billed.id),
      type: 'TPS',
      status: verdict.status,
      severity: verdict.severity,
      week: billed.week,
      date: billed.date,
      haciendaCode: billed.haciendaCode,
      hacienda: billed.hacienda,
      suerte: billed.suerte,
      labor: billed.labor,
      service: billed.service,
      unit: billed.unit,
      payrollUnits: stageRya,
      billedUnits: billed.units,
      difference: round(billed.units - stageRya),
      tariff: billed.tariff,
      amount: billed.total,
      pFacts: [billed.pFact],
      contractor: billed.contractorCode,
      explanation,
      masterStatus: master.status,
      payrollRowIds: stageRows.map((row) => row.id),
      prefacturaRowIds: [billed.id],
      stageCut,
      stageUnload,
      stageRya,
      userConfirmed: verdict.status === 'TPS_COBRADO_CON_DIFERENCIA_NOMINA',
      ...traceFields(billed, stageRows, [billed], context),
    };
    results.set(billed.id, applyMasterAndDuplicateFlags(finding, master.status, parameters));
  }
  return billedPackages.map((row) => results.get(row.id));
};

/** RYA de Nómina no usada por ningún TPS cobrado: pendiente de cobro. */
const pendingTpsFromPayroll = (payroll, usedPayrollIds, parameters, context) => {
  const findings = [];
  groupBy(
    payroll.filter((row) => TPS_RYA_SERVICES.has(row.service) && !usedPayrollIds.has(row.id)),
    directKey,
  ).forEach((rows, key) => {
    const sample = rows[0];
    const units = round(sumBy(rows, (row) => row.units));
    if (units <= 0) return;
    const master = context.lookupMaster(sample.hacienda, sample.suerte);
    const finding = {
      id: hashId('tps-pending', key),
      type: 'TPS',
      status: 'NOMINA_SIN_COBRO',
      severity: 'critical',
      week: sample.week,
      date: sample.date,
      haciendaCode: sample.haciendaCode,
      hacienda: sample.hacienda,
      suerte: sample.suerte,
      labor: sample.labor,
      service: sample.service,
      unit: sample.unit,
      payrollUnits: units,
      billedUnits: 0,
      difference: -units,
      tariff: 0,
      amount: 0,
      pFacts: [],
      contractor: CASUR_CONTRACTOR,
      explanation: 'RYA de Nómina sin TPS asociado en la ventana configurada. Revisar cobro pendiente o desfase.',
      masterStatus: master.status,
      payrollRowIds: rows.map((row) => row.id),
      prefacturaRowIds: [],
      stageRya: units,
      ...traceFields(sample, rows, [], context),
    };
    findings.push(applyMasterAndDuplicateFlags(finding, master.status, parameters));
  });
  return findings;
};

/** Etapas de siembra (corte, descargue y otras) que no quedaron asociadas a ningún paquete TPS. */
const unpackagedStages = (payroll, usedPayrollIds, parameters, context) => {
  const findings = [];
  groupBy(
    payroll.filter(
      (row) => TPS_STAGE_SERVICES.has(row.service) && !TPS_RYA_SERVICES.has(row.service) && !usedPayrollIds.has(row.id),
    ),
    directKey,
  ).forEach((rows, key) => {
    const sample = rows[0];
    const units = round(sumBy(rows, (row) => row.units));
    const master = context.lookupMaster(sample.hacienda, sample.suerte);
    const finding = {
      id: hashId('tps-stage', key),
      type: 'TPS_STAGE',
      status: 'ETAPA_TPS_SIN_PAQUETE',
      severity: 'info',
      week: sample.week,
      date: sample.date,
      haciendaCode: sample.haciendaCode,
      hacienda: sample.hacienda,
      suerte: sample.suerte,
      labor: sample.labor,
      service: sample.service,
      unit: sample.unit,
      payrollUnits: units,
      billedUnits: 0,
      difference: -units,
      tariff: 0,
      amount: 0,
      pFacts: [],
      contractor: CASUR_CONTRACTOR,
      explanation:
        'Etapa de siembra registrada en Nómina sin paquete TPS en la ventana configurada. Se cobra dentro del paquete TPS, no por separado: revise si el paquete está pendiente.',
      masterStatus: master.status,
      payrollRowIds: rows.map((row) => row.id),
      prefacturaRowIds: [],
      ...traceFields(sample, rows, [], context),
    };
    findings.push(applyMasterAndDuplicateFlags(finding, master.status, parameters));
  });
  return findings;
};

// ---------------------------------------------------------------------------------------------
// Excepciones, fuera de alcance y servicios sin regla

const exceptionRule = (row) => {
  if (row.contractorCode === 'CS3625' && row.labor === 'TPS' && row.service === 'SSCONTRA') {
    return {
      status: 'TPS_EXTERNO_VALIDO',
      type: 'EXTERNAL_TPS',
      severity: 'ok',
      explanation: 'Siembra contratada externamente; no se espera Nómina CASUR.',
    };
  }
  if (row.labor === 'AAM') {
    return {
      status: 'EXCLUIDO_AAM',
      type: 'EXCLUDED',
      severity: 'info',
      explanation: 'Aplicación aérea AAM excluida del cobro a productores.',
    };
  }
  if (row.contractorCode === 'CS2661') {
    return {
      status: 'SEPARADO_CS2661',
      type: 'EXCLUDED',
      severity: 'info',
      explanation: 'Contratista CS2661 reportado en universo separado.',
    };
  }
  if (row.contractorCode === 'CS3317' && row.labor === 'CAP') {
    return {
      status: 'EXCEPCION_CAP_VALIDADA',
      type: 'EXCEPTION',
      severity: 'ok',
      explanation: 'Excepción CAP/Vuelos Verdes aceptada.',
    };
  }
  if (row.contractorCode !== CASUR_CONTRACTOR) {
    return {
      status: 'FUERA_DE_ALCANCE',
      type: 'EXCLUDED',
      severity: 'warning',
      explanation: `Contratista ${row.contractorCode || row.contractor || 'sin código'} sin regla de conciliación: no se concilia contra Nómina. Verifique si corresponde.`,
    };
  }
  return null;
};

const billedFinding = (row, rule, context, parameters) => {
  const master = context.lookupMaster(row.hacienda, row.suerte);
  const finding = {
    id: hashId('exception', row.id),
    type: rule.type,
    status: rule.status,
    severity: rule.severity,
    week: row.week,
    date: row.date,
    haciendaCode: row.haciendaCode,
    hacienda: row.hacienda,
    suerte: row.suerte,
    labor: row.labor,
    service: row.service,
    unit: row.unit,
    payrollUnits: 0,
    billedUnits: row.units,
    difference: row.units,
    tariff: row.tariff,
    amount: row.total,
    pFacts: [row.pFact],
    contractor: row.contractorCode,
    explanation: rule.explanation,
    masterStatus: master.status,
    payrollRowIds: [],
    prefacturaRowIds: [row.id],
    ...traceFields(row, [], [row], context),
  };
  return applyMasterAndDuplicateFlags(finding, master.status, parameters);
};

export const classifyExceptions = (prefactura, context, parameters) =>
  prefactura.flatMap((row) => {
    const rule = exceptionRule(row);
    return rule ? [billedFinding(row, rule, context, parameters)] : [];
  });

const KNOWN_BILLED_SERVICES = new Set([...DIRECT_SERVICES, ...TPS_STAGE_SERVICES, ...MECHANIZED_SERVICES, TPS_BILLED_SERVICE]);

/** Servicios de Nómina o de Prefactura CS9999 sin regla de conciliación (antes se omitían sin aviso). */
const unclassifiedServices = (payroll, prefactura, parameters, context) => {
  const findings = [];
  const payrollRows = payroll.filter((row) => !DIRECT_SERVICES.has(row.service) && !TPS_STAGE_SERVICES.has(row.service));
  const billedRows = prefactura.filter(
    (row) =>
      row.contractorCode === CASUR_CONTRACTOR &&
      !KNOWN_BILLED_SERVICES.has(row.service) &&
      !exceptionRule(row) &&
      row.labor !== 'TPS',
  );
  const payrollGroups = groupBy(payrollRows, directKey);
  const billedGroups = groupBy(billedRows, directKey);
  for (const key of new Set([...payrollGroups.keys(), ...billedGroups.keys()])) {
    const pRows = payrollGroups.get(key) ?? [];
    const bRows = billedGroups.get(key) ?? [];
    const sample = pRows[0] ?? bRows[0];
    const payrollUnits = round(sumBy(pRows, (row) => row.units));
    const billedUnits = round(sumBy(bRows, (row) => row.units));
    const master = context.lookupMaster(sample.hacienda, sample.suerte);
    const finding = {
      id: hashId('unclassified', key),
      type: 'UNCLASSIFIED',
      status: 'SERVICIO_SIN_CLASIFICAR',
      severity: 'warning',
      week: sample.week,
      date: sample.date,
      haciendaCode: sample.haciendaCode,
      hacienda: sample.hacienda,
      suerte: sample.suerte,
      labor: sample.labor,
      service: sample.service,
      unit: sample.unit,
      payrollUnits,
      billedUnits,
      difference: round(billedUnits - payrollUnits),
      tariff: bRows[0]?.tariff ?? 0,
      amount: round(
        sumBy(bRows, (row) => row.total),
        2,
      ),
      pFacts: [...new Set(bRows.map((row) => row.pFact))],
      contractor: CASUR_CONTRACTOR,
      explanation: `Servicio ${sample.service} sin regla de conciliación (${pRows.length ? 'Nómina' : 'Prefactura'}): sus cantidades se muestran pero no se validan. Confirme si debe incorporarse a la lista de servicios conciliables.`,
      masterStatus: master.status,
      payrollRowIds: pRows.map((row) => row.id),
      prefacturaRowIds: bRows.map((row) => row.id),
      ...traceFields(sample, pRows, bRows, context),
    };
    findings.push(applyMasterAndDuplicateFlags(finding, master.status, parameters));
  }
  return findings;
};

// ---------------------------------------------------------------------------------------------
// Ejecución completa

/** Filas dentro del período y ámbito configurados (compartido por Conciliación y Financiero). */
export const scopeInputs = (inputs, parameters) => {
  const params = { ...DEFAULT_PARAMETERS, ...parameters };
  const startPeriod = resolveStartPeriod([...inputs.payroll, ...inputs.prefactura], params.startDate);
  const inRange = (row) => isInPeriodRange(row, startPeriod);
  const prefactura = inputs.prefactura.filter(inRange);
  const lookupMaster = createMasterLookup(inputs.master);
  const billedLots = new Set(prefactura.map((row) => lotKey(row.hacienda, row.suerte)));
  const payroll = inputs.payroll.filter((row) => {
    if (!inRange(row)) return false;
    if (params.scope === 'BOTH') return true;
    const isProducer =
      !!lookupMaster(row.hacienda, row.suerte).row?.producerScope || billedLots.has(lotKey(row.hacienda, row.suerte));
    return params.scope === 'PRODUCERS' ? isProducer : !isProducer;
  });
  return { params, startPeriod, payroll, prefactura };
};

export const runReconciliation = (inputs, parameters) => {
  const { params, startPeriod, payroll, prefactura } = scopeInputs(inputs, parameters);
  const context = createContext(inputs, params, prefactura, payroll);
  const direct = reconcileDirect(payroll, prefactura, params, context);
  const tps = reconcileTps(payroll, prefactura, params, context);
  const usedPayrollIds = new Set(tps.flatMap((finding) => finding.payrollRowIds));
  const pendingTps = pendingTpsFromPayroll(payroll, usedPayrollIds, params, context);
  const stages = unpackagedStages(payroll, usedPayrollIds, params, context);
  const exceptions = classifyExceptions(prefactura, context, params);
  const unclassified = unclassifiedServices(payroll, prefactura, params, context);
  const unknownServices = [
    ...new Set(
      prefactura
        .filter((row) => row.contractorCode === CASUR_CONTRACTOR && !KNOWN_BILLED_SERVICES.has(row.service))
        .map((row) => row.service),
    ),
  ].sort();
  const allRows = [...payroll, ...prefactura];
  const weeks = allRows.map((row) => row.week).filter(Boolean);
  const periods = [...new Set(allRows.filter((row) => row.year != null).map((row) => periodKey(row.year, row.week)))].sort(
    comparePeriods,
  );
  const findings = [...direct, ...tps, ...pendingTps, ...stages, ...exceptions, ...unclassified].sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0) || b.week - a.week || a.hacienda.localeCompare(b.hacienda),
  );
  return {
    generatedAt: new Date().toISOString(),
    findings,
    excludedRows: exceptions.filter((finding) => finding.type === 'EXCLUDED').length,
    mechanizedRows: prefactura.filter((row) => row.contractorCode === CASUR_CONTRACTOR && MECHANIZED_SERVICES.has(row.service))
      .length,
    unknownServices,
    duplicateGroups: context.duplicates.groupsCount,
    duplicateExtraRows: context.duplicates.extraRows,
    duplicateExtraAmount: context.duplicates.extraAmount,
    repetitions: context.duplicates.repetitions.summary,
    coverage: {
      payrollRows: payroll.length,
      prefacturaRows: prefactura.length,
      producerPayrollRows: payroll.length,
      startWeek: Math.min(...weeks),
      endWeek: Math.max(...weeks),
      startPeriod: periods[0] ?? '',
      endPeriod: periods.at(-1) ?? '',
      periods,
      multiYear: new Set(periods.map((period) => period.slice(0, 4))).size > 1,
    },
    startPeriod: startPeriod ? periodKey(startPeriod.year, startPeriod.week) : '',
    parameters: params,
    engineVersion: 2,
  };
};
