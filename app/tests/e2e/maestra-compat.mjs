// Regresión comparativa: vista "Seguimiento de Labores" de la App Maestra (bundle 8b2-1-public) frente a la
// versión independiente, a nivel de datos y de interfaz.
//
// Uso: npx vite-node tests/e2e/maestra-compat.mjs -- --labores <Negocios_de_Cana_CASUR_APP/modules/labores> [--out informe.json]
//
// P0: seguimiento.json publicado hoy en la App Maestra (motor legacy, datos al 8 sep).
// P1: lo que publicaría el motor legacy 8b3-1-1 con los datos actuales (se intercepta la API de GitHub).
// P2: lo que publica el motor nuevo con los datos actuales (mismo mecanismo, desde la interfaz).
// Ninguna publicación sale a GitHub: las llamadas se responden localmente.
import path from 'node:path';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { serve, launch, openAndWait, readDb } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../..');
const args = process.argv.slice(2).filter((a) => a !== '--');
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const labores = arg('--labores');
if (!labores) throw new Error('Indique --labores <ruta a modules/labores de la App Maestra>.');
const datos = path.resolve(appDir, arg('--datos', '../datos'));
const outFile = arg('--out', null);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'OK ' : 'FALLA'} · ${name}${detail ? ' · ' + detail : ''}`);
};
const info = (name, detail) => console.log(`INFO · ${name} · ${detail}`);

// ---------------------------------------------------------------------------------------------
// Métricas de datos de un payload de Seguimiento

const round = (value) => Math.round(value * 100) / 100;
const metrics = (rows) => {
  const sum = (keyOf) => {
    const map = {};
    rows.forEach((row) => {
      const key = keyOf(row);
      map[key] = round((map[key] ?? 0) + row.units);
    });
    return map;
  };
  const count = (keyOf) => {
    const map = {};
    rows.forEach((row) => {
      const key = keyOf(row);
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  };
  return {
    rows: rows.length,
    producers: new Set(rows.map((row) => row.producer)).size,
    producerNames: [...new Set(rows.map((row) => row.producer))].sort(),
    byLaborUnit: sum((row) => `${row.classification === 'Mecanizada' ? 'MEC' : 'MAN'}|${row.labor}|${row.unit}`),
    // El payload legacy no trae `year`: la semana se compara sin año y el año se cuenta aparte.
    byWeekUnit: sum((row) => `S${String(row.week).padStart(2, '0')}|${row.unit}`),
    byYear: count((row) => row.year ?? 'sin año'),
    byFincaUnit: sum((row) => `${row.hacienda}|${row.unit}`),
    bySuerteUnit: sum((row) => `${row.hacienda}·${row.suerte}|${row.unit}`),
    byClassification: count((row) => row.classification),
    bySource: count((row) => row.source),
  };
};
const diffMaps = (a, b) => {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys
    .filter((key) => round(a[key] ?? 0) !== round(b[key] ?? 0))
    .map((key) => ({ key, antes: a[key] ?? 0, despues: b[key] ?? 0 }));
};
const compare = (label, a, b) => {
  const out = {};
  for (const dim of ['byYear', 'byLaborUnit', 'byWeekUnit', 'byFincaUnit', 'bySuerteUnit', 'byClassification', 'bySource'])
    out[dim] = diffMaps(a[dim], b[dim]);
  out.rows = [a.rows, b.rows];
  out.producers = [a.producers, b.producers];
  return out;
};

// ---------------------------------------------------------------------------------------------
// Interfaz de Seguimiento (mismo DOM en ambas versiones)

const scrapeTracking = async (page) => {
  const out = {};
  for (const workType of ['Manuales', 'Mecanizadas']) {
    await page.locator('.exec-switch button', { hasText: workType }).click();
    await page.waitForTimeout(400);
    await page.locator('.exec-local-nav button', { hasText: 'Resumen ejecutivo' }).click();
    await page.waitForTimeout(300);
    const hero = (await page.locator('.exec-reference-hero').innerText()).replace(/\s+/g, ' ').trim();
    const producers = (await page.locator('.exec-toolbar select').first().locator('option').count()) - 1;
    await page.locator('.exec-local-nav button', { hasText: 'Detalle por labor' }).click();
    await page.waitForTimeout(300);
    const more = page.locator('.exec-more', { hasText: 'combinaciones' });
    if (await more.count()) await more.click();
    await page.waitForTimeout(200);
    const cards = (await page.locator('.exec-labor-card').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim()).sort();
    out[workType] = { hero, producers, cards };
  }
  return out;
};

/** Aplica un productor y un rango de semanas y devuelve el texto del resumen. */
const scrapeFiltered = async (page, producer, from, to) => {
  await page.locator('.exec-switch button', { hasText: 'Manuales' }).click();
  await page.locator('.exec-local-nav button', { hasText: 'Resumen ejecutivo' }).click();
  const selects = page.locator('.exec-toolbar select');
  await selects.nth(0).selectOption({ label: producer });
  const pickWeek = async (index, week) => {
    const options = await selects.nth(index).locator('option').allInnerTexts();
    const label = options.find((text) => new RegExp(`^Semana ${week}\\b`).test(text.trim()));
    if (label) await selects.nth(index).selectOption({ label });
  };
  await pickWeek(1, from);
  await pickWeek(2, to);
  await page.waitForTimeout(400);
  const hero = (await page.locator('.exec-reference-hero').innerText()).replace(/\s+/g, ' ').trim();
  await page.locator('.exec-reset').first().click();
  return hero;
};

/** Separa una línea CSV con ";" respetando comillas. */
const splitCsv = (line) => {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === ';' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells;
};

const exportCsv = async (page, workType = 'Manuales') => {
  await page.locator('.exec-switch button', { hasText: workType }).click();
  await page.locator('.exec-local-nav button', { hasText: 'Detalle por labor' }).click();
  await page.waitForTimeout(300);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button', { hasText: 'Exportar detalle' }).click(),
  ]);
  const text = (await readFile(await download.path(), 'utf8')).replace(/^\uFEFF/, '');
  const lines = text.split(/\r\n/).filter(Boolean);
  const header = splitCsv(lines[0]);
  const records = lines.slice(1).map(splitCsv);
  const quantityIndex = header.indexOf('Cantidad');
  const quantity = records.reduce((total, cells) => total + Number(cells[quantityIndex]), 0);
  return { header, records, rows: records.length, quantity: round(quantity) };
};

/** Filas del CSV proyectadas a unas columnas (semana, fecha, finca, suerte, labor, UM, cantidad…), ordenadas. */
const projectCsv = (csv, columns) =>
  csv.records.map((cells) => columns.map((column) => cells[csv.header.indexOf(column)]).join('|')).sort();

/** Publicación interceptada: devuelve el payload que la app enviaría a GitHub. */
const capturePublish = async (page) => {
  let payload = null;
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(request.postData());
    payload = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    return route.fulfill({ status: 201, body: '{"content":{}}' });
  });
  await page.evaluate(() => localStorage.setItem('casur-gh-publish-token', 'token-de-prueba-sin-uso'));
  await page.locator('.sidebar nav button', { hasText: 'Actualizar archivos' }).click();
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: /^Publicar Seguimiento$/ }).click();
  for (let i = 0; i < 60 && !payload; i += 1) await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.removeItem('casur-gh-publish-token'));
  return payload;
};

// ---------------------------------------------------------------------------------------------

const work = await mkdtemp(path.join(tmpdir(), 'maestra-'));
const maestraActual = path.join(work, 'actual');
const maestraNueva = path.join(work, 'nueva');
await cp(labores, maestraActual, { recursive: true });
await cp(labores, maestraNueva, { recursive: true });
const p0 = JSON.parse(await readFile(path.join(labores, 'data/seguimiento.json'), 'utf8'));

const { server, origin } = await serve({
  '/legacy/datos/': datos,
  '/legacy/': path.join(appDir, 'tests/legacy'),
  '/app/datos/': datos,
  '/app/': path.join(appDir, 'dist'),
  '/maestra-actual/': maestraActual,
  '/maestra-nueva/': maestraNueva,
});
const browser = await launch();
const report = {
  generado: new Date().toISOString(),
  datos,
  p0: { generatedAt: p0.generatedAt, maxWeek: p0.maxWeek, count: p0.count },
};
try {
  // P1: motor legacy con datos actuales
  const legacy = await openAndWait(browser, `${origin}/legacy/index.html`);
  const p1 = await capturePublish(legacy.page);
  check('P1 capturado del motor legacy', p1?.rows?.length > 0, `${p1?.rows?.length} filas`);
  await legacy.context.close();

  // P2: motor nuevo con datos actuales (desde la interfaz), y la vista independiente
  const standalone = await openAndWait(browser, `${origin}/app/index.html`);
  const p2 = await capturePublish(standalone.page);
  check('P2 capturado del motor nuevo', p2?.rows?.length > 0, `${p2?.rows?.length} filas`);
  const { buildPublishedTracking } = await import('../../src/engine/published.js');
  const { upgradeInputs } = await import('../../src/engine/importers.js');
  const dbStandalone = await readDb(standalone.page);
  const nodePayload = buildPublishedTracking(
    upgradeInputs(dbStandalone.values.inputs),
    dbStandalone.values.parameters?.startDate ?? '2026-01-01',
  );
  check('P2 de la interfaz = buildPublishedTracking del motor', JSON.stringify(nodePayload.rows) === JSON.stringify(p2.rows));
  check(
    'P2 conserva los campos del formato publicado y no incluye montos/tarifas/P.FACT',
    p2.rows.every((row) => !('amount' in row) && !('tariff' in row) && !('pFact' in row)) &&
      Object.keys(p0.rows[0]).every((field) => field in p2.rows[0]),
  );
  await writeFile(path.join(maestraNueva, 'data/seguimiento.json'), JSON.stringify(p2));

  await standalone.page.locator('.sidebar nav button', { hasText: 'Seguimiento de labores' }).click();
  await standalone.page.waitForTimeout(800);
  const uiStandalone = await scrapeTracking(standalone.page);

  // Datos: P1 vs P2 (mismo insumo, distinto motor) y P0 vs P2 (hasta la semana publicada hoy)
  const m0 = metrics(p0.rows);
  const m1 = metrics(p1.rows);
  const m2 = metrics(p2.rows);
  report.motorLegacyVsNuevo = compare('P1→P2', m1, m2);
  report.productoresLegacy = m1.producerNames;
  report.productoresNuevo = m2.producerNames;
  const upTo = (rows, week) => rows.filter((row) => (row.year ?? 2026) === 2026 && row.week <= week && row.date >= '2026-01-01');
  report.publicadoHoyVsNuevo = compare(
    'P0→P2 (≤S' + p0.maxWeek + ')',
    metrics(upTo(p0.rows, p0.maxWeek)),
    metrics(upTo(p2.rows, p0.maxWeek)),
  );

  // Interfaz de la App Maestra con P0 (actual) y con P2 (nueva publicación)
  const maestraWithP2 = await browser.newContext({
    timezoneId: 'America/Managua',
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await maestraWithP2.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => (route.request().url().startsWith('http://127.0.0.1') ? route.continue() : route.abort()));
  await page.goto(`${origin}/maestra-nueva/index.html#tracking`);
  await page.waitForSelector('.exec-reference-hero', { timeout: 120000 });
  await page.waitForTimeout(1500);
  const uiMaestraP2 = await scrapeTracking(page);
  for (const workType of ['Manuales', 'Mecanizadas']) {
    check(
      `Interfaz ${workType}: resumen igual (App Maestra con P2 vs independiente)`,
      uiMaestraP2[workType].hero === uiStandalone[workType].hero,
      uiMaestraP2[workType].hero.slice(0, 120),
    );
    check(
      `Interfaz ${workType}: número de productores igual`,
      uiMaestraP2[workType].producers === uiStandalone[workType].producers,
      `${uiMaestraP2[workType].producers}`,
    );
    check(
      `Interfaz ${workType}: tarjetas por labor y UM iguales`,
      JSON.stringify(uiMaestraP2[workType].cards) === JSON.stringify(uiStandalone[workType].cards),
      `${uiMaestraP2[workType].cards.length} tarjetas`,
    );
  }
  // Filtros: primer productor + semanas 10–20
  const firstProducer = (await page.locator('.exec-toolbar select').first().locator('option').allInnerTexts())[1];
  const filteredMaestra = await scrapeFiltered(page, firstProducer, 10, 20);
  const filteredStandalone = await scrapeFiltered(standalone.page, firstProducer, 10, 20);
  check(
    `Filtros (productor ${firstProducer}, S10–S20) dan el mismo resumen`,
    filteredMaestra === filteredStandalone,
    filteredMaestra.slice(0, 100),
  );
  // Exportador: fila por fila (semana, fecha, finca, suerte, labor, UM, cantidad…) en las columnas de la App Maestra
  for (const workType of ['Manuales', 'Mecanizadas']) {
    const csvMaestra = await exportCsv(page, workType);
    const csvStandalone = await exportCsv(standalone.page, workType);
    check(
      `Exportador ${workType}: mismas filas y cantidad total`,
      csvMaestra.rows === csvStandalone.rows && csvMaestra.quantity === csvStandalone.quantity,
      `${csvMaestra.rows} filas · ${csvMaestra.quantity}`,
    );
    check(
      `Exportador ${workType}: columnas de la App Maestra contenidas en el nuevo`,
      csvMaestra.header.every((column) => csvStandalone.header.includes(column)),
      `nuevas: ${csvStandalone.header.filter((c) => !csvMaestra.header.includes(c)).join(', ')}`,
    );
    // Todas las columnas del CSV de la App Maestra. "Nota de edad" y "Fila" dependen de ageNote/sourceRow, que el
    // payload publica desde v0.8 (antes la App Maestra escribía la nota vacía y "REPORTE!undefined").
    const shared = csvMaestra.header;
    check(
      `Exportador ${workType}: mismo contenido fila por fila (${shared.length} columnas de la App Maestra)`,
      JSON.stringify(projectCsv(csvMaestra, shared)) === JSON.stringify(projectCsv(csvStandalone, shared)),
      shared.join(', '),
    );
    const rowsOf = (csv) => [...new Set(projectCsv(csv, ['Fila']).map((value) => value.replace(/\d+$/, 'n')))];
    info(
      `Exportador ${workType} · Fila`,
      `App Maestra ${rowsOf(csvMaestra).join(', ')} · independiente ${rowsOf(csvStandalone).join(', ')}`,
    );
    report[`csvColumnasDistintas${workType}`] = csvMaestra.header
      .filter(
        (column) => JSON.stringify(projectCsv(csvMaestra, [column])) !== JSON.stringify(projectCsv(csvStandalone, [column])),
      )
      .map((column) => {
        const a = projectCsv(csvMaestra, [column]);
        const b = projectCsv(csvStandalone, [column]);
        const index = a.findIndex((value, i) => value !== b[i]);
        return { column, maestra: a.slice(index, index + 3), independiente: b.slice(index, index + 3) };
      });
  }
  // Recarga
  await page.reload();
  await page.waitForSelector('.exec-reference-hero', { timeout: 120000 });
  await page.waitForTimeout(1500);
  const afterReload = await scrapeTracking(page);
  check('App Maestra: mismo resultado tras recargar', JSON.stringify(afterReload) === JSON.stringify(uiMaestraP2));
  check('App Maestra: sin errores de página', !errors.length, errors.slice(0, 2).join(' | '));
  await maestraWithP2.close();

  // App Maestra tal como está publicada hoy (P0)
  const actual = await browser.newContext({
    timezoneId: 'America/Managua',
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  const actualPage = await actual.newPage();
  await actualPage.route('**/*', (route) =>
    route.request().url().startsWith('http://127.0.0.1') ? route.continue() : route.abort(),
  );
  await actualPage.goto(`${origin}/maestra-actual/index.html#tracking`);
  await actualPage.waitForSelector('.exec-reference-hero', { timeout: 120000 });
  await actualPage.waitForTimeout(1500);
  report.uiMaestraActual = await scrapeTracking(actualPage);
  report.uiMaestraConP2 = uiMaestraP2;
  report.uiIndependiente = uiStandalone;
  await actual.close();

  // Persistencia: misma base (mismo origen) independiente → App Maestra → independiente
  await standalone.page.evaluate(
    () =>
      new Promise((res) => {
        const q = indexedDB.open('conciliador-casur');
        q.onsuccess = () => {
          const tx = q.result.transaction('closures', 'readwrite');
          tx.objectStore('closures').put({
            week: '2026-S10',
            period: '2026-S10',
            year: 2026,
            weekNumber: 10,
            status: 'CLOSED',
            closedAt: '2026-10-14T12:00:00Z',
            note: 'Cierre de prueba',
            fingerprint: 'x',
            history: [],
          });
          tx.oncomplete = () => res();
        };
      }),
  );
  const before = await readDb(standalone.page);
  await standalone.page.goto(`${origin}/maestra-nueva/index.html#tracking`);
  await standalone.page.waitForSelector('.exec-reference-hero', { timeout: 120000 });
  await standalone.page.waitForTimeout(1500);
  await standalone.page.goto(`${origin}/app/index.html`);
  await standalone.page.waitForTimeout(5000);
  const after = await readDb(standalone.page);
  check(
    'IndexedDB: la App Maestra no altera datos ni cierres de la independiente',
    after.values.inputs.payroll.length === before.values.inputs.payroll.length &&
      after.closures.some((c) => c.week === '2026-S10'),
  );
  check('IndexedDB: esquema v1 tras pasar por ambas', after.version === 10);
  await standalone.context.close();
} finally {
  await browser.close();
  server.close();
}

const summarize = (label, diff) => {
  info(label, `filas ${diff.rows.join(' → ')} · productores ${diff.producers.join(' → ')}`);
  for (const [dim, list] of Object.entries(diff)) {
    if (!Array.isArray(list) || dim === 'rows' || dim === 'producers') continue;
    info(
      `${label} · ${dim}`,
      list.length
        ? `${list.length} diferencias, p. ej. ${list
            .slice(0, 4)
            .map((d) => `${d.key}: ${d.antes}→${d.despues}`)
            .join(' · ')}`
        : 'sin diferencias',
    );
  }
};
summarize('Motor legacy → nuevo (mismos datos)', report.motorLegacyVsNuevo);
summarize('Publicado hoy → nuevo (hasta la semana publicada)', report.publicadoHoyVsNuevo);
if (outFile) await writeFile(outFile, JSON.stringify({ ...report, comprobaciones: results }, null, 2));
if (results.some((r) => !r.ok)) process.exitCode = 1;
