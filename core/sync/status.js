/* ============================================================
   status.js — Estado del sistema (online/offline, almacenamiento).
   No sincroniza datos de módulos; solo reporta estado para el
   header y el Centro Maestro. La sincronización real de cada
   módulo (p. ej. Supabase de Inventario) vive dentro del módulo.
   ============================================================ */

const listeners = new Set();

/** ¿Hay conexión de red? */
export function isOnline() {
  return navigator.onLine;
}

/** Suscribe un callback a cambios de conectividad. Devuelve función para desuscribir. */
export function onConnectivityChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  const online = navigator.onLine;
  listeners.forEach((cb) => { try { cb(online); } catch { /* noop */ } });
}
window.addEventListener('online', emit);
window.addEventListener('offline', emit);

/** Estimación de almacenamiento del origen (todas las apps del origen). */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return {
      usage, quota,
      usageMB: (usage / 1048576).toFixed(1),
      quotaMB: (quota / 1048576).toFixed(0),
      pct: quota ? Math.min(100, Math.round((usage / quota) * 100)) : 0,
    };
  } catch {
    return null;
  }
}

/** Lista los CacheStorage presentes en el origen (diagnóstico). */
export async function listCaches() {
  if (!('caches' in window)) return [];
  try { return await caches.keys(); } catch { return []; }
}
