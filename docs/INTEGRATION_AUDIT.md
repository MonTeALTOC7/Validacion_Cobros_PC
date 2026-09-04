# INTEGRATION_AUDIT.md — Negocios de Caña CASUR

> **Fase 0 — Auditoría técnica.** Documento generado inspeccionando directamente el código
> de los 7 repositorios fuente (clonados y analizados, no supuestos).
> Fecha de auditoría: 2026-09-03 · Auditor: arquitectura App Maestra.

---

## 0. Resumen ejecutivo

Se auditaron 7 PWAs independientes publicadas bajo el mismo origen `montealtoc7.github.io`.
Todas son **estáticas y compatibles con subdirectorio de GitHub Pages** (rutas relativas ya
correctas). El riesgo dominante **no** es de rutas ni de datos: es el **conflicto entre
Service Workers**, porque las 7 borran mutuamente su caché. La estrategia recomendada
(detallada en `ARCHITECTURE.md`) es **aislamiento por `<iframe>` + un único Service Worker
raíz**, lo que preserva el 100 % del comportamiento y de los datos existentes con **cero
migración de almacenamiento** en v1.0.

---

## 1. Inventario por aplicación

### 1.1 PRODUCCIÓN — `Cronologico_Historico_260726_CASUR_PROGRAMADOR`
| Campo | Valor |
|---|---|
| Stack | HTML monolítico + JS vanilla, datos embebidos |
| Peso | `index.html` ≈ **5.7 MB**; `data/*.json` ≈ 2.4 MB |
| Versión | **VF54.6** (`VERSION.txt`) |
| Manifest | `manifest.webmanifest` · name *Producción Suertes CASUR* · `start_url ./` · `scope ./` |
| Service Worker | `sw.js` · cache `casur-suertes-vf54-data-sync-20260903-7` · **borra otras caches** |
| Registro SW | `serviceWorker.register('./sw.js',{scope:'./'})` en `index.html` |
| IndexedDB | ninguna (datos en JSON/JS embebido) |
| localStorage | selección/preferencias en el bundle (no expuestas como claves sueltas) |
| Vendor | `vendor/xlsx.bundle.js` (SheetJS con estilos) |
| Rutas | relativas ✓ |
| Notas | Aplicación grande, favorita del propietario. **No refactorizar en fase 1.** |

### 1.2 TCH / VISITAS — `TCH_BioEstimador_Rfotos`
| Campo | Valor |
|---|---|
| Stack | JS vanilla multi-archivo (`app.js`, `tch-engine.js`, `storage.js`, `excel.js`, `master.js`, `result-image.js`) |
| Versión | **v2.7.2** (cache `estimador-tch-casur-v2.7.2`) |
| Manifest | name *Estimador TCH CASUR* · `start_url ./` · `scope ./` |
| Service Worker | `sw.js` · cache `estimador-tch-casur-v2.7.2` · **borra otras caches** |
| **IndexedDB** | **`casur-estimador-tch` v3** — stores: `master`, `biometries`, `weighings`, `harvests`, `visits`, `audit`, `settings` |
| Fotografías | **Blobs** almacenados dentro de `biometries` / `visits` |
| Rutas | relativas ✓ |
| Notas | **NO renombrar la base.** Probar fotos grandes y restauración (Fase 3). |

### 1.3 CONVERTIDOR SIAGRI — `Convertidor_Cronologico_Oficial`
| Campo | Valor |
|---|---|
| Stack | JS vanilla (`app.js`, `data-engine.js`, `config.js`, `tests-page.js`) + `js/vendor` |
| Versión | cache `casur-cronologico-v1.1.0` |
| Manifest | `manifest.json` · name *Administrador del Cronológico Maestro CASUR* · `start_url ./` |
| Service Worker | `service-worker.js` · cache `casur-cronologico-v1.1.0` · **borra otras caches** |
| localStorage | **`casur-master-validations-v1`** |
| Regla Sucuya | ✅ **presente y verificada** — excluye `cod === 16`; el test valida `records.every(r => Number(r.cod) !== 16)` y muestra "− Sucuya · Código 16" en la conciliación |
| Rutas | relativas ✓ |
| Notas | Procesa Excel SIAGRI localmente. Se integra dentro de **Centro Maestro → Administrador SIAGRI**, no como módulo del home. |

### 1.4 INSUMOS — `Insumos_Entregados_PC`
| Campo | Valor |
|---|---|
| Stack | JS vanilla (`app.js`) + `scripts/procesar_siagri.py` (herramienta local) |
| Versión | cache `casur-insumos-v2-2026-08-23` |
| Manifest | name *Control y Seguimiento de Insumos CASUR* · `id control-insumos-casur` · `start_url ./` |
| Service Worker | `sw.js` · cache `casur-insumos-v2-2026-08-23` · **borra otras caches** |
| **IndexedDB** | **`insumos_casur_db`** (abierta con helper `openDB`) |
| Docs de negocio | `REGLAS_NEGOCIO.md`, `ANALISIS_DATOS.md`, `PROJECT_STATUS.md` (conservar reglas de áreas) |
| Rutas | relativas ✓ |
| Notas | No convertir HA-evento en superficie única. Conservar loader propio. |

