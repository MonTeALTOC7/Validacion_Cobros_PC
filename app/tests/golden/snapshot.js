// Cifras de referencia (golden) del motor sobre los datos publicados en datos/.
// Las calcula siempre el mismo código para la prueba (golden.test.js) y para la actualización (scripts/golden-update.mjs).
// Contiene cifras legibles para revisar en el diff y huellas SHA-256 que detectan cualquier otro cambio.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseMasterFile, parsePayrollFile, parsePrefacturaFile } from '../../src/engine/importers';
import { runReconciliation } from '../../src/engine/reconciliation';
import { DEFAULT_PARAMETERS } from '../../src/engine/constants';
import {
  collectionState,
  coverageStats,
  findingPeriod,
  isBlockingPending,
  pendingBreakdown,
  unitTotalsByState,
} from '../../src/engine/indicators';
import { buildFinanceRows, financeSummary, invoiceSummaries } from '../../src/engine/finance';
import { classifyRepetitions } from '../../src/engine/repetitions';
import { buildTrackingRows } from '../../src/engine/tracking';
import { buildPublishedTracking } from '../../src/engine/published';
import { assessDataQuality } from '../../src/engine/quality';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const r2 = (value) => Math.round(value * 100) / 100;
const countBy = (list, keyOf) =>
  Object.fromEntries(
    [...list.reduce((map, item) => map.set(keyOf(item), (map.get(keyOf(item)) ?? 0) + 1), new Map())].sort(([a], [b]) =>
      String(a).localeCompare(String(b)),
    ),
  );
const sumBy = (list, keyOf, valueOf) =>
  Object.fromEntries(
    [...list.reduce((map, item) => map.set(keyOf(item), (map.get(keyOf(item)) ?? 0) + valueOf(item)), new Map())]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([key, value]) => [key, r2(value)]),
  );
const digest = (rows) => sha256(JSON.stringify(rows));

/** Lee los archivos de datos/manifest.json con los importadores de la aplicación. */
export async function loadPublishedInputs(datosDir) {
  const manifest = JSON.parse(await readFile(path.join(datosDir, 'manifest.json'), 'utf8'));
  const entry = (kind) => manifest.files.find((file) => file.kind === kind);
  const read = async (kind) => {
    const { path: file, name } = entry(kind);
    const buffer = await readFile(path.join(datosDir, file));
    return { buffer, file: new File([buffer], name ?? file) };
  };
  const payroll = await read('payroll');
  const prefactura = await read('prefactura');
  const master = await read('master');
  const parsed = {
    payroll: await parsePayrollFile(payroll.file),
    prefactura: await parsePrefacturaFile(prefactura.file),
    master: await parseMasterFile(master.file),
  };
  return {
    manifestVersion: manifest.version,
    hashes: {
      [entry('payroll').path]: sha256(payroll.buffer),
      [entry('prefactura').path]: sha256(prefactura.buffer),
      [entry('master').path]: sha256(master.buffer),
    },
    parsed,
    inputs: {
      payroll: parsed.payroll.rows,
      prefactura: parsed.prefactura.rows,
      master: parsed.master.rows,
      files: [parsed.payroll.file, parsed.prefactura.file, parsed.master.file],
    },
  };
}

