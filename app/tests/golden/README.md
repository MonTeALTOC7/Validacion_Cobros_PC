# Pruebas golden (cifras de referencia)

- `snapshot.js` calcula, con el motor de la aplicación y los archivos de `datos/`, las cifras de referencia: hallazgos
  por tipo, estado, bandera y semana; cobertura; pendientes (semanas prefacturadas y sin Prefactura); totales
  financieros por universo, tipo de labor y contratista; repeticiones; Seguimiento y dataset publicado; alertas de
  calidad; y huellas SHA-256 de cada hallazgo, línea financiera y fila de Seguimiento.
- `expected.json` guarda esas cifras. `golden.test.js` (parte de `npm test`) falla ante cualquier diferencia.
- `legacy-allowlist.json` lista, una por una, las diferencias funcionales permitidas con el bundle legacy.
  `npm run compare:check` (CI) falla si aparece otra o si una permitida deja de aparecer. Solo se admiten diferencias
  que cumplen una regla de `legacy-diff.js`, cada una con su referencia a `docs/CAMBIOS_v0.8.md`.
- `REGISTRO.md` documenta cada versión de ambos archivos con su huella y justificación.

## Cuándo y cómo actualizar

Solo cuando un cambio de resultados es intencional (datos nuevos en `datos/`, una regla de negocio aprobada):

```bash
cd app
npm run build
node tests/e2e/compare-legacy.mjs --report-only --write-diffs /tmp/diffs.json
npm run golden:update -- --justificacion "Datos al DD mmm: Nómina y Prefactura nuevas (sin cambios de reglas)" --diffs /tmp/diffs.json
```

El cambio llega al PR como diff revisable de `expected.json`, `legacy-allowlist.json` y una fila nueva de
`REGISTRO.md`; la CI lo destaca en el resumen de la ejecución. Una regresión no puede pasar sin que esas cifras cambien
a la vista.
