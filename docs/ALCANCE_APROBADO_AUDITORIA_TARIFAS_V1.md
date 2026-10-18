# Alcance aprobado de la primera implementación — Auditoría de tarifas y cobros

**Decisión de negocio comunicada:** 16-oct-2026. **Estado:** autorizada implementación por fases en rama independiente; ninguna publicación o merge sin QA visual y autorización posterior.

## Principio de fuente y alcance

La **Prefactura SIAGRI** es la fuente principal de cantidades, tarifas mostradas e importes reportados de cobro. La explicación remitida por Finanzas solo documenta cómo **interpretar** las discrepancias entre tarifa reportada e importe en consolidaciones: SIAGRI puede promediar aritméticamente tarifas cuando agrupa registros, aun cuando haya totalizado correctamente los importes. **No reconstruir el sistema Cambios de pagos y cobros como dependencia ni condicionar el módulo a tener sus datos.** No suponer que toda discrepancia se debe a promedios o que un importe es correcto solo porque procede de Prefactura.

- Tarifa mostrada SIAGRI: `row.tariff` original, inmutable.
- Importe SIAGRI: `row.total` original, inmutable y siempre identificado como **prefacturado/informado**, no pagado confirmado.
- Tarifa efectiva descriptiva: `row.total / row.units` si unidades > 0 y campos válidos. No equivale automáticamente a tarifa autorizada; para grupos mixtos es una razón ponderada.
- Tarifa autorizada y diferencia económica: **no calculables** sin documento/catálogo autorizado que defina tarifa, servicio, UM, contratista, base, vigencia y excepciones.
- Tarifa observada excepcional (p. ej. CMN servicio 16013 a 0,88): anomalía prioritaria para verificar, NO sobrecobro confirmado, incluso cuando tarifa x unidades coincide con importe.
- Reajuste aproximado 4,6 % en torno a junio de 2026: criterio exploratorio **no aprobado** como regla universal de cobro. Fecha, porcentaje y sujetos exactos necesitan respaldo CASUR.
- Período histórico: en Prefactura actualmente constan registros desde enero de 2026, **no desde diciembre de 2025**. Comparar enero–mayo contra junio en adelante según cobertura y mostrar fechas reales; diciembre de 2025 es visible en Nómina pero no amplía ficticiamente Prefactura.

## Prohibición expresa de regresiones

El desarrollo es **un módulo nuevo**, no una revisión general del sistema actual. Mantener sin cambios funcionales/semánticos en esta fase:
- Conciliación, reglas/estados, golden y cantidades.
- Financiero, sumatorias, universos, drill-down B1 y exportadores.
- Revisión por Correo, incluso su estado heredado `TOTAL_INCORRECTO`: **no modificar** ahora, aunque auditoría nueva clasifique como presentación compatible casos que esta revisión marca de otra manera.
- Calidad de datos, incluso sus advertencias heredadas.
- TPS, Seguimiento, parámetros actuales, maestro CASUR, IndexedDB schema v1, bitácora, cierres y respaldos.
- Cuarta posición de navegación para Seguimiento de labores, requerida por App Maestra.

Único cambio admisible de navegación: el panel actualmente llamado «Auditoría y cierres» se presenta como «Auditoría de tarifas y cobros», manteniendo el ID `audit`, e incluye una subvista «Historial y cierres» que renderiza el panel existente **sin modificar su lógica**. Preferir un nuevo componente envoltorio `TariffAuditPanel` y motor aislado; cualquier cambio transversal imprescindible requiere justificación, tests y revisión previa.

## Objetivo de MVP (primera entrega funcional)

La primera implementación **debe ser útil sin tarifario oficial**, pero no podrá declarar diferencias contractuales confirmadas.

