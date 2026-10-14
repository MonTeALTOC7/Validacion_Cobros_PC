// Comprueba el resultado de `npm run release` (copia de app/dist a la raíz que publica GitHub Pages):
// - cada archivo de app/dist está en la raíz con el mismo contenido;
// - la raíz no conserva bundles viejos en assets/ ni workbox-*.js huérfanos;
// - index.html y sw.js solo referencian archivos existentes;
// - los archivos estáticos y los datos publicados (datos/ y sus manifiestos) siguen presentes.
// Uso: node scripts/verify-release.mjs
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(appDir, 'dist');
const root = path.resolve(appDir, '..');
const failures = [];
const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );
const walk = async (dir, base = dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
};

const distFiles = await walk(dist);
for (const file of distFiles) {
  const target = path.join(root, file);
  if (!(await exists(target))) failures.push(`falta en la raíz: ${file}`);
  else if (!(await readFile(target)).equals(await readFile(path.join(dist, file))))
    failures.push(`distinto de app/dist: ${file}`);
}

const distAssets = new Set(await readdir(path.join(dist, 'assets')));
for (const name of await readdir(path.join(root, 'assets')))
  if (!distAssets.has(name)) failures.push(`asset sobrante en la raíz: assets/${name}`);
for (const name of await readdir(root))
  if (/^workbox-[\w-]+\.js$/.test(name) && !distFiles.includes(name)) failures.push(`workbox huérfano: ${name}`);

const html = await readFile(path.join(root, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g))
  if (!(await exists(path.join(root, ref)))) failures.push(`index.html referencia un archivo inexistente: ${ref}`);
const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
for (const [, ref] of sw.matchAll(/url:"([^"]+)"/g))
  if (!(await exists(path.join(root, ref)))) failures.push(`sw.js precarga un archivo inexistente: ${ref}`);

for (const required of ['casur-logo.png', 'casur-mark.svg', 'icon.svg', 'manifest.webmanifest', 'registerSW.js', 'sw.js'])
  if (!(await exists(path.join(root, required)))) failures.push(`falta archivo estático: ${required}`);
for (const manifest of ['manifest.json', 'revision-manifest.json']) {
  const file = path.join(root, 'datos', manifest);
  if (!(await exists(file))) {
    failures.push(`falta datos/${manifest}`);
    continue;
  }
  const json = JSON.parse(await readFile(file, 'utf8'));
  const listed = [...(json.files ?? []).map((entry) => entry.path), json.file?.path].filter(Boolean);
  for (const data of listed)
    if (!(await exists(path.join(root, 'datos', data))))
      failures.push(`datos/${manifest} referencia un archivo inexistente: ${data}`);
}

console.log(`Release: ${distFiles.length} archivos de app/dist comprobados en la raíz.`);
if (failures.length) {
  failures.forEach((failure) => console.error('FALLA · ' + failure));
  process.exitCode = 1;
} else console.log('La raíz coincide con el build y conserva datos/ y archivos estáticos.');
