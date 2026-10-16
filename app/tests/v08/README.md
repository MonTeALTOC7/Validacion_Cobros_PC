# Build v0.8 previo a la corrección de zona horaria (referencia de transición)

Copia exacta, byte a byte, del build publicado en la raíz de la rama v0.8 en el commit `3ca0876` (`index.html`,
`registerSW.js`, `manifest.webmanifest`, logo, icono y los cinco archivos de `assets/` que carga ese `index.html`),
anterior a la corrección de fechas e identificadores independientes de la zona horaria.
`SHA256SUMS` guarda las huellas; la CI las verifica con `sha256sum -c SHA256SUMS`.
Se usa exclusivamente por `tests/e2e/timezone.mjs` para comprobar en el navegador la transición de los datos que esta
versión guardó en IndexedDB (en Managua y al este de UTC) hacia la versión corregida. No se publica ni se carga desde la
aplicación. No editar.
