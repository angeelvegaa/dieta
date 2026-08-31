# Registro de dieta — PWA

Seguimiento diario de dieta, peso, fases y cumplimiento. HTML + CSS + JS con
módulos ES nativos: **sin build, sin dependencias, sin backend y sin cuentas**.
Todos los datos se guardan solo en el dispositivo (`localStorage`).

## Estructura

```
index.html          shell: markup + <link> + <script type="module">
manifest.json       metadatos de instalación (rutas relativas → sirve en cualquier subruta)
sw.js               service worker: cache-first, versionado, actualización automática
css/app.css         estilos (idénticos al archivo original)
js/
  app.js            punto de entrada: importa cada pantalla y arranca el estado
  config.js         constantes
  dates.js          utilidades de fecha
  storage.js        load / save / listKeys (window.storage → localStorage → memoria)
  state.js          estado mutable + guardado sin botón (síncrono + flush en pagehide)
  backup.js         copia automática y silenciosa tras cada guardado
  modal.js          customConfirm / customPrompt (NO usar confirm/prompt nativos)
  toast.js          avisos efímeros
  longpress.js      pulsación larga (touch + ratón + clic derecho)
  stats.js          balance, % de cumplimiento, fases
  pwa.js            registro del SW + recarga automática al actualizar
  ui/
    month.js        pantalla principal: rejilla, ciclo de toque, columna Extra, notas
    settings.js     fase actual, comidas del día (con retro), copia de seguridad
    history.js      historial de meses + gráfico de % navegable
    weight.js       peso con fecha + gráfico coloreado por fase
    plan.js         "Mi dieta" estructurada por día de la semana
    notes.js        listado de todas las notas
    reminder.js     aviso si no se ha registrado nada a partir de las 20h
    actions.js      copiar resumen / borrar el mes
icons/              iconos PWA (generados con scripts/make-icons.mjs)
```

`scripts/` y `tests/` son solo herramientas de desarrollo (usan Playwright, ya
instalado en la máquina; `node_modules/` está en `.gitignore`). No forman parte
de lo que se despliega ni añaden dependencias a la app.

## Desarrollo / pruebas

```bash
npm install                 # solo Playwright, para las utilidades
npm run icons               # regenera los iconos
node tests/server.mjs       # sirve en http://localhost:4599/dieta/
npm test                    # e2e en Chromium y WebKit, vertical, todas las pantallas
npm test chromium           # un solo motor
```

## Publicar una versión nueva

Sube el número de `VERSION` en `sw.js` y haz push. La próxima vez que se abra
la app, el service worker detecta la versión nueva, la instala, toma el control
(`skipWaiting` + `clients.claim`) y la página se recarga sola una vez con el
código nuevo. No hay que pulsar nada. El estado se guarda en cada interacción,
así que la recarga no pierde nada.

## Despliegue en GitHub Pages

Ver `DEPLOY.md`.
