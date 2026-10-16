# Conciliador Nómina–Prefactura CASUR · fuente editable

Aplicación React (Vite) que concilia la Nómina de labores manuales contra la Prefactura SIAGRI, da seguimiento a las
labores, analiza los montos facturados y conserva auditoría y cierres semanales. Se publica en GitHub Pages desde la
**raíz del repositorio** (`index.html`, `assets/`, `sw.js`…); esta carpeta `app/` contiene la fuente y las pruebas.

## Comandos

```bash
cd app
npm ci             # instalación reproducible (package-lock.json)
npm run dev        # servidor local de desarrollo
npm test           # pruebas unitarias y cifras de referencia golden (Vitest)
npm run build      # build en app/dist
npm run test:e2e   # pruebas en Chromium sobre app/dist (CHROME_PATH, /opt/pw-browsers o `npx playwright-core install chromium`)
npm run compare    # informe de diferencias contra el bundle legacy 8b3-1-1 (tests/legacy)
npm run compare:check   # falla ante diferencias con el legacy fuera de tests/golden/legacy-allowlist.json
npm run golden:update -- --justificacion "…"   # regenera las cifras de referencia (ver tests/golden/README.md)
npm run engine -- <nomina.xlsx> <prefactura.xlsx> <maestro.xlsx>   # resumen del motor sobre Excel reales
npm run release    # build + copia a la raíz del repositorio (publicar = fusionar a main con autorización)
npm run verify:release   # la raíz coincide con app/dist y conserva datos/ y archivos estáticos
npm run verify:legacy    # tests/legacy idéntico a e7587c3 (SHA256SUMS + historial git)
npx vite-node tests/e2e/maestra-compat.mjs -- --labores <App Maestra>/modules/labores   # regresión App Maestra
```

La CI (`.github/workflows/ci.yml`) ejecuta en cada pull request: `npm ci`, formato, pruebas unitarias y golden,
registro de cifras de referencia, copia legacy, `npm run release` + `verify:release` + raíz sin cambios respecto de lo
versionado (el build es determinista), humo en Chromium sobre `app/dist` y sobre la raíz, actualización desde v0.7,
comparación legacy contra la lista de diferencias permitidas y la regresión obligatoria con la App Maestra en un commit
fijado. Todo es bloqueante. No publica ni escribe en otros repositorios.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/engine/` | Motor puro, sin navegador: `importers` (lectura y validación de Excel), `periods` (año operativo SIAGRI), `reconciliation` (directa, TPS, excepciones, banderas), `indicators` (incl. pendientes por semana y cobertura), `repetitions` (clasificación de repeticiones de Prefactura), `published` (dataset para la App Maestra), `review` (Revisión por Correo), `tracking` (Seguimiento), `applications` (aplicaciones estimadas), `tariffs`, `finance`, `quality`, `exports`. |
| `src/data/` | Precarga de `datos/` y Maestro Central remoto (App Maestra). |
| `src/storage/` | IndexedDB `conciliador-casur` (Dexie, **esquema v1 fijo**): valores, auditoría, cierres, respaldo. |
| `src/state/` | `useConciliador`: estado y acciones (carga, importación, conciliación, Maestro, respaldo). |
| `src/components/` | Interfaz por módulo (Resumen, Conciliación, Revisión, Seguimiento, Financiero, TPS, Auditoría, Carga, Parámetros). |
| `tests/unit/` | Casos controlados con Excel sintéticos; `timezone.test.js` repite las cifras de referencia en varias zonas horarias. |
| `tests/e2e/` | Prueba de humo, ruta de actualización, zona horaria (`timezone.mjs`), comparación contra el legacy y compatibilidad con la App Maestra (`maestra-compat.mjs`). |
| `tests/golden/` | Cifras de referencia, diferencias legacy permitidas y registro justificado. |
| `tests/legacy/` | Copia exacta del bundle publicado 8b3-1-1 (solo para comparar), con `SHA256SUMS`. |
| `tests/v08/` | Copia exacta del build v0.8 previo a la corrección de zona horaria (`3ca0876`), para probar la transición de datos guardados. |
| `scripts/` | `release` (copia a la raíz), `verify-release`, `verify-legacy`, `golden-update`, `golden-guard`. |
| `tools/` | Reconstrucción de la fuente y utilidades de renombrado (trazabilidad). |

## Restricciones que deben respetarse

- **IndexedDB `conciliador-casur` en versión 1.** La vista "Seguimiento de Labores" de la App Maestra comparte el
  origen `montealtoc7.github.io` y abre la misma base con un bundle antiguo; subir la versión rompería esa vista.
  Los datos nuevos se guardan como claves adicionales de `values`.
- **"Seguimiento de labores" debe ser la 4.ª pestaña.** La App Maestra oculta las demás con `nth-child(4)`.
- **`localStorage`**: `casur-application-rules-v1`, `casur-remote-master-cache-v1`, `casur-gh-publish-token` se conservan.
- **Formato de `seguimiento.json`** publicado para la App Maestra: mismos campos de v0.7 (`PUBLISHED_FIELDS` en
  `src/engine/published.js`; se agregan `ageNote`, `sourceRow`, `year` y `maxPeriod`). Sin tarifas, montos ni P.FACT.
- No se recalculan montos: los totales financieros son la columna `Total` de la Prefactura.
- **Fechas de Excel independientes de la zona horaria.** Los libros se leen con `readExcelWorkbook` (seriales de Excel,
  no `cellDates`), y cada celda de fecha conserva el instante que SheetJS producía en Managua, porque de él depende el
  identificador de cada fila. No convertir fechas con `toISOString()` ni con la hora local del equipo (ver
  `src/engine/normalize.js` y la sección 11 de `docs/CAMBIOS_v0.8.md`).

## Reglas del motor

Ver `../docs/CAMBIOS_v0.8.md` para la lista de reglas verificadas, cambios de comportamiento y evidencia.