### 1.5 RIEGO — `Riego_Ejecutado_Productor_casur`
| Campo | Valor |
|---|---|
| Stack | **Vite / React** (assets hasheados en `./assets/`) |
| Versión | cache `casur-riego-v6-2026-08-20` |
| Manifest | name *Seguimiento de Riegos Ejecutados CASUR* · short **Riegos CASUR** · `id seguimiento-riegos-ejecutados` · `start_url ./` |
| Service Worker | `sw.js` · cache `casur-riego-v6-2026-08-20` · **borra otras caches** |
| **Supabase** | proyecto `https://fbatjsbdybliradxjhdm.supabase.co` · clave **`sb_publishable_...`** (segura) |
| localStorage | sesión GoTrue (`supabase.gotrue-js.locks...`) |
| Assets | `./assets/index-*.js` (base relativa ✓), incluye `html2canvas` |
| Rutas | relativas ✓ |
| Notas | **Su icono/diseño PWA es la REFERENCIA visual** del icono maestro. |

### 1.6 INVENTARIO — `Inventario_Pansaco`
| Campo | Valor |
|---|---|
| Stack | JS vanilla + Supabase JS (`vendor/supabase.min.js`) + Chart/ExcelJS/PptxGen |
| Versión | **v1.4.0** (`config.js`, cache `pansaco-inventario-v1.4.0`) |
| Manifest | name *Inventario Pansaco · CT* · `start_url ./` |
| Service Worker | `sw.js` · cache `pansaco-inventario-v1.4.0` · network-first index · **borra otras caches** |
| **Supabase** | `https://fbatjsbdybliradxjhdm.supabase.co` · clave **`sb_publishable_...`** · Auth `persistSession:true` · **Realtime** `eventsPerSecond:8` · `detectSessionInUrl:false` |
| Config | `window.PANSACO_CONFIG` (frozen) · versión 1.4.0 |
| **Tablas `inv_*`** | `inv_balances`, `inv_fields`, `inv_labor_types`, `inv_movement_lines`, `inv_movements`, `inv_producers`, `inv_products`, `inv_profiles`, `inv_settings`, `inv_warehouses` |
| **RPC** | `inv_post_movement`, `inv_void_movement`, `inv_delete_movement`, `inv_reset_demo` |
| **Edge Function** | `inv-users` |
| **Migraciones** | 6 archivos SQL (core, demo_reset, hardening seguridad, dosage, permisos granulares, realtime) |
| **IndexedDB** | **`pansaco-inventory-outbox`** (cola offline / idempotencia) |
| Rutas | relativas ✓ |
| Notas | **NO tocar tablas `inv_*` ni lógica Supabase.** Verificar Auth/Realtime bajo nueva ruta. |

### 1.7 VALIDACIÓN / LABORES — `Validacion_Cobros_PC`
| Campo | Valor |
|---|---|
| Stack | **Vite / React** + **Dexie** + **Workbox** (vite-plugin-pwa) |
| Manifest | `manifest.webmanifest` (raíz) |
| Service Worker | `sw.js` (Workbox precache) + `registerSW.js` → `register('./sw.js',{scope:'./'})` + `workbox-*.js` |
| **IndexedDB (Dexie)** | **`conciliador-casur`** — store confirmado `values` (+ `audit`, `closures` según diseño) |
| localStorage | **`casur-application-rules-v1`** |
| Lógica de negocio | Presente en bundle: **Nómina / Prefactura / Manual / Mecanizada / deduplicación** |
| Datos de ejemplo | `datos/Nomina_2026.xlsx`, `Prefactura_2026.xlsx`, `Cronologico_Maestro_2026.xlsx`, `CobrosAgosto_Y2026.xlsx` |
| Rutas | relativas `./assets/` ✓ |
| Módulos | Resumen, Conciliación, Revisión por Correo, **Seguimiento de labores**, Paquetes TPS, Auditoría/cierres, Actualizar archivos, Parámetros |
| Notas | Público = **solo Seguimiento de Labores**. El resto es privado (montos/tarifas/prefacturas). |

---

## 2. Matriz de almacenamiento (namespaces reales)

| App | IndexedDB | localStorage | Supabase | CacheStorage |
|---|---|---|---|---|
| Producción | — | (bundle) | — | `casur-suertes-vf54-data-sync-20260903-7` |
| TCH | `casur-estimador-tch` v3 | — | — | `estimador-tch-casur-v2.7.2` |
| Convertidor | — | `casur-master-validations-v1` | — | `casur-cronologico-v1.1.0` |
| Insumos | `insumos_casur_db` | — | — | `casur-insumos-v2-2026-08-23` |
| Riego | — | sesión GoTrue | `fbatjsbdybliradxjhdm` (publishable) | `casur-riego-v6-2026-08-20` |
| Inventario | `pansaco-inventory-outbox` | sesión | `fbatjsbdybliradxjhdm` (publishable) | `pansaco-inventario-v1.4.0` |
| Validación/Labores | `conciliador-casur` (`values`/`audit`/`closures`) | `casur-application-rules-v1` | — | (Workbox precache) |

