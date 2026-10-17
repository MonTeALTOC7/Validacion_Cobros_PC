# Exportación de Auditoría de tarifas y cobros — QA

## Fase 1: alcance y estructura

En **Auditoría de tarifas y cobros** hay dos descargas locales: **Toda la Prefactura** y **Selección actual**. La primera usa todas las líneas cargadas, sin depender de la página visible. La segunda usa exactamente las filas que pasan los filtros de la vista y documenta sus valores en el libro.

El XLSX contiene:

| Hoja | Contenido |
|---|---|
| Resumen | Alcance, fecha, archivo/hash, filtros, controles, metodología y limitaciones. |
| Prefactura | Cada línea única del alcance, valores fuente, tarifas y columnas analíticas. |
| Revisión única | Un registro por identidad de auditoría, motivos y explicaciones operativas. |
| Motivos (no sumar) | Una línea por señal; el importe repetido se marca expresamente como no sumable. |
| Referencias mensuales | Medianas observadas, MAD, límites, suficiencia y muestra por servicio/labor/UM/contratista/universo/mes/jornada/base. |
| Evolución | Períodos anteriores y posteriores al corte, cobertura y cambios descriptivos de medianas. |
| Evidencia | Productor, hacienda, suerte, servicio, semana, P.FACT, archivo, hoja y fila. |

En la exportación completa, la prueba vuelve a abrir el XLSX y confirma **4.452** líneas y **C$13.278.583,33**, una sola fila por identidad, **887** registros únicos de revisión y **417** con comparables insuficientes. Estos dos últimos conjuntos se traslapan: el resumen lo indica y no los suma. `REPORTE!1376` aparece con CMN, tarifa reportada 0,88 y P.FACT conservado como texto.

Los importes individuales se conservan sin redondear. Los totales agregados del resumen se presentan a centavos, como la interfaz. No se genera tarifa autorizada, importe esperado ni diferencia económica. Las medianas son referencias observadas, nunca tarifas oficiales. Cuando se exporta una selección, las estadísticas de referencia mantienen la población completa del motor para no recalibrar por filtros; el resumen lo declara.

Las celdas de texto se escriben como texto XLSX, incluidos P.FACT y entradas que comiencen por `=`. No se crean fórmulas desde contenido fuente. La descarga no escribe en IndexedDB ni altera cálculos o cierres.

## Inventario actual y fase 2 propuesta

| Módulo | Exportación existente observada | Paso propuesto (PR separado) |
|---|---|---|
| Resumen | XLSX «Exportar vista» de hallazgos filtrados. | Verificar que conteos y evidencia correspondan al filtro; añadir resumen de control si falta. |
| Conciliación | El mismo XLSX de hallazgos filtrados, con identificación propia de archivo. | Revisar cobertura de filas, claves textuales y documentos de origen. |
| Revisión por Correo | Libro de revisión con resumen y detalle de discrepancias/evidencia. | Confirmar referencias cruzadas a Nómina y archivo, hoja, fila en pruebas de descarga. |
| Seguimiento de labores | CSV de labores y CSV separado de aplicaciones. | Añadir XLSX, conservar ambos CSV e integración App Maestra; comparar sus filas/columnas mediante regresión. |
| Financiero | Libro existente de 10 hojas: resumen, agrupaciones, tarifas, prefacturas y detalle. | Mantener; solo reparar omisiones demostradas por una prueba de exportación. |
| Paquetes TPS | XLSX de la vista de hallazgos filtrados. | Confirmar el total de registros TPS y rastreo a fuentes. |
| Auditoría de tarifas y cobros | El Excel superior existente es el informe general de conciliación; este PR agrega el libro exploratorio propio de la vista. | No ampliar más sin validar metodología y alcance con el usuario. |
| Historial y cierres | XLSX de bitácora, cierres y semanas. | Añadir referencias al análisis histórico solo si hay un requerimiento de negocio específico. |

Orden recomendado: auditar cada descarga actual con conteos/filas fuente; preparar un PR pequeño para XLSX de Seguimiento; luego atender únicamente las brechas concretas encontradas en Revisión por Correo y los demás módulos. Preservar exportadores válidos y no cambiar motores, importadores, cierres ni persistencia por cobertura de exportación.

## Validación

- Unitarias completas: 123/123; también pasan en `Asia/Tokyo` (111/111, excluida la prueba que compara zonas).
- Build y release de `app`: PASS; `verify-release` confirma que los 13 artefactos de `app/dist` coinciden con la raíz.
- E2E de Auditoría: 86/86, escritorio y móvil, con descarga XLSX completa y filtrada.
- Humo app/dist y raíz: 52/52 cada uno; drill-down: 54/54; actualización desde v0.7: PASS; zona horaria: PASS.
- Golden guard: PASS sin cambios de cifras. Legacy: 9 archivos idénticos. Comparación funcional: 95 diferencias, todas permitidas, 0 no permitidas.
- App Maestra fijada al commit 938e809: PASS en las comprobaciones de compatibilidad, filtros, exportadores y recarga.
- Formato de las fuentes modificadas y del árbol con `prettier --check --end-of-line auto`: PASS.
