# ARCHITECTURE.md — Negocios de Caña CASUR

> Propuesta de arquitectura para la App Maestra, basada en `INTEGRATION_AUDIT.md`.
> **Pendiente de aprobación antes de construir el shell.**

---

## 1. Decisión de arquitectura: aislamiento por `<iframe>` + Service Worker único

### 1.1 El problema central
Las 7 aplicaciones **no** son componentes; son **apps completas** con:
- ámbitos globales propios (`app`, `$`, `state`, `CACHE`…),
- dos raíces React con routers independientes (Riego, Validación),
- un monolito HTML de 5.7 MB (Producción),
- Service Workers que se borran la caché entre sí.

Fusionarlas en un solo documento/SPA garantiza **regresiones** (colisiones C3–C4 del audit).

### 1.2 La solución
Cada módulo se integra como **copia casi literal** en `modules/<id>/` y se carga dentro de
un **`<iframe>` del mismo origen**. El shell maestro es la única "app" que registra un
Service Worker.

```
Documento superior (shell)  ──► manifest único, SW único, home, navegación, Centro Maestro, gate privado
        │
        └── <iframe src="modules/riego/index.html">   ← Riego corre BYTE POR BYTE como hoy
        └── <iframe src="modules/tch/index.html">      ← TCH usa casur-estimador-tch sin cambios
        └── ...
```

### 1.3 Por qué es la opción correcta para v1.0

| Requisito del proyecto | Cómo lo cumple el iframe |
|---|---|
| **Cero regresiones** | El módulo se ejecuta idéntico a hoy dentro de su propio documento. |
| **Preservar datos sin migrar** | IndexedDB/localStorage son **por origen**; el iframe comparte origen ⇒ `casur-estimador-tch`, `conciliador-casur`, `insumos_casur_db`, `pansaco-inventory-outbox` siguen intactos. **Cero migración en v1.0.** |
| **Una sola instalación PWA** | Solo cuenta el manifest del documento superior ⇒ una PWA, no seis. |
| **Un solo Service Worker** | Los `register()` de cada módulo se neutralizan; solo el SW raíz queda activo. |
| **Modularidad real** | Mejorar Riego = trabajar en `modules/riego/`. Ningún módulo depende de otro. |
| **Producción sin refactor** | El monolito se copia tal cual; no se divide por estética. |
| **Aislamiento de fallos** | Un error JS en un módulo no derriba el shell ni a los demás. |

### 1.4 Costos y mitigaciones
| Costo | Mitigación |
|---|---|
| Comunicación shell↔módulo | `postMessage` mínimo: reportar versión/estado, botón "volver", señal de gate privado. |
| Memoria con varios módulos abiertos | Descargar (`src=""`) el iframe al salir del módulo; mantener 1 activo. |
| Deep-link dentro de un módulo | El shell pasa la ruta inicial por query/hash al iframe. |
| SW debe cachear assets de módulos | El SW raíz cachea shell + assets de módulos con estrategia por patrón (ver §4). |

### 1.5 Camino de evolución (post-v1.0)
`iframe` es el **primitivo de integración**, no la meta final. Cuando un módulo tenga
pruebas suficientes, puede "graduarse" a integración nativa (Web Component / módulo ES)
**sin cambiar el shell**, porque el registro de módulos ya abstrae la ruta. *Primero
preservar, después centralizar solo lo realmente común.*

---

## 2. Estructura de carpetas propuesta

Se mantiene la estructura del brief con ajustes menores justificados:

