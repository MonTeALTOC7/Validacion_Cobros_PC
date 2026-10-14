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
| 3 | **Duplicados exactos de Prefactura** se marcan (bandera *Duplicado potencial* o *Repetición respaldada*), no se eliminan. | Antes solo se contaban en un indicador. | Datos nuevos: 16 grupos, 16 copias extra por C$ 105.908,10. |
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
  Prefactura y tarifa registrada en Nómina), en Seguimiento y en el CSV de labores.
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

- `npm test`: 43 pruebas unitarias (períodos, normalización, importadores, conciliación directa, TPS, duplicados,
  cambio de año, finanzas, tarifas, calidad, Maestro Central).
- `tests/e2e/smoke.mjs`: 52 comprobaciones en Chromium, escritorio (1366 px) y móvil (390 px): todas las pestañas,
  detalle con tarifa y origen, exportaciones, importación, cierre y reapertura, respaldo, esquema sin cambios.
- `tests/e2e/upgrade.mjs`: datos guardados por v0.7 se conservan y actualizan; el cierre v0.7 se conserva; la vista de
  labores de la App Maestra (bundle antiguo) abre la base actualizada.

## 6. Pendiente de confirmar con negocio

- Regla de año operativo (semana baja con fecha de diciembre → año siguiente): verificada en datos 2025–2026.
- Significado de la columna Tarifa de Nómina (en estos datos coincide con la tarifa cobrada para 16013).
- Si el umbral de 5 % para "tarifa poco frecuente" es adecuado.
- Sucuya / código 16: el conciliador no tiene regla propia; los archivos actuales no contienen ese código.
- Publicación de `seguimiento.json` para la App Maestra: sigue siendo manual (botón "Publicar Seguimiento").
