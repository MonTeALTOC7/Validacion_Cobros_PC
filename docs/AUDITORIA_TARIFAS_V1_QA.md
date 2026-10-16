# Auditoría de tarifas y cobros V1 — guía de revisión

Implementación del alcance aprobado en `ALCANCE_APROBADO_AUDITORIA_TARIFAS_V1.md`. PR borrador; pendiente de QA visual del usuario. No autoriza integración ni publicación.

## Arquitectura y límites

- `app/src/engine/audit/tariffAudit.js`: función pura `analyzeTariffs(prefactura, options)`. Recibe las filas normalizadas de Prefactura completas; no usa hallazgos, Nómina ni Revisión por Correo como dependencia. Solo reutiliza las funciones de clasificación financiera en lectura.
- `app/src/components/audit/TariffAuditPanel.jsx`: envoltorio de la séptima pestaña `audit`. Resumen ejecutivo, Tarifas por período, Discrepancias e Historial y cierres. Usa los componentes comunes `Metric`, `DataTable`, `DrillDrawer` y `LineFields` sin modificarlos.
- CSS propio bajo clases `audit-*`/`tariff-audit-module`. El panel de cierres original se renderiza directamente, con sus mismas propiedades, reglas y almacenamiento.
- Auditoría no escribe IndexedDB, no agrega parámetros de conciliación ni persiste expedientes. Configuración de muestra y umbral solo durante la sesión del panel. Volver a entrar restablece los valores iniciales.
- No cambia ningún motor/estado heredado, importador, exportador, datos, golden ni App Maestra. Seguimiento permanece en cuarta posición. El botón Excel superior conserva el informe general existente; no exporta el nuevo análisis.
- Los archivos generados en la raíz forman parte del build revisable requerido por CI. Pages está configurado sobre `main`; subir esta rama o abrir el borrador no publica la aplicación.

## Reglas reproducibles

1. Tarifa efectiva = `Total / Unidades` únicamente con números finitos, unidades positivas y UM identificada. La tarifa y el importe originales permanecen intactos. La efectiva es una razón descriptiva, potencialmente mixta.
2. Diferencia de presentación = `Total − Tarifa × Unidades`, conservando precisión; señal cuando su valor absoluto supera C$0,02 (epsilon numérico 1e−8). Es compatible con promedio SIAGRI, sin afirmar que esa sea la causa ni que el importe sea correcto. No alimenta diferencias económicas.
3. Población fija por servicio, labor, UM, contratista, universo financiero, mes calendario de la fecha del reporte y jornada/base cuando se conocen. `No informada` no se interpreta como jornada normal. Faltantes de servicio/UM/contratista/fecha impiden una referencia suficiente.
4. Se excluyen copias exactas únicamente de la muestra. Se necesitan 10 tarifas positivas en al menos 2 semanas operativas distintas dentro del mes. Nunca se mezclan meses/contratistas/UM para alcanzar ese mínimo. La referencia reportada y la efectiva tienen muestras y conteos propios.
5. Mediana y MAD (mediana de desviaciones absolutas). Radio = `max(3,5 × 1,4826 × MAD; 25 % × |mediana|; 0,02)`. Intervalo `[max(0, mediana − radio), mediana + radio]`. El piso evita inestabilidad por MAD cero o redondeo. No se presenta este intervalo como tarifa autorizada.
6. Fuera de intervalo: atípica reportada o efectiva. Razón respecto de mediana `< 1/100` o `> 100`: prioridad extrema. Una tarifa menor que 1 no se considera anómala por sí sola. Ceros/negativos requieren revisar la celda, posibles créditos/ajustes y documentación.
7. Histórico: misma serie dimensional, corte descriptivo `2026-06-01`, medianas antes/después y cambio porcentual observado. Se muestran fechas reales, muestras y advertencia de composición. No se impone 4,6 %, no se crea diciembre de 2025 y no se determina reajuste exigible. Falta de uno de los lados produce un valor no disponible, no cero. Con menos de 10 muestras por lado se avisa muestra limitada.
8. Repetición exacta, misma combinación en distintas P.FACT y misma cantidad con tarifas distintas: indicios documentales. La firma incluye productor, finca/suerte, servicio, UM, contratista, semana/fecha y base/jornada disponibles. Las distintas tarifas pueden corresponder a jornadas distintas. Se exige ejecución/P.FACT final/anulación/reesmisión para resolverlo. No se eliminan filas de los importes.
9. Una línea puede activar varias reglas. Resumen y selección cuentan la unión de líneas originales; importes repetidos se suman una sola vez por línea. No se suman conteos de categorías como si fueran partidas independientes.
10. `authorizedTariff`, `expectedAmount`, `economicDifference` son `null`: **Tarifa autorizada no disponible / importe esperado no verificable**. Nunca se calcula sobrecobro a partir de medianas o porcentajes supuestos.

Configuración completa expuesta por el motor; UI permite cambiar mínimo de muestras y umbral robusto sin tocar los parámetros compartidos. Los filtros de presentación no recalculan ninguna población. Los identificadores `auditId` solo identifican filas de la corrida actual; no son expedientes persistentes.

## Referencia sobre datos versionados

Prefactura SHA-256 `c775b5a8bfa05cccc1992c964e0782c384d68117b8a74552f0302cd8dbfccee9`. Fechas reales **2026-01-02 a 2026-09-20**. El nombre del manifiesto no amplía esa cobertura.

