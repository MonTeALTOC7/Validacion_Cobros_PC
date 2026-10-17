// V1: solo Prefactura, señales independientes, detalle B1, teclado, móvil y cero escrituras de auditoría.
// Uso: node tests/e2e/tariff-audit.mjs [--site ..] [--shots carpeta]
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve, launch, openAndWait, readDb } from './harness.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const shots = arg('--shots', null);
if (shots) await mkdir(shots, { recursive: true });
const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed: !!passed });
  console.log(`${passed ? 'OK' : 'FALLA'} · ${name}${detail ? ' · ' + detail : ''}`);
};
const { server, origin } = await serve({
  '/app/datos/': path.resolve(appDir, '../datos'),
  '/app/': path.resolve(appDir, arg('--site', 'dist')),
});
const browser = await launch();
try {
  for (const [device, viewport] of [
    ['PC', { width: 1366, height: 900 }],
    ['móvil', { width: 390, height: 844 }],
  ]) {
    const { page, context, errors } = await openAndWait(browser, `${origin}/app/index.html`, { viewport });
    const before = await readDb(page);
    const nav = async () => {
      if (device === 'móvil') await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
      await page.locator('.sidebar nav button').nth(6).click();
      await page.locator('.audit-scope').waitFor();
      if (device === 'móvil')
        await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0);
    };
    await nav();
    check(
      `${device}: séptima Auditoría y cuarta Seguimiento`,
      /Auditoría de tarifas/.test(await page.locator('.sidebar nav button').nth(6).innerText()) &&
        /Seguimiento/.test(await page.locator('.sidebar nav button').nth(3).innerText()),
    );
    const module = page.locator('.tariff-audit-module');
    const view = async (name) =>
      module.locator('nav[aria-label="Vistas de auditoría"]').getByRole('button', { name, exact: true }).click();
    const metric = (name) => module.locator('.metric-action', { hasText: name });
    await module.locator('.audit-technical-summary summary').click();
    check(
      `${device}: cobertura real y total original`,
      /2026-01-02 → 2026-09-20/.test(await module.innerText()) &&
        /13,278,583.33/.test(await metric('Importe informado').innerText()),
    );
    check(
      `${device}: sin importe contractual inventado`,
      /Tarifa autorizada no disponible \/ importe esperado no verificable/.test(await module.innerText()),
    );
    check(
      `${device}: página sin desbordamiento horizontal`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    );
    await module.locator('.audit-technical-summary summary').click();
    check(
      `${device}: bandeja operativa con campos y referencias`,
      /Cobros que requieren revisión/.test(await module.innerText()) &&
        /Tarifa reportada/i.test(await module.innerText()) &&
        /Tarifa efectiva/i.test(await module.innerText()) &&
        /Referencia observada/i.test(await module.innerText()),
    );
    const queue = module.locator('.operational-queue');
    const uniqueCount = Number(await queue.locator('[data-tariff-review-count]').getAttribute('data-tariff-review-count'));
    const visibleRows = () => queue.locator(device === 'PC' ? '.tariff-review-table tbody tr' : '.tariff-review-card');
    const firstPage = await visibleRows().evaluateAll((items) => items.map((item) => item.dataset.tariffReviewId));
    await queue.getByRole('button', { name: 'Siguiente', exact: true }).click();
    const secondPage = await visibleRows().evaluateAll((items) => items.map((item) => item.dataset.tariffReviewId));
    check(
      `${device}: paginación sin duplicar registros`,
      firstPage.length === 8 && secondPage.length === 8 && !firstPage.some((id) => secondPage.includes(id)),
    );
    await queue.getByRole('button', { name: 'Anterior', exact: true }).click();
    await queue.getByRole('button', { name: /Comparables insuficientes/ }).click();
    check(
      `${device}: contador de respaldo coincide con su selección`,
      Number(await queue.locator('[data-tariff-review-count]').getAttribute('data-tariff-review-count')) ===
        Number(await queue.locator('.tariff-review-counter').nth(1).locator('strong').innerText()),
    );
    await queue.getByRole('button', { name: /Casos para revisar/ }).click();
    check(
      `${device}: contador de casos únicos consistente`,
      Number(await queue.locator('[data-tariff-review-count]').getAttribute('data-tariff-review-count')) === uniqueCount,
    );
    if (shots) await page.screenshot({ path: path.join(shots, `${device}-resumen.png`), fullPage: true });
    await queue.getByLabel('Buscar un cobro').fill('1376');
    if (shots) await page.screenshot({ path: path.join(shots, `${device}-busqueda-1376.png`), fullPage: true });
    const queueOpener = queue.locator('button[aria-label="Abrir evidencia de fila 1376"]:visible');
    await queueOpener.click();
    check(
      `${device}: ficha explica motivo, comparación y acción`,
      /Qué se detectó/.test(await page.locator('.drill-drawer').innerText()) &&
        /Qué corresponde verificar/.test(await page.locator('.drill-drawer').innerText()) &&
        /tarifa reportada está por debajo/.test(await page.locator('.drill-drawer').innerText()),
    );
    if (shots) await page.screenshot({ path: path.join(shots, `${device}-guia-cmn.png`) });
    await page.keyboard.press('Escape');
    check(
      `${device}: bandeja conserva búsqueda y foco`,
      (await queueOpener.evaluate((element) => element === document.activeElement)) &&
        (await queue.getByLabel('Buscar un cobro').inputValue()) === '1376',
    );
    await queue.getByLabel('Buscar un cobro').fill('');
    await module.locator('.audit-technical-summary summary').click();
    const count = Number(await metric('Extremos prioritarios').locator('strong').innerText());
    await metric('Extremos prioritarios').click();
    check(
      `${device}: KPI lleva a exactamente sus líneas`,
      Number(await module.locator('[data-audit-count]').getAttribute('data-audit-count')) === count && count >= 3,
    );
    await page.getByLabel('Buscar evidencia').fill('1376');
    check(
      `${device}: filtro encuentra evidencia CMN`,
      Number(await module.locator('[data-audit-count]').getAttribute('data-audit-count')) === 1,
    );
    const opener = module.locator('tbody tr').first();
    await opener.focus();
    await page.keyboard.press('Enter');
    const drawer = page.locator('.drill-drawer');
    await drawer.waitFor();
    await drawer.locator('.audit-evidence-technical summary').click();
    const evidence = await drawer.innerText();
    check(
      `${device}: origen, productor, P.FACT y CMN 0,88`,
      /REPORTE!1376/.test(evidence) &&
        /Productor/i.test(evidence) &&
        /16183/.test(evidence) &&
        /0.88/.test(evidence) &&
        /16013/.test(evidence),
    );
    check(
      `${device}: referencia reproducible visible`,
      /MAD/.test(evidence) &&
        /Intervalo/.test(evidence) &&
        /2026-05/.test(evidence) &&
        /Jornada\/base desconocida/.test(evidence),
    );
    if (shots) await page.screenshot({ path: path.join(shots, `${device}-cmn.png`) });
    for (const key of ['Tab', 'Shift+Tab']) {
      let inside = true;
      for (let index = 0; index < 20; index += 1) {
        await page.keyboard.press(key);
        inside &&= await page.evaluate(() => !!document.activeElement?.closest('.drill-drawer'));
      }
      check(`${device}: ${key} permanece en detalle`, inside);
    }
    await drawer.getByRole('button', { name: 'Ver muestra comparable', exact: true }).first().click();
    check(
      `${device}: muestra completa navegable con ruta`,
      (await drawer.locator('.drill-crumbs button').count()) === 1 && (await drawer.locator('tbody tr').count()) > 0,
    );
    await drawer.locator('tbody tr').first().click();
    check(
      `${device}: muestra permite abrir otra fila`,
      (await drawer.locator('.drill-crumbs button').count()) === 2 && /Hoja · fila/i.test(await drawer.innerText()),
    );
    await drawer.locator('.drill-crumbs button').first().click();
    check(`${device}: ruta vuelve a CMN`, /REPORTE!1376/.test(await drawer.innerText()));
    await page.keyboard.press('Escape');
    check(
      `${device}: Escape conserva búsqueda y devuelve foco`,
      (await drawer.count()) === 0 &&
        (await page.getByLabel('Buscar evidencia').inputValue()) === '1376' &&
        (await opener.evaluate((element) => element === document.activeElement)),
    );
    await view('Pendientes de revisión');
    await module.locator('.audit-technical-summary summary').click();
    await metric('Importe informado').click();
    check(
      `${device}: desglose conserva C$13,278,583.33`,
      Math.abs(Number(await drawer.locator('[data-audit-total]').getAttribute('data-audit-total')) - 13278583.33) < 0.005,
    );
    for (const name of ['Productor', 'Hacienda', 'Suerte', 'Labor', 'Servicio', 'Semana', 'P.FACT']) {
      await drawer.locator('.drill-tabs').getByRole('button', { name, exact: true }).click();
      check(`${device}: desglose ${name}`, (await drawer.locator('tbody tr').count()) > 0);
    }
    await drawer.locator('tbody tr').first().click();
    await drawer.getByRole('button', { name: 'Volver', exact: true }).click();
    check(
      `${device}: Volver restaura total y nivel`,
      Math.abs(Number(await drawer.locator('[data-audit-total]').getAttribute('data-audit-total')) - 13278583.33) < 0.005 &&
        (await drawer.locator('.drill-crumbs button').count()) === 0,
    );
    if (device === 'móvil')
      check('móvil: detalle a ancho completo', Math.abs((await drawer.boundingBox()).width - viewport.width) < 2);
    await drawer.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await view('Evolución de tarifas');
    const series = module.locator('.audit-series select');
    const cmn = await series
      .locator('option')
      .evaluateAll((options) => options.find((option) => option.textContent.startsWith('16013 · CMN · HA · CS9999')).value);
    await series.selectOption(cmn);
    check(
      `${device}: evolución sencilla y detalle técnico cerrado`,
      (await module.locator('.evolution-month').count()) > 1 &&
        !(await module.locator('.audit-history-technical').evaluate((element) => element.open)),
    );
    if (shots) await page.screenshot({ path: path.join(shots, `${device}-evolucion.png`), fullPage: true });
    await module.locator('.audit-history-technical summary').click();
    const rates = await module.innerText();
    check(
      `${device}: comparación histórica sin diciembre ficticio`,
      /Antes de 2026-06-01/.test(rates) &&
        /Desde 2026-06-01/.test(rates) &&
        /Cambio observado/.test(rates) &&
        !/2025-12/.test(rates),
    );
    check(
      `${device}: tabla por período con MAD`,
      /Mes observado/i.test(rates) && /MAD efectiva/i.test(rates) && (await module.locator('tbody tr').count()) > 1,
    );
    if (shots) await page.screenshot({ path: path.join(shots, `${device}-historico.png`), fullPage: true });
    await view('Todos los registros');
    check(
      `${device}: todos los registros sin filtro heredado`,
      Number(await module.locator('[data-audit-count]').getAttribute('data-audit-count')) === 4452,
    );
    await view('Historial y cierres');
    check(`${device}: panel de cierres original accesible`, (await module.locator('.week-controls button').count()) > 0);
    if (shots) await page.screenshot({ path: path.join(shots, `${device}-cierres.png`), fullPage: true });
    await view('Pendientes de revisión');
    await module.locator('.audit-method summary').click();
    await module.getByLabel('Mínimo de muestras').fill('15');
    await module.getByRole('button', { name: 'Recalcular auditoría', exact: true }).click();
    check(`${device}: configuración local explícita`, /Mínimo 15 muestras/.test(await module.innerText()));
    const after = await readDb(page);
    check(
      `${device}: ninguna escritura ni alteración de conciliación`,
      JSON.stringify(after) === JSON.stringify(before) && after.values.analysis.findings.length === 2348,
    );
    check(`${device}: IndexedDB v1 intacta`, after.version === 10 && after.stores.join(',') === 'audit,closures,values');
    // Fuente sintética solo dentro de este contexto aislado de prueba; nunca se cambia datos/.
    await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('conciliador-casur');
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise((resolve) => {
        const tx = db.transaction('values', 'readwrite');
        const store = tx.objectStore('values');
        const request = store.get('inputs');
        request.onsuccess = () => {
          const record = request.result;
          const row = record.value.prefactura[0];
          record.value = {
            ...record.value,
            payroll: [],
            master: [],
            prefactura: [{ ...row, id: 'synthetic-siagri', units: 4.2, tariff: 515.065, total: 2028.837 }],
            files: record.value.files.filter((file) => file.kind === 'prefactura'),
          };
          store.put(record);
          store.delete('analysis');
        };
        tx.oncomplete = resolve;
      });
      db.close();
    });
    await page.reload();
    await page.waitForTimeout(2500);
    await nav();
    await module.locator('.audit-technical-summary summary').click();
    check(
      `${device}: auditoría funciona con Prefactura sola`,
      /1 líneas/.test(await module.innerText()) &&
        Number(await metric('Presentación SIAGRI').locator('strong').innerText()) === 1,
    );
    await metric('Presentación SIAGRI').click();
    await module.locator('tbody tr').first().click();
    await drawer.locator('.audit-evidence-technical summary').click();
    check(
      `${device}: promedio presentado sin dictamen económico`,
      /483.0564/.test(await drawer.innerText()) &&
        /no demuestra su causa ni valida el cobro/.test(await drawer.innerText()) &&
        /importe esperado no verificable/.test(await drawer.innerText()),
    );
    await page.keyboard.press('Escape');
    await view('Historial y cierres');
    check(
      `${device}: cierres mantienen requisito de conciliación`,
      /Primero concilie los archivos actuales/.test(await module.innerText()),
    );
    check(`${device}: sin errores de navegador`, !errors.length, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${results.filter((item) => item.passed).length}/${results.length} comprobaciones correctas`);
if (results.some((item) => !item.passed) || results.length < 83) process.exitCode = 1;
