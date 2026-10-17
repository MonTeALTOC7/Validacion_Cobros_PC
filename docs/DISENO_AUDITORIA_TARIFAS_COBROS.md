# Propuesta funcional y técnica — Auditoría de tarifas y cobros
Estado: DISEÑO PRELIMINAR, pendiente de revisión y aprobación. No equivale a auditoría concluyente ni autoriza cambios funcionales sin QA.
Base: `main` tras PR #1 (v0.8) y PR #2 (v0.9 B1), SHA `556d7717bb95e76adee1697cf5779a9bb0153db9`.

## Objetivo y límites
Conservar Conciliación como control de **cantidades de Nómina vs Prefactura** y Financiero como análisis de **importes SIAGRI**. Transformar la entrada de navegación «Auditoría y cierres» en «Auditoría de tarifas y cobros», dejando los cierres y la bitácora existentes en una subvista «Historial y cierres», sin pérdida de datos o compatibilidad.

La auditoría debe responder: (a) ¿la tarifa observada es consistente con sus comparables y vigencia?, (b) ¿el importe total informado corresponde al que estaba autorizado?, (c) ¿hubo ajuste tarifario donde correspondía?, (d) ¿existen cobros repetidos que requieran comprobar ejecución, prefactura definitiva y anulación? Mantener separados «observación», «indicio», «diferencia calculada con tarifario aprobado» y «error confirmado por revisión humana».

## Contexto declarado por Finanzas / regla SIAGRI
Al trasladar de Nómina a Cobros SIAGRI consolida por Hacienda, Suerte, Labor y Semana; se suman unidades e importes, pero el campo de tarifa del reporte puede ser un promedio aritmético de tarifas ordinarias y festivas, **sin modificar el importe**. El día específico desaparece del registro consolidado. Para registros homogéneos con unidades positivas, la tarifa efectiva observada es `importe SIAGRI / unidades SIAGRI`. Esta razón **no sustituye** la tarifa oficial ni certifica que el importe sea correcto. Puede haber distintas bases de tarifa entre Nómina y Prefactura; verificar equivalencia antes de cruzarlas monetariamente. Nómina no respalda por definición todas las mecanizadas o contratistas externos; éstos requieren otras fuentes documentales.

## Fuentes
- Prefactura: P.FACT, período operativo, Hacienda, Suerte, Labor, Servicio, UM, Unidades, Tarifa informada, Total, contratista, origen archivo/hoja/fila.
- Nómina: año, semana, fecha/jornada, trabajador, labor/servicio, UM, unidades, tarifa de Nómina y origen. No suponer homologación automática de tarifas.
- Maestro: ubicación/identidad de suerte y área física, para contexto, no como divisor universal de servicios.
- Futuro catálogo autorizado importable: servicio, labor, UM, contratista, categoría/tipo de jornada, tarifa aprobada, vigencia desde/hasta, documento/responsable, excepciones.
- Fechas de comparación sugeridas: diciembre de 2025–mayo de 2026 frente a junio de 2026 en adelante; **no son vigencias oficiales hasta validación**. Los datos actuales no garantizan cobertura de diciembre de 2025. Reajuste 4,6 %: hipótesis operacional configurable, no valor exigible universal ni fecha de vigencia confirmada.
- Evidencia operativa adicional: pantalla «Cambios de pagos y cobros», catálogo histórico de tarifas y reajustes, órdenes de trabajo, P.FACT final, anulaciones y ajustes.

## Conceptos y cálculo
Mostrar separados: `tarifa_reportada`, `tarifa_efectiva = total / unidades` (si unidades > 0 y UM válida), `tarifa_autorizada` (solo cuando hay correspondencia inequívoca de vigencia y tipo), `importe_original`, `importe_esperado` y `diferencia = original - esperado` (solo con tarifa autorizada, unidad/base compatibles, cantidades verificadas). No recalcular ni modificar montos originales.
Comparar series por servicio **y UM**, contratista, tipo de jornada, período/vigencia y universo financiero; evitar mezclar normal/festivo, distintos contratistas o distintas bases. Para grupo mixto, valorar por subpartes respaldadas si existen; de lo contrario, «No verificable con datos disponibles».
No sumar líneas asociadas a varios grupos repetidos dos veces; distinguir importe registrado en SIAGRI, exposición a investigar y cobro final confirmado.

