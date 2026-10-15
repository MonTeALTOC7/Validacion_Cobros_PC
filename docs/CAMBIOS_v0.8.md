# Conciliador v0.8 · cambios, reglas y evidencia

Fecha: 14 de octubre de 2026 · Rama `claude/relaxed-mendel-7z7bnv` · Base: `main` en `e7587c3` (bundle 8b3-1-1).

## 1. Fuente editable recuperada

El repositorio solo contenía el build minificado (con dos parches escritos a mano). Se reconstruyó la fuente en `app/`
y se verificó **equivalencia exacta** con el bundle publicado antes de cualquier cambio funcional:

| Verificación (datos de `datos/` al 7 sep) | Legacy 8b3-1-1 | Fuente reconstruida |
|---|---|---|
| Hallazgos | 1.953 | 1.953 (mismos ids y campos) |
| Entradas guardadas (Nómina, Prefactura, Maestro) | — | idénticas |
| Revisión por Correo | — | idéntica |
| Texto de las 8 pestañas | — | idéntico |

Comandos: `tests/e2e/compare-legacy.mjs` (commits `58cc716` y `123babe`). Nota: la primera versión del arnés no
esperaba de forma fiable a que existiera el análisis; se corrigió y la equivalencia se volvió a verificar con el arnés
corregido sobre el commit `123babe` (resultado en la tabla).

## 2. Cambios de comportamiento (intencionales)

| # | Cambio | Motivo | Efecto medido |
|---|---|---|---|
| 1 | **Año operativo** en todas las claves (conciliación, TPS, cierres, revisión). | Las claves solo tenían semana: S5-2026 y S5-2027 se mezclarían. | Sin cambio de resultados con un solo año. |
| 2 | **La fecha inicial no parte la semana operativa.** Se incluye completa la semana que contiene la fecha inicial. | La Nómina del 29–31 dic 2025 es semana 2 de 2026 (confirmado por la columna Periodo de Prefactura); se descartaba por fecha. | 14 "Cobro sin Nómina" → Conciliado y 10 "Cobro en exceso" → Conciliado, **todos en la semana 2**. Ningún otro cambio de estado. |
| 3 | **Repeticiones de Prefactura** se clasifican y marcan (ver §7), no se eliminan ni se descuentan. | Antes solo se contaban en un indicador y la firma no incluía Total. | Datos nuevos: 16 duplicados exactos (C$ 105.908,10 en copias extra), 2 cobros en otra P.FACT, 28 misma cantidad con tarifa distinta. |
| 4 | **Exclusiones visibles**: servicios sin regla (*Servicio sin clasificar*), contratistas sin regla (*Fuera de alcance*), etapas de siembra sin paquete (*Etapa de siembra sin TPS*, informativo). | Antes se omitían sin aviso. | Datos nuevos: 4 etapas de siembra informativas; 0 servicios/contratistas sin regla. |
| 5 | **TPS**: una misma RYA de Nómina valida como máximo un paquete (orden cronológico). | Evita doble uso de evidencia. | Sin cambio con los datos actuales. |
| 6 | **Excepciones TPS confirmadas** editables en Parámetros (antes fijas en el código). | Trazabilidad. | Mismas 4 por defecto. |
| 7 | **"Incluir suertes históricas"** ahora tiene efecto (antes no hacía nada). Desactivado: se marca *Lote no encontrado* en vez de validar por hacienda. | Parámetro sin implementar. | Por defecto activado = igual que v0.7. |
| 8 | **Maestro Central explícito**: versión visible, se guarda, recalcula la conciliación y registra auditoría; su versión forma parte de la huella de cierres; un Maestro Excel importado prevalece hasta volver a elegir el Central. | Antes reemplazaba en silencio el Maestro sin recalcular (Conciliación y Seguimiento podían usar Maestros distintos). | — |
| 9 | **Productor sin "FACTURA :n.º"** en Seguimiento y Financiero. | Cada factura aparecía como productor distinto ("titular sin confirmar"). | Datos nuevos: 30 productores reales. |
| 10 | **Fechas en texto**: solo AAAA-MM-DD o DD/MM/AAAA. | Evitar confundir día y mes. | Sin efecto (los reportes traen fechas reales). |
| 11 | Ids de fila **por contenido** (estables aunque cambie el nombre del archivo). | Trazabilidad. | — |

