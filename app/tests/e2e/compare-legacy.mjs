// Compara el bundle legacy 8b3-1-1 contra el build nuevo (app/dist) con los mismos Excel.
// Uso: node tests/e2e/compare-legacy.mjs [--datos ../datos] [--out report.json] [--report-only]
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve, launch, openAndWait, readDb, tabTexts } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../..');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const datos = path.resolve(appDir, arg('--datos', '../datos'));
const outFile = arg('--out', null);
const reportOnly = process.argv.includes('--report-only');

const LEGACY_TABS = [
  'Resumen',
  'Conciliación',
  'Revisión por Correo',
  'Seguimiento de labores',
  'Paquetes TPS',
  'Auditoría y cierres',
  'Actualizar archivos',
  'Parámetros',
];

const VOLATILE = new Set(['generatedAt', 'importedAt', 'updatedAt', 'at', 'modified']);
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !VOLATILE.has(k))
        .map(([k, x]) => [k, strip(x)]),
    );
  }
  return v;
};
const cleanText = (s) =>
  (s ?? '')
    .replace(/Último análisis:[^\n]*/g, 'Último análisis: <fecha>')
    .replace(/\d{1,2}\/\d{1,2}\/\d{4},? \d{1,2}:\d{2}(:\d{2})?\s?[ap]\.\s?m\./g, '<fecha>');

async function capture(browser, url) {
  const { context, page, errors } = await openAndWait(browser, url);
  const db = await readDb(page);
  const texts = await tabTexts(page, LEGACY_TABS);
  await context.close();
  return { db, texts, errors };
}

function diffFindings(a = [], b = []) {
  const ma = new Map(a.map((f) => [f.id, f]));
  const mb = new Map(b.map((f) => [f.id, f]));
  const removed = [...ma.keys()].filter((k) => !mb.has(k));
  const added = [...mb.keys()].filter((k) => !ma.has(k));
  const changed = [];
  for (const [k, fa] of ma) {
    const fb = mb.get(k);
    if (!fb) continue;
    const fields = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter(
      (f) => JSON.stringify(fa[f]) !== JSON.stringify(fb[f]),
    );
    if (fields.length) changed.push({ id: k, fields });
  }
  return { removed, added, changed };
}

const { server, origin } = await serve({
  '/legacy/datos/': datos,
  '/legacy/': path.join(appDir, 'tests/legacy'),
  '/new/datos/': datos,
  '/new/': path.join(appDir, 'dist'),
});
const browser = await launch();
try {
  const legacy = await capture(browser, `${origin}/legacy/index.html`);
  const next = await capture(browser, `${origin}/new/index.html`);
  const la = legacy.db.values.analysis;
  const na = next.db.values.analysis;
  const report = {
    datos,
    errors: { legacy: legacy.errors, next: next.errors },
    schema: { legacy: [legacy.db.version, legacy.db.stores], next: [next.db.version, next.db.stores] },
    inputsEqual:
      !!legacy.db.values.inputs &&
      JSON.stringify(strip(legacy.db.values.inputs)) === JSON.stringify(strip(next.db.values.inputs)),
    analysisEqual: !!la && JSON.stringify(strip(la)) === JSON.stringify(strip(na)),
    reviewEqual:
      JSON.stringify(strip(legacy.db.values['review-workspace'])) === JSON.stringify(strip(next.db.values['review-workspace'])),
    findings: { legacyCount: la?.findings.length, nextCount: na?.findings.length, ...diffFindings(la?.findings, na?.findings) },
    tabs: Object.fromEntries(
      LEGACY_TABS.map((t) => [t, cleanText(legacy.texts[t]) === cleanText(next.texts[t]) ? 'igual' : 'DIFERENTE']),
    ),
  };
  const tabDiffs = {};
  for (const t of LEGACY_TABS) {
    if (report.tabs[t] === 'igual') continue;
    const a = cleanText(legacy.texts[t]).split('\n');
    const b = cleanText(next.texts[t]).split('\n');
    const i = a.findIndex((line, k) => line !== b[k]);
    tabDiffs[t] = { firstDifferentLine: i, legacy: a.slice(Math.max(0, i - 2), i + 4), next: b.slice(Math.max(0, i - 2), i + 4) };
  }
  report.tabDiffs = tabDiffs;
  const summary = {
    ...report,
    findings: {
      ...report.findings,
      removed: report.findings.removed.length,
      added: report.findings.added.length,
      changed: report.findings.changed.length,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  const compact = (findings = []) =>
    findings.map((f) => ({
      key: [f.type, f.week, f.hacienda, f.suerte, f.labor, f.service, f.unit, f.type === 'DIRECT' ? '' : f.pFacts.join(',')].join(
        '|',
      ),
      status: f.status,
      payrollUnits: f.payrollUnits,
      billedUnits: f.billedUnits,
      flags: f.flags ?? [],
      year: f.year,
    }));
  report.legacyFindings = compact(la?.findings);
  report.nextFindings = compact(na?.findings);
  if (outFile) await writeFile(outFile, JSON.stringify(report, null, 2));
  const identical =
    report.inputsEqual &&
    report.analysisEqual &&
    report.reviewEqual &&
    Object.values(report.tabs).every((x) => x === 'igual') &&
    !next.errors.length;
  if (!identical && !reportOnly) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
