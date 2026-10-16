# Registro de cifras de referencia (golden)

Cada versión de `expected.json` (resultados del motor sobre `datos/`) y de `legacy-allowlist.json` (diferencias
permitidas con el bundle legacy 8b3-1-1) tiene una fila con sus huellas SHA-256 y la justificación del cambio.

Reglas:

- Las filas solo se agregan con `npm run golden:update -- --justificacion "…"`; no se editan ni se borran
  (la CI falla si cambia una fila existente: `scripts/golden-guard.mjs`).
- La prueba golden falla si la última fila no coincide con los archivos vigentes.
- Si cambian las cifras, la CI muestra el diff en el resumen de la ejecución con un aviso.

| Fecha      | expected.json (SHA-256)                                            | legacy-allowlist.json (SHA-256)                                    | Justificación                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-15 | `d0d00b2650c8e263b261c72c725861288a0a01b9510d62192cd74c0236b89e13` | `7610b9fb771a52e7c5c3471cb4338bdd453ad10407711d79faaa0d073004628b` | Creación inicial: resultados de v0.8 (commit affe289) con datos al 11 oct 2026, verificados en la revisión del 14 oct (CAMBIOS §5–§8); 95 diferencias legacy justificadas por reglas S02, ETAPA_TPS y banderas informativas. |