```
Negocios_de_Cana_CASUR/
├── index.html                 # shell (documento superior, única PWA)
├── manifest.webmanifest       # único manifest
├── sw.js                      # ÚNICO Service Worker raíz
├── .nojekyll                  # evita que Pages procese con Jekyll
├── 404.html                   # fallback SPA para rutas del shell
├── core/
│   ├── navigation/            # router del shell (hash-based, sin servidor)
│   ├── module-registry/       # registro central de módulos (config declarativa)
│   ├── permissions/           # gate de área privada
│   ├── versions/              # versión App Maestra + lectura de versiones de módulos
│   ├── storage/               # helpers namespaced casur_master_*
│   └── sync/                  # estado online/offline, reporte de módulos
├── modules/
│   ├── produccion/            # copia de Cronologico_Historico_...PROGRAMADOR (SW neutralizado)
│   ├── tch/                   # copia de TCH_BioEstimador_Rfotos
│   ├── riego/                 # copia del build Vite de Riego
│   ├── insumos/               # copia de Insumos_Entregados_PC
│   ├── inventario/            # copia de Inventario_Pansaco (Supabase)
│   └── labores/               # vista PÚBLICA de Seguimiento de Labores (sin datos económicos)
├── private/
│   └── conciliacion/          # copia de Validación (Conciliación) — solo tras desbloqueo
├── master/
│   ├── centro-maestro/        # UI de administración
│   ├── convertidor/           # copia de Convertidor SIAGRI (dentro de Centro Maestro)
│   ├── data/                  # datasets oficiales versionados (maestro suertes público)
│   └── versions/              # manifiesto de versiones
└── shared/
    ├── assets/                # iconos App Maestra, tipografías, fondo
    ├── components/            # tarjetas home, bottom-nav, drawers
    └── utilities/             # utilidades comunes (fecha, formato, Hac-Sue)
```

**Ajuste vs. brief:** `modules/labores/` (público) y `private/conciliacion/` (privado) son
**dos superficies físicas distintas** que comparten motor, para cumplir la regla "ocultar con
CSS no es seguridad" (ver §5).

---

## 3. Registro de módulos (Module Registry)

Config declarativa; la UI del home se genera desde aquí (no hardcodeada):

```js
// core/module-registry/registry.js
export const MODULES = [
  { moduleId:'produccion', name:'Producción', version:'VF54.6',
    route:'modules/produccion/index.html', icon:'produccion',
    enabled:true, visible:true, order:1, requiresOnline:false, usesSupabase:false,
    storageNamespaces:['cache:casur-suertes-vf54-*'], privacy:'public' },

  { moduleId:'tch', name:'TCH y Visitas', version:'2.7.2',
    route:'modules/tch/index.html', icon:'tch',
    enabled:true, visible:true, order:2, requiresOnline:false, usesSupabase:false,
    storageNamespaces:['idb:casur-estimador-tch'], privacy:'public' },

  { moduleId:'riego', name:'Riego Ejecutado', version:'v6',
    route:'modules/riego/index.html', icon:'riego',
    enabled:true, visible:true, order:3, requiresOnline:true, usesSupabase:true,
    storageNamespaces:['supabase:fbatjsbdybliradxjhdm'], privacy:'public' },

  { moduleId:'insumos', name:'Seguimiento de Insumos', version:'v2',
    route:'modules/insumos/index.html', icon:'insumos',
    enabled:true, visible:true, order:4, requiresOnline:false, usesSupabase:false,
    storageNamespaces:['idb:insumos_casur_db'], privacy:'public' },

  { moduleId:'inventario', name:'Inventario', version:'1.4.0',
    route:'modules/inventario/index.html', icon:'inventario',
    enabled:true, visible:true, order:5, requiresOnline:true, usesSupabase:true,
    storageNamespaces:['idb:pansaco-inventory-outbox','supabase:fbatjsbdybliradxjhdm'],
    privacy:'public' },

  { moduleId:'labores', name:'Seguimiento de Labores', version:'0.7.x',
    route:'modules/labores/index.html', icon:'labores',
    enabled:true, visible:true, order:6, requiresOnline:false, usesSupabase:false,
    storageNamespaces:['casur_labores_public_*'], privacy:'public' },

  // Administración / privado (no aparecen en el home normal)
  { moduleId:'convertidor', name:'Administrador SIAGRI', version:'1.1.0',
    route:'master/convertidor/index.html', icon:'siagri',
    enabled:true, visible:false, order:90, requiresOnline:false, usesSupabase:false,
    storageNamespaces:['ls:casur-master-validations-v1'], privacy:'admin' },

  { moduleId:'conciliacion', name:'Conciliación de Cobros', version:'0.7.x',
    route:'private/conciliacion/index.html', icon:'conciliacion',
    enabled:true, visible:false, order:99, requiresOnline:false, usesSupabase:false,
    storageNamespaces:['idb:conciliador-casur','ls:casur-application-rules-v1'],
    privacy:'private' },
];
```