**Conclusión clave:** IndexedDB y localStorage son **por origen**. Si cada módulo se carga
dentro de un `<iframe>` en el **mismo origen** que la App Maestra, **todas las bases siguen
existiendo y accesibles sin cambio de nombre ni migración**. Esto elimina el riesgo de
pérdida de datos en v1.0.

---

## 3. Colisiones detectadas

| # | Colisión | Severidad | Detalle |
|---|---|---|---|
| C1 | **Service Workers mutuamente destructivos** | 🔴 Crítica | Las 7 apps ejecutan `caches.keys().filter(k!==MI_CACHE).map(caches.delete)`. CacheStorage es por origen ⇒ cada app borra la caché de las demás. Origen actual: `montealtoc7.github.io`. |
| C2 | **Múltiples registros de SW en el mismo scope** | 🔴 Crítica | Si se cargan tal cual dentro de la Maestra, competirían por el scope `./` y romperían el caché maestro. |
| C3 | **Globales JS en ámbito compartido** | 🟠 Alta | Vanilla apps definen `app`, `$`, `CACHE`, `state`… en `window`. Concatenarlas en un solo documento provoca colisiones. (Se evita con iframes.) |
| C4 | **Dos raíces React + routers** | 🟠 Alta | Riego y Validación son builds Vite independientes; dos routers en un mismo documento pelean por `history`/URL. (Se evita con iframes.) |
| C5 | **Seis manifests / seis instalaciones PWA** | 🟠 Alta | Cada app instala su propia PWA. La Maestra debe exponer **un solo** manifest. |
| C6 | **Prefijos localStorage `casur-*-v1` solapados** | 🟡 Media | `casur-master-validations-v1` (Convertidor) y `casur-application-rules-v1` (Validación) comparten estilo de prefijo; sin colisión exacta hoy, pero conviene namespacing `casur_master_*` para lo NUEVO. |
| C7 | **Dato económico y operativo en la misma base** | 🟠 Alta | `conciliador-casur` guarda montos/tarifas junto a labores. Requiere separación de dataset público/privado (ver plan de privacidad). |

---

## 4. Seguridad (verificado)

- ✅ **No hay `service_role` ni secretos de backend en el frontend.** Búsqueda negativa en todos los repos.
- ✅ Inventario y Riego usan la **clave publishable** (`sb_publishable_...`), diseñada para el cliente; la seguridad real recae en **RLS** de Supabase.
- ✅ Inventario ya trae *hardening* de seguridad/performance (migración `...0003_security_performance_hardening.sql`) y **permisos granulares** por usuario.
- ⚠️ Inventario y Riego **comparten el mismo proyecto Supabase**; cualquier cambio de RLS afecta a ambos. Tratar como una sola superficie backend.
- ⚠️ Datos económicos de Validación viven **localmente sin cifrado** en IndexedDB del origen. Riesgo documentado en `ARCHITECTURE.md` §Privacidad.

---

## 5. Compatibilidad GitHub Pages

- ✅ Los 7 `index.html` usan **rutas relativas** (0 referencias absolutas `/...`).
- ✅ Builds Vite (Riego, Validación) referencian `./assets/` (base relativa correcta).
- ✅ Todos los manifests usan `start_url ./` y `scope ./`.
- ⇒ **Publicables bajo subdirectorio sin modificar rutas.** El único ajuste necesario es el
  del **Service Worker maestro** y neutralizar los registros de SW de cada módulo.

---

## 6. Reglas de negocio a preservar (verificadas o declaradas)

1. **Sucuya (Cod. Hacienda 16) siempre excluida** — verificado activo en Convertidor.
2. **Nómina = fuente primaria de labores manuales.**
3. **Prefactura = mecanizadas + contraste**; manuales de Prefactura **no duplican** las de Nómina.
4. **HA = acumulado de trabajo**, no superficie única.
5. Llave de negocio `Hac-Sue` (ej. Hac 993 + Sue 40 → `99340`); complementar con **UUID interno** donde la concatenación no sea segura.
6. Preferir `activo = false` sobre borrado físico cuando existan referencias históricas.
7. Conservar todos los exportadores existentes (xlsx, imágenes, pptx en Inventario).

---

## 7. Estado de la Fase 0

- [x] Inspección de los 7 repositorios
- [x] Identificación de stack por app
- [x] Manifests
- [x] Service Workers (y su lógica de borrado)
- [x] IndexedDB
- [x] localStorage
- [x] Supabase (URL, claves, tablas, RPC, edge, migraciones)
- [x] Rutas
- [x] Loaders / exportadores (identificados por app)
- [x] Dependencias / vendor
- [x] Assets
- [x] Colisiones potenciales (C1–C7)

**Fase 0 COMPLETA.** No se ha modificado ningún repositorio original ni escrito código de
integración. Continuar solo tras aprobación de la arquitectura (`ARCHITECTURE.md`).
