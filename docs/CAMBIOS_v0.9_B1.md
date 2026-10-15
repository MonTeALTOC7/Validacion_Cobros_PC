# Conciliador v0.9 · B1: detalle navegable en Financiero y Calidad de datos

Rama `claude/drilldown-v09`, a partir de v0.8 (`3ca0876`). Sin cambios en reglas de negocio, importadores, cálculos
financieros, cierres, IndexedDB ni exportadores: las cifras de referencia (golden) no cambian.

## Qué cambia para el usuario

**Financiero**

- El panel de detalle actual pasa a ser navegable. Tiene ruta (por ejemplo Total › PANSACO › PANSACO · 01 › Fila 95),
  botón **Volver**, **Cerrar** y la tecla Escape. Al cerrar, la página conserva sus filtros, vista y selección.
- Se abre desde los **KPIs**:
  - Total abre todas las líneas de la vista.
  - Prefacturas abre la pestaña Por prefactura.
  - Prefacturado por ha de suerte abre Por suerte, con área y C$/ha.
  - HA trabajada abre las líneas con UM HA.
  - Última semana abre esa semana.
- También se abre desde las tablas, rankings y barras existentes, desde la tabla de **tarifas** (líneas con esa
  tarifa) y desde la alerta de **repeticiones** (grupos y evidencia).
- Cada nivel muestra:
  - total, líneas, prefacturas, suertes y semanas;
  - cantidades por unidad, sin sumar unidades distintas;
  - pestañas dinámicas por productor, finca, suerte, labor, servicio, contratista, semana y P.FACT. Solo aparecen las
    que tienen más de un valor.
- La pestaña **Líneas** es una tabla paginada con búsqueda; informa el total de la búsqueda sin alterar el del nivel.
- La **ficha de línea** muestra archivo, hoja y fila de origen, Periodo SIAGRI, productor, finca, suerte con área,
  labor, servicio, cantidad, tarifa, total, P.FACT, contratista, tipo de labor, universo e interface. También indica
  si la línea pertenece a un grupo de repetición y su estado de conciliación tal como lo calcula el motor.
- **Aplicar como filtro** es opcional y reversible:
  - Solo se habilita cuando la selección se puede expresar con filtros reales de la página (productor, finca,
    contratista, tipo de labor, universo, semana).
  - Antes de aplicarlo se verifica que esos filtros den exactamente las mismas líneas.
  - Suerte, labor, servicio, P.FACT, tarifa y UM no tienen filtro equivalente: el botón queda deshabilitado con el
    motivo.
  - **Deshacer filtro** restaura los filtros anteriores.

**Calidad de datos** (Actualizar archivos)

- Cada alerta ofrece **Ver todos los registros (N)**: tabla paginada con búsqueda de todos los registros afectados,
  no solo los 12 ejemplos. Cada registro abre su ficha de origen (Prefactura o Nómina).
- Las alertas de repetición abren **Ver grupos y evidencia**, con:
  - un resumen por tipo y las líneas distintas, contadas una sola vez aunque pertenezcan a varios grupos;
  - el detalle de cada grupo: sus líneas, las demás líneas de la misma clave de cobro y la Nómina de esa clave
    (filas, fechas, día, trabajador, cantidad, tarifa).
- En labores sin registro en Nómina (mecanizadas, contratistas externos) se indica que no hay evidencia de Nómina
  para comparar. **No se califica ningún caso como doble cobro.**
- Las filas descartadas por el importador muestran los ejemplos que este conserva (hasta 20), y se indica así.

**Teléfono:** el detalle ocupa toda la pantalla; las tablas se ajustan al panel y el texto largo salta de línea.

## Componentes

| Archivo | Uso |
|---|---|
| `components/drill/DrillDrawer.jsx` | Panel genérico con niveles (ruta, Volver, Cerrar, Escape, foco). Reutiliza `.drawer` / `.drawer-wide`. |
| `components/finance/FinanceDrill.jsx` | Niveles de Financiero: grupo, líneas, ficha y repeticiones. |
| `components/drill/RepetitionGroups.jsx` | Lista y detalle de grupos de repetición, compartidos por Financiero y Calidad. |
| `components/drill/QualityDrill.jsx` | Detalle de una alerta de calidad. |
| `components/drill/LineFields.jsx` | Ficha de origen de una fila de Prefactura o Nómina. |
| `lib/drill.js` | Funciones puras: dimensiones, agrupación, unidades, búsqueda, filtro equivalente verificado, líneas distintas y evidencia de Nómina. |
| `engine/quality.js` | Opción `fullItems` para obtener todos los registros; la salida por defecto es idéntica (verificado). |

## Garantías y pruebas

- **Totales:** el panel recibe exactamente las filas con las que se calcula cada KPI o grupo, de modo que la suma de
  los grupos de cada pestaña coincide con el total del nivel. Con los datos publicados, todas las dimensiones suman
  C$ 13.278.583,33 (prueba unitaria).
- **Pruebas unitarias** (`tests/unit/drill.test.js`, 10): agrupación y totales por dimensión, unidades sin mezclar,
  filtro equivalente verificado (incluido un nombre compartido por dos códigos de productor), líneas de repetición
  sin doble conteo, evidencia de Nómina por clave y Calidad completa con salida por defecto idéntica.
- **E2E** (`tests/e2e/drilldown.mjs`, 48 comprobaciones, escritorio 1366 px y móvil 390 px, en la CI):
  - KPI = total del panel;
  - suma de grupos = total en cada nivel;
  - tres niveles con ruta, Volver, salto por ruta y Cerrar con filtros conservados;
  - búsqueda, ficha con hoja!fila, Aplicar como filtro y Deshacer, botón deshabilitado con motivo y Escape;
  - repeticiones (16 y 2 grupos) con evidencia sin calificar;
  - Calidad con todos los registros;
  - en el teléfono, panel a pantalla completa sin desplazamiento horizontal;
  - IndexedDB sin cambios y sin errores de página.
- **Sin regresiones:** golden, comparación legacy, humo (52), actualización y compatibilidad con la App Maestra siguen
  en verde.