---

## 4. Plan de Service Worker (regla crítica)

### 4.1 Principio
**Un solo SW raíz** en `scope ./`. Los SW de los módulos se **neutralizan** (se elimina/anula
la llamada `navigator.serviceWorker.register(...)` en la copia dentro de `modules/`). Los
repos originales conservan su SW porque siguen siendo apps independientes.

### 4.2 Regla de limpieza de caché — **NUNCA borrado ciego**
El SW maestro **solo** administra caches con prefijo propio y aplica una **allowlist**:

```js
const MASTER_PREFIX = 'casur_master_';
const SHELL_CACHE   = 'casur_master_shell_v1.0.0';
const DATA_CACHE    = 'casur_master_data_v1.0.0';
// Allowlist de caches que el SW puede tocar. Jamás borra caches ajenas.
const OWNED = new Set([SHELL_CACHE, DATA_CACHE]);

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(k => k.startsWith(MASTER_PREFIX) && !OWNED.has(k)) // solo caches maestras viejas
    .map(k => caches.delete(k)));
  await self.clients.claim();
})()));
```

> Esto corrige C1/C2 del audit: el SW maestro **jamás** borra `estimador-tch-casur-*`,
> `casur-riego-v6-*`, etc.

### 4.3 Estrategias de fetch por patrón
| Patrón de recurso | Estrategia | Motivo |
|---|---|---|
| Shell (`index.html`, `core/`, `shared/`) | **network-first → cache** | shell siempre fresco, offline garantizado |
| Assets hasheados de módulos (`modules/**/assets/*-[hash].js\|css`) | **cache-first** | inmutables por hash |
| Datasets oficiales versionados (`master/data/**`) | **network-first + cache fallback** | nunca servir datos oficiales obsoletos |
| Supabase (`*.supabase.co`) | **passthrough (sin cachear)** | requiere servidor; Auth/Realtime |
| Navegación offline | **fallback a `index.html`** | app-shell offline-first |

### 4.4 Actualización
`skipWaiting` + `clients.claim` controlados, con aviso de "nueva versión disponible" en el
shell (no recarga silenciosa que descarte trabajo del usuario).

---

## 5. Plan de privacidad (Seguimiento de Labores vs. Conciliación)

### 5.1 Regla rectora
> *Ocultar un botón con CSS no es seguridad.* Debe existir **separación lógica de datos**,
> no solo de interfaz.

### 5.2 Diseño v1.0 — separación de datasets

```
              ┌────────────────────────────────────────────┐
  (privado)   │  private/conciliacion/  (Validación)        │
  Carlos ───► │  carga Nómina + Prefactura + Maestro        │
              │  procesa → conciliación (montos, tarifas)   │
              │  ── EMITE ──►  dataset PÚBLICO de labores    │  ← una sola actualización
              └───────────────────────┬────────────────────┘
                                       │ (sin montos/tarifas/P.FACT)
                                       ▼
              ┌────────────────────────────────────────────┐
  (público)   │  modules/labores/  (Seguimiento)            │
  cualquiera  │  lee SOLO casur_labores_public_dataset      │
              │  manuales/mecanizadas/resumen/productor/... │
              └────────────────────────────────────────────┘
```

- **Una sola actualización** (privada) alimenta ambas superficies. El usuario **no** vuelve a
  cargar los Excel en la parte pública. Cumple el requisito de "actualizar una sola vez".
- El **dataset público** se genera **despojado** de: montos, tarifas, prefacturas, diferencias
  económicas, conciliaciones. Solo lleva campos operativos: labor, tipo (manual/mecanizada),
  productor, hacienda, suerte, semana, fecha, cantidad/unidad, edad de caña cuando exista.
- La **deduplicación manual Nómina↔Prefactura** ya existente se **reutiliza** (no se reescribe).

