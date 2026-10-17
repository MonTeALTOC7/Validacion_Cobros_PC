// Ruta de actualización en un mismo origen (como en montealtoc7.github.io):
// 1) el bundle legacy 8b3-1-1 guarda datos y un cierre v0.7 (semana sin año);
// 2) la versión nueva abre esa misma base, la actualiza sin perder el cierre y ofrece los datos publicados;
// 3) la vista "Seguimiento de Labores" de la App Maestra (bundle antiguo) sigue abriendo la base.
// Uso: node tests/e2e/upgrade.mjs --labores <ruta a Negocios_de_Cana_CASUR_APP/modules/labores>
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch, openAndWait, readDb } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../..');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const labores = arg('--labores', null);
const datos = path.resolve(appDir, arg('--datos', '../datos'));
const oldDatos = arg('--datos-legacy', datos);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK ' : 'FALLA'} · ${name}${detail ? ' · ' + detail : ''}`);
};

const mounts = {
  '/legacy/datos/': oldDatos,
  '/legacy/': path.join(appDir, 'tests/legacy'),
  '/nueva/datos/': datos,
  '/nueva/': path.join(appDir, 'dist'),
};
if (labores) {
  mounts['/labores/'] = labores;
}
const { server, origin } = await serve(mounts);
const browser = await launch();
try {
  const { context, page } = await openAndWait(browser, `${origin}/legacy/index.html`);
  const legacyDb = await readDb(page);
  await page.evaluate(
    () =>
      new Promise((res) => {
        const q = indexedDB.open('conciliador-casur');
        q.onsuccess = () => {
          const tx = q.result.transaction('closures', 'readwrite');
          tx.objectStore('closures').put({
            week: 12,
            closedAt: '2026-04-01T12:00:00.000Z',
            status: 'CLOSED',
            note: 'Cierre v0.7',
            fingerprint: 'id-legacy',
          });
          tx.oncomplete = () => res();
        };
      }),
  );
  check(
    'Legacy guardó datos',
    legacyDb.values.inputs?.payroll?.length > 0,
    `${legacyDb.values.inputs?.payroll?.length} filas Nómina`,
  );

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/nueva/index.html`);
  await page.waitForTimeout(6000);
  const db = await readDb(page);
  const payroll = db.values.inputs.payroll;
  check('La versión nueva conserva los datos guardados', payroll.length === legacyDb.values.inputs.payroll.length);
  check(
    'Completa el año operativo en filas v0.7',
    payroll.every((row) => row.year != null),
  );
  check(
    'Recalcula el análisis con períodos',
    db.values.analysis.findings.every((f) => /^\d{4}-S\d{2}$/.test(f.period)),
  );
  check(
    'Conserva el cierre v0.7',
    db.closures.some((c) => c.week === 12 && c.note === 'Cierre v0.7'),
  );
  check('Esquema sin cambios', db.version === 10);
  await page.locator('.sidebar nav button', { hasText: 'Actualizar archivos' }).click();
  await page.waitForTimeout(500);
  const loadText = await page.locator('main').innerText();
  check('Ofrece cargar los datos publicados nuevos', /datos publicados más recientes/i.test(loadText));
  await page.locator('.sidebar nav button', { hasText: 'Auditoría de tarifas y cobros' }).click();
  await page.getByRole('button', { name: 'Historial y cierres', exact: true }).click();
  await page.waitForTimeout(500);
  check('Muestra el cierre v0.7 como histórico', /cierre v0\.7 sin año/i.test(await page.locator('main').innerText()));
  check('Sin errores de página', !errors.length, errors.join(' | '));

  if (labores) {
    const laboresErrors = [];
    page.on('pageerror', (e) => laboresErrors.push(e.message));
    await page.goto(`${origin}/labores/index.html#tracking`);
    await page.waitForTimeout(6000);
    const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
    check(
      'Vista de labores de la App Maestra abre con la base actualizada',
      text.includes('Trabajo realizado') && !laboresErrors.length,
      laboresErrors.join(' | '),
    );
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
// Con la App Maestra se esperan 10 comprobaciones; sin ella, 9. Menos significa que la prueba no terminó.
const MIN_CHECKS = labores ? 10 : 9;
if (results.length < MIN_CHECKS) {
  console.error(`FALLA · solo se ejecutaron ${results.length} de ${MIN_CHECKS} comprobaciones`);
  process.exitCode = 1;
}
if (results.some((ok) => !ok)) process.exitCode = 1;
