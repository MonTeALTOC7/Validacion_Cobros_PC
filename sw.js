/* ============================================================
   sw.js — ÚNICO Service Worker raíz de "Negocios de Caña CASUR".
   ------------------------------------------------------------
   REGLA CRÍTICA (auditoría C1/C2): jamás borrado ciego de cachés.
   Este SW SOLO administra cachés con su propio prefijo y una
   allowlist. Nunca toca las cachés de los módulos originales
   (estimador-tch-*, casur-riego-*, pansaco-inventario-*, etc.).
   Los Service Workers individuales de cada módulo quedan
   neutralizados dentro de la Maestra: aquí no se registran.
   ============================================================ */

const APP_VERSION = '1.0.0';
const MASTER_PREFIX = 'casur_master_';
const SHELL_CACHE = MASTER_PREFIX + 'shell_v' + APP_VERSION;
const DATA_CACHE  = MASTER_PREFIX + 'data_v' + APP_VERSION;

/* Cachés que este SW puede administrar/borrar. Nunca fuera de aquí. */
const OWNED = new Set([SHELL_CACHE, DATA_CACHE]);

/* App-shell: lo mínimo para arrancar offline. Los módulos se
   cachean bajo demanda (no se precachea el monolito de Producción). */
const SHELL_ASSETS = [
  './',
  './index.html',
  './404.html',
  './manifest.webmanifest',
  './app.js',
  './core/navigation/router.js',
  './core/module-registry/registry.js',
  './core/permissions/gate.js',
  './core/sync/status.js',
  './core/storage/storage.js',
  './core/versions/versions.js',
  './shared/components/icons.js',
  './shared/styles/tokens.css',
  './shared/styles/app.css',
  './shared/assets/icons/icon-192.png',
  './shared/assets/icons/icon-512.png',
  './shared/assets/icons/emblem-192.png',
  './shared/assets/icons/favicon-48.png',
  './shared/assets/brand/casur-logo.png',
];

/* ---------------- Install ---------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll falla si un archivo falta; usamos add individual tolerante.
    await Promise.all(SHELL_ASSETS.map((url) =>
      cache.add(url).catch((e) => console.warn('[SW] no cacheado:', url, e))
    ));
    // No hacemos skipWaiting automático: el shell avisa y el usuario decide.
  })());
});

/* ---------------- Activate ---------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        // SOLO cachés maestras viejas. Jamás cachés de módulos.
        .filter((k) => k.startsWith(MASTER_PREFIX) && !OWNED.has(k))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ---------------- Mensajes (actualización controlada) ---------------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------------- Fetch (estrategias por patrón) ---------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Supabase y APIs externas: passthrough, nunca cachear.
  if (url.hostname.endsWith('.supabase.co') || url.origin !== self.location.origin) {
    return; // deja pasar a la red tal cual
  }

  // 2) Navegaciones: network-first con fallback al index CORRECTO.
  //    Una navegación offline dentro de /modules/<id>/, /master/<id>/ o
  //    /private/<id>/ debe caer en el index.html de ESE módulo, no en el
  //    shell maestro. Así, cuando un módulo se cargue en iframe, offline
  //    no termina metiendo la App Maestra dentro de sí misma.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL_CACHE, navigationFallback(url)));
    return;
  }

  // 3) Datasets oficiales versionados: network-first + cache.
  if (url.pathname.includes('/master/data/')) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // 4) Assets hasheados de módulos (inmutables): cache-first.
  if (/\/modules\/.+\.[a-f0-9]{6,}\.(js|css|png|jpg|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  // 5) Shell y demás recursos propios: stale-while-revalidate ligero.
  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

/* ---------------- Fallback de navegación por scope ---------------- */
/* Devuelve el index.html que corresponde a la ruta navegada:
   - dentro de modules/<id>/ | master/<id>/ | private/<id>/  → index de ese módulo
   - en cualquier otro caso                                   → index del shell maestro
   Todo relativo al scope del SW, para funcionar bajo el subdirectorio
   de GitHub Pages sin asumir raíz '/'. */
function navigationFallback(url) {
  const scope = new URL(self.registration.scope).pathname; // p.ej. /Negocios_de_Cana_CASUR/
  let rel = url.pathname;
  if (rel.startsWith(scope)) rel = rel.slice(scope.length);
  const m = rel.match(/^(modules|master|private)\/([^/]+)\//);
  // 'master/data' son datasets versionados, no una sub-app: shell maestro.
  if (m && !(m[1] === 'master' && m[2] === 'data')) {
    return scope + m[1] + '/' + m[2] + '/index.html';
  }
  return scope + 'index.html';
}

/* ---------------- Estrategias ---------------- */
async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (fallbackUrl) {
      const fb = await cache.match(fallbackUrl);
      if (fb) return fb;
    }
    return new Response('Sin conexión y sin copia en caché.', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('Recurso no disponible offline.', { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) ||
    new Response('Sin conexión.', { status: 503 });
}
