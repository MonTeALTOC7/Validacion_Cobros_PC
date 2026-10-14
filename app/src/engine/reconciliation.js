// Motor de conciliación Nómina → Prefactura.
// - DIRECT: servicios manuales, Nómina (base) contra Prefactura CS9999 por semana/hacienda/suerte/labor/servicio/UM.
// - TPS: paquete de siembra SIE_INV contra las etapas de siembra registradas en Nómina.
// - Excepciones: TPS externo, AAM, CS2661 y CAP/Vuelos Verdes.
import {
  CASUR_CONTRACTOR,
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

export const toleranceForUnit = (unit, parameters) =>
  ({ 'D-H': parameters.toleranceDH, HA: parameters.toleranceHA, MJO: parameters.toleranceMJO, PAQ: parameters.tolerancePAQ })[unit] ??
  0.01;

export const directKey = (row) => [row.week, row.hacienda, row.suerte, row.labor, row.service, row.unit].join('|');

/**
 * Búsqueda en el Maestro: exacta por hacienda+suerte; si no existe, primera suerte de la hacienda
 * (FALLBACK_HACIENDA); si tampoco, MISSING.
 */
export const createMasterLookup = (master) => {
  const byLot = new Map();
  const byHacienda = new Map();
  master.forEach((row) => {
    byLot.set(lotKey(row.hacienda, row.suerte), row);
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

export const reconcileDirect = (payroll, prefactura, parameters, lookupMaster) => {
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
    const master = lookupMaster(sample.hacienda, sample.suerte);
    let status = base.status;
    let severity = base.severity;
    let explanation = `Nómina ${payrollUnits} ${sample.unit}; Prefactura ${billedUnits} ${sample.unit}.`;
    if (master.status === 'FALLBACK_HACIENDA' && status === 'CONCILIADO') {
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
    return {
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
    };
  });
};

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

export const reconcileTps = (payroll, prefactura, parameters, lookupMaster) =>
  prefactura
    .filter((row) => row.contractorCode === CASUR_CONTRACTOR && row.labor === 'TPS' && row.service === TPS_BILLED_SERVICE)
    .map((billed) => {
      const stageRows = payroll.filter(
        (row) =>
          row.hacienda === billed.hacienda &&
          row.suerte === billed.suerte &&
          TPS_STAGE_SERVICES.has(row.service) &&
          row.week >= billed.week - parameters.tpsWeeksBefore &&
          row.week <= billed.week + parameters.tpsWeeksAfter,
      );
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
      const verdict = tpsVerdict({
        ryaMatches: withinTolerance(stageRya, billed.units, tolerance),
        otherStageMatches: withinTolerance(stageCut, billed.units, tolerance) || withinTolerance(stageUnload, billed.units, tolerance),
        confirmedByBusiness: TPS_CONFIRMED_EXCEPTIONS.has(`${billed.pFact}|${billed.hacienda}|${billed.suerte}`),
      });
      let explanation = verdict.explanation;
      const weeks = [...new Set(stageRows.map((row) => row.week))];
      if (
        (verdict.status === 'PAQUETE_TPS_VALIDADO_RYA' || verdict.status === 'PAQUETE_TPS_VALIDADO_RYA_CORROBORADO') &&
        weeks.some((week) => week !== billed.week)
      ) {
        explanation += ` Ciclo observado en semana(s) ${weeks.join(', ')}.`;
      }
      return {
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
        masterStatus: lookupMaster(billed.hacienda, billed.suerte).status,
        payrollRowIds: stageRows.map((row) => row.id),
        prefacturaRowIds: [billed.id],
        stageCut,
        stageUnload,
        stageRya,
        userConfirmed: verdict.status === 'TPS_COBRADO_CON_DIFERENCIA_NOMINA',
      };
    });

/** RYA de Nómina no usada por ningún TPS cobrado: pendiente de cobro. */
const pendingTpsFromPayroll = (payroll, usedPayrollIds, lookupMaster) => {
  const findings = [];
  groupBy(
    payroll.filter((row) => TPS_RYA_SERVICES.has(row.service) && !usedPayrollIds.has(row.id)),
    directKey,
  ).forEach((rows, key) => {
    const sample = rows[0];
    const units = round(sumBy(rows, (row) => row.units));
    if (units <= 0) return;
    findings.push({
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
      masterStatus: lookupMaster(sample.hacienda, sample.suerte).status,
      payrollRowIds: rows.map((row) => row.id),
      prefacturaRowIds: [],
      stageRya: units,
    });
  });
  return findings;
};

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
    return { status: 'EXCLUIDO_AAM', type: 'EXCLUDED', severity: 'info', explanation: 'Aplicación aérea AAM excluida del cobro a productores.' };
  }
  if (row.contractorCode === 'CS2661') {
    return { status: 'SEPARADO_CS2661', type: 'EXCLUDED', severity: 'info', explanation: 'Contratista CS2661 reportado en universo separado.' };
  }
  if (row.contractorCode === 'CS3317' && row.labor === 'CAP') {
    return { status: 'EXCEPCION_CAP_VALIDADA', type: 'EXCEPTION', severity: 'ok', explanation: 'Excepción CAP/Vuelos Verdes aceptada.' };
  }
  return null;
};

export const classifyExceptions = (prefactura, lookupMaster) =>
  prefactura.flatMap((row) => {
    const rule = exceptionRule(row);
    if (!rule) return [];
    return [
      {
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
        masterStatus: lookupMaster(row.hacienda, row.suerte).status,
        payrollRowIds: [],
        prefacturaRowIds: [row.id],
      },
    ];
  });

/** Número de grupos de filas de Prefactura idénticas en semana, fecha, lote, servicio, unidades, tarifa, P.FACT y contratista. */
export const countDuplicateGroups = (prefactura) => {
  const counts = new Map();
  prefactura.forEach((row) => {
    const key = [
      row.week,
      row.date,
      row.hacienda,
      row.suerte,
      row.labor,
      row.service,
      row.units,
      row.unit,
      row.tariff,
      row.pFact,
      row.contractorCode,
    ].join('|');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.values()].filter((count) => count > 1).length;
};

export const runReconciliation = (inputs, parameters) => {
  const startDate = parameters.startDate;
  const prefactura = inputs.prefactura.filter((row) => row.date >= startDate);
  const lookupMaster = createMasterLookup(inputs.master);
  const billedLots = new Set(prefactura.map((row) => lotKey(row.hacienda, row.suerte)));
  const payroll = inputs.payroll.filter((row) => {
    if (row.date < startDate) return false;
    if (parameters.scope === 'BOTH') return true;
    const isProducer = !!lookupMaster(row.hacienda, row.suerte).row?.producerScope || billedLots.has(lotKey(row.hacienda, row.suerte));
    return parameters.scope === 'PRODUCERS' ? isProducer : !isProducer;
  });
  const direct = reconcileDirect(payroll, prefactura, parameters, lookupMaster);
  const tps = reconcileTps(payroll, prefactura, parameters, lookupMaster);
  const usedPayrollIds = new Set(tps.flatMap((finding) => finding.payrollRowIds));
  tps.push(...pendingTpsFromPayroll(payroll, usedPayrollIds, lookupMaster));
  const exceptions = classifyExceptions(prefactura, lookupMaster);
  const knownServices = new Set([...DIRECT_SERVICES, ...TPS_STAGE_SERVICES, ...MECHANIZED_SERVICES, TPS_BILLED_SERVICE]);
  const unknownServices = [
    ...new Set(prefactura.filter((row) => row.contractorCode === CASUR_CONTRACTOR && !knownServices.has(row.service)).map((row) => row.service)),
  ].sort();
  const weeks = [...payroll.map((row) => row.week), ...prefactura.map((row) => row.week)].filter(Boolean);
  const findings = [...direct, ...tps, ...exceptions].sort((a, b) => b.week - a.week || a.hacienda.localeCompare(b.hacienda));
  return {
    generatedAt: new Date().toISOString(),
    findings,
    excludedRows: exceptions.filter((finding) => finding.type === 'EXCLUDED').length,
    mechanizedRows: prefactura.filter((row) => row.contractorCode === CASUR_CONTRACTOR && MECHANIZED_SERVICES.has(row.service)).length,
    unknownServices,
    duplicateGroups: countDuplicateGroups(prefactura),
    coverage: {
      payrollRows: payroll.length,
      prefacturaRows: prefactura.length,
      producerPayrollRows: payroll.length,
      startWeek: Math.min(...weeks),
      endWeek: Math.max(...weeks),
    },
  };
};
