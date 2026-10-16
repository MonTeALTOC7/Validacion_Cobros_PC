// Ejecuta el motor sobre archivos Excel reales y muestra un resumen (uso en desarrollo/QA).
// npx vite-node tests/tools/run-engine.mjs -- <nomina.xlsx> <prefactura.xlsx> <maestro.xlsx>
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseMasterFile, parsePayrollFile, parsePrefacturaFile } from '../../src/engine/importers';
import { runReconciliation } from '../../src/engine/reconciliation';
import { DEFAULT_PARAMETERS } from '../../src/engine/constants';
import { coverageStats, isBlockingPending } from '../../src/engine/indicators';
import { assessDataQuality } from '../../src/engine/quality';
import { buildFinanceRows, financeSummary } from '../../src/engine/finance';
import { buildTrackingRows } from '../../src/engine/tracking';

const asFile = async (p) => new File([await readFile(p)], path.basename(p));
const [nominaPath, prefacturaPath, masterPath] = process.argv.slice(2).filter((a) => a !== '--');
const payroll = await parsePayrollFile(await asFile(nominaPath));
const prefactura = await parsePrefacturaFile(await asFile(prefacturaPath));
const master = await parseMasterFile(await asFile(masterPath));
const inputs = {
  payroll: payroll.rows,
  prefactura: prefactura.rows,
  master: master.rows,
  files: [payroll.file, prefactura.file, master.file],
};
const analysis = runReconciliation(inputs, DEFAULT_PARAMETERS);
const count = (list, f) => list.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const cov = coverageStats(analysis.findings);
const flags = {};
analysis.findings.forEach((f) => (f.flags ?? []).forEach((x) => (flags[x] = (flags[x] ?? 0) + 1)));
const fin = financeSummary(buildFinanceRows(inputs, DEFAULT_PARAMETERS.startDate));
console.log(
  JSON.stringify(
    {
      files: inputs.files.map((f) => ({
        kind: f.kind,
        rows: f.rows,
        skipped: f.skippedRows,
        reasons: f.skipReasons,
        years: f.years,
        sheet: f.sheet,
      })),
      startPeriod: analysis.startPeriod,
      coverage:
        analysis.coverage.payrollRows +
        ' nómina / ' +
        analysis.coverage.prefacturaRows +
        ' prefactura · ' +
        analysis.coverage.startPeriod +
        '→' +
        analysis.coverage.endPeriod,
      findings: analysis.findings.length,
      byType: count(analysis.findings, (f) => f.type),
      byStatus: count(analysis.findings, (f) => f.status),
      flags,
      coveragePct: cov.percent.toFixed(1) + ' % (' + cov.covered + '/' + cov.base + ')',
      pending: analysis.findings.filter(isBlockingPending).length,
      duplicates: [analysis.duplicateGroups, analysis.duplicateExtraRows, analysis.duplicateExtraAmount],
      quality: assessDataQuality(inputs, DEFAULT_PARAMETERS).map((i) => `${i.severity} · ${i.title} (${i.count})`),
      finance: {
        total: fin.overall.total,
        invoices: fin.overall.invoices,
        producers: fin.overall.producers,
        area: fin.overall.area,
        perHa: fin.overall.perHa,
        perHaWorked: fin.overall.perHaWorked,
        byClass: fin.byClass.map((g) => g.label + ': ' + g.total),
        top3: fin.byProducer.slice(0, 3).map((g) => g.label + ': ' + g.total),
      },
      trackingRows: buildTrackingRows(inputs, DEFAULT_PARAMETERS.startDate).length,
      trackingProducers: new Set(buildTrackingRows(inputs, DEFAULT_PARAMETERS.startDate).map((r) => r.producer)).size,
    },
    null,
    1,
  ),
);
