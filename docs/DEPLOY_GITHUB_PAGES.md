# DEPLOY_GITHUB_PAGES.md — Cómo publicar

La App Maestra es **estática**: no necesita Node ni `npm run dev`. Se publica subiendo los
archivos tal cual, con `index.html` en la **raíz** del repositorio.

## Opción A — Subir el ZIP (recomendada)
1. Crea un repositorio nuevo en GitHub llamado **`Negocios_de_Cana_CASUR`**.
2. Descomprime `Negocios_de_Cana_CASUR_v1.0.0_GitHub_Pages.zip`.
   En la raíz debe quedar `index.html` (no dentro de una subcarpeta).
3. Sube todo el contenido a la rama `main` (arrastrar y soltar en la web de GitHub, o `git push`).
4. Repo → **Settings → Pages** → *Source*: `Deploy from a branch` → rama `main`, carpeta `/ (root)` → **Save**.
5. Espera 1–2 minutos. Quedará en:
   `https://<tu-usuario>.github.io/Negocios_de_Cana_CASUR/`

## Opción B — Con git
```bash
git clone https://github.com/<tu-usuario>/Negocios_de_Cana_CASUR.git
cd Negocios_de_Cana_CASUR
# copiar aquí el contenido del proyecto (index.html en la raíz)
git add .
git commit -m "feat(shell): App Maestra v1.0.0"
git push origin main
```
Luego activar Pages como en la Opción A.

## Comprobaciones tras publicar
- Abrir la URL en Chrome/Edge → debe cargar el home con las tarjetas.
- Menú del navegador → **Instalar app**: debe aparecer **una sola** PWA.
- Abrir un módulo → debe cargarse dentro de la app (iframe).
- Cerrar y reabrir sin conexión → el shell debe seguir cargando.

## Notas importantes
- El archivo **`.nojekyll`** ya está incluido: evita que GitHub Pages procese el sitio con
  Jekyll y respeta carpetas/archivos. No lo borres.
- Todas las rutas son **relativas**; funciona correctamente bajo el subdirectorio
  `/Negocios_de_Cana_CASUR/`. No se asume raíz `/`.
- Al publicar una versión nueva, sube los archivos y sube el número en `sw.js` y
  `core/versions/versions.js` para que la app ofrezca "Nueva versión disponible".