| Magnitud | Resultado inicial |
|---|---:|
| Líneas originales | 4.452 |
| Total informado SIAGRI | C$13.278.583,33 |
| Hallazgos de conciliación, sin cambios | 2.348 |
| Poblaciones mensuales / series históricas | 172 / 55 |
| Líneas con algún indicador | 495 |
| Extremos prioritarios | 21 |
| Atípicas reportadas o efectivas, unión de filas | 436 |
| Presentación SIAGRI en esta Prefactura | 0 |
| Sin referencia suficiente | 417 |
| Líneas con indicios de repetición, unión | 91 |
| Importe original de esas 91 líneas | C$288.238,26 |
| Copias exactas excluidas solo del entrenamiento | 16 |
| Grupos exactos / entre P.FACT / cantidad con tarifa distinta | 16 / 2 / 28 |

Los 21 extremos incluyen CMN 0,88 en `REPORTE!1376`, `REPORTE!1403`, `REPORTE!1424`, P.FACT 16183, 2026-S19. Sus totales originales son C$7,32, C$2,88 y C$2,70. Son señales prioritarias aun cuando la multiplicación es consistente. Hay otras labores extremas en esa misma P.FACT; no es una regla codificada solo para CMN.

436 atípicas no equivalen a 436 errores: la jornada/base desconocida y mezclas ordinarias/festivas pueden explicarlas. Las 91 líneas repetidas y su importe tampoco son dobles cobros confirmados. Los 383 grupos de varias líneas por clave del módulo heredado no se transforman en alertas de duplicidad en este MVP.

El caso SIAGRI de 4,2 unidades, tarifa presentada 515,065 y total 2.028,837 se prueba mediante una fuente controlada: efectiva 483,0564286 y diferencia de presentación −134,436, con diferencia contractual no verificable. No se agrega esa fuente de prueba a los datos publicados.

## Guion de QA visual

1. Abrir la vista previa local y entrar a la séptima pestaña. Verificar cobertura real, total original y aviso de ausencia de tarifario.
2. Pulsar «Extremos prioritarios», buscar `1376`, abrir la fila y revisar CMN, 0,88, efectiva, P.FACT, archivo, SHA-256 y `REPORTE!1376`.
3. Abrir «Ver muestra comparable»: revisar mediana, MAD, intervalo, número de semanas, filas incluidas y origen. Volver mediante la ruta; Escape debe cerrar y devolver el foco conservando la búsqueda.
4. Abrir el KPI del total. Desglosar por productor, hacienda, suerte, labor, servicio, semana o P.FACT hasta una fila. El total del nivel no se multiplica por la cantidad de señales.
5. En «Tarifas por período», seleccionar `16013 · CMN · HA · CS9999`. Comparar fechas/muestras reales antes/después y consultar cada mes. Cualquier cambio es observado, no un reajuste autorizado.
6. En Discrepancias, filtrar repeticiones y abrir los registros coincidentes. Comprobar que no se descuentan importes ni se declaran cobros duplicados.
7. Abrir «Historial y cierres». Verificar el panel anterior y los cierres ya existentes. Un cierre de conciliación no certifica tarifas.
8. Repetir con pantalla de 390 px y teclado Tab/Mayús+Tab/Escape. Las tablas tienen desplazamiento interno; la página no debe desbordarse. La prioridad del resumen se pagina en seis filas.

## Validación automatizada y limitaciones

Pruebas nuevas: `tests/unit/tariff-audit.test.js` (17 escenarios) y `tests/e2e/tariff-audit.mjs` (67 comprobaciones PC/móvil). Además se ejecutan las pruebas completas existentes, zonas horarias, golden guard, hashes legacy/v0.8, release reproducible, humo dist/raíz, B1, upgrade, comparación legacy y App Maestra en `938e809a6e6ddae0f8e1c4c2f2f1500a5f6527dc`. Los selectores de las pruebas de cierres se adaptan a la nueva ubicación; no se debilitan sus aserciones ni las de consola. Ver resultados del HEAD revisado en la pestaña Checks del PR.

En la ejecución local Windows/Chrome se reproduce el 404 de `/favicon.ico` de la base: auditoría 66/67, humo 51/52 y B1 53/54; las funciones pasan, el control de errores de consola falla. Zonas horarias conserva cifras en las seis zonas y falla también ese control (28/29). La comparación legacy mantiene las 95 diferencias autorizadas, ninguna nueva, pero registra el 404 del bundle legacy. No se cambió favicon ni arnés para ocultarlo. Chromium 129 descargado por Playwright no pudo iniciarse en este Windows (`spawn UNKNOWN`); la CI Linux usa su instalación reproducible.

Las 109 pruebas unitarias/golden, 97 de la ejecución Asia/Tokyo, actualización con App Maestra y sus 21 comprobaciones de compatibilidad pasan localmente. El chequeo de formato en Windows detecta los CRLF del checkout; Linux valida los blobs LF. El build debe generarse con `app/index.html` y los SVG de `app/public/` en LF (como los blobs de Git) para que la raíz y las huellas del precache sean reproducibles entre sistemas. No es necesario cambiar su contenido funcional.

El importador existente descarta unidades cero y algunas filas inválidas; solo se auditan los registros conservados. Tarifa/total ausentes pueden haber sido normalizados a cero y no se conserva la celda cruda. El detalle muestra la precisión numérica conservada por el importador, no garantiza recuperar el formato de celda Excel. Tampoco hay historial de P.FACT finales, anulaciones, base/jornada identificada ni tarifa autorizada. Estos límites se muestran en el módulo y no se suplen con suposiciones.

Pendiente de una fase posterior aprobada: tarifario oficial, verificación económica contractual, expedientes persistentes, documentos adjuntos y exportación propia de auditoría.
