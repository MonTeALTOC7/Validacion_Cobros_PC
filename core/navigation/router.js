/* ============================================================
   router.js — Router mínimo basado en hash (#/ruta).
   Se usa hash (no History API) porque GitHub Pages sirve archivos
   estáticos: así no hacen falta reglas de reescritura en el
   servidor y los enlaces profundos funcionan siempre.
   Rutas del shell:
     #/                     home
     #/modulo/:id           abre un módulo en iframe
     #/centro-maestro       panel de administración
     #/privado              área privada (requiere desbloqueo)
   ============================================================ */

const handlers = new Set();

/** Parsea el hash actual en { name, param }. */
export function current() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean); // ['modulo','tch']
  if (parts.length === 0) return { name: 'home', param: null };
  if (parts[0] === 'modulo') return { name: 'modulo', param: parts[1] || null };
  if (parts[0] === 'centro-maestro') return { name: 'centro-maestro', param: null };
  if (parts[0] === 'privado') return { name: 'privado', param: parts[1] || null };
  return { name: 'home', param: null };
}

/** Navega a una ruta. */
export function go(path) {
  if (location.hash === '#' + path) { emit(); return; }
  location.hash = path;
}

/** Vuelve al home. */
export function home() { go('/'); }

/** Suscribe un callback a cambios de ruta. */
export function onChange(cb) {
  handlers.add(cb);
  return () => handlers.delete(cb);
}

function emit() {
  const route = current();
  handlers.forEach((cb) => { try { cb(route); } catch (e) { console.error(e); } });
}

window.addEventListener('hashchange', emit);

/** Arranca el router (emite la ruta inicial). */
export function start() { emit(); }