Banderas adicionales: *Tarifa poco frecuente* (menos del 5 % de las filas del servicio/UM; parámetro), *Lote no
encontrado*, *Fecha fuera de su semana* (según la columna Periodo).

## 3. Nuevas funciones

- **Tarifa cobrada** visible en la tabla de conciliación, en el detalle (con tarifa, total y P.FACT por fila de
  Prefactura y tarifa registrada en Nómina), en Seguimiento y en el CSV de labores (columnas nuevas al final:
  Archivo, Tarifa, Total, P.FACT, Período; las 13 columnas de v0.7 se conservan con el mismo formato).
- **Módulo Financiero** (pestaña 5): total facturado (columna Total, sin recalcular), por productor, finca, suerte,
  labor, servicio, tipo de labor, contratista y semana; C$ por ha de suerte (área física, contada una vez por suerte)
  separado de la tarifa media por HA trabajada; concentración; tendencia semanal; tarifas observadas con frecuencia y
  semanas; prefacturas por P.FACT; detalle con líneas y origen; Nómina pendiente por productor **en unidades** (no se
  valoriza: la tarifa de un mismo servicio varía, p. ej. 21018 D-H: 368,21 / 381,73 / 724,85 / 751,43); exportación
  Excel de 10 hojas.
- **Calidad de datos**: filas descartadas con motivo, fechas fuera de su semana oficial, duplicados, P.FACT vacío,
  Total ≠ Tarifa × Unidades, tarifas poco frecuentes, lotes sin Maestro, códigos de hacienda con nombres distintos,
  servicios sin regla. Con ejemplos rastreables a archivo y fila.
- **Cierres por período** (AAAA-SNN) con historial, **reapertura con motivo obligatorio**, cierres v0.7 conservados
  como históricos y **exportación de la bitácora**.
- **Respaldo y restauración** completos del dispositivo (JSON); limpiar o restaurar descarga antes un respaldo.
- **Datos publicados nuevos**: si `datos/manifest.json` cambia, se ofrece "Revisar y cargar" con la misma comprobación
  previa por archivo.
- Importadores: hoja REPORTE o la primera con las columnas requeridas; encabezados sin depender de mayúsculas,
  tildes o espacios; motivos de filas descartadas; semanas que aparecen/desaparecen al reemplazar.
- Informe Excel de auditoría: conserva las columnas v0.7 y agrega año, período, tarifas, banderas y estado de cobro,
  más hojas **Origen** (cada hallazgo → archivo/hoja/fila), **Calidad**, **Parámetros** y **Versión**.
- Corrección visual: los iconos de las tarjetas del Resumen no se dibujaban (defecto del build v0.7).
- Corrección: el botón de cerrar del detalle de Seguimiento referenciaba una variable local con el mismo nombre que el
  icono (defecto introducido al reconstruir la fuente; detectado con un análisis de ámbitos y cubierto por la prueba de humo).

## 4. Datos publicados

`datos/Nomina_2026.xlsx` y `datos/Prefactura_2026.xlsx` reemplazados por los archivos entregados el 14 oct
(`Nomina_del01dic_al_11_Oct_26.xlsx`, `Prefactura_01-ene-11-oct-26.xlsx`). Maestro y archivo de revisión sin cambios.

| Resultado con los datos nuevos | Valor |
|---|---|
| Filas utilizables | Nómina 13.020 (0 descartadas) · Prefactura 4.452 (0 descartadas) |
| Período conciliado | 2026-S02 → 2026-S42 (Prefactura llega a S39, 20 sep) |
| Hallazgos | 2.348 · cobertura 93,9 % (2.052/2.186) · 134 pendientes |
| Total facturado (Financiero) | C$ 13.278.583,33 = suma de la columna Total |

## 5. Verificación

- `npm test`: 55 pruebas unitarias (períodos, normalización, importadores, conciliación directa, TPS, repeticiones,
  cambio de año en conciliación y en Seguimiento, pendientes por cobertura, finanzas con P.FACT reutilizada y
  universos, tarifas, calidad, Maestro Central, dataset publicado) y 11 pruebas golden (§10).
- `tests/e2e/smoke.mjs`: 52 comprobaciones en Chromium, escritorio (1366 px) y móvil (390 px): todas las pestañas,
  detalle con tarifa y origen, exportaciones, importación, cierre y reapertura, respaldo, esquema sin cambios.
