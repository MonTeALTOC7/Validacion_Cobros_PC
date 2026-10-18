import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { serve, launch } from './harness.mjs';
import { programHeaders, programRows } from '../fixtures/programming.js';
const { utils, write } = createRequire(import.meta.url)('xlsx');
const workbook = utils.book_new();
const header = [
  'Fecha',
  'Hacienda',
  'Nombre Hacienda',
  'Suerte',
  'UM',
  'Labor',
  'Maquina',
  'Nro del Documento',
  'Labor',
  'Cant.',
  'Zona',
  'Semana',
];
const matrix = [
  header,
  ...Array.from({ length: 200 }, (_, i) => [
    '01/10/2026',
    '900',
    'FINCA DEMOSTRACIÓN',
    String(i + 1).padStart(2, '0'),
    i < 163 ? 'HR' : 'KM',
    i < 163 ? (i % 2 ? 'MEC' : 'FTS') : i < 194 ? 'ALC' : 'ALR',
    'T-01',
    `000${i}`,
    'Labor sintética',
    2,
    5,
    40,
  ]),
];
utils.book_append_sheet(workbook, utils.aoa_to_sheet(matrix), 'REPORTE');
const bytes = write(workbook, { bookType: 'xlsx', type: 'buffer' });
const { server, origin } = await serve({ '/app/': path.resolve('dist') });
const browser = await launch();
const shots = path.resolve(process.env.MECHANIZED_SHOTS || '../docs/mecanizadas-etapa-a');
await mkdir(shots, { recursive: true });
try {
  for (const [label, viewport] of [
    ['pc', { width: 1440, height: 1000 }],
    ['movil', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(origin) && url.includes('/datos/')) return route.fulfill({ status: 404, body: '' });
      if (!url.startsWith(origin)) return route.abort();
      return route.continue();
    });
    await page.goto(`${origin}/app/`);
    const navigate = async () => {
      if (label === 'movil') await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
      await page.getByRole('button', { name: 'Cobros mecanizados', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.sidebar').classList.contains('sidebar-open'));
      await page.evaluate(async () => {
        await Promise.all(
          document
            .querySelector('.sidebar')
            .getAnimations()
            .map((a) => a.finished),
        );
      });
    };
    assert.equal(await page.locator('.sidebar nav button').nth(3).innerText(), 'Seguimiento de labores');
    await navigate();
    await page.getByRole('button', { name: 'Importar Horas Máquina', exact: true }).click();
    await page.locator('.mec-import input[type=file]').setInputFiles({
      name: 'hm-sintetico.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bytes,
    });
    await page.getByRole('button', { name: 'Validar importación' }).click();
    await page.getByText('200 filas admitidas · 0 excluidas · 0 repeticiones exactas').waitFor();
    await page.getByRole('button', { name: 'Incorporar 200 registros' }).click();
    await page.getByText('200 registros', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    assert.equal(await page.locator('.mec-inbox tbody tr').count(), 50);
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    await page.getByLabel('Unidad de evidencia', { exact: true }).selectOption('KM');
    await page.getByText('37 registros', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ver evidencia HM fila 165', exact: true }).click();
    assert.match(await page.getByRole('dialog').innerText(), /2 KM/);
    assert.match(await page.getByRole('dialog').innerText(), /Zona\s+5/);
    assert.match(await page.getByRole('dialog').innerText(), /Semana\s+40/);
    await page.keyboard.press('Escape');
    await page.getByLabel('Unidad de evidencia', { exact: true }).selectOption('HR');
    await page.getByText('163 registros', { exact: true }).waitFor();
    await page.getByLabel('Unidad de evidencia', { exact: true }).selectOption('Todas');
    await page.getByRole('button', { name: 'Importar / pegar programación', exact: true }).click();
    await page.getByText('Pegar rango de Excel (TSV)', { exact: true }).click();
    await page.getByLabel('Rango de Excel', { exact: true }).fill('Finca\tLote\tTrabajo\tPeriodo\n900\t01\tMEC\tOctubre 2026');
    await page.getByRole('button', { name: 'Leer rango', exact: true }).click();
    const mapper = page.locator('.mec-mapping');
    await mapper.getByLabel('Código hacienda', { exact: true }).selectOption('0');
    await mapper.getByLabel('Suerte', { exact: true }).selectOption('1');
    await mapper.getByLabel('Código labor', { exact: true }).selectOption('2');
    await mapper.getByLabel('Período', { exact: true }).selectOption('3');
    await page.getByRole('button', { name: 'Validar importación' }).click();
    await page.getByRole('button', { name: 'Incorporar 1 registros' }).click();
    await page.getByText('201 registros', { exact: true }).waitFor();
    // Cancel and reject replacement without destroying either persisted source.
    await page.getByRole('button', { name: 'Importar Horas Máquina', exact: true }).click();
    await page.locator('.mec-import input[type=file]').setInputFiles({
      name: 'hm-replacement.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bytes,
    });
    await page.getByRole('button', { name: 'Validar importación' }).click();
    await page.getByRole('button', { name: 'Incorporar 200 registros' }).waitFor();
    await page
      .locator('.mec-import input[type=file]')
      .setInputFiles({ name: 'invalid.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
    await page.getByRole('button', { name: 'Validar importación' }).click();
    await page.locator('.mec-import [role=alert]').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Incorporar 200 registros' }).count(), 0);
    await page.getByRole('button', { name: 'Cerrar importación' }).click();
    await page.getByText('201 registros', { exact: true }).waitFor();
    // Replace programming TSV with Excel, keeping HM untouched.
    const programBook = utils.book_new();
    utils.book_append_sheet(
      programBook,
      utils.aoa_to_sheet([
        ['Finca', 'Lote', 'Trabajo', 'Periodo'],
        ['900', '02', 'MEC', 'Octubre 2026'],
      ]),
      'Plan',
    );
    await page.getByRole('button', { name: 'Importar / pegar programación', exact: true }).click();
    await page.locator('.mec-import input[type=file]').setInputFiles({
      name: 'programa-sintetico.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: write(programBook, { bookType: 'xlsx', type: 'buffer' }),
    });
    await mapper.getByLabel('Código hacienda', { exact: true }).selectOption('0');
    await mapper.getByLabel('Suerte', { exact: true }).selectOption('1');
    await mapper.getByLabel('Código labor', { exact: true }).selectOption('2');
    await mapper.getByLabel('Período', { exact: true }).selectOption('3');
    await page.getByRole('button', { name: 'Validar importación' }).click();
    await page.getByRole('button', { name: 'Incorporar 1 registros' }).click();
    await page.getByText('201 registros', { exact: true }).waitFor();
    await page.reload();
    await navigate();
    await page.getByText('201 registros', { exact: true }).waitFor();
    // Use the existing Prefactura uploader, then verify its adapter and persistence.
    const programTSV = [['Título sintético'], programHeaders, ...programRows].map((r) => r.join('\t')).join('\n');
    await page.getByRole('button', { name: 'Importar / pegar programación', exact: true }).click();
    await page.getByText('Pegar rango de Excel (TSV)', { exact: true }).click();
    await page.getByLabel('Rango de Excel', { exact: true }).fill(programTSV);
    await page.getByRole('button', { name: 'Leer rango', exact: true }).click();
    await page.getByRole('button', { name: 'Validar importación', exact: true }).click();
    await page.getByRole('button', { name: 'Incorporar 84 registros', exact: true }).click();
    const statuses = page.getByRole('region', { name: 'Estados de programación' });
    assert.match(await statuses.innerText(), /59 ejecutadas.*25 no ejecutadas/);
    assert.match(await statuses.innerText(), /22 suspendidas.*3 no suspendidas/);
    const fullProgram = utils.book_new();
    utils.book_append_sheet(fullProgram, utils.aoa_to_sheet([['Título sintético'], programHeaders, ...programRows]), 'Plan');
    await page.getByRole('button', { name: 'Importar / pegar programación', exact: true }).click();
    await page.locator('.mec-import input[type=file]').setInputFiles({
      name: 'plan-sintetico.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: write(fullProgram, { type: 'buffer', bookType: 'xlsx' }),
    });
    await page.getByRole('button', { name: 'Validar importación', exact: true }).click();
    await page.getByRole('button', { name: 'Incorporar 84 registros', exact: true }).click();
    await page.getByText('284 registros', { exact: true }).waitFor();
    const pfBook = utils.book_new();
    utils.book_append_sheet(
      pfBook,
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
          40,
          '01/10/2026',
          '900',
          'FINCA DEMOSTRACIÓN',
          '01',
          'MEC',
          '19001',
          3,
          'HA',
          '000789',
          'CS0001',
          'PRODUCTOR SINTÉTICO',
          300,
          100,
        ],
      ]),
      'REPORTE',
    );
    assert.match(await page.getByRole('region', { name: 'Disponibilidad Prefactura' }).innerText(), /no disponible/);
    await page.getByLabel('Archivo Prefactura', { exact: true }).setInputFiles({
      name: 'prefactura-sintetica.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: write(pfBook, { bookType: 'xlsx', type: 'buffer' }),
    });
    await page.getByRole('button', { name: 'Confirmar actualización' }).click();
    await page.getByText('285 registros', { exact: true }).waitFor();
    assert.match(await page.getByRole('region', { name: 'Disponibilidad Prefactura' }).innerText(), /en uso automático/);
    await page.locator('.mec-source').filter({ hasText: 'Líneas de Prefactura' }).click();
    await page.getByRole('button', { name: 'Ver evidencia Prefactura fila 2', exact: true }).click();
    assert.match(await page.getByRole('dialog').innerText(), /000789/);
    await page.keyboard.press('Escape');
    await page.reload();
    await navigate();
    await page.getByText('285 registros', { exact: true }).waitFor();
    assert.match(await page.getByRole('region', { name: 'Disponibilidad Prefactura' }).innerText(), /prefactura-sintetica.xlsx/);
    const notice = page.getByRole('button', { name: 'Cerrar aviso', exact: true });
    if (await notice.count()) await notice.click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(shots, `${label}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Ver evidencia HM fila 2', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /0000/);
    await page.screenshot({ path: path.join(shots, `${label}-evidencia.png`), fullPage: false });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.locator('.mec-source').filter({ hasText: 'Registros programados' }).click();
    await page.getByRole('button', { name: 'Ver evidencia Programación fila 3', exact: true }).click();
    const programInspector = await page.getByRole('dialog').innerText();
    assert.match(programInspector, /2026-02-23/);
    assert.match(programInspector, /2026-03-01/);
    assert.match(programInspector, /2026-03-04/);
    assert.match(programInspector, /59.7/);
    await page.screenshot({ path: path.join(shots, `${label}-programacion.png`), fullPage: false });
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log(
      `OK ${label}: importación Excel/TSV, exclusiones, paginación, persistencia, inspector, cuarta pestaña y ancho responsive`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