1. Motor puro independiente que recibe Prefactura y configuración local de auditoría. No reescribir importadores, no descartar líneas originales ni modificar totales.
2. Detección explicable y reproducible de: tarifa cero/casi cero, valores extremos de tarifa reportada y tarifa efectiva, discordancia `tarifa_reportada * unidades` vs. importe (señal **de presentación**, no error de importe), cambios interperíodo por servicio/UM/contratista y repetición documental con líneas únicas sin doble conteo.
3. Agrupar poblaciones homogéneas: por servicio + UM + contratista + universo + período, segmentando jornada/base cuando se conoce. No suponer jornada normal cuando se desconoce. Para comparables insuficientes reportar «Sin referencia suficiente».
4. Referencia estadística robusta calibrada sobre la **misma población fija** por corrida (mediana + MAD o alternativa justificada, umbrales explícitos y configurables; control de MAD=0); excluir copias exactas del conjunto de entrenamiento sin alterar finanzas. Las búsquedas/filtros de presentación **no cambian** la referencia.
5. Vista Resumen (KPIs clicables), Tarifas y vigencias observadas, Discrepancias (tabla compacta), y drill-down hasta Prefactura archivo, hoja y fila; conservar el historial de cierres en subvista.
6. Comparador temporal de tarifas efectivas y reportadas para **mismo servicio + UM + contratista** y cobertura visible. Mostrar porcentaje de cambio observado sin asumir automáticamente que debe ser 4,6 %.
7. Estado de ausencia de tarifario muy claro: «Tarifa autorizada no disponible / importe esperado no verificable». **No presentar C$0 como importe de diferencias** por falta de catálogo.
8. Mostrar todas las observaciones como «Indicadores para revisar», «Presentación SIAGRI» o «Respaldo insuficiente». No declarar fraude, error confirmado, cobro pagado o sobrecobro definitivo.
9. Permitir navegar por casos sin mutar datos. Reutilizar UX B1 y cuidar móvil/accesibilidad.

### Fuera del MVP; diseñar interfaces sin implementarlas en esta primera entrega
- Importación de tarifario oficial CASUR y cálculo de importe exigible por vigencia.
- Expedientes persistentes con resolución humana y documentos adjuntos.
- Exportación contable concluyente de diferencias monetarias.
- Cambios a reglas de Revisión por Correo / Calidad para corregir falsos positivos heredados.

Estos trabajos se harán en una siguiente subfase, con decisiones de negocio confirmadas.

## QA y entregable

Trabajar exclusivamente en `feature/auditoria-tarifas-cobros`; empezar de `main` actual con diferencias limitadas al documento de diseño. Crear PR **draft**, sin merge/publicación. La v0.8 + B1 aprobadas son la base inmutable.

Validaciones mínimas:
- Todas las pruebas `golden` del motor existente, los importadores, finanzas, conciliación, seguimiento, B1, actualización, zonas horarias y compatibilidad App Maestra.
- Ejemplos reales CMN 0,88 (Prefactura REPORTE 1376, 1403 y 1424), GCO consolidado del reporte recibido (solo evidencia contextual si se provee; no obligatorio para la primera versión), tarifas pequeñas legítimas de otras UM, cero unidades y precisión/redondeo.
- Invariantes: total Prefactura C$ 13.278.583,33; las 4.452 líneas permanecen en universo original; 2.348 hallazgos de conciliación; ninguna cifra/estado heredado cambia.
- Pruebas PC y móvil, teclas Escape/Tab/Mayús+Tab, ruta, abrir/cerrar paneles, filtros, y Excel existente.
- Cualquier 404 real de favicon o error de navegador debe documentarse y justificarse, no ocultarse alterando el arnés o silenciando la consola.
- No crear versiones ni datos de prueba que sustituyan datos reales publicados.

Antes de pasar a implementación de catálogo autorizado o expedientes persistentes, presentar resultado MVP, evidencia de pruebas y vista previa para revisión del usuario.

## Documentos
- Diagnóstico local de Codex `DIAGNOSTICO_PROPUESTA_AUDITORIA_TARIFAS_COBROS.md` (aportado al chat, no guardado en el repositorio).
- Diseño anterior `docs/DISENO_AUDITORIA_TARIFAS_COBROS.md`. Ante diferencias de alcance, **rige este documento de decisiones**.
