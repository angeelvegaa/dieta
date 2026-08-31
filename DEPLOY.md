# Desplegar en GitHub Pages

La app usa **rutas relativas** en todas partes (manifest, service worker,
`<link>`, `<script>`), así que funciona en cualquier subruta sin tocar nada:
`https://<usuario>.github.io/<repo>/`.

## 1. Subir el código (lo hace Claude / o tú)

```bash
cd "ruta/al/proyecto/dieta"
git init -b main
git add -A
git commit -m "Registro de dieta: PWA con módulos ES"
gh repo create <NOMBRE-REPO> --public --source=. --remote=origin --push
```

## 2. Activar GitHub Pages (esto lo haces tú en la web)

1. Abre `https://github.com/<usuario>/<NOMBRE-REPO>`
2. **Settings** (pestaña superior) → menú lateral **Pages**
3. En **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` — carpeta `/ (root)` → **Save**
4. Espera ~1 minuto. En la misma página aparecerá:
   `Your site is live at https://<usuario>.github.io/<NOMBRE-REPO>/`
5. Abre esa URL en el móvil (Safari en iPhone, Chrome en Android):
   - iPhone: botón Compartir → **Añadir a pantalla de inicio**
   - Android: menú ⋮ → **Instalar aplicación** / **Añadir a pantalla de inicio**

## 3. Comprobar que quedó bien

- Abre la URL, cierra el móvil / pon modo avión → la app sigue abriendo (SW).
- Instálala en la pantalla de inicio y ábrela: no debe salir ningún cuadro de
  diálogo en blanco al confirmar cosas (usa modales propios).

## Publicar cambios más adelante

```bash
# edita lo que sea, y si tocaste HTML/CSS/JS sube la versión del cache:
#   en sw.js → const VERSION = "v2";
git add -A && git commit -m "..." && git push
```

GitHub Pages re-despliega solo en 1-2 min. La próxima vez que alguien abra la
app instalada, verá el banner **"Hay una versión nueva"**.
