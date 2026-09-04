/* ============================================================
   icons.js — Iconos SVG inline (sin dependencias).
   Cada icono devuelve un string SVG con currentColor,
   para que herede el color del contenedor (acento del módulo).
   ============================================================ */

const wrap = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  // --- Módulos (símbolos específicos por tema) ---
  // Producción: caña + análisis de datos (barras ascendentes + hoja/brote)
  produccion: wrap('<path d="M3.5 20.5h17"/><path d="M6 20.5v-5"/><path d="M11 20.5v-9"/><path d="M16 20.5v-6"/><path d="M16 14.5c0-2.6 1.8-4.4 4-4.8-.2 2.8-1.4 4.6-4 4.8Z"/><path d="M11 11.5c0-2.2-1.3-3.6-3.2-4 .1 2.3 1.1 3.7 3.2 4Z"/>'),
  // TCH y Visitas: cámara (fotografía) con hoja como lente (biometría/caña)
  tch: wrap('<path d="M4 8.5h2.5L8 6.5h8l1.5 2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><path d="M12 16.5c-2 0-3.2-1.4-3.2-3.1 0-1.8 3.2-4.4 3.2-4.4s3.2 2.6 3.2 4.4c0 1.7-1.2 3.1-3.2 3.1Z"/>'),
  // Riego: gota de agua con brote de caña dentro
  riego: wrap('<path d="M12 3s5.2 5.6 5.2 9.2A5.2 5.2 0 0 1 6.8 12.2C6.8 8.6 12 3 12 3Z"/><path d="M12 17.5v-4"/><path d="M12 14c1.7 0 2.8-1.1 3-2.6"/><path d="M12 15c-1.5 0-2.5-1-2.7-2.3"/>'),
  // Insumos: saco de insumo/fertilizante con hoja (agrícola)
  insumos: wrap('<path d="M6.5 7.5l1.8-3h7.4l1.8 3v11.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M8.3 7.5h7.4"/><path d="M12 17c-1.6 0-2.6-1.2-2.6-2.7 0-1.5 2.6-3.6 2.6-3.6s2.6 2.1 2.6 3.6C14.6 15.8 13.6 17 12 17Z"/>'),
  // Inventario: bodega con caja (continuidad visual con Pansaco)
  inventario: wrap('<path d="M3 10l9-6 9 6"/><path d="M5 10v10h14V10"/><rect x="9" y="13.5" width="6" height="6.5"/><path d="M9 16.5h6"/>'),
  // Labores: tractor (labores manuales y mecanizadas en el campo)
  labores: wrap('<circle cx="7.5" cy="16.5" r="3.3"/><circle cx="17.5" cy="17.5" r="2.4"/><path d="M4 13.2h4l1.2-4.2H14l1.1 4.2h2.4a1.5 1.5 0 0 1 1.5 1.5v1.6"/><path d="M11 13V9"/>'),
  // --- Administración / privado ---
  siagri: wrap('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 4v16"/>'), // hoja de cálculo
  conciliacion: wrap('<path d="M12 3v18"/><path d="M6 7l-3 5h6Z"/><path d="M18 7l-3 5h6Z"/><path d="M6 21h12"/>'), // balanza
  // --- UI ---
  home: wrap('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>'),
  master: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'), // engranaje
  lock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  chevron: wrap('<path d="M9 6l6 6-6 6"/>'),
  back: wrap('<path d="M15 6l-6 6 6 6"/>'),
  refresh: wrap('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  wifi: wrap('<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19h.01"/>'),
  wifiOff: wrap('<path d="M3 3l18 18"/><path d="M12 19h.01"/><path d="M8.5 16a5 5 0 0 1 6-.5"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
};

/** Devuelve el SVG de un icono, o un punto si no existe. */
export function icon(name) {
  return ICONS[name] || wrap('<circle cx="12" cy="12" r="3"/>');
}