export async function buildGoldenSnapshot(datosDir) {
  const { manifestVersion, hashes, parsed, inputs } = await loadPublishedInputs(datosDir);
  const parameters = DEFAULT_PARAMETERS;
  const analysis = runReconciliation(inputs, parameters);
  const findings = analysis.findings;
  const payrollCases = findings.filter((f) => f.type === 'DIRECT' || f.type === 'TPS');
  const breakdown = pendingBreakdown(analysis);
  const financeRows = buildFinanceRows(inputs, parameters.startDate);
  const finance = financeSummary(financeRows);
  const repetitions = classifyRepetitions(inputs.prefactura).summary;
  const tracking = buildTrackingRows(inputs, parameters.startDate);
  const published = buildPublishedTracking(inputs, parameters.startDate, 'fijo');
  const quality = assessDataQuality(inputs, { atypicalTariffPct: parameters.atypicalTariffPct });
  const sortedIds = (ids) => [...(ids ?? [])].sort();

  return {
    datos: { manifest: manifestVersion, sha256: hashes },
    parametros: parameters,
    importacion: Object.fromEntries(
      Object.entries(parsed).map(([kind, result]) => [
        kind,
        { filas: result.rows.length, descartadas: result.file.skippedRows ?? 0, motivos: result.file.skipReasons ?? {} },
      ]),
    ),
    conciliacion: {
      motor: analysis.engineVersion,
      periodoInicial: analysis.startPeriod,
      hallazgos: findings.length,
      porTipo: countBy(findings, (f) => f.type),
      porEstado: countBy(findings, (f) => f.status),
      porBandera: countBy(
        findings.flatMap((f) => f.flags ?? []),
        (flag) => flag,
      ),
      porEstadoDeCobro: countBy(payrollCases, collectionState),
      cobertura: { ...coverageStats(payrollCases), percent: r2(coverageStats(payrollCases).percent) },
      pendientes: {
        casos: payrollCases.filter(isBlockingPending).length,
        enSemanasPrefacturadas: breakdown.inBilledWeeks,
        enSemanasSinPrefactura: breakdown.inUnbilledWeeks,
        sinCalendario: breakdown.unknown,
        ultimaSemanaPrefacturada: breakdown.lastBilledPeriod,
        porSemana: Object.fromEntries(breakdown.periods.map((entry) => [entry.period, entry.cases])),
        unidades: Object.fromEntries(unitTotalsByState(payrollCases, 'pending').map(([unit, value]) => [unit, r2(value)])),
      },
      excesoUnidades: Object.fromEntries(unitTotalsByState(payrollCases, 'excess').map(([unit, value]) => [unit, r2(value)])),
      porSemanaYEstado: Object.fromEntries(
        Object.entries(
          findings.reduce((map, f) => {
            const period = findingPeriod(f) ?? 'sin período';
            map[period] = map[period] ?? {};
            map[period][f.status] = (map[period][f.status] ?? 0) + 1;
            return map;
          }, {}),
        ).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    finanzas: {
      total: r2(finance.overall.total),
      lineas: finance.overall.rows,
      prefacturas: invoiceSummaries(financeRows).length,
      productores: finance.overall.producers,
      fincas: finance.overall.haciendas,
      porUniverso: sumBy(
        financeRows,
        (row) => row.universe,
        (row) => row.total,
      ),
      porTipoDeLabor: sumBy(
        financeRows,
        (row) => row.financeClass,
        (row) => row.total,
      ),
      porContratista: sumBy(
        financeRows,
        (row) => row.contractorCode || 'SIN CÓDIGO',
        (row) => row.total,
      ),
      areaSuertesHa: r2(finance.overall.area),
      prefacturadoPorHaDeSuerte: r2(finance.overall.perHa ?? 0),
      haTrabajadas: r2(finance.overall.haUnits),
    },
    repeticiones: Object.fromEntries(
      Object.entries(repetitions).map(([kind, entry]) => [
        kind,
        { ...entry, extraAmount: r2(entry.extraAmount), amount: r2(entry.amount) },
      ]),
    ),
    seguimiento: {
      filas: tracking.length,
      porOrigen: countBy(tracking, (row) => row.source),
      porClasificacion: countBy(tracking, (row) => row.classification),
      productores: new Set(tracking.map((row) => row.producer)).size,
      unidadesPorClasificacionYUM: sumBy(
        tracking,
        (row) => `${row.classification}|${row.unit}`,
        (row) => row.units,
      ),
      publicado: { filas: published.count, maxWeek: published.maxWeek, maxPeriod: published.maxPeriod },
    },
    calidad: Object.fromEntries(quality.map((issue) => [issue.id, { severidad: issue.severity, casos: issue.count }])),
    huellas: {
      hallazgos: digest(
        [...findings]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((f) => [
            f.id,
            f.type,
            f.status,
            f.severity,
            [...(f.flags ?? [])].sort(),
            r2(f.payrollUnits ?? 0),
            r2(f.billedUnits ?? 0),
            r2(f.amount ?? 0),
            sortedIds(f.payrollRowIds),
            sortedIds(f.prefacturaRowIds),
          ]),
      ),
      finanzas: digest(
        [...financeRows]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((row) => [row.id, r2(row.total), row.universe, row.financeClass, row.invoiceKey]),
      ),
      seguimiento: digest(
        [...tracking]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((row) => [row.id, r2(row.units), row.classification, row.period, row.producer, row.source]),
      ),
      publicado: digest(published.rows),
    },
  };
}
