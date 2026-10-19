# Etapa B · Conciliación documental mecanizada

Base: `db2a1b34ceb3ca8c070c1558c6bd56c2776d4ff0` de `feat/validacion-cobros-mecanizados-v09` (PR #4). Rama B: `feat/mecanizadas-v09-b-conciliacion`. El PR de B se compara contra la rama A. Sin merge, despliegue, modificación de App Maestra ni actualización del preview.

## Arquitectura

- `app/src/mechanized/reconciliation.js`: funciones puras de clasificación, identidad, comparación, generación de casos, vigencia de revisiones y conteo único de importes. No modifica ninguna fila recibida ni los motores anteriores.
- `model.js`: conserva el inventario de A; los eventos de Programación también separan zona y exigen revisión ante documento ausente, productos repetidos o superficies incompatibles.
- `ReconciliationBoard.jsx`: dashboard y bandeja de casos con filtros, reglas explícitas, inspector, selección documental, decisiones y respaldo local. Se integra junto al inventario/importadores de A, sin sustituirlos.
- `storage.js`: migra exclusivamente `casur-mechanized-stage-a` de Dexie v1 a v2. Conserva `sources`; añade `cases`, `evidence`, `reviews`, `settings`. La base compartida `conciliador-casur` permanece en v1. Casos/evidencias son una caché recalculable; las decisiones y su historial se conservan por separado.

## Reglas verificables

1. Hacienda por código normalizado (nombre solo si falta código), suerte con sufijo conservado y labor compatible. Nunca se une solo por finca/suerte. Los registros y celdas originales no se transforman en la fuente.
2. Fecha de ejecución de Programación tiene prioridad sobre inicio/final. Intervalos sin fecha puntual generan candidatos, nunca coincidencia fuerte. Tolerancia inicial ±14 días, configurable entre 0 y 366. El inspector explica diferencia temporal, documentos, zona y contradicciones. Ejercicio y semana SIAGRI se conservan, sin cálculo ISO.
3. Coincidencia fuerte exige misma labor, misma fecha puntual, documentos en ambas fuentes, clasificación PF mecanizada cierta y ausencia de ambigüedad, contradicción o trabajos competidores. Las numeraciones de documentos de las fuentes son independientes: que ambas existan no significa que sean el mismo número. Una coincidencia fuerte tampoco es confirmación humana.
4. No existen equivalencias predeterminadas. El revisor puede habilitar, por ejemplo, `FTS=MEC` como **sugerencia candidata**, nunca como sustitución del código. Para suertes distintas, el inspector permite buscar y vincular otras evidencias manualmente, dejando nota y selección exacta.
5. Se generan casos por movimiento HM; después se añaden eventos y PF no representados. Los puentes a través de Programación conservan todos los respaldos, sin fusionar pases por transitividad. Un caso no equivale necesariamente a una ejecución física: cada KPI dice **casos**, y los conteos de movimientos, eventos candidatos y líneas PF aparecen separados.
6. Los productos compatibles se agrupan como evento candidato por documento, finca, suerte, labor, fechas, zona, ejercicio/semana, estado, UM, reserva y bodega. Cada línea, producto, dosis y cantidad se conserva. Una superficie idéntica aparece una sola vez en el evento; áreas incompatibles quedan ambiguas. No se agregan HR, KM y HA ni se calculan rendimientos.
7. `Ejecutado=SI` es ejecución reportada. NO/suspendida no genera cobro faltante; si hay HM/PF compatible se presenta inconsistencia. Estado ausente no se inventa.
8. Prefactura reutiliza **en lectura** `financeClass()`. Manual, TPS, TPS externo, aéreo y CS2661 se excluyen con motivo visible. Clase MECANIZADA + UM HR/KM/HA + P.FACT permite candidato cierto. Otros contratistas, SAP desconocido, UM distinta o documento ausente requieren revisión; MEC/ZGC/CCH solos nunca bastan. Todas las líneas PF siguen disponibles en el motor, incluidas las exclusiones. El filtro del inventario de A no restringe la conciliación.
9. Sin PF localizada requiere ejecución reportada, una fuente PF cargada y **declaración documentada del revisor** de intervalo y zonas que cubra también la tolerancia. Sin esa declaración se muestra cobertura insuficiente. Zona ausente no se trata como otra zona ni satisface una cobertura de zona específica. `*` es declaración explícita de todas las zonas. Los extremos observados no acreditan integridad del reporte.
10. Duplicados idénticos o identidades documentales insuficientes bloquean confirmación. Líneas de diferentes P.FACT con idénticos atributos de facturación se señalan como posible duplicidad, conservando las líneas separadas para revisión.

## Decisiones y trazabilidad

Las claves persistentes usan documento, fuente, hacienda/suerte/labor, fecha, ejercicio y atributos específicos (máquina, servicio/contratista/productor o producto/bodega). Son claves canónicas completas, sin hashes susceptibles a colisión y sin índices de fila. Archivo, hoja y fila son procedencia, no identidad. Las huellas conservan el contenido normalizado; los snapshots de revisión incluyen las filas y originales disponibles.

Cada guardado exige observación y conserva fecha UTC, estado, selección exacta, huellas y entrada nueva de historial. Confirmar requiere al menos PF y HM/Programación, sin identidades ambiguas ni PF excluida. Es posible vincular varios movimientos o suertes al mismo respaldo; el importe confirmado usa un conjunto de identidades PF y no se duplica. Los estados calculados permanecen separados de las decisiones humanas.

Descartar registra las sugerencias seleccionadas y las identifica como rechazadas en el inspector. El caso continúa pendiente; descartar una sugerencia no cierra todas las demás. Reabrir, dejar pendiente, desvincular y registrar ausencia después de revisión generan historial, no eliminaciones.

Reimportar el mismo contenido en otro orden/archivo conserva la revisión. Cambiar contenido, candidatos relacionados, reglas o evidencias vinculadas la vuelve no vigente. El dashboard deja de contar la confirmación. Si cambia una parte de la identidad (por ejemplo, documento o fecha), la decisión antigua permanece en «decisiones sin caso vigente» con todos sus snapshots, sin aplicarse silenciosamente al caso nuevo. La escritura verifica revisión previa para evitar pérdida de historial entre pestañas.

El respaldo JSON local contiene decisiones e historial, incluidos snapshots. No transmite datos ni reemplaza las fuentes importadas. Restaura transaccionalmente: valida formato/versión, estados, estructura, última revisión e identidades; omite duplicados idénticos y rechaza conflictos sin sobrescribir nada. La vigencia se calcula contra las fuentes y reglas actuales, incluso después de restaurar. El respaldo puede contener datos de los archivos del usuario: debe conservarse bajo su control local.

## Pruebas y ejemplos sintéticos

`tests/unit/mechanized-b.test.js` añade 25 escenarios parametrizados al conjunto anterior: tres fuentes, FTS/MEC configurable, PF sin HM, ejecución sin PF con/sin cobertura, suspensión/NO, productos múltiples, ambigüedad, pases, duplicados PF, fechas, zona/semana, 200 movimientos (163 HR/37 KM; 31 ALC/6 ALR), clasificación ZGC, selección manual, reapertura, reimportación, cambios/desaparición, respaldo y conteo único. Incluye un puente HM→Programación→PF para detectar evidencia que podría perderse fuera de la tolerancia directa.

`tests/e2e/mechanized-b.mjs` usa exclusivamente datos inventados. En PC y móvil crea una base A real (versión nativa IndexedDB 10), abre B y comprueba migración a 20, conservación de fuentes, importación PF oficial, reglas, filtros, confirmación, recarga, exportación/restauración, duplicados/conflictos, cambio de fuente, pérdida de vigencia, reapertura y base legacy sin cambio. Se añade a la CI existente; las capturas de CI van a un directorio temporal, sin modificar las versionadas.

La CI mantiene todas las regresiones anteriores. `scripts/private-ci-check.mjs` conserva sus códigos de salida y publica únicamente resultado/conteos: las pruebas heredadas utilizan fixtures del repositorio y antes imprimían nombres o informes de productores. Ya no se suben sus informes detallados; los artefactos contienen resultados sin registros, referencia de App Maestra y capturas sintéticas A/B. Dos pruebas adicionales comprueban que el wrapper preserva éxito/fallo y no expone stdout/stderr sensible. Los diagnósticos de una regresión fallida se reproducen localmente.

Validación local: 161 pruebas unitarias/golden; importadores A y flujo B en escritorio/móvil; 56/56 comprobaciones de humo; 21/21 de compatibilidad App Maestra; formato y verificación de release. La CI completa del PR vuelve a ejecutar también Tokyo, humo de raíz, drill-down, auditoría tarifaria, actualizaciones y comparación legacy.

Ejemplo: HM-DEMO-1 (3 HR) y PF-DEMO-1 (5.97 HA, C$597) respaldan un evento PR-DEMO-1 de dos productos sobre 5.97 HA. El revisor selecciona las tres evidencias y confirma; una segunda decisión que usa la misma PF no agrega otros C$597. Al cambiar HM a 4 HR, el historial se conserva pero el importe confirmado vigente vuelve a cero hasta nueva revisión. FTS en la suerte 03A solo se sugiere al habilitar el par candidato. La Programación NO/suspendida de suerte 10 no se trata como cobro faltante.

Capturas revisables:

- [Escritorio](mecanizadas-etapa-b/pc.png), [evidencia](mecanizadas-etapa-b/pc-evidencia.png), [selección y confirmación](mecanizadas-etapa-b/pc-decision.png).
- [Móvil](mecanizadas-etapa-b/movil.png), [evidencia](mecanizadas-etapa-b/movil-evidencia.png), [selección y confirmación](mecanizadas-etapa-b/movil-decision.png).

## Límites para aprobación

- La cobertura declarada y la correspondencia física de varios movimientos requieren criterio del revisor; no hay deducción automática de deuda ni de pago.
- Identidades indistinguibles requieren corregir/completar la fuente. El motor prefiere marcar ambigüedad antes que asignar una confirmación a la línea incorrecta.
- Prefactura conserva los campos y procedencia disponibles en su importador oficial; ese importador anterior no almacena todas las celdas crudas como los importadores HM/Programación. No se alteró su contrato ni el clasificador financiero.
- Los eventos siguen siendo candidatos documentales; no se deduplican ejecuciones físicas por hectáreas o por máquina.
- Las pruebas nuevas y las capturas son sintéticas. No se añadieron Excel reales, productores reales, datos de producción ni nuevos servicios remotos.
- No se incluye Etapa C, edición avanzada de tablas, publicación, aprobación automática ni sincronización entre dispositivos.
