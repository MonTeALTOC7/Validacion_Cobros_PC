# TEST_PLAN.md — Plan de pruebas y checklist

## Fase 1 — Shell (estado: verificado automáticamente)
- [x] Carga del shell (online y offline)
- [x] Navegación inicio ↔ módulo ↔ regreso
- [x] Apertura de módulo en iframe aislado
- [x] Centro Maestro: 8 módulos, interruptores, estado, versiones, PIN
- [x] Área privada: gate visible, desbloqueo con PIN correcto, bloquear
- [x] Instalabilidad PWA (manifest + iconos + SW)
- [x] **SW maestro NO borra cachés de otros módulos** (regresión crítica C1/C2)
- [x] Consola sin errores ni warnings
- [x] Responsive móvil (390px) y PC (1200px)
- [ ] Instalación en dispositivo real Android (propietario)
- [ ] Instalación en Windows/PC real (propietario)

## Regresión por módulo (Fases 2–8)
### Producción
- [ ] Submódulos, cronológico, histórico, análisis, gráficos, exportación, selección múltiple.
### TCH
- [ ] Abrir → crear biometría → guardar → **foto grande** → visita → reiniciar → **persiste**.
### Riego
- [ ] Datos, filtros, importación, persistencia, Supabase online.
### Insumos
- [ ] Importar SIAGRI, Resumen/Explorar/Insumos/Productores/Madurante/Admin, exportación.
### Inventario
- [ ] Lectura, entrada, salida, **realtime**, offline (outbox), reconexión, sincronización.
### Labores
- [ ] Manual, mecanizada, filtros, productor, suerte, aplicación, resumen ejecutivo.
### Convertidor
- [ ] Excel SIAGRI procesa, **Sucuya = 0 en resultado**, exportación, offline.
### Privado
- [ ] No visible normalmente, desbloqueo, conciliación, carga Excel, actualización, bloquear.

## Regla de no-regresión (cierre de cada fase)
1. Probar el nuevo módulo. 2. Probar navegación general. 3. Smoke de módulos ya integrados.
4. Verificar IndexedDB/localStorage intactos. 5. Verificar PWA. 6. Revisar consola.
7. No continuar con errores importantes abiertos.

## Cómo probar localmente
Al usar módulos ES y Service Worker, hay que servir por HTTP (no abrir con `file://`):
```bash
cd Negocios_de_Cana_CASUR
python3 -m http.server 8080
# abrir http://localhost:8080/
```
