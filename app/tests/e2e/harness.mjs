// Utilidades compartidas por las pruebas de navegador: servidor estático y captura de estado.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.webmanifest': 'application/manifest+json',
};

/** Sirve varios directorios bajo prefijos: { '/legacy/': dir, '/legacy/datos/': datosDir, ... } */
export async function serve(mounts) {
  const entries = Object.entries(mounts).sort((a, b) => b[0].length - a[0].length);
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const mount = entries.find(([prefix]) => url.startsWith(prefix));
    if (!mount) return res.writeHead(404).end();
    let file = path.join(mount[1], url.slice(mount[0].length) || 'index.html');
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  if (existsSync(base)) {
    const shell = readdirSync(base).find((d) => d.startsWith('chromium_headless_shell'));
    if (shell) return path.join(base, shell, 'chrome-linux', 'headless_shell');
  }
  throw new Error('Defina CHROME_PATH con la ruta de Chromium/headless_shell.');
}

export async function launch() {
  return chromium.launch({ executablePath: chromePath() });
}

/** Abre la app, espera a que la precarga deje un análisis en IndexedDB y devuelve el estado guardado. */
export async function openAndWait(browser, url, { viewport = { width: 1366, height: 900 }, blockRemote = true } = {}) {
  const context = await browser.newContext({ timezoneId: 'America/Managua', viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text()) && errors.push(m.text()));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (blockRemote && !u.startsWith('http://127.0.0.1')) return route.abort();
    return route.continue();
  });
  await page.goto(url);
  // Sondeo explícito: waitForFunction no espera de forma fiable a una promesa del predicado.
  const hasAnalysis = () =>
    page.evaluate(
      () =>
        new Promise((res) => {
          const q = indexedDB.open('conciliador-casur');
          q.onsuccess = () => {
            const db = q.result;
            if (!db.objectStoreNames.contains('values')) return res(false);
            const g = db.transaction('values').objectStore('values').getAllKeys();
            g.onsuccess = () => res(g.result.includes('analysis') && g.result.includes('inputs'));
            g.onerror = () => res(false);
          };
          q.onerror = () => res(false);
        }),
    );
  const deadline = Date.now() + 240000;
  while (!(await hasAnalysis())) {
    if (Date.now() > deadline) throw new Error('La aplicación no generó el análisis a tiempo: ' + url);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  return { context, page, errors };
}

export async function readDb(page) {
  return page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('conciliador-casur');
      q.onsuccess = () => r(q.result);
    });
    const all = (s) =>
      new Promise((r) => {
        const g = db.transaction(s).objectStore(s).getAll();
        g.onsuccess = () => r(g.result);
      });
    const values = Object.fromEntries((await all('values')).map((v) => [v.key, v.value]));
    return {
      version: db.version,
      stores: [...db.objectStoreNames],
      values,
      audit: await all('audit'),
      closures: await all('closures'),
    };
  });
}

/** Navega por cada pestaña del menú lateral y devuelve su texto visible. */
export async function tabTexts(page, labels) {
  const out = {};
  for (const label of labels) {
    const button = page.locator('.sidebar nav button', { hasText: label }).first();
    if (!(await button.count())) {
      out[label] = null;
      continue;
    }
    await button.click();
    await page.waitForTimeout(700);
    out[label] = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
  }
  return out;
}