### 5.3 Desbloqueo del área privada
- El home normal **no muestra** Conciliación (registry `visible:false`, `privacy:'private'`).
- El área privada exige **desbloqueo**. Un gate solo en cliente **no es seguridad real**,
  por lo que:

### 5.4 Limitación honesta de v1.0 (documentada)
En v1.0, si los datos económicos siguen en IndexedDB `conciliador-casur` del **mismo origen**,
cualquier código del origen podría leerlos. El gate evita el acceso *accidental*, **no** a un
atacante con consola. **Riesgo aceptado y documentado.**

### 5.5 Fix real (Fase 8+): backend con RLS
La separación definitiva mueve el dato económico fuera del cliente público:
- Reusar el proyecto Supabase existente con un esquema `labores_*` + **RLS**; Carlos inicia
  sesión (Inventario ya tiene Auth + `inv_profiles` + permisos granulares → infraestructura lista).
- El cliente público **descarga solo** el dataset operativo publicado; **nunca** tarifas ni montos.
- Así la privacidad deja de depender del cliente.

---

## 6. Matriz de riesgos

| ID | Riesgo | Prob. | Impacto | Nivel | Mitigación |
|---|---|---|---|---|---|
| R1 | SW de módulos borran caché entre sí / rompen SW maestro | Alta | Alto | **🔴 Crítico** | Un solo SW raíz; neutralizar `register()` de módulos; limpieza por allowlist (§4.2). |
| R2 | Pérdida de datos TCH (fotos Blob) al integrar | Media | Muy alto | **🔴 Crítico** | Iframe mismo origen ⇒ no se toca `casur-estimador-tch`. Regresión explícita con fotos grandes (Fase 3). |
| R3 | Romper Supabase de Inventario (Auth/Realtime/RLS) bajo nueva ruta | Media | Alto | **🟠 Alto** | No tocar tablas/RPC; verificar `detectSessionInUrl:false` y Realtime en iframe; no cambiar clave. |
| R4 | Fuga de datos económicos al cliente público | Media | Alto | **🟠 Alto** | Dataset público despojado + gate; fix real con RLS (Fase 8+). Riesgo v1.0 documentado. |
| R5 | Producción (5.7 MB) degrada carga/instalación | Media | Medio | **🟠 Alto** | Cargar bajo demanda (iframe al abrir módulo), no precache total; lazy. |
| R6 | Dos routers React (Riego/Validación) chocan | Baja | Alto | **🟡 Medio** | Iframes separan `history`/documento; sin choque. |
| R7 | Compartir proyecto Supabase Riego+Inventario | Baja | Alto | **🟡 Medio** | Cambios RLS revisados contra ambos; tratar como una superficie. |
| R8 | Seis manifests → varias instalaciones PWA | Alta | Bajo | **🟡 Medio** | Solo el manifest del shell; módulos sin `<link rel=manifest>` efectivo. |
| R9 | Namespaces localStorage nuevos colisionan | Baja | Medio | **🟢 Bajo** | Prefijos `casur_master_*` para lo nuevo; no renombrar los viejos. |
| R10 | Romper regla Sucuya (cod 16) al integrar Convertidor | Baja | Alto | **🟡 Medio** | No tocar `data-engine`; test de regresión "Sucuya = 0 en resultado". |
| R11 | Duplicar manuales Nómina/Prefactura al reusar labores | Media | Medio | **🟡 Medio** | Reutilizar dedup existente; no reescribir clasificación. |
| R12 | Deep-link/estado inicial de módulo se pierde | Media | Bajo | **🟢 Bajo** | Pasar ruta por hash/query al iframe. |

Leyenda: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🟢 Bajo.

---

## 7. Plan de migración por módulo (sin romper)

**Patrón común de integración (todas las fases):**
1. Copiar el repo a `modules/<id>/` (o `private/` / `master/`).
2. **Neutralizar** su `navigator.serviceWorker.register(...)` (comentar/eliminar).
3. Quitar su `<link rel="manifest">` (para no ofrecer instalación propia).
4. Cargarlo en `<iframe>` desde el shell.
5. Regresión: abrir, operar, cerrar, reabrir, verificar persistencia + consola limpia.

