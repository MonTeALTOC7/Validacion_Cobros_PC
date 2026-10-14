// Copia el build (app/dist) a la raíz del repositorio, que es lo que publica GitHub Pages.
// - Sustituye assets/, index.html, sw.js, registerSW.js, workbox-*.js, manifest e iconos.
// - No toca datos/ ni ningún otro archivo de la raíz.
// Publicar = fusionar a main (requiere autorización expresa).
import { cp, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(appDir, 'dist');
const root = path.resolve(appDir, '..');

await stat(path.join(dist, 'index.html')).catch(() => {
  throw new Error('No existe app/dist/index.html. Ejecute primero npm run build.');
});

await rm(path.join(root, 'assets'), { recursive: true, force: true });
for (const name of await readdir(root)) {
  if (/^workbox-[\w-]+\.js$/.test(name)) await rm(path.join(root, name));
}
const copied = [];
for (const name of await readdir(dist)) {
  await cp(path.join(dist, name), path.join(root, name), { recursive: true });
  copied.push(name);
}
console.log('Publicado en la raíz del repositorio:', copied.join(', '));
