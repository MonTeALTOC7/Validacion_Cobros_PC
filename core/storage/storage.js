/* ============================================================
   storage.js — Almacenamiento del SHELL con namespace propio.
   Regla de auditoría: nombres nuevos SIEMPRE con prefijo
   'casur_master_' para no colisionar con las bases de los módulos.
   Nunca lee ni escribe las bases de los módulos (idb de TCH,
   conciliador-casur, etc.). Solo estado del shell.
   ============================================================ */

const PREFIX = 'casur_master_';

/** Lee un valor JSON del shell. */
export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Guarda un valor JSON del shell. */
export function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Elimina una clave del shell. */
export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
}

/** Lista las claves del shell (sin el prefijo). */
export function keys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
  }
  return out;
}

export const NAMESPACE = PREFIX;