- `tests/e2e/upgrade.mjs`: datos guardados por v0.7 se conservan y actualizan; el cierre v0.7 se conserva; la vista de
  labores de la App Maestra (bundle antiguo) abre la base actualizada.
- `tests/e2e/maestra-compat.mjs`: regresión de la vista de labores de la App Maestra frente a la vista independiente
  (§8).
- CI (`.github/workflows/ci.yml`): todo lo anterior más formato, copia legacy idéntica (`verify-legacy`) y
  `npm run release` reproducible (`verify-release` + raíz sin cambios).

## 6. Pendiente de confirmar con negocio

- Regla de año operativo (fecha de diciembre con semana ≤ 26 → año siguiente; enero con semana ≥ 27 → año anterior):
  verificada contra la columna Periodo (§7.2); falta el calendario SIAGRI oficial para semanas sin Prefactura.
- Significado de la columna Tarifa de Nómina (en estos datos coincide con la tarifa cobrada para 16013).
- Si el umbral de 5 % para "tarifa poco frecuente" es adecuado.
- Sucuya / código 16: el conciliador no tiene regla propia; los archivos actuales no contienen ese código.
- Publicación de `seguimiento.json` para la App Maestra: sigue siendo manual (botón "Publicar Seguimiento").
- Si *Misma cantidad con tarifas distintas* (28 grupos, p. ej. 3,2 D-H × 368,21 y × 724,85) corresponde a jornada
  normal + doble legítima o a doble cobro.
- Los 2 cobros repetidos en otra prefactura (filas 1907–1909, P.FACT 16202/16203; filas 1979/1981, P.FACT 16167/16169).
- Las 3 filas de Nómina del 2025-12-03 marcadas semana 1 (fuera del calendario conocido).
- Si la tarifa de Nómina es equivalente a la de Prefactura: **no** se compara automáticamente hasta confirmarlo.

## 7. Revisión del 14 oct · correcciones y verificaciones

### 7.1 Correcciones

| Ref. | Hallazgo | Corrección | Prueba |
|---|---|---|---|
| A | La clave de deduplicación de Seguimiento (`buildTrackingRows`) no tenía año: una mecanizada de 2027 se descartaba si había Nómina de la misma semana en 2026. | La clave incluye el año operativo. | 2 pruebas (Nómina/Prefactura en años distintos); fallan con el código anterior. |
| B | La firma de duplicados de Prefactura no incluía `total`. | Clasificación en 4 tipos (`engine/repetitions.js`): duplicado exacto, mismo cobro en otra prefactura, misma cantidad con tarifa distinta, varias líneas en la misma clave (informativo). Nada se elimina ni se descuenta. | 5 pruebas. Con la firma anterior los 16 grupos eran los mismos (ninguno difería solo en total). |
| C | `invoiceSummaries()` y el Financiero agrupaban por P.FACT. | En los datos actuales P.FACT es único (274 valores, cada uno con un productor, año, finca y semana), pero no hay garantía entre años: se usa la clave compuesta `año|productor|P.FACT`; si un número se reutiliza se muestra el año. | Prueba con P.FACT reutilizada en dos años/productores. |
| D | El ámbito Productores/CASUR/Todos solo filtra la Nómina; la Prefactura entra completa (4.452 filas en todos los ámbitos, grupo de tenencia CV). | El Financiero muestra el ámbito como nota y separa **universos**: Conciliable (CS9999 manual + TPS), Mecanizada CASUR y Fuera de conciliación (CS2661, TPS externo, aérea). Filtro por universo; no se mezclan como comparables. | Prueba de universos. |

Totales por universo (C$, columna Total): Manual 5.074.470,67 · TPS 1.008.028,84 · Mecanizada 5.471.932,59 ·
CS2661 1.011.941,06 · TPS externo 642.366,00 · Aérea 69.844,17 · **Total 13.278.583,33**.

### 7.2 Año operativo frente a la columna Periodo

- Periodo coincide 100 % con Semana. 38 semanas oficiales (2026-S02 29/12/2025–04/01/2026 a 2026-S39 14–20/09/2026),
  todas de lunes a domingo y consecutivas. La semana SIAGRI equivale a la ISO + 1 en 2026, pero **no se usa ISO**:
  el año sale de la regla de fecha/semana y las fechas se validan contra Periodo.
