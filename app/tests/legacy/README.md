# Bundle legacy de referencia (8b3-1-1)

Copia exacta, byte a byte, del build publicado en `main` (commit `e7587c3`, 7 sep 2026) antes de reconstruir la fuente
(`index.html`, `registerSW.js`, `manifest.webmanifest`, logo y los cinco archivos de `assets/` que carga ese `index.html`).
`SHA256SUMS` guarda las huellas; la CI las verifica con `sha256sum -c SHA256SUMS` y
`node scripts/verify-legacy.mjs` las contrasta además con el commit `e7587c3` cuando hay historial.
Se usa exclusivamente por `tests/e2e/compare-legacy.mjs` para comparar resultados antes/después.
No se publica ni se carga desde la aplicación. No editar.
