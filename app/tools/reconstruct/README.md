# Reconstrucción de la fuente (trazabilidad)

La fuente de `app/src` se reconstruyó a partir del bundle publicado `assets/index-8b3-1-1.js`
(commit `e7587c3`), porque el repositorio nunca contuvo el proyecto original.

Pasos reproducibles:

1. Formatear el bundle con Prettier 3.3.3.
2. `node reconstruct.cjs <bundle-formateado> <salida>` con `names.json`/`modules.json` derivados de `map.txt`:
   - transformaciones seguras (`!0`→`true`, `void 0`→`undefined`, separar secuencias y declaraciones múltiples);
   - eliminación del runtime de React/lucide/Vite (se sustituyen por los paquetes npm con la misma versión);
   - renombrado con alcance (Babel) de las ligaduras de nivel superior según `map.txt`;
   - conversión de llamadas `jsx()/jsxs()` a JSX;
   - división en módulos con imports/exports calculados.
3. Prettier sobre el resultado.

La equivalencia se verificó con `tests/e2e/compare-legacy.mjs`: misma IndexedDB (entradas, análisis,
revisión) y mismo texto en las 8 pestañas que el bundle original, con los Excel de `datos/`.

Nota: se descartó la herramienta automática wakaru porque produjo código semánticamente incorrecto
(`x == null ? void 0 : x.value` → `x == null || x.value`).
