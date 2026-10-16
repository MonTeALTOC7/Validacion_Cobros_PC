// Drill-down v0.9 (B1): Financiero y Calidad de datos, en escritorio y móvil.
// Verifica que cada total del detalle coincida con su KPI o grupo de origen, la navegación (ruta, Volver, Cerrar),
// la conservación de filtros, "Aplicar como filtro" reversible, la ficha de línea con origen y la Calidad completa.
// Uso: node tests/e2e/drilldown.mjs [--site dist|..] [--shots carpeta]
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { read, utils, write } from 'xlsx';
import { fileURLToPath } from 'node:url';
import { serve, launch, openAndWait, readDb } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const datos = path.resolve(appDir, arg('--datos', '../datos'));
const site = path.resolve(appDir, arg('--site', 'dist'));
const shots = arg('--shots', null);
if (shots) await mkdir(shots, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'OK ' : 'FALLA'} · ${name}${detail ? ' · ' + detail : ''}`);
};
/** "C$13,278,583.33" → 13278583.33 (formato es-NI). */
const money = (text) => Number(String(text).replace(/[^0-9.-]/g, ''));
const near = (a, b) => Math.abs(a - b) < 0.005;

const { server, origin } = await serve({ '/app/datos/': datos, '/app/': site });
const browser = await launch();
try {
  for (const [label, viewport] of [
    ['escritorio', { width: 1366, height: 900 }],
    ['movil', { width: 390, height: 844 }],
  ]) {
    const { context, page, errors } = await openAndWait(browser, `${origin}/app/index.html`, { viewport });
    const nav = async (tab) => {
      if (label === 'movil') await page.locator('.menu-button').click();
      await page.locator('.sidebar nav button', { hasText: tab }).first().click();
      await page.waitForTimeout(500);
    };
    const drawer = page.locator('.drill-drawer');
    const drawerTotal = async () => Number(await drawer.locator('[data-drill-total]').getAttribute('data-drill-total'));
    const crumbs = () => drawer.locator('.drill-crumbs button').count();
    const tab = async (name) => {
      await drawer.locator('.drill-tabs button', { hasText: name }).first().click();
      await page.waitForTimeout(250);
    };
    /** Índice de la columna "Total" de la tabla visible del detalle. */
    const totalColumn = async () =>
      (await drawer.locator('thead th').allInnerTexts()).findIndex((text) => /^total\b/i.test(text.trim()));
    const footerTotal = async () =>
      money(
        await drawer
          .locator('tfoot td')
          .nth(await totalColumn())
          .innerText(),
      );
    const rowTotal = async (row) =>
      money(
        await row
          .locator('td')
          .nth(await totalColumn())
          .innerText(),
      );
    const select = (name) =>
      page
        .locator('.finance-toolbar label')
        .filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) })
        .locator('select');

    await nav('Financiero');
    // Contexto: filtro de universo antes de abrir el detalle
    await select('Universo').selectOption('CONCILIABLE');
    await page.waitForTimeout(400);
    const kpi = page.locator('.metric-action', { hasText: 'Total informado por SIAGRI' });
    const kpiTotal = money(await kpi.locator('strong').innerText());
    await kpi.click();
    await drawer.waitFor();
    check(`${label} · KPI Total abre el detalle con el mismo total`, near(await drawerTotal(), kpiTotal), `${kpiTotal}`);
    if (label === 'movil') {
      const width = await drawer.evaluate((el) => el.getBoundingClientRect().width);
      check(`${label} · el detalle ocupa toda la pantalla`, Math.abs(width - viewport.width) < 2, `${width}px`);
      check(
        `${label} · sin desplazamiento horizontal con el detalle abierto`,
        !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      );
    }
    if (shots) await page.screenshot({ path: path.join(shots, `${label}-1-total.png`) });
    // Diálogo modal: Tab y Mayús+Tab no salen del panel
    const focusStaysInside = async (key) => {
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press(key);
        if (!(await page.evaluate(() => !!document.activeElement?.closest('.drill-drawer')))) return false;
      }
      return true;
    };
    check(`${label} · Tab recorre solo el panel abierto`, await focusStaysInside('Tab'));
    check(`${label} · Mayús+Tab recorre solo el panel abierto`, await focusStaysInside('Shift+Tab'));

    // Nivel 1 → por productor: la suma de los grupos coincide con el total del nivel
    await tab('Por productor');
    check(`${label} · Por productor: suma de grupos = total del nivel`, near(await footerTotal(), await drawerTotal()));
    const firstProducerRow = drawer.locator('tbody tr').first();
    const firstProducerTotal = await rowTotal(firstProducerRow);
    await firstProducerRow.click();
    await page.waitForTimeout(300);
    check(`${label} · nivel 2: total = fila elegida`, near(await drawerTotal(), firstProducerTotal), `${firstProducerTotal}`);
    check(`${label} · ruta con 1 nivel anterior`, (await crumbs()) === 1);
    const producerLevelTotal = await drawerTotal();

    // Nivel 2 → por suerte → nivel 3 → líneas → ficha
    await tab('Por suerte');
    check(`${label} · Por suerte: suma de grupos = total del nivel`, near(await footerTotal(), producerLevelTotal));
    await drawer.locator('tbody tr').first().click();
    await page.waitForTimeout(300);
    check(`${label} · nivel 3 abierto (ruta de 2)`, (await crumbs()) === 2);
    await tab('Líneas');
    check(`${label} · Líneas: suma = total del nivel`, near(await footerTotal(), await drawerTotal()));
    const factColumn = (await drawer.locator('thead th').allInnerTexts()).findIndex((text) => /^p\.fact/i.test(text.trim()));
    const firstLineFact = (await drawer.locator('tbody tr').first().locator('td').nth(factColumn).innerText()).trim();
    await drawer.locator('.drill-search input').fill(firstLineFact);
    await page.waitForTimeout(300);
    const searchNote = await drawer.locator('.drill-note').first().innerText();
    check(`${label} · búsqueda de líneas informa el total de la búsqueda`, /total de la búsqueda/.test(searchNote));
    await drawer.locator('tbody tr').first().click();
    await page.waitForTimeout(300);
    const ficha = await drawer.locator('.drill-fields').innerText();
    check(`${label} · ficha de línea con archivo, hoja y fila`, /archivo/i.test(ficha) && /REPORTE!\d+/.test(ficha));
    if (shots) await page.screenshot({ path: path.join(shots, `${label}-2-ficha.png`) });

    // Volver tres veces y salto por ruta
    await drawer.locator('.drill-back').click();
    await drawer.locator('.drill-back').click();
    check(`${label} · Volver regresa al nivel del productor`, near(await drawerTotal(), producerLevelTotal));
    await drawer.locator('.drill-crumbs button').first().click();
    await page.waitForTimeout(200);
    check(`${label} · la ruta salta al nivel inicial`, (await crumbs()) === 0 && near(await drawerTotal(), kpiTotal));
    await drawer.locator('button[aria-label="Cerrar detalle"]').click();
    await page.waitForTimeout(200);
    check(
      `${label} · al cerrar se conservan filtros y KPI`,
      (await drawer.count()) === 0 &&
        (await select('Universo').inputValue()) === 'CONCILIABLE' &&
        near(money(await kpi.locator('strong').innerText()), kpiTotal),
    );

    // Aplicar como filtro (productor) y deshacer
    await kpi.click();
    await tab('Por productor');
    const producerName = (await drawer.locator('tbody tr').first().locator('td').first().innerText()).trim();
    await drawer.locator('tbody tr').first().click();
    await page.waitForTimeout(300);
    const selectionTotal = await drawerTotal();
    const apply = drawer.locator('button', { hasText: 'Aplicar como filtro' });
    check(`${label} · Aplicar como filtro disponible para un productor`, await apply.isEnabled());
    await apply.click();
    await page.waitForTimeout(400);
    check(
      `${label} · filtro aplicado: productor y KPI = total de la selección`,
      (await select('Productor').inputValue()) === producerName &&
        near(money(await kpi.locator('strong').innerText()), selectionTotal),
      producerName,
    );
    await page.locator('.drill-undo').click();
    await page.waitForTimeout(400);
    check(
      `${label} · Deshacer restaura los filtros anteriores`,
      (await select('Productor').inputValue()) === 'all' && near(money(await kpi.locator('strong').innerText()), kpiTotal),
    );
    // Selección sin filtro equivalente (suerte)
    await kpi.click();
    await tab('Por suerte');
    await drawer.locator('tbody tr').first().click();
    await page.waitForTimeout(300);
    check(
      `${label} · suerte: Aplicar como filtro deshabilitado con motivo`,
      !(await drawer.locator('button', { hasText: 'Aplicar como filtro' }).isEnabled()) &&
        /no tiene un filtro equivalente/.test(await drawer.locator('#drill-apply-reason').innerText()),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check(`${label} · Escape cierra el detalle`, (await drawer.count()) === 0);

    // Repeticiones con evidencia (sin filtros)
    await page.locator('.exec-reset', { hasText: 'Restablecer' }).click();
    await page.waitForTimeout(400);
    await page.locator('.finance-duplicates button', { hasText: 'Ver grupos' }).click();
    await drawer.waitFor();
    const listText = await drawer.innerText();
    check(
      `${label} · repeticiones: 16 duplicados exactos y 2 en otra prefactura`,
      /16 grupo\(s\)/.test(listText) && /2 grupo\(s\)/.test(listText),
    );
    await drawer.locator('.drill-tabs button', { hasText: 'Mismo cobro en otra prefactura' }).click();
    await drawer.locator('tbody tr').first().click();
    await page.waitForTimeout(300);
    const groupText = await drawer.innerText();
    check(
      `${label} · grupo: registros, evidencia e interpretación separados, sin calificar el caso`,
      /1 · Registros repetidos en Prefactura/.test(groupText) &&
        /2 · Evidencia disponible: Nómina/.test(groupText) &&
        /3 · Interpretación/.test(groupText) &&
        /no califica este grupo/.test(groupText) &&
        !/doble cobro/i.test(groupText),
    );
    await drawer.locator('button[aria-label="Cerrar detalle"]').click();

    // Calidad de datos: todos los registros
    await nav('Actualizar archivos');
    const tariffItem = page.locator('.quality-item', { hasText: 'Tarifas poco frecuentes' });
    await tariffItem.locator('summary').click();
    const expected = Number((await tariffItem.locator('summary b').innerText()).replace(/\D/g, ''));
    await tariffItem.locator('button', { hasText: 'Ver todos los registros' }).click();
    await drawer.waitFor();
    const pager = drawer.locator('.pagination span');
    const totalRows = (await pager.count())
      ? Number((await pager.innerText()).match(/([\d.,]+) filas/)[1].replace(/\D/g, ''))
      : await drawer.locator('tbody tr').count();
    check(`${label} · Calidad: todos los registros (${expected})`, totalRows === expected, `${totalRows}`);
    await drawer.locator('tbody tr').first().click();
    await page.waitForTimeout(300);
    check(`${label} · Calidad: ficha de origen`, /REPORTE!\d+/.test(await drawer.locator('.drill-fields').innerText()));
    if (shots) await page.screenshot({ path: path.join(shots, `${label}-3-calidad.png`) });
    await drawer.locator('button[aria-label="Cerrar detalle"]').click();

    // Alerta con filas descartadas al importar: solo se conservan 20 ejemplos y no se promete «Ver todos»
    if (label === 'escritorio') {
      const book = read(await readFile(path.join(datos, 'Nomina_2026.xlsx')));
      const sheet = book.Sheets.REPORTE;
      const range = utils.decode_range(sheet['!ref']);
      const fecha = [...Array(range.e.c + 1).keys()].find((c) => sheet[utils.encode_cell({ r: 0, c })]?.v === 'Fecha');
      for (let r = 1; r <= 25; r += 1) delete sheet[utils.encode_cell({ r, c: fecha })];
      await page
        .locator('.file-card', { hasText: 'Nómina' })
        .first()
        .locator('input[type=file]')
        .setInputFiles({
          name: 'Nomina_25_sin_fecha.xlsx',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from(write(book, { type: 'buffer', bookType: 'xlsx' })),
        });
      const review = page.locator('.drawer', { hasText: 'Comprobación antes de reemplazar' });
      await review.waitFor({ timeout: 60000 });
      await review.locator('input[type=checkbox]').check();
      await review.locator('button', { hasText: 'Confirmar actualización' }).click();
      await review.waitFor({ state: 'detached', timeout: 60000 });
      const skipped = page.locator('.quality-item', { hasText: 'Nómina: 25 fila(s) no utilizables' });
      await skipped.locator('summary').click();
      const button = skipped.locator('.quality-actions button');
      check(
        `${label} · Calidad: filas descartadas sin prometer «Ver todos»`,
        (await button.innerText()).trim() === 'Ver ejemplos conservados (20 de 25)',
        await button.innerText(),
      );
      await button.click();
      await drawer.waitFor();
      check(
        `${label} · Calidad: el detalle aclara que solo hay ejemplos`,
        /Solo hay 20 ejemplo\(s\) de los 25 registros/.test(await drawer.innerText()) &&
          (await drawer.locator('tbody tr').count()) === 20,
      );
      await drawer.locator('button[aria-label="Cerrar detalle"]').click();
    }

    const db = await readDb(page);
    check(`${label} · IndexedDB sin cambios de esquema`, db.version === 10 && db.stores.join(',') === 'audit,closures,values');
    check(`${label} · sin errores de página`, !errors.length, errors.slice(0, 3).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
// 27 comprobaciones en escritorio y 27 en móvil. Menos significa que la prueba no terminó.
if (failed.length || results.length < 54) process.exitCode = 1;