- Nómina: 11.383 filas dentro de su semana oficial, 0 fuera. 1.637 filas en semanas sin calendario (2025-S50..S52,
  2026-S01, S40–S42); para ellas Calidad de datos comprueba la fecha contra la semana extrapolada desde el calendario
  del mismo año (`date-outside-inferred-week`) y lo informa como inferido. 3 filas del 2025-12-03 marcadas S1.

### 7.3 Los 134 pendientes

| | Casos |
|---|---|
| En semanas ya prefacturadas | 5 (S24, S27, S31 TPS, S32, S35) — revisión prioritaria |
| En semanas aún sin Prefactura (S40: 45, S41: 49, S42: 35) | 129 — esperables; la Prefactura llega a S39 |
| Parciales | 0 |

Resumen y el informe de auditoría (hoja *Pendientes por semana*) muestran el desglose; las barras de semanas sin
Prefactura se distinguen.

### 7.4 Montos y etiquetas

- El KPI principal es "Total informado por SIAGRI" (C$ 13.278.583,33, sin descuentos). Los duplicados exactos se
  muestran aparte (C$ 105.908,10 en 16 copias extra) junto con los cobros repetidos en otra prefactura
  (C$ 18.774,80), **sin restarlos**.
- C$/ha → "Prefacturado por ha de suerte" (área física, una vez por suerte; *no es el costo total de producción*) y
  "Prefacturado por HA trabajada".
- La alerta de tarifa poco frecuente (5 %) sigue siendo informativa.
- No se compara la tarifa de Nómina con la de Prefactura.

## 8. Compatibilidad con la App Maestra (sin modificarla)

`tests/e2e/maestra-compat.mjs` sirve la vista de labores de la App Maestra (bundle `index-8b2-1-public.js`, HEAD
`938e809`) y la versión independiente desde el mismo origen. Genera P1 (lo que publicaría el legacy con los datos
actuales) y P2 (lo que publica v0.8) interceptando la API de GitHub; nada se publica.

| Comprobación | Resultado |
|---|---|
| P2 desde la interfaz = `buildPublishedTracking` | Igual; sin montos, tarifas ni P.FACT; campos del bundle intactos |
| Productores (Manuales / Mecanizadas) | 27 / 17 en ambas vistas; tarjetas 30 / 10 iguales |
| Cantidades por labor/UM, semana, finca y suerte | Iguales: tarjetas por labor/UM en la interfaz y CSV fila por fila (semana, finca, suerte) |
| Filtro productor + semanas S10–S20 | Iguales |
| Exportador CSV (Manuales / Mecanizadas) | 570 / 1.661 filas; **contenido idéntico fila por fila** en las 13 columnas de la App Maestra (productor, hacienda, suerte, fecha, semana, labor, UM, cantidad, edad, notas, fila); el CSV independiente agrega Archivo, Tarifa, Total, P.FACT y Período |
| Recarga | Estable, sin errores de página |
| IndexedDB | La App Maestra no la altera; esquema v1; cierres históricos conservados |

Dos ajustes surgieron de esta regresión (comparación fila por fila del CSV):

- El CSV de Seguimiento v0.8 escribía el período (`2026-S10`) en la columna *Semana*; se restituye el número de semana
  de v0.7 y el período va en una columna nueva *Período* al final (compatibilidad con quien consuma el CSV).
- El payload publicado no llevaba `ageNote` ni `sourceRow`, que el CSV de la App Maestra sí lee: su CSV mostraba
  *Nota de edad* vacía y *Fila* = `REPORTE!undefined` (también con el payload v0.7 publicado hoy). Se agregan al
  payload (sin montos). Efecto solo al volver a publicar `seguimiento.json`; la App Maestra no se modifica.

Diferencias de datos **intencionales** (legacy → v0.8 con los mismos archivos): filas 13.810 → 13.930 (+120 filas de
Nómina del 29–31 dic que pertenecen a 2026-S02); productores 150 → 30 (se quita "FACTURA :n.º" del nombre).
Por semana, las únicas diferencias legacy → v0.8 están en S02 (4 claves semana/UM). Publicado hoy (P0, datos al
8 sep, S37) → P2 hasta S37: 11.681 → 12.372 filas por la actualización de archivos (diferencias semana/UM en S12, S13,
S36 y S37).

