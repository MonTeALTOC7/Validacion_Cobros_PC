# Validación de Cobros Mecanizados — Etapa A

Repositorio: `MonTeALTOC7/Validacion_Cobros_PC`. Rama: `feat/validacion-cobros-mecanizados-v09`.
Base: `15766fac51ce6766763e4849dcbcd01621893ba3`. Versión visible conservada: **v0.8.0**.

## Alcance para QA

La pestaña **Cobros mecanizados** incorpora fuentes y permite consultar evidencia. No determina todavía si existe respaldo de cobro, ejecución o deuda. Los ocho indicadores de conciliación se muestran como **No evaluado**; se implementarán en la Etapa B después de aprobación.

- HM: Excel, selección de una hoja, fila de encabezados configurable, mapeo por posición (incluye encabezados Labor repetidos), previsualización y exclusiones con fila y motivo. Se conservan HR y KM en el inventario, con cantidades originales, distribución por unidad y filtro de unidad. No se suman ni convierten cantidades entre unidades. Zona y Semana se conservan como campos opcionales y en las celdas originales. No se unen automáticamente hojas alternativas.
- Prefactura: reutiliza el importador y el estado existentes mediante **Cargar Prefactura existente**. El módulo recibe sus filas sin mutarlas. Filtro explícito inicial MEC/ZGC/CCH, editable; no representa un catálogo completo ni convierte FTS en MEC.
- Programación: Excel o TSV con comillas, tabulaciones y saltos de línea dentro de celdas. Mapeo explícito; no se presupone un formato real. Requiere hacienda, suerte, labor y fecha o período. Cantidad y unidad son opcionales.
- Dashboard por fuente, filtros, búsqueda, tabla paginada sin límite silencioso y encabezados fijos; inspector de valores y procedencia, operable con teclado.
- Las fuentes HM y Programación persisten en IndexedDB independiente `casur-mechanized-stage-a`, esquema 1. Confirmar una importación reemplaza solo esa fuente; cancelar o fallar preserva la anterior. La base existente no cambia.

## Arquitectura y archivos

`app/src/mechanized/importers.js`: lectura y normalización. `model.js`: inventario sin conciliación. `storage.js`: persistencia aislada. `MechanizedPanel.jsx` y `mechanized.css`: interfaz responsive y consulta de evidencia.

Integración mínima en `app/src/App.jsx`: pestaña agregada al final, Seguimiento continúa cuarta, exportación general ocultada en el prototipo para evitar confusión. No se modifican motores/importadores/exportadores existentes.

`app/vite.config.js`: fecha de compilación explícita para reproducibilidad entre días; actualizarla deliberadamente al preparar otra entrega. `assets/`, `index.html` y `sw.js`: build de revisión en esta rama, necesario para la verificación de CI. Generar este build local no publica GitHub Pages.

Pruebas nuevas: `app/tests/unit/mechanized.test.js`, `app/tests/e2e/mechanized.mjs` y `app/tests/tools/check-mechanized-files.mjs`. La CI añade el flujo sintético; sus capturas temporales no alteran las capturas versionadas.

## Verificación local

- 131 pruebas unitarias y golden aprobadas.
- Humo existente: 52/52, escritorio y móvil, exportaciones y persistencia anterior.
- Flujo nuevo PC/móvil: HM Excel, separación HR/KM y trazabilidad Zona/Semana, paginación, TSV, reemplazo por programación Excel, cancelación y fallo de fuente, Prefactura sintética por el importador existente, selección de fuente, inspector, recarga, cuarta pestaña y ausencia de desbordamiento global.
- Excel reales leídos únicamente desde sus rutas locales: cada hoja alternativa HM produce 200 movimientos (163 HR y 37 KM: 31 ALC y 6 ALR), todos con Zona 5 y Semana informada; Prefactura produce 4.452 filas sin exclusiones. No se copian estos archivos ni sus filas al repositorio.
- App Maestra examinada en modo lectura: `938e809a6e6ddae0f8e1c4c2f2f1500a5f6527dc`; prueba comparativa existente, incluyendo esquema IndexedDB y cuarta pestaña.
- `npm run release`, `node scripts/verify-release.mjs` y comparación SHA-256 de dos builds consecutivos. Revisar también el resultado de CI enlazado en el PR.
- En Windows, el chequeo local de Prettier usa `--end-of-line auto` por los CRLF del checkout. CI comprueba el formato estándar del contenido Git en Linux.

## Recorrido de aprobación

1. Abrir Cobros mecanizados; importar HM, elegir REPORTE y revisar mapeo de Labor/descripción.
2. Validar y revisar exclusiones antes de incorporar. Abrir un registro y consultar documento, máquina, fila y celdas originales.
3. Cargar Prefactura desde el flujo existente y volver al módulo. Cambiar el filtro explícito de códigos para revisar otras labores.
4. Pegar una programación o elegir Excel, asignar columnas, validar e incorporar. Recargar y comprobar que ambas fuentes locales siguen disponibles.
5. Revisar en PC y teléfono; la tabla permite desplazamiento horizontal en pantallas estrechas.

Capturas exclusivamente sintéticas: [PC](mecanizadas-etapa-a/pc.png), [móvil](mecanizadas-etapa-a/movil.png), [inspector PC](mecanizadas-etapa-a/pc-evidencia.png), [inspector móvil](mecanizadas-etapa-a/movil-evidencia.png).

## Límites y pendientes

- Formato real de Programación pendiente de recepción y validación. El mapeo flexible es funcional, pero no se afirma compatibilidad con una plantilla aún no suministrada.
- Extremos de fechas observadas no garantizan cobertura completa. No se comparan ni suman cantidades HR, KM y HA ni se suman importes de evidencia relacionada.
- Las identidades de contenido SHA-256 conservan firma para verificar colisiones dentro de la importación; sobreviven a reordenamiento/renombre. Las filas idénticas se conservan y cuentan como repeticiones. La identidad documental para decisiones, cambios de evidencia, historial, respaldo/restauración de decisiones y equivalencias revisables corresponde a Etapa B.
- Reemplazo de fuentes explícito, sin archivo histórico de importaciones en esta etapa. No hay sincronización entre dispositivos ni inclusión del nuevo almacén en el respaldo antiguo.
- Tablas redimensionables, ordenación avanzada y exportadores propios corresponden a Etapa C.
- No se hizo merge, despliegue, cambio de versión ni escritura en la App Maestra. Detener desarrollo para QA al entregar el PR en borrador.

## Ajustes de revisión técnica sobre e5e02bd

Se conservan los 200 movimientos HM por hoja alternativa. Las tarjetas muestran conteos por unidad y el filtro permite inspeccionar HR/KM por separado. Zona y Semana son texto normalizado opcional, sin inferirlos de la fecha; se conserva el valor original y la fila. Para actualizar una fuente importada con la revisión anterior, vuelva a importar el Excel y confirme el reemplazo: no se modifica silenciosamente el almacén anterior ni se inventan campos faltantes.

Prefactura conserva servicio SAP, UM y clasificación si existe. El filtro por labor no clasifica la línea como mecanizada: ZGC puede incluir servicios de distinta naturaleza. La clasificación definitiva permanece fuera de Etapa A. Se añadieron pruebas sintéticas de 200 filas y de Prefacturas ZGC con servicios, unidades y clasificaciones distintas; no se cambió su importador ni su motor.
