// V1: solo Prefactura, señales independientes, detalle B1, teclado, móvil y cero escrituras de auditoría.
// Uso: node tests/e2e/tariff-audit.mjs [--site ..] [--shots carpeta]
import path from 'node:path';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { read, utils } from 'xlsx';
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
      await page.locator('.sidebar nav').getByRole('button', { name: 'Auditoría de tarifas y cobros', exact: true }).click();
      await page.locator('.audit-scope').waitFor();
      if (device === 'móvil')
        await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0);
    };
    await nav();
    check(
      `${device}: Auditoría accesible y cuarta Seguimiento`,
      (await page
        .locator('.sidebar nav')
        .getByRole('button', { name: 'Auditoría de tarifas y cobros', exact: true })
        .isVisible()) && /Seguimiento/.test(await page.locator('.sidebar nav button').nth(3).innerText()),
    );
    const module = page.locator('.tariff-audit-module');
    const view = async (name) =>
      module.locator('nav[aria-label="Vistas de auditoría"]').getByRole('button', { name, exact: true }).click();
    const metric = (name) => module.locator('.metric-action', { hasText: name });
    if (device === 'PC') {
      const downloadFull = page.waitForEvent('download');
      await module.getByRole('button', { name: /Toda la Prefactura/ }).click();
      const fullFile = await downloadFull;
      const fullBook = read(await readFile(await fullFile.path()), { type: 'buffer' });
      const sampleDir = path.join(appDir, 'test-results');
      await mkdir(sampleDir, { recursive: true });
      await copyFile(await fullFile.path(), path.join(sampleDir, 'auditoria_tarifas_cobros_completa_muestra.xlsx'));
      const fullRows = utils.sheet_to_json(fullBook.Sheets.Prefactura, { defval: '' });
      const reviewRows = utils.sheet_to_json(fullBook.Sheets['Revisión única'], { defval: '' });
      const insufficientRows = reviewRows.filter((row) => row.Motivos.includes('Comparables insuficientes'));
      const cmnRow = fullRows.find((row) => row['Fila origen'] === 1376);
      check(
        'Excel completo reconcilia filas, importe, revisión deduplicada y CMN 0,88',
        fullRows.length === 4452 &&
          Math.abs(fullRows.reduce((total, row) => total + row['Total Prefactura'], 0) - 13278583.33) < 0.005 &&
          reviewRows.length === 887 &&
          new Set(reviewRows.map((row) => row['ID de auditoría'])).size === 887 &&
          insufficientRows.length === 417 &&
          cmnRow?.Labor === 'CMN' &&
          cmnRow?.['Tarifa reportada'] === 0.88 &&
          cmnRow?.Hoja === 'REPORTE',
      );
      check(
        'Excel completo incluye evidencia, referencias, evolución y motivos',
        [
          'Resumen',
          'Prefactura',
          'Revisión única',
          'Motivos (no sumar)',
          'Referencias mensuales',
          'Evolución',
          'Evidencia',
        ].every((name) => fullBook.SheetNames.includes(name)),
      );
      await view('Todos los registros');
      await module.locator('.audit-filters label').filter({ hasText: 'Indicador' }).locator('select').selectOption('all');
      await page.getByLabel('Buscar evidencia').fill('1376');
      const downloadSelection = page.waitForEvent('download');
      await module.getByRole('button', { name: /Selección actual/ }).click();
      const selectionFile = await downloadSelection;
      const selectionBook = read(await readFile(await selectionFile.path()), { type: 'buffer' });
      const selectionRows = utils.sheet_to_json(selectionBook.Sheets.Prefactura, { defval: '' });
      const selectionSummary = utils.sheet_to_json(selectionBook.Sheets.Resumen, { defval: '' });
      check(
        'Excel de Todos los registros respeta filtros y conserva P.FACT como texto',
        selectionRows.length === 1 &&
          selectionRows[0]['Fila origen'] === 1376 &&
          selectionRows[0]['P.FACT'] === '16183' &&
          selectionSummary.find((row) => row.Indicador === 'Vista consultada')?.Valor === 'Todos los registros' &&
          selectionBook.Sheets.Prefactura.A2.t === 's',
      );
      await view('Pendientes de revisión');
    }
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
    const insufficientCount = Number(await queue.locator('[data-tariff-review-count]').getAttribute('data-tariff-review-count'));
    const insufficientButton = module.getByRole('button', { name: /Selección actual/ });
    check(
      `${device}: filtro de comparables insuficientes cuenta toda la subvista`,
      insufficientCount === 417 &&
        insufficientCount === Number(await queue.locator('.tariff-review-counter').nth(1).locator('strong').innerText()) &&
        insufficientCount === Number(await insufficientButton.getAttribute('data-export-selection-count')) &&
        (await visibleRows().count()) === 8,
    );
    const downloadInsufficient = page.waitForEvent('download');
    await insufficientButton.click();
    const insufficientFile = await downloadInsufficient;
    const insufficientBook = read(await readFile(await insufficientFile.path()), { type: 'buffer' });
    if (device === 'PC')
      await copyFile(
        await insufficientFile.path(),
        path.join(appDir, 'test-results', 'auditoria_tarifas_cobros_seleccion_417_muestra.xlsx'),
      );
    const insufficientExport = utils.sheet_to_json(insufficientBook.Sheets.Prefactura, { defval: '' });
    const insufficientSummary = utils.sheet_to_json(insufficientBook.Sheets.Resumen, { defval: '' });
    const insufficientEvidence = utils.sheet_to_json(insufficientBook.Sheets.Evidencia, { defval: '' });
    check(
      `${device}: XLSX exporta los 417 comparables sin recortar a la página`,
      insufficientExport.length === 417 &&
        insufficientEvidence.length === 417 &&
        insufficientExport.every((row) => row['Comparables suficientes'] === false) &&
        insufficientSummary.find((row) => row.Indicador === 'Vista consultada')?.Valor === 'Cobros que requieren revisión' &&
        insufficientSummary.find((row) => row.Indicador === 'Líneas en este alcance')?.Valor === 417,
    );
    await queue.getByRole('button', { name: /Casos para revisar/ }).click();
    check(
      `${device}: contador de casos únicos consistente`,
      Number(await queue.locator('[data-tariff-review-count]').getAttribute('data-tariff-review-count')) === uniqueCount,
    );
    if (shots) await page.screenshot({ path: path.join(shots, `${device}-resumen.png`), fullPage: true });
    await queue.getByLabel('Buscar un cobro').fill('1376');
    const queueSelection = module.getByRole('button', { name: /Selección actual/ });
    const queueCount = Number(await queue.locator('[data-tariff-review-count]').getAttribute('data-tariff-review-count'));
    check(
      `${device}: selección de bandeja y contador muestran una fila`,
      queueCount === 1 &&
        queueCount === Number(await queueSelection.getAttribute('data-export-selection-count')) &&
        (await queueSelection.innerText().then((label) => /Selección actual \(1\)/.test(label))),
    );
    const downloadQueueSelection = page.waitForEvent('download');
    await queueSelection.click();
    const queueSelectionFile = await downloadQueueSelection;
    const queueSelectionBook = read(await readFile(await queueSelectionFile.path()), { type: 'buffer' });
    if (device === 'PC')
      await copyFile(
        await queueSelectionFile.path(),
        path.join(appDir, 'test-results', 'auditoria_tarifas_cobros_seleccion_cmn_1376_muestra.xlsx'),
      );
    const queueSelectionRows = utils.sheet_to_json(queueSelectionBook.Sheets.Prefactura, { defval: '' });
    const queueEvidenceRows = utils.sheet_to_json(queueSelectionBook.Sheets.Evidencia, { defval: '' });
    const queueSummary = utils.sheet_to_json(queueSelectionBook.Sheets.Resumen, { defval: '' });
    const queueRow = queueSelectionRows[0];
    check(
      `${device}: búsqueda 1376 exporta solo CMN con importe y evidencia originales`,
      queueSelectionRows.length === 1 &&
        queueRow?.['Fila origen'] === 1376 &&
        queueRow?.Labor === 'CMN' &&
        queueRow?.Servicio === '16013' &&
        queueRow?.['Productor código'] === 'CL1105' &&
        queueRow?.Productor === 'PANSACO' &&
        queueRow?.['Hacienda código'] === '993' &&
        queueRow?.Suerte === '10' &&
        queueRow?.Unidades === 8.32 &&
        queueRow?.['Tarifa reportada'] === 0.88 &&
        queueRow?.['Total Prefactura'] === 7.32 &&
        queueRow?.['P.FACT'] === '16183' &&
        queueRow?.Archivo === 'Prefactura_01-ene-11-oct-26.xlsx' &&
        queueRow?.Hoja === 'REPORTE' &&
        queueEvidenceRows.length === 1 &&
        queueEvidenceRows[0]?.Fila === 1376 &&
        queueEvidenceRows[0]?.['P.FACT'] === '16183' &&
        queueSummary.find((row) => row.Indicador === 'Vista consultada')?.Valor === 'Cobros que requieren revisión' &&
        queueSummary.find((row) => row.Indicador === 'Filtros aplicados a esta selección')?.Valor.includes('1376'),
    );
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
    const seriesSelectionButton = module.getByRole('button', { name: /Selección actual/ });
    const seriesSelectionCount = Number(await seriesSelectionButton.getAttribute('data-export-selection-count'));
    const downloadSeries = page.waitForEvent('download');
    await seriesSelectionButton.click();
    const seriesFile = await downloadSeries;
    const seriesBook = read(await readFile(await seriesFile.path()), { type: 'buffer' });
    const seriesRows = utils.sheet_to_json(seriesBook.Sheets.Prefactura, { defval: '' });
    const seriesSummary = utils.sheet_to_json(seriesBook.Sheets.Resumen, { defval: '' });
    check(
      `${device}: selección de Evolución exporta la serie consultada`,
      seriesRows.length === seriesSelectionCount &&
        seriesRows.length > 0 &&
        seriesRows.every(
          (row) => row.Servicio === '16013' && row.Labor === 'CMN' && row.UM === 'HA' && row['Contratista código'] === 'CS9999',
        ) &&
        seriesSummary.find((row) => row.Indicador === 'Vista consultada')?.Valor === 'Evolución de tarifas' &&
        seriesSummary.find((row) => row.Indicador === 'Filtros aplicados a esta selección')?.Valor.includes('16013'),
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
      Number(await module.locator('[data-audit-count]').getAttribute('data-audit-count')) === 4452 &&
        Number(await module.getByRole('button', { name: /Selección actual/ }).getAttribute('data-export-selection-count')) ===
          4452,
    );
    if (device === 'PC') {
      const downloadAllRows = page.waitForEvent('download');
      await module.getByRole('button', { name: /Selección actual/ }).click();
      const allRowsFile = await downloadAllRows;
      const allRowsBook = read(await readFile(await allRowsFile.path()), { type: 'buffer' });
      const allRowsExport = utils.sheet_to_json(allRowsBook.Sheets.Prefactura, { defval: '' });
      const allRowsSummary = utils.sheet_to_json(allRowsBook.Sheets.Resumen, { defval: '' });
      check(
        'Excel de Todos los registros no hereda filtros de la bandeja ni la serie',
        allRowsExport.length === 4452 &&
          allRowsSummary.find((row) => row.Indicador === 'Vista consultada')?.Valor === 'Todos los registros' &&
          allRowsSummary.find((row) => row.Indicador === 'Líneas en este alcance')?.Valor === 4452,
      );
    }
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
