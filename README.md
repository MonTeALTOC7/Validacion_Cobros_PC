# Negocios de Caña CASUR

App Maestra (PWA) que integra en una sola aplicación los sistemas de campo de CASUR:
**Producción, TCH y Visitas, Riego, Insumos, Inventario y Seguimiento de Labores**, más un
área privada de **Conciliación** y un **Centro Maestro** de administración.

Se publica en **GitHub Pages** (sin servidor Node) con `index.html` en la raíz, es
**instalable** en Android, Windows y navegadores compatibles, y funciona **offline** en la
medida en que cada módulo lo soporte.

> Estado actual: **v1.0.0 — Fase 1 (Shell)**. Los módulos se muestran como marcadores de
> posición y se integrarán uno a uno en las fases siguientes, conservando su comportamiento y
> sus datos existentes. Ver `docs/ARCHITECTURE.md`.

---

## Módulos

| Módulo | Descripción | Estado |
|---|---|---|
| Producción | Cronológico e Histórico de suertes (VF54.6) | Placeholder → Fase 4 |
| TCH y Visitas | Biometría, visitas y fotografías (v2.7.2) | Placeholder → Fase 3 |
| Riego Ejecutado | Seguimiento de riegos por productor (v6, Supabase) | Placeholder → Fase 6 |
| Seguimiento de Insumos | Insumos, productores y madurante (v2) | Placeholder → Fase 5 |
| Inventario | Kardex, entradas y salidas · Pansaco (v1.4.0, Supabase) | Placeholder → Fase 7 |
| Seguimiento de Labores | Manuales y mecanizadas (operativo, público) | Placeholder → Fase 8 |
| Administrador SIAGRI | Convertidor Cronológico Maestro (en Centro Maestro) | Placeholder → Fase 2 |
| Conciliación de Cobros | Área privada (datos económicos) | Placeholder → Fase 8 |

Detalle en `docs/MODULES.md`.

## Instalación (usuario final)

1. Abre la app en el navegador (Chrome/Edge en Android o PC).
2. Menú del navegador → **Instalar app** / **Añadir a pantalla de inicio**.
3. Se instala **una sola** PWA (no seis). El icono es el de Negocios de Caña CASUR.

## Funcionamiento offline

- El **shell** (inicio, navegación, Centro Maestro) funciona sin conexión.
- Cada módulo es offline según su propia naturaleza: los locales (Producción, TCH, Insumos,
  Labores) funcionan offline; los que usan **Supabase** (Riego, Inventario) requieren red para
  sincronizar, con cola offline donde ya existe.
- Un único **Service Worker raíz** administra la caché del shell y **nunca borra** la caché de
  los módulos (ver `docs/ARCHITECTURE.md` §4).

## Publicar (propietario)

Ver `docs/DEPLOY_GITHUB_PAGES.md`. En resumen: subir el contenido de este proyecto a la raíz
del repositorio `Negocios_de_Cana_CASUR`, activar GitHub Pages, y quedará en
`https://<usuario>.github.io/Negocios_de_Cana_CASUR/`.

## Qué es privado

- El home normal muestra solo módulos públicos.
- **Conciliación** (montos, tarifas, prefacturas) está en el **área privada**, tras desbloqueo
  con PIN desde la pestaña *Privado*.
- **Aviso:** en v1.0 el PIN evita accesos accidentales, **no** es cifrado. La separación real
  de datos económicos llega con Supabase + RLS (Fase 8+). Ver `docs/ARCHITECTURE.md` §5.

## Actualizar la versión

- App Maestra: cambiar `APP_VERSION` en `core/versions/versions.js` **y** en `sw.js`.
- Módulos: cada uno tiene su versión en `core/versions/versions.js` (independiente).
- Al desplegar una versión nueva del SW, la app avisa "Nueva versión disponible" y el usuario
  decide cuándo actualizar (sin recargas que descarten trabajo).

## Estructura

```
index.html · manifest.webmanifest · sw.js   → PWA (raíz)
core/       → registro de módulos, navegación, permisos, versiones, almacenamiento, estado
modules/    → módulos públicos (iframe aislado)
private/    → área privada (conciliación)
master/     → centro maestro + convertidor SIAGRI + datos oficiales
shared/     → estilos, componentes, iconos, utilidades
docs/       → auditoría, arquitectura, módulos, despliegue, pruebas, changelog
```

## Tecnología

HTML + CSS + JavaScript **vanilla** (módulos ES), **sin bundler ni paso de build**. Elegido
así a propósito para que funcione directo en GitHub Pages y sea fácil de mantener desde
distintas herramientas (Claude, ChatGPT Codex) sin dependencias frágiles.

## Documentación

- `docs/INTEGRATION_AUDIT.md` — auditoría técnica de los 7 sistemas.
- `docs/ARCHITECTURE.md` — arquitectura, migración, riesgos, SW, privacidad, pruebas.
- `docs/MODULES.md` — detalle por módulo.
- `docs/DEPLOY_GITHUB_PAGES.md` — cómo publicar.
- `docs/TEST_PLAN.md` — plan de pruebas y checklist.
- `docs/CHANGELOG.md` — historial de versiones.