**Diagnóstico de sincronización.** La App Maestra muestra los datos nuevos solo cuando se vuelve a publicar
`seguimiento.json` (manual). Llega por el payload: nombres de productor corregidos, inclusión de S02 completa,
mecanizadas. No llega (está en su bundle antiguo): filtros por período/año (riesgo de mezclar semanas de 2026 y 2027
cuando haya dos años), detalle con archivo/hoja de origen, módulo Financiero y demás interfaz v0.8. Tarifa, total y
P.FACT se excluyen a propósito del payload público. El defecto del botón de cerrar (icono X) no existe en el bundle
antiguo. No se modificó la App Maestra.

## 9. Organización del PR

Se evaluó separar el PR en (1) reconstrucción de la fuente, (2) cambios funcionales y (3) actualización de datos.
**Se mantiene un solo PR** porque: los commits ya están separados en ese orden y cada uno es revisable por sí mismo
(`58cc716`/`123babe` reconstrucción con equivalencia verificada; `cb83981`, `28c0226` y los commits de la revisión del 14 oct funcionales; `e93742b` datos;
`ded5d8b` build publicado); los cambios funcionales dependen de la fuente reconstruida y el build publicado depende de
ambos, de modo que tres PR se fusionarían obligatoriamente en ese orden y la raíz publicada quedaría inconsistente
con la fuente entre fusiones; y reescribir el historial invalidaría las referencias de esta documentación. Si se
prefiere, el primer PR puede crearse desde `123babe` sin reescribir nada.

## 10. Cierre técnico (15 oct): verificaciones bloqueantes

Sin cambios de reglas, importadores, montos ni interfaz.

| Verificación | Qué bloquea |
|---|---|
| **Golden** (`app/tests/golden`, dentro de `npm test`) | Cualquier diferencia en: hallazgos por tipo, estado, bandera y semana; cobertura (2.052/2.186); pendientes (134 = 5 en semanas prefacturadas + 129 sin Prefactura); totales financieros por universo, tipo de labor y contratista (C$ 13.278.583,33); repeticiones; Seguimiento (13.930 filas) y dataset publicado; alertas de calidad; y huellas SHA-256 de cada hallazgo, línea financiera y fila de Seguimiento. También falla si cambian los archivos de `datos/`. |
| **Registro de cifras** (`REGISTRO.md` + `scripts/golden-guard.mjs`) | Las cifras solo cambian con `npm run golden:update -- --justificacion "…"`, que agrega una fila con las huellas. La prueba exige que la última fila coincida con los archivos; la CI impide editar o borrar filas y publica el diff de cifras en el resumen de la ejecución con un aviso. |
| **Comparación legacy** (`compare-legacy.mjs --allowlist`) | Diferencias con el bundle 8b3-1-1 fuera de la lista permitida (95: 24 transiciones S02, 4 etapas TPS informativas, 67 hallazgos con banderas informativas), o permitidas que dejan de aparecer. La lista solo admite diferencias que cumplen una regla documentada de `legacy-diff.js`. |
| **App Maestra** (obligatoria) | Se examina en el commit fijado `MAESTRA_REF` (`938e809`) en solo lectura y sin credenciales persistidas. Falla si no puede leerse, si el commit no coincide o si no se ejecutan todas las comprobaciones (21 de compatibilidad y 10 de actualización). El resumen registra el commit y el SHA-256 de cada archivo examinado. |
| **Pruebas de navegador** | `smoke` (52), `upgrade` (9 o 10) y `maestra-compat` (21) fallan también si no completan todas sus comprobaciones. |
| **Acciones de GitHub** | `checkout`, `setup-node` y `upload-artifact` actualizadas a v5. |
| **Normalización** | El carácter literal U+FFFD de `normalizeText` se reemplaza por su escape `\uFFFD`; salida idéntica (prueba unitaria). |

Observación (comportamiento previo, no modificado): los identificadores de fila "por contenido" dependen de la zona
horaria del equipo, porque se calculan sobre las fechas que SheetJS entrega en hora local. Los valores (cantidades,
estados, montos) no cambian. Las pruebas se ejecutan en `America/Managua`, como la aplicación y las pruebas de
navegador. Corregirlo exige tocar el importador y queda propuesto para una etapa posterior.

Pendiente fuera del repositorio: marcar el check `verificar` como obligatorio en la protección de la rama `main`
(GitHub → Settings → Branches) para que una CI en rojo impida fusionar.
