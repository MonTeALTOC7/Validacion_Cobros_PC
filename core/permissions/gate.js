/* ============================================================
   gate.js — Desbloqueo del área privada (Conciliación).
   ------------------------------------------------------------
   AVISO DE SEGURIDAD (documentado en ARCHITECTURE.md §5.4):
   Este gate evita el acceso ACCIDENTAL al área privada desde el
   uso normal. NO es seguridad criptográfica: el código del
   cliente es público. La separación REAL de datos económicos se
   implementa en Fase 8+ con Supabase Auth + RLS (el dato privado
   deja de descargarse al cliente público).
   Por eso aquí NO se guarda ningún dato económico; solo un flag
   de sesión de desbloqueo, que se borra al cerrar/pantalla.
   ============================================================ */

import * as store from '../storage/storage.js';

/* PIN por defecto de la Fase 1 (placeholder). El propietario lo
   cambia en Centro Maestro. Se guarda como hash simple solo para
   no dejarlo en texto plano; NO es protección fuerte. */
const DEFAULT_PIN = '2016'; // referencia mnemónica: Sucuya=16, año base
const PIN_KEY = 'private_pin_hash';
const SESSION_FLAG = 'private_unlocked';

/* Hash no-criptográfico (djb2). Suficiente para no dejar el PIN
   en claro; sustituible por WebCrypto cuando haya backend. */
function weakHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function currentPinHash() {
  return store.get(PIN_KEY, weakHash(DEFAULT_PIN));
}

/** ¿El área privada está desbloqueada en esta sesión? */
export function isUnlocked() {
  return sessionStorage.getItem(store.NAMESPACE + SESSION_FLAG) === '1';
}

/** Intenta desbloquear con un PIN. Devuelve true si es correcto. */
export function unlock(pin) {
  const ok = weakHash(String(pin)) === currentPinHash();
  if (ok) sessionStorage.setItem(store.NAMESPACE + SESSION_FLAG, '1');
  return ok;
}

/** Bloquea de nuevo el área privada. */
export function lock() {
  sessionStorage.removeItem(store.NAMESPACE + SESSION_FLAG);
}

/** Cambia el PIN (desde Centro Maestro). */
export function setPin(newPin) {
  store.set(PIN_KEY, weakHash(String(newPin)));
}

/* ============================================================
   Gate de CENTRO MAESTRO (barrera de interfaz separada).
   Contraseña fija: solo evita accesos accidentales de otros
   usuarios. Repositorio público aceptado; no es seguridad real.
   ============================================================ */
const CENTRO_PASS = '15102171011';
const CENTRO_FLAG = 'centro_unlocked';

/** ¿Centro Maestro desbloqueado en esta sesión? */
export function isCentroUnlocked() {
  return sessionStorage.getItem(store.NAMESPACE + CENTRO_FLAG) === '1';
}

/** Intenta desbloquear Centro Maestro. */
export function centroUnlock(pass) {
  const ok = String(pass) === CENTRO_PASS;
  if (ok) sessionStorage.setItem(store.NAMESPACE + CENTRO_FLAG, '1');
  return ok;
}

/** Bloquea de nuevo Centro Maestro. */
export function centroLock() {
  sessionStorage.removeItem(store.NAMESPACE + CENTRO_FLAG);
}
