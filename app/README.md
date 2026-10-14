# Conciliador Nómina–Prefactura CASUR · fuente editable

Aplicación React (Vite) que concilia la Nómina de labores manuales contra la Prefactura SIAGRI, da seguimiento a las
labores, analiza los montos facturados y conserva auditoría y cierres semanales. Se publica en GitHub Pages desde la
**raíz del repositorio** (`index.html`, `assets/`, `sw.js`…); esta carpeta `app/` contiene la fuente y las pruebas.

## Comandos

```bash
cd app
npm install
npm run dev        # servidor local de desarrollo
npm test           # pruebas unitarias del motor (Vitest)
npm run build      # build en app/dist
npm run test:e2e   # pruebas en Chromium sobre app/dist (requiere CHROME_PATH o /opt/pw-browsers)
npm run compare    # informe de diferencias contra el bundle legacy 8b3-1-1 (tests/legacy)
npm run engine -- <nomina.xlsx> <prefactura.xlsx> <maestro.xlsx>   # resumen del motor sobre Excel reales
npm run release    # build + copia a la raíz del repositorio (publicar = fusionar a main con autorización)
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/engine/` | Motor puro, sin navegador: `importers` (lectura y validación de Excel), `periods` (año operativo SIAGRI), `reconciliation` (directa, TPS, excepciones, banderas), `indicators`, `review` (Revisión por Correo), `tracking` (Seguimiento), `applications` (aplicaciones estimadas), `tariffs`, `finance`, `quality`, `exports`. |
| `src/data/` | Precarga de `datos/` y Maestro Central remoto (App Maestra). |
| `src/storage/` | IndexedDB `conciliador-casur` (Dexie, **esquema v1 fijo**): valores, auditoría, cierres, respaldo. |
| `src/state/` | `useConciliador`: estado y acciones (carga, importación, conciliación, Maestro, respaldo). |
| `src/components/` | Interfaz por módulo (Resumen, Conciliación, Revisión, Seguimiento, Financiero, TPS, Auditoría, Carga, Parámetros). |
| `tests/unit/` | Casos controlados con Excel sintéticos. |
| `tests/e2e/` | Prueba de humo, ruta de actualización y comparación contra el legacy. |
| `tests/legacy/` | Copia exacta del bundle publicado 8b3-1-1 (solo para comparar). |
| `tools/` | Reconstrucción de la fuente y utilidades de renombrado (trazabilidad). |

## Restricciones que deben respetarse

- **IndexedDB `conciliador-casur` en versión 1.** La vista "Seguimiento de Labores" de la App Maestra comparte el
  origen `montealtoc7.github.io` y abre la misma base con un bundle antiguo; subir la versión rompería esa vista.
  Los datos nuevos se guardan como claves adicionales de `values`.
- **"Seguimiento de labores" debe ser la 4.ª pestaña.** La App Maestra oculta las demás con `nth-child(4)`.
- **`localStorage`**: `casur-application-rules-v1`, `casur-remote-master-cache-v1`, `casur-gh-publish-token` se conservan.
- **Formato de `seguimiento.json`** publicado para la App Maestra: mismos campos de v0.7 (se agrega `year`).
- No se recalculan montos: los totales financieros son la columna `Total` de la Prefactura.

## Reglas del motor

Ver `../docs/CAMBIOS_v0.8.md` para la lista de reglas verificadas, cambios de comportamiento y evidencia.
