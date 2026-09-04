/* ============================================================
   registry.js — Registro central de módulos.
   La UI del home y del Centro Maestro se genera desde aquí:
   para añadir un módulo nuevo en el futuro, basta agregar una
   entrada (no se toca la interfaz).

   Campos:
     moduleId          identificador único
     name              nombre visible
     desc              descripción corta para la tarjeta
     version           versión del módulo (independiente)
     route             ruta relativa al index.html del módulo (iframe)
     icon              clave en icons.js
     accent            variable CSS de acento
     enabled           el propietario puede desactivarlo (Centro Maestro)
     visible           aparece en el home normal
     order             orden de aparición
     requiresOnline    necesita red para funcionar
     usesSupabase      usa backend Supabase
     storageNamespaces bases/claves que toca (auditoría)
     privacy           'public' | 'admin' | 'private'
   ============================================================ */

import * as store from '../storage/storage.js';

/* Definición base (fuente de verdad). En Fase 1 las rutas apuntan
   a placeholders; al integrar cada módulo real (Fases 2–8) se
   reemplaza el contenido de esa carpeta, no esta tabla. */
const BASE_MODULES = [
  { moduleId: 'produccion', name: 'Producción', desc: 'Cronológico e Histórico de suertes',
    version: 'VF54.6', route: 'modules/produccion/index.html', icon: 'produccion',
    accent: 'var(--accent-produccion)', enabled: true, visible: true, order: 1,
    requiresOnline: false, usesSupabase: false,
    storageNamespaces: ['cache:casur-suertes-vf54-*'], privacy: 'public' },

  { moduleId: 'tch', name: 'TCH y Visitas', desc: 'Biometría, visitas y fotografías',
    version: '2.7.2', route: 'modules/tch/index.html', icon: 'tch',
    accent: 'var(--accent-tch)', enabled: true, visible: true, order: 2,
    requiresOnline: false, usesSupabase: false,
    storageNamespaces: ['idb:casur-estimador-tch'], privacy: 'public' },

  { moduleId: 'riego', name: 'Riego Ejecutado', desc: 'Seguimiento de riegos por productor',
    version: 'v6', route: 'modules/riego/index.html', icon: 'riego',
    accent: 'var(--accent-riego)', enabled: true, visible: true, order: 3,
    requiresOnline: true, usesSupabase: true,
    storageNamespaces: ['supabase:fbatjsbdybliradxjhdm'], privacy: 'public' },

  { moduleId: 'insumos', name: 'Seguimiento de Insumos', desc: 'Insumos, productores y madurante',
    version: 'v2', route: 'modules/insumos/index.html', icon: 'insumos',
    accent: 'var(--accent-insumos)', enabled: true, visible: true, order: 4,
    requiresOnline: false, usesSupabase: false,
    storageNamespaces: ['idb:insumos_casur_db'], privacy: 'public' },

  { moduleId: 'inventario', name: 'Inventario', desc: 'Kardex, entradas y salidas · Pansaco',
    version: '1.4.0', route: 'modules/inventario/index.html', icon: 'inventario',
    accent: 'var(--accent-inventario)', enabled: true, visible: true, order: 5,
    requiresOnline: true, usesSupabase: true,
    storageNamespaces: ['idb:pansaco-inventory-outbox', 'supabase:fbatjsbdybliradxjhdm'],
    privacy: 'public' },

  { moduleId: 'labores', name: 'Seguimiento de Labores', desc: 'Manuales y mecanizadas (operativo)',
    version: '0.7.x', route: 'modules/labores/index.html', icon: 'labores',
    accent: 'var(--accent-labores)', enabled: true, visible: true, order: 6,
    requiresOnline: false, usesSupabase: false,
    storageNamespaces: ['casur_labores_public_*'], privacy: 'public' },

  /* Administración: se opera desde Centro Maestro, no en el home. */
  { moduleId: 'convertidor', name: 'Administrador SIAGRI', desc: 'Convertidor Cronológico Maestro',
    version: '1.1.0', route: 'master/convertidor/index.html', icon: 'siagri',
    accent: 'var(--accent-admin)', enabled: true, visible: false, order: 90,
    requiresOnline: false, usesSupabase: false,
    storageNamespaces: ['ls:casur-master-validations-v1'], privacy: 'admin' },

  /* Privado: solo tras desbloqueo. */
  { moduleId: 'conciliacion', name: 'Conciliación de Cobros', desc: 'Área privada · datos económicos',
    version: '0.7.x', route: 'private/conciliacion/index.html', icon: 'conciliacion',
    accent: 'var(--accent-private)', enabled: true, visible: false, order: 99,
    requiresOnline: false, usesSupabase: false,
    storageNamespaces: ['idb:conciliador-casur', 'ls:casur-application-rules-v1'],
    privacy: 'private' },
];

/* Overrides del propietario (mostrar/ocultar, activar/desactivar,
   orden) guardados en el shell. Se fusionan sobre la base. */
const OVERRIDES_KEY = 'module_overrides';

function overrides() {
  return store.get(OVERRIDES_KEY, {});
}

function apply(mod) {
  const o = overrides()[mod.moduleId] || {};
  return { ...mod, ...o };
}

/** Todos los módulos (con overrides aplicados), ordenados. */
export function all() {
  return BASE_MODULES.map(apply).sort((a, b) => a.order - b.order);
}

/** Un módulo por id. */
export function byId(id) {
  const m = BASE_MODULES.find((x) => x.moduleId === id);
  return m ? apply(m) : null;
}

/** Módulos que se muestran en el home normal (públicos, visibles, activos). */
export function homeModules() {
  return all().filter((m) => m.visible && m.enabled && m.privacy === 'public');
}

/** Guarda un override para un módulo (p. ej. {enabled:false}). */
export function setOverride(id, patch) {
  const o = overrides();
  o[id] = { ...(o[id] || {}), ...patch };
  store.set(OVERRIDES_KEY, o);
}

/** Restablece todos los overrides. */
export function resetOverrides() {
  store.remove(OVERRIDES_KEY);
}