## Detectores, evidencias y estados
1. Tarifa cero/casi cero, negativa, desproporcionada frente a referencia comparable (ejemplo mencionado: CMN 0,88): anomalía, no error automático.
2. Tarifa informada × cantidad distinta del importe: posible promedio SIAGRI; describir diferencia de presentación y valorar importe de forma independiente.
3. Tarifa efectiva fuera de distribución homogénea robusta (mediana/IQR o MAD) con tamaño mínimo y umbrales configurables; mostrar grupo comparable y evidencia, sin asumir tarifa oficial.
4. Ajuste de tarifa omitido/excesivo al cruzar con catálogo aprobado y fechas exactas; comparación antes/después exploratoria cuando aún no exista catálogo.
5. Diferencia económica concluyente únicamente cuando se conoce y valida el tarifario aplicable y la naturaleza del concepto.
6. Repeticiones exactas / entre P.FACT con fuente y solapamientos, sin diagnóstico automático de doble cobro.
7. Excepciones, fechas ambiguas, faltantes de catálogo, servicios/UM sin comparables suficientes: clasificar «requiere respaldo».
Estados de gestión independiente: Nuevo, En revisión, Justificado, Error confirmado, Corregido; guardar responsable, fecha, nota y evidencia. No modificar fuente importada.

## UX
Nueva pestaña «Auditoría de tarifas y cobros» en **séptima posición** de navegación, preservando «Seguimiento de labores» en la cuarta posición por compatibilidad con App Maestra.
Subvistas: Resumen; Tarifas y vigencias; Discrepancias; Seguimiento de casos; Historial y cierres.
KPIs clicables con recuentos, clasificación por severidad y montos **solo** cuando estén sustentados. Filtros por vigencia, servicio, labor, UM, productor, Hacienda/Suerte, contratista, tipo de jornada, estado y P.FACT. Línea de tiempo por servicio y comparador antes/después. Reutilizar componentes B1 de drill-down hasta fila original y fuente. Exportación Excel con Resumen, Hallazgos, Evidencias, Comparables, Tarifario y Metodología/limitaciones. Diseño compacto PC/móvil.

## Restricciones de implementación
No tocar motor original de conciliación ni cifras golden; no alterar `total` de Prefactura; no eliminar Auditoría y cierres: preservar bitácora, cierres, reaperturas, respaldos e IndexedDB v1; no modificar App Maestra ni orden cuarta pestaña. Guardar estado de casos de manera compatible (evaluar clave propia en `values`, sin crear stores ni subir versión), con fingerprint del conjunto fuente y reglas; los casos nuevos no deben autocerrarse con reimportaciones.
No cambiar producción directamente. Trabajar por PR independiente, pruebas CI, build reproducible, snapshots e invariantes de cifras, pruebas multizona y móvil.

## Fases
**A — Diseño y muestra de datos:** inspeccionar importadores, motor, Financiero, Calidad, IndexedDB, exportadores y 2025/2026 en `datos/`. Listar qué verificaciones son posibles hoy, qué faltará importar y cómo calcular una referencia sin falsear error monetario. Presentar modelo, UX y matriz de reglas; sin codificar todavía.
**B — Motor de auditoría + pruebas:** cálculo puro y determinista, verificaciones con escenarios mezclados normal/festivo, CMN 0,88, reajuste con vigencia exacta, sumatorias, cero unidades, contratista externo, tarifas sin catálogo, duplicidad con solapamiento.
**C — UX, gestión de casos, importador de tarifario y Excel:** mantener diseño existente, drill-down, accesibilidad, persistencia y compatibilidad.
**D — QA:** pruebas CI completas y validación del usuario antes de merge.

## Preguntas pendientes de negocio
1. ¿Existe tarifario aprobado por servicio, UM, contratista y vigencia, y en qué archivo?
2. ¿Qué fecha y porcentaje aplicó CASUR al cambio por salario mínimo? ¿Es igual para todas las labores?
3. ¿Tarifa de Nómina y tarifa de cobro corresponden a la misma base? ¿Incluyen cargas, otros conceptos?
4. ¿Cómo SIAGRI descompone cantidades ordinarias/feriadas y bajo qué evidencia puede consultarse?
5. ¿Existe historial de P.FACT final, cancelación, nota de crédito o reemisión para confirmar duplicados?
