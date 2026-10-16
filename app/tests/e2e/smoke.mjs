// Prueba de humo en navegador del build (app/dist) con los datos publicados (datos/).
// Recorre todas las pestañas, flujos de importación, cierre/reapertura, financiero y exportaciones.
// Uso: node tests/e2e/smoke.mjs [--datos ../datos] [--site dist|..] [--shots carpeta]
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve, launch, openAndWait, readDb } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../..');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const datos = path.resolve(appDir, arg('--datos', '../datos'));
const shots = arg('--shots', null);
const site = path.resolve(appDir, arg('--site', 'dist'));
if (shots) await mkdir(shots, { recursive: true });

const TABS = [
  'Resumen',
  'Conciliación',
  'Revisión por Correo',
  'Seguimiento de labores',
  'Financiero',
  'Paquetes TPS',
  'Auditoría y cierres',
  'Actualizar archivos',
  'Parámetros',
];
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'OK ' : 'FALLA'} · ${name}${detail ? ' · ' + detail : ''}`);
};

const { server, origin } = await serve({ '/app/datos/': datos, '/app/': site });
const browser = await launch();
try {
  for (const [label, viewport] of [
    ['escritorio', { width: 1366, height: 900 }],
    ['movil', { width: 390, height: 844 }],
  ]) {
    const { context, page, errors } = await openAndWait(browser, `${origin}/app/index.html`, { viewport });
    const clickNav = async (tab) => {
      if (label === 'movil') await page.locator('.menu-button').click();
      await page.locator('.sidebar nav button', { hasText: tab }).first().click();
      await page.waitForTimeout(600);
    };
    for (const tab of TABS) {
      await clickNav(tab);
      const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      check(`${label} · ${tab} se muestra`, text.length > 100, `${text.length} caracteres`);
      if (label === 'movil') check(`${label} · ${tab} sin desplazamiento horizontal`, !overflow);
      if (shots)
        await page.screenshot({
          path: path.join(shots, `${label}-${tab.replace(/\W+/g, '_')}.png`),
          fullPage: label === 'escritorio',
        });
    }
    if (label === 'escritorio') {
      // Conciliación: columna de tarifa y detalle con evidencia
      await clickNav('Conciliación');
      const header = await page.locator('table thead').first().innerText();
      check('Conciliación muestra columna Tarifa', /tarifa/i.test(header));
      await page.locator('table tbody tr').first().click();
      await page.waitForTimeout(400);
      const drawer = await page.locator('.drawer').innerText();
      check('Detalle de hallazgo con tarifa cobrada y origen', /tarifa cobrada/i.test(drawer) && /REPORTE!\d+/.test(drawer));
      if (shots) await page.screenshot({ path: path.join(shots, 'escritorio-detalle_hallazgo.png') });
      await page.locator('.drawer-head button').click();
      // Exportar vista
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('button', { hasText: 'Exportar vista' }).first().click(),
      ]);
      check(
        'Exportar vista de conciliación',
        /conciliacion_.*\.xlsx$/.test(download.suggestedFilename()),
        download.suggestedFilename(),
      );
      // Informe Excel completo
      const [audit] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.top-actions button', { hasText: 'Excel' }).click(),
      ]);
      check('Informe Excel de auditoría', /auditoria_nomina_prefactura_.*\.xlsx$/.test(audit.suggestedFilename()));
      const auditPath = await audit.path();
      const { read, utils } = await import('xlsx');
      const { readFileSync } = await import('node:fs');
      const workbook = read(readFileSync(auditPath));
      check(
        'Informe con hojas Origen/Calidad/Parámetros/Versión',
        ['Resumen', 'Conciliación', 'TPS', 'Pendientes', 'Origen', 'Calidad', 'Archivos', 'Parámetros', 'Versión'].every((s) =>
          workbook.SheetNames.includes(s),
        ),
        workbook.SheetNames.join(','),
      );
      const conciliation = utils.sheet_to_json(workbook.Sheets['Conciliación']);
      check(
        'Hoja Conciliación conserva columnas v0.7 y agrega Período/Tarifas',
        ['Semana', 'Hacienda', 'P.FACT', 'Explicación', 'Período', 'Tarifas cobradas', 'Banderas'].every(
          (c) => c in conciliation[0],
        ),
      );

      // Seguimiento: abrir y cerrar el detalle de una suerte/productor
      await clickNav('Seguimiento de labores');
      await page.locator('.exec-local-nav button', { hasText: 'Detalle por labor' }).click();
      await page.waitForTimeout(400);
      await page.locator('.exec-evidence-link').first().click();
      await page.waitForTimeout(400);
      const trackingDrawer = await page.locator('.drawer').innerText();
      check('Seguimiento · detalle con origen del registro', /trabajo realizado/i.test(trackingDrawer));
      await page.locator('.drawer-head button').click();
      await page.waitForTimeout(300);
      check('Seguimiento · el detalle se cierra', (await page.locator('.drawer').count()) === 0);

      // Financiero: total igual a la suma de Prefactura del período y detalle
      await clickNav('Financiero');
      const finance = await page.locator('.finance-module').innerText();
      check('Financiero muestra total facturado', /Total facturado/i.test(finance));
      for (const view of [
        'Productores y fincas',
        'Labores y servicios',
        'Suertes',
        'Tarifas',
        'Prefacturas',
        'Resumen ejecutivo',
      ]) {
        await page.locator('.exec-local-nav button', { hasText: view }).click();
        await page.waitForTimeout(400);
        check(`Financiero · ${view}`, (await page.locator('.finance-module').innerText()).length > 200);
        if (shots)
          await page.screenshot({
            path: path.join(shots, `escritorio-financiero_${view.replace(/\W+/g, '_')}.png`),
            fullPage: true,
          });
      }
      await page.locator('.finance-grid').nth(1).locator('.bar-row').first().click();
      await page.waitForTimeout(300);
      check('Financiero · detalle por grupo', (await page.locator('.drawer').count()) === 1);
      await page.locator('.drawer-head button').click();
      const [financeExport] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('button', { hasText: 'Exportar Excel' }).click(),
      ]);
      const financeBook = read(readFileSync(await financeExport.path()));
      check('Financiero · exportación con 10 hojas', financeBook.SheetNames.length === 10, financeBook.SheetNames.join(','));

      // Importación: reimportar la Nómina publicada (mismo archivo → sin cambios)
      await clickNav('Actualizar archivos');
      await page.locator('.file-card input[type=file]').first().setInputFiles(path.join(datos, 'Nomina_2026.xlsx'));
      await page.locator('.drawer', { hasText: 'Comprobación antes de reemplazar' }).waitFor({ timeout: 60000 });
      const importText = await page.locator('.drawer').innerText();
      check('Reimportar el mismo archivo se reconoce sin cambios', importText.includes('Es el mismo archivo'));
      await page.locator('button', { hasText: 'Cancelar · conservar actual' }).click();

      // Cierre y reapertura de una semana sin pendientes
      await clickNav('Auditoría y cierres');
      const available = page.locator('.week-controls button', { hasText: 'Disponible para cerrar' }).first();
      if (await available.count()) {
        await available.click();
        await page.locator('.closure-form textarea').fill('Prueba automática de cierre');
        await page.locator('button', { hasText: 'Cerrar semana' }).click();
        await page.waitForTimeout(800);
        const closed = await page.locator('main').innerText();
        check('Cierre de semana registrado', closed.includes('Ya cerrada en este corte'));
        await page.locator('.reopen-box input').fill('Prueba de reapertura');
        await page.locator('button', { hasText: 'Reabrir semana' }).click();
        await page.waitForTimeout(800);
        const db = await readDb(page);
        const closure = db.closures.find((c) => c.status === 'REOPENED');
        check(
          'Reapertura con motivo e historial',
          closure &&
            closure.reopenReason === 'Prueba de reapertura' &&
            closure.history.length === 1 &&
            /^\d{4}-S\d{2}$/.test(closure.week),
        );
        check(
          'Bitácora registra cierre y reapertura',
          ['SEMANA_CERRADA', 'SEMANA_REABIERTA'].every((a) => db.audit.some((e) => e.action === a)),
        );
      } else check('Hay una semana disponible para cerrar', false);
      const [backup] = await Promise.all([
        page.waitForEvent('download'),
        (async () => {
          await clickNav('Actualizar archivos');
          await page.locator('button', { hasText: 'Descargar respaldo' }).click();
        })(),
      ]);
      const backupData = JSON.parse(readFileSync(await backup.path(), 'utf8'));
      check(
        'Respaldo JSON completo',
        backupData.format === 'conciliador-casur-respaldo' && backupData.values.some((v) => v.key === 'inputs'),
      );
      const db = await readDb(page);
      check('Esquema IndexedDB sin cambios (v1 Dexie)', db.version === 10 && db.stores.join(',') === 'audit,closures,values');
    }
    check(`${label} · sin errores de página`, !errors.length, errors.slice(0, 3).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
// 52 comprobaciones (escritorio y móvil). Menos significa que la prueba no terminó.
if (failed.length || results.length < 52) process.exitCode = 1;
