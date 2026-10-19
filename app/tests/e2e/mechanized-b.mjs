import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { serve, launch } from './harness.mjs';
import { hm, program } from '../fixtures/mechanized-b.js';
const { utils, write } = createRequire(import.meta.url)('xlsx');
const book = utils.book_new();
utils.book_append_sheet(
  book,
  utils.aoa_to_sheet([
    [
      'Semana',
      'Fecha',
      'Hda',
      'Nombre Hacienda',
      'Ste',
      'Labor',
      'Servicio SAP',
      'Unidades',
      'UM',
      'P.FACT',
      'Contratista',
      'Nombre Productor',
      'Total',
      'Tarifa',
    ],
    [
      39,
      '01/10/2026',
      '900',
      'FINCA DEMOSTRACIÓN',
      '02A',
      'MEC',
      '102207SL',
      5.97,
      'HA',
      'PF-DEMO-1',
      'CS9999',
      'PRODUCTOR SINTÉTICO',
      597,
      100,
    ],
    [
      39,
      '01/10/2026',
      '900',
      'FINCA DEMOSTRACIÓN',
      '03A',
      'MEC',
      '102207SL',
      2,
      'HA',
      'PF-DEMO-2',
      'CS9999',
      'PRODUCTOR SINTÉTICO',
      200,
      100,
    ],
    [
      39,
      '01/10/2026',
      '900',
      'FINCA DEMOSTRACIÓN',
      '20',
      'MEC',
      '102207SL',
      2,
      'HA',
      'PF-DEMO-3',
      'CS9999',
      'PRODUCTOR SINTÉTICO',
      200,
      100,
    ],
    [
      39,
      '01/10/2026',
      '900',
      'FINCA DEMOSTRACIÓN',
      '21',
      'ZGC',
      '10005',
      2,
      'HA',
      'PF-DEMO-4',
      'CS9999',
      'PRODUCTOR SINTÉTICO',
      200,
      100,
    ],
  ]),
  'REPORTE',
);
const bytes = write(book, { bookType: 'xlsx', type: 'buffer' });
const shots = path.resolve(process.env.MECHANIZED_B_SHOTS || '../docs/mecanizadas-etapa-b');
await mkdir(shots, { recursive: true });
const { server, origin } = await serve({ '/app/': path.resolve('dist') });
const browser = await launch();
try {
  for (const [device, viewport] of [
    ['pc', { width: 1440, height: 1000 }],
    ['movil', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (!url.startsWith(origin)) return route.abort();
      if (url.includes('/datos/')) return route.fulfill({ status: 404, body: '' });
      return route.continue();
    });
    // Construct the actual Stage A IndexedDB v1 (native IDB version 10 in Dexie).
    await page.goto(`${origin}/app/manifest.webmanifest`);
    await page.evaluate(
      async ({ hm, program }) => {
        await new Promise((resolve, reject) => {
          const request = indexedDB.open('casur-mechanized-stage-a', 10);
          request.onupgradeneeded = () => request.result.createObjectStore('sources', { keyPath: 'kind' });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('sources', 'readwrite');
            tx.objectStore('sources').put({
              kind: 'hm',
              data: {
                name: 'hm-demo.xlsx',
                rows: [
                  hm,
                  { ...hm, document: 'HM-DEMO-2', suerte: '03A', labor: 'FTS' },
                  { ...hm, document: 'HM-DEMO-3', suerte: '04A', unit: 'KM', labor: 'ALC' },
                ],
              },
            });
            tx.objectStore('sources').put({
              kind: 'program',
              data: {
                name: 'program-demo.xlsx',
                rows: [
                  program,
                  { ...program, product: 'P-DEMO-B', productName: 'PRODUCTO SINTÉTICO B' },
                  { ...program, document: 'PR-DEMO-NO', suerte: '10', executed: 'NO', suspended: '1' },
                  { ...program, document: 'PR-DEMO-SI', suerte: '11' },
                ],
              },
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      { hm, program },
    );
    await page.goto(`${origin}/app/`);
    const navigate = async () => {
      if (device === 'movil') await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
      await page.getByRole('button', { name: 'Cobros mecanizados', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.sidebar').classList.contains('sidebar-open'));
    };
    await navigate();
    assert.equal(await page.locator('.sidebar nav button').nth(3).innerText(), 'Seguimiento de labores');
    await page.getByText('7 registros', { exact: true }).waitFor();
    await page.getByLabel('Archivo Prefactura', { exact: true }).setInputFiles({
      name: 'pf-demo.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bytes,
    });
    await page.getByRole('button', { name: 'Confirmar actualización' }).click();
    await page.getByText('11 registros', { exact: true }).waitFor();
    const board = page.getByRole('region', { name: 'Motor de conciliación' });
    await board.getByText('Reglas, cobertura y equivalencias candidatas', { exact: true }).click();
    await board.getByLabel('Alternativas candidatas', { exact: true }).fill('FTS=MEC');
    await board.getByLabel('Desde', { exact: true }).fill('2026-09-01');
    await board.getByLabel('Hasta', { exact: true }).fill('2026-10-31');
    await board.getByLabel('Zonas (coma; * todas)', { exact: true }).fill('5');
    await board
      .getByLabel('Referencia que acredita cobertura', { exact: true })
      .fill('Declaración sintética de cobertura completa de Zona 5');
    await board.getByRole('button', { name: 'Aplicar reglas', exact: true }).click();
    await board.getByText('Reglas guardadas; las decisiones afectadas requieren nueva revisión.', { exact: true }).waitFor();
    await board.getByText('Reglas, cobertura y equivalencias candidatas', { exact: true }).click();
    assert.match(await board.innerText(), /Coincidencia documental fuerte/);
    assert.match(await board.innerText(), /Coincidencia candidata/);
    assert.match(await board.innerText(), /Sin Prefactura localizada/);
    assert.match(await board.innerText(), /Programada no ejecutada/);
    assert.match(await board.innerText(), /Prefactura excluida por clasificación/);
    await board.getByRole('button', { name: /Prefacturados confirmados manualmente/ }).click();
    assert.equal(await board.locator('.mec-cases tbody tr').count(), 0);
    await board.getByRole('button', { name: 'Mostrar todos los casos', exact: true }).click();
    await board.getByLabel('Zona', { exact: true }).fill('5');
    assert.equal(await board.locator('.mec-cases tbody tr').count(), 5);
    await board.getByLabel('Zona', { exact: true }).fill('05');
    assert.equal(await board.locator('.mec-cases tbody tr').count(), 5);
    await board.getByRole('button', { name: 'Mostrar todos los casos', exact: true }).click();
    const openFirst = async () => board.getByRole('button', { name: /Revisar HM.*HM-DEMO-1/ }).click();
    await openFirst();
    const drawer = page.getByRole('dialog', { name: 'Conciliación documental' });
    await drawer.getByRole('checkbox', { name: /Vincular Prefactura.*PF-DEMO-1/ }).check();
    await drawer.getByRole('checkbox', { name: /Vincular Programación.*PR-DEMO-1/ }).check();
    await drawer.getByLabel('Decisión manual', { exact: true }).selectOption('confirmed');
    await drawer
      .getByLabel('Observación de revisión', { exact: true })
      .fill('Revisión sintética: PF-DEMO-1 respalda HM-DEMO-1 y dos productos del mismo evento.');
    await drawer.getByRole('button', { name: 'Guardar decisión', exact: true }).click();
    await drawer.getByText(/Decisión: Prefacturado confirmado/).waitFor();
    await drawer.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(shots, `${device}-evidencia.png`) });
    await drawer.getByRole('heading', { name: 'Registrar revisión', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, `${device}-decision.png`) });
    await page.keyboard.press('Escape');
    assert.equal(await drawer.count(), 0);
    await page.reload();
    await navigate();
    await board.getByText(/Respaldo confirmado vigente: C\$ 597/).waitFor();
    const downloadEvent = page.waitForEvent('download');
    await board.getByRole('button', { name: 'Exportar decisiones e historial' }).click();
    const downloaded = await downloadEvent;
    const backupBytes = await readFile(await downloaded.path());
    const backup = JSON.parse(backupBytes);
    assert.equal(backup.reviews.length, 1);
    assert.equal(backup.reviews[0].history.length, 1);
    const storage = await page.evaluate(
      async () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('casur-mechanized-stage-a');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(['sources', 'reviews', 'evidence', 'cases'], 'readwrite');
            const sourceCount = tx.objectStore('sources').count(),
              caseCount = tx.objectStore('cases').count();
            tx.objectStore('reviews').clear();
            tx.oncomplete = () => {
              resolve({ version: db.version, sources: sourceCount.result, cases: caseCount.result });
              db.close();
            };
          };
        }),
    );
    assert.equal(storage.version, 20);
    assert.equal(storage.sources, 2);
    assert.ok(storage.cases >= 6);
    await page.reload();
    await navigate();
    const restore = async (buffer) =>
      board
        .getByLabel('Restaurar respaldo local', { exact: true })
        .setInputFiles({ name: 'decisiones-demo.json', mimeType: 'application/json', buffer });
    await restore(backupBytes);
    await board.getByText('1 decisiones restauradas; duplicados idénticos omitidos.', { exact: true }).waitFor();
    await restore(backupBytes);
    await board.getByText('0 decisiones restauradas; duplicados idénticos omitidos.', { exact: true }).waitFor();
    const conflict = structuredClone(backup);
    conflict.reviews[0].notes = 'Conflicto sintético';
    conflict.reviews[0].history[0].notes = 'Conflicto sintético';
    await restore(Buffer.from(JSON.stringify(conflict)));
    await board.getByRole('alert').filter({ hasText: 'Conflicto' }).waitFor();
    await restore(Buffer.from('{"format":"incorrecto"}'));
    await board.getByRole('alert').filter({ hasText: 'inválido' }).waitFor();
    // A replacement import changes quantity while preserving documentary identity.
    await page.evaluate(
      async () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('casur-mechanized-stage-a');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result,
              tx = db.transaction('sources', 'readwrite'),
              store = tx.objectStore('sources'),
              get = store.get('hm');
            get.onsuccess = () => {
              const data = get.result;
              data.data.rows[0].units = 4;
              store.put(data);
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await navigate();
    await board.getByText('Requiere nueva revisión', { exact: true }).waitFor();
    await board.getByText(/Respaldo confirmado vigente: C\$ 0/).waitFor();
    await openFirst();
    await drawer.getByLabel('Decisión manual', { exact: true }).selectOption('reopened');
    await drawer
      .getByLabel('Observación de revisión', { exact: true })
      .fill('Cambio de cantidad detectado; reapertura para revisión.');
    await drawer.getByRole('button', { name: 'Guardar decisión', exact: true }).click();
    await drawer.getByText(/Decisión: Reabierto/).waitFor();
    assert.equal(await drawer.locator(':scope > details').count(), 2);
    await page.keyboard.press('Escape');
    await board.scrollIntoViewIfNeeded();
    const notice = page.getByRole('button', { name: 'Cerrar aviso', exact: true });
    if (await notice.count()) await notice.click();
    await page.evaluate(() => document.querySelector('.mec-reconciliation').scrollIntoView({ block: 'start' }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(shots, `${device}.png`) });
    const legacyVersion = await page.evaluate(
      async () =>
        new Promise((resolve) => {
          const r = indexedDB.open('conciliador-casur');
          r.onsuccess = () => {
            resolve(r.result.version);
            r.result.close();
          };
        }),
    );
    assert.equal(legacyVersion, 10);
    assert.deepEqual(errors, []);
    console.log(
      `OK ${device}: migración A→B, cobertura, sugerencias, filtros, selección exacta, confirmación, recarga, respaldo/restauración, conflictos, cambio de evidencia, reapertura y esquema legacy intacto.`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
