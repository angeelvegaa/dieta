# Registro de dieta — PWA

Seguimiento diario de dieta, peso, fases y cumplimiento. HTML + CSS + JS con
módulos ES nativos: **sin build, sin dependencias, sin backend y sin cuentas**.
Todos los datos se guardan solo en el dispositivo (`localStorage`) — salvo que
actives tú mismo la copia en la nube (opcional, apagada por defecto).

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
  sync.js           copia en la nube (opcional): Supabase + AES-GCM, import dinámico
  storage.js        load / save / listKeys / onWrite (window.storage → localStorage → memoria)
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
    cloud-sync.js   tarjeta y asistente de activación de la copia en la nube
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
npm run test:sync           # pruebas de la copia en la nube (Chromium y WebKit)
```

## Copia en la nube (opcional)

Apagada por defecto: quien no la active tiene la app 100% local, sin ninguna
llamada de red, exactamente igual que antes de que existiera esta función. El
SDK de Supabase se carga con `import()` dinámico, así que ni siquiera llega al
navegador mientras el interruptor está apagado.

Quien la activa desde **Ajustes → Copia en la nube**:

- El asistente pregunta primero: **crear una cuenta nueva** o **iniciar sesión
  con una cuenta que ya existe**. Ambas con el mismo formulario email + contraseña
  + widget de Cloudflare Turnstile (Supabase Auth: `signUp` vs
  `signInWithPassword`). "Iniciar sesión" es imprescindible cuando el email de
  confirmación se abre en otro navegador: la cuenta queda creada y confirmada en
  el servidor, pero la sesión no persiste en este dispositivo hasta que se entra
  con ella. La confirmación de email está activada: tras crear cuenta hay que
  confirmarla antes de poder iniciar sesión. Contraseña y no magic link a
  propósito (esta app no tiene router de hash, pero así el flujo es idéntico al
  de `gym track`).
- Genera una clave de cifrado AES-GCM en el dispositivo (Web Crypto) que nunca
  sale de él: a Supabase solo sube el valor ya cifrado. La clave se muestra una
  vez como **código de recuperación**; sin guardarlo aparte no hay forma de
  recuperar los datos ya sincronizados en un dispositivo nuevo (ni nosotros
  podemos).
- `js/sync.js` sube (con debounce de 2 s) cada escritura de las claves
  sincronizables — `dieta:comidas`, `dieta:fase`, `dieta:faseHistory`,
  `dieta:peso`, `dieta:planStructured` y cada mes `dieta:AAAA-MM` — y al abrir la
  app baja y fusiona por "último cambio gana" (sin resolución de conflictos
  compleja). Quedan fuera la copia de seguridad local y la línea base del aviso
  de %, que son propias de cada dispositivo.
- El proyecto de Supabase está **compartido con la app de running**: la tabla
  `sync_data` tiene una columna `app` (aquí siempre `'dieta'`) para no mezclar
  datos. La seguridad va por RLS sobre `user_id`: cada cuenta solo lee/escribe
  sus propias filas, verificado en la base de datos.

El test de ida y vuelta real (`npm run test:sync` con credenciales) requiere una
cuenta ya confirmada (Dashboard → Authentication → Users → Add user → marca
"Auto Confirm User"):

```bash
DIETA_SYNC_TEST_EMAIL=... DIETA_SYNC_TEST_PASSWORD=... npm run test:sync
```

Sin esas variables ese bloque se salta solo; el resto (incluido "cero red con el
interruptor apagado", en Chromium y WebKit) corre siempre.

## Publicar una versión nueva

Sube el número de `VERSION` en `sw.js` y haz push. La próxima vez que se abra
la app, el service worker detecta la versión nueva, la instala, toma el control
(`skipWaiting` + `clients.claim`) y la página se recarga sola una vez con el
código nuevo. No hay que pulsar nada. El estado se guarda en cada interacción,
así que la recarga no pierde nada.

## Despliegue en GitHub Pages

Ver `DEPLOY.md`.