| Fase | Módulo | Acción específica | Verificación clave |
|---|---|---|---|
| 1 | **Shell** | home, nav, registry, gate, manifest, SW único, versiones, placeholders | instalación Android/PC; SW activo; offline shell |
| 2 | **Convertidor** | copiar a `master/convertidor/`; abrir desde Centro Maestro | Excel SIAGRI procesa; **Sucuya=0**; export; offline |
| 3 | **TCH** | copiar a `modules/tch/`; NO tocar `casur-estimador-tch` | crear biometría, **foto grande**, visita, cerrar, reabrir → persiste |
| 4 | **Producción** | copiar monolito a `modules/produccion/`; sin refactor | todos los submódulos, gráficos, export, selección múltiple |
| 5 | **Insumos** | copiar a `modules/insumos/`; loader intacto | importar SIAGRI; Resumen/Explorar/Madurante; export |
| 6 | **Riego** | copiar build Vite a `modules/riego/`; base `./` intacta | datos, filtros, seguimiento; Supabase online |
| 7 | **Inventario** | copiar a `modules/inventario/`; Supabase sin tocar | online, offline (outbox), reconexión, **realtime**, entrada/salida |
| 8 | **Labores + Privado** | Validación → `private/conciliacion/`; vista pública `modules/labores/` con dataset despojado | público sin montos; desbloqueo; una actualización alimenta ambos |

**Commits pequeños y reversibles**, p. ej.:
`feat(shell): master navigation` · `fix(sw): isolate module caches` ·
`feat(convertidor): integrate SIAGRI` · `feat(tch): preserve legacy IndexedDB`.

---

## 8. Plan de pruebas (antes de cambios estructurales)

### 8.1 Smoke test — App Maestra
- [ ] Carga del shell (online/offline)
- [ ] Navegación home ↔ módulo ↔ regreso
- [ ] Instalación PWA (Android y PC) → **una sola** entrada
- [ ] Actualización de SW con aviso (sin recarga destructiva)
- [ ] Responsive móvil/PC + safe-area
- [ ] Consola sin errores

### 8.2 Regresión por módulo
- **Producción:** submódulos, cronológico, histórico, análisis, gráficos, export, selección múltiple.
- **TCH:** abrir → biometría → guardar → **foto** → visita → reiniciar → **persistencia**.
- **Riego:** datos, filtros, importación, persistencia, Supabase.
- **Insumos:** importar, Resumen/Explorar/Insumos/Productores/Madurante/Admin, export.
- **Inventario:** lectura, entrada, salida, **realtime**, offline (outbox), sincronización.
- **Labores:** manual, mecanizada, filtros, productor, suerte, aplicación, resumen ejecutivo.
- **Privado:** no visible normalmente, desbloqueo, conciliación, carga Excel, actualización, bloquear.

### 8.3 Regla de no-regresión (cierre de fase)
1. Probar el nuevo módulo. 2. Probar navegación general. 3. Smoke de módulos ya integrados.
4. Verificar IndexedDB/localStorage intactos. 5. Verificar PWA. 6. Revisar consola.
7. **No continuar con errores importantes abiertos.**

---

## 9. Decisiones que requieren tu confirmación

1. **¿Apruebas el patrón `<iframe>` + SW único** como estrategia de integración v1.0?
   (Es lo que permite cero regresiones y cero migración de datos.)
2. **Repos faltantes en tu perfil:** el brief cita `TCH_BioEstimador_Rfotos`,
   `Convertidor_Cronologico_Oficial`, `Insumos_Entregados_PC`, `Riego_Ejecutado_Productor_casur`,
   `Inventario_Pansaco` y `Validacion_Cobros_PC`. **Se clonaron correctamente los 7.** Confirmar
   que son las versiones vigentes (no otras ramas/repos).
3. **Icono maestro:** se tomará **Riegos CASUR** como referencia visual. ¿Correcto?
4. **Área privada v1.0:** ¿aceptas gate en cliente + dataset público despojado, con el fix
   real (Supabase RLS) planificado para Fase 8+? El riesgo local queda documentado (§5.4).

**No se iniciará la construcción del shell hasta tu aprobación.**
