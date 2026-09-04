/* ============================================================
   versions.js — Control de versiones.
   La App Maestra tiene su propia versión; cada módulo la suya
   (independiente). Se muestran en Centro Maestro. Actualizar el
   número de un módulo aquí no afecta a los demás.
   ============================================================ */

export const APP_VERSION = '1.0.0';
export const APP_CHANNEL = 'GitHub Pages';

/* Versiones detectadas en la auditoría (Fase 0). En fase 1 son
   informativas (placeholders); al integrar cada módulo real se
   confirmarán/leerán de su propio version.json cuando exista. */
export const MODULE_VERSIONS = {
  produccion: 'VF54.6',
  tch: '2.7.2',
  riego: 'v6',
  insumos: 'v2',
  inventario: '1.4.0',
  labores: '0.7.x',
  convertidor: '1.1.0',
  conciliacion: '0.7.x',
};

export function moduleVersion(id) {
  return MODULE_VERSIONS[id] || '—';
}
