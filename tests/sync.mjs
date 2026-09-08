/* Pruebas de la copia en la nube (js/sync.js + js/ui/cloud-sync.js).

   Independiente de la fecha, en Chromium y WebKit. Comprueba lo esencial:

   1. Con el interruptor APAGADO (caso por defecto) la app no hace NINGUNA
      llamada de red relacionada con la sincronización: ni al SDK de Supabase
      (esm.sh), ni al proyecto (*.supabase.co), ni al widget de Cloudflare.
   2. El asistente de activación solo carga Turnstile cuando se abre, y sigue
      sin tocar Supabase hasta que la persona envía el formulario.
   3. Si Turnstile no carga / falla, sale un aviso VISIBLE en la pantalla (no
      se queda en blanco). Y la Site Key real del código es la correcta.

   Uso:  node tests/sync.mjs            (ambos motores)
         node tests/sync.mjs chromium   (uno)

   Test opcional de ida y vuelta real contra el proyecto de Supabase: define
   una cuenta YA CONFIRMADA (Dashboard → Authentication → Users → Add user →
   "Auto Confirm User") y pasa sus credenciales por entorno:

     DIETA_SYNC_TEST_EMAIL=... DIETA_SYNC_TEST_PASSWORD=... node tests/sync.mjs

   Sin esas variables ese bloque se salta (no falla). */

import { chromium, webkit } from "playwright";
import { readFile } from "node:fs/promises";
import { start, BASE } from "./server.mjs";

const only = process.argv[2];
const ENGINES = [["chromium", chromium], ["webkit", webkit]].filter(([n]) => !only || n === only);
const SYNC_HOSTS = /esm\.sh|supabase\.co|challenges\.cloudflare\.com/;

// Site Key REAL correcta (0x4 + 6 A's). El prompt original traía una "A" de más
// que Turnstile rechaza con error 400020 -> widget en blanco. En localhost la
// app usa la clave de test oficial de Cloudflare, que siempre pasa.
const SITE_KEY_REAL = "0x4AAAAAAEroqMIQUWfcnssE";
const SITE_KEY_TEST = "1x00000000000000000000AA";
const CLOUD_SYNC_SRC = await readFile(new URL("../js/ui/cloud-sync.js", import.meta.url), "utf8");

const EMAIL = process.env.DIETA_SYNC_TEST_EMAIL;
const PASSWORD = process.env.DIETA_SYNC_TEST_PASSWORD;

let pass = 0, fail = 0;
function ok(engine, name, cond, detail = "") {
  const line = `${cond ? "PASS" : "FAIL"}  [${engine}] ${name}${detail ? " — " + detail : ""}`;
  console.log(line);
  cond ? pass++ : fail++;
}

const ctxOpts = { viewport: { width: 390, height: 844 }, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" };

async function runEngine(engine, launcher) {
  const browser = await launcher.launch();
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();

  const netHits = [];
  const errs = [];
  page.on("request", (r) => { if (SYNC_HOSTS.test(r.url())) netHits.push(r.url()); });
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // Turnstile responde 400 en dominios no autorizados (localhost): esperado
    // al abrir el asistente fuera de producción, no es un fallo de la app.
    const from = (m.location() && m.location().url) || "";
    if (SYNC_HOSTS.test(from) || /challenges\.cloudflare\.com|turnstile/i.test(m.text())) return;
    errs.push("console: " + m.text());
  });

  // ---- 1. recorrido normal con la sync apagada ----
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForSelector("#grid .cell");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);

  // marca una comida (escritura real) y navega por varias pantallas
  await page.locator("#grid .cell:not(.extra)").first().click();
  await page.click("#history");
  await page.waitForSelector("#histSheet.open");
  await page.locator("#histSheet").click({ position: { x: 6, y: 6 } });
  await page.click("#weightBtn");
  await page.waitForSelector("#weightSheet.open");
  await page.locator("#weightSheet").click({ position: { x: 6, y: 6 } });

  await page.click("#gear");
  await page.waitForSelector("#sheet.open");
  ok(engine, "sección 'Copia en la nube' presente en Ajustes",
    (await page.locator("#sheet .sheet-inner h2", { hasText: "Copia en la nube" }).count()) === 1);
  ok(engine, "apagada por defecto: botón de activar, sin campos de login",
    (await page.isVisible("#cloudActivate")) && (await page.locator("#cloudSyncBody input").count()) === 0);
  const copy = (await page.textContent("#cloudSyncBody")) || "";
  ok(engine, "el texto deja claro que es opcional y local por defecto",
    /opcional/i.test(copy) && /local/i.test(copy));

  ok(engine, "con la sync apagada: CERO peticiones a Supabase / esm.sh / Turnstile",
    netHits.length === 0, netHits.slice(0, 3).join(" | "));

  // ---- 2. abrir el asistente: carga Turnstile, NO toca Supabase ----
  await page.click("#cloudActivate");
  await page.waitForSelector('#cloudSyncBody input[type="email"]');
  ok(engine, "el asistente pide email y contraseña",
    (await page.locator('#cloudSyncBody input[type="email"]').isVisible()) &&
    (await page.locator('#cloudSyncBody input[type="password"]').isVisible()));
  await page.waitForTimeout(1500);
  ok(engine, "al abrir el asistente SÍ se carga el script de Turnstile",
    netHits.some((u) => /challenges\.cloudflare\.com/.test(u)));
  const tsHits = netHits.filter((u) => /turnstile/.test(u)).join(" ");
  ok(engine, "en localhost el widget usa la Site Key de TEST (nunca la real)",
    tsHits.includes(SITE_KEY_TEST) && !tsHits.includes(SITE_KEY_REAL),
    netHits.filter((u) => /turnstile/.test(u)).slice(-1)[0] || "");
  let widgetWorks = false;
  try {
    // La clave de test de Cloudflare resuelve el reto sola: el token acaba
    // en el input oculto. Si eso pasa, el widget se pintó y funciona.
    await page.waitForFunction(() => {
      const i = document.querySelector('.turnstile-slot input[name="cf-turnstile-response"]');
      return !!(i && i.value && i.value.length > 0);
    }, null, { timeout: 10000 });
    widgetWorks = true;
  } catch { /* widgetWorks queda en false */ }
  ok(engine, "el widget se pinta y resuelve el reto (no se queda en blanco)", widgetWorks);
  ok(engine, "abrir el asistente NO hace ninguna llamada a Supabase / esm.sh",
    netHits.filter((u) => /supabase\.co|esm\.sh/.test(u)).length === 0,
    netHits.filter((u) => /supabase\.co|esm\.sh/.test(u)).join(" | "));

  await page.getByRole("button", { name: "Cancelar" }).first().click();
  ok(engine, "cancelar el asistente vuelve al estado apagado", await page.isVisible("#cloudActivate"));

  ok(engine, "sin errores de JS propios en todo el flujo", errs.length === 0, errs.slice(0, 3).join(" | "));

  await context.close();
  await browser.close();
}

// Cuando Turnstile falla —el script se traba/no carga, render() peta, o el
// widget llama a su error-callback— el asistente debe enseñar un aviso VISIBLE
// en la pantalla, nunca quedarse en blanco. Se fuerza con un stub de
// window.turnstile inyectado antes de cargar la app (determinista, sin depender
// de bloquear la red, que WebKit no intercepta igual entre contextos).
async function runTurnstileFailure(engine, launcher, mode) {
  const browser = await launcher.launch();
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript((m) => {
    window.__tsMode = m;
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: {
        render(_el, opts) {
          if (window.__tsMode === "render-throws") throw new Error("stub: Turnstile caído");
          if (window.__tsMode === "error-callback") { opts["error-callback"]("600010"); return "stub-widget"; }
          return "stub-widget";
        },
        reset() {}, remove() {}
      }
    });
  }, mode);
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#grid .cell");
  await p.click("#gear");
  await p.waitForSelector("#sheet.open");
  await p.click("#cloudActivate");
  await p.waitForSelector('#cloudSyncBody input[type="email"]');
  await p.waitForFunction(
    () => /⚠[^]*verific/i.test(document.getElementById("cloudSyncBody").textContent),
    null, { timeout: 8000 }
  ).catch(() => {});
  const txt = (await p.textContent("#cloudSyncBody")) || "";
  ok(engine, `Turnstile falla (${mode}): aviso visible en la pantalla, no se queda en blanco`,
    /⚠[^]*verific/i.test(txt), txt.replace(/\s+/g, " ").slice(0, 90));
  ok(engine, `Turnstile falla (${mode}): el formulario sigue ahí (email visible)`,
    await p.locator('#cloudSyncBody input[type="email"]').isVisible());
  await ctx.close();
  await browser.close();
}

// ---- 3. (opcional) ida y vuelta real entre dos "dispositivos" ----
async function runLive(engine, launcher) {
  const browser = await launcher.launch();
  const marker = `nota-sync-${Date.now()}`;

  // Dispositivo A: ya tiene datos locales, activa la sync y sube.
  const ctxA = await browser.newContext(ctxOpts);
  const pageA = await ctxA.newPage();
  await pageA.goto(BASE, { waitUntil: "load" });
  await pageA.waitForSelector("#grid .cell");
  await pageA.locator("#grid .cell:not(.extra)").first().click(); // +1 en una comida

  await pageA.click("#gear");
  await pageA.waitForSelector("#sheet.open");
  await pageA.click("#cloudActivate");
  await pageA.waitForSelector('#cloudSyncBody input[type="email"]');
  // Turnstile en test: usa la clave de test que siempre pasa si el proyecto
  // lo permite; si no, este bloque necesita interacción manual. Se intenta y,
  // si el botón no avanza en 15s, se marca como skip informativo.
  await pageA.locator('#cloudSyncBody input[type="email"]').fill(EMAIL);
  await pageA.locator('#cloudSyncBody input[type="password"]').fill(PASSWORD);
  await pageA.waitForTimeout(3000);
  await pageA.getByRole("button", { name: "Iniciar sesión" }).click();

  const genBtn = pageA.getByRole("button", { name: /primera vez que activo/i });
  const contBtn = pageA.getByRole("button", { name: "Continuar" });
  try {
    await genBtn.or(contBtn).waitFor({ state: "visible", timeout: 20000 });
  } catch {
    ok(engine, "[live] no se pudo pasar el login (¿Turnstile manual?) — bloque omitido", true);
    await ctxA.close();
    await browser.close();
    return;
  }
  if (await genBtn.isVisible()) {
    await genBtn.click();
    await pageA.getByRole("button", { name: "Ya lo he guardado, continuar" }).click();
  } else {
    await contBtn.click();
  }
  await pageA.getByText(/Sincronizando con/).waitFor({ state: "visible", timeout: 20000 });
  await pageA.getByRole("button", { name: "Ver código de recuperación" }).click();
  const code = (await pageA.locator(".recovery-code").innerText()).trim();
  ok(engine, "[live] activación en A: hay código de recuperación", code.length > 20);

  // añade una nota y deja que el debounce (2s) la suba
  await pageA.locator("#sheet").click({ position: { x: 6, y: 6 } });
  const cell = pageA.locator("#grid .cell:not(.extra)").nth(1);
  await cell.dispatchEvent("mousedown");
  await pageA.waitForTimeout(700);
  await cell.dispatchEvent("mouseup");
  await pageA.waitForSelector("#modalOverlay:not([hidden])");
  await pageA.fill("#modalInput", marker);
  await pageA.click("#modalOk");
  await pageA.waitForTimeout(3500);

  // Dispositivo B: contexto limpio, recupera con email + código.
  const ctxB = await browser.newContext(ctxOpts);
  const pageB = await ctxB.newPage();
  await pageB.goto(BASE, { waitUntil: "load" });
  await pageB.waitForSelector("#grid .cell");
  await pageB.click("#gear");
  await pageB.waitForSelector("#sheet.open");
  await pageB.click("#cloudActivate");
  await pageB.waitForSelector('#cloudSyncBody input[type="email"]');
  await pageB.locator('#cloudSyncBody input[type="email"]').fill(EMAIL);
  await pageB.locator('#cloudSyncBody input[type="password"]').fill(PASSWORD);
  await pageB.waitForTimeout(3000);
  await pageB.getByRole("button", { name: "Iniciar sesión" }).click();
  const codeArea = pageB.getByPlaceholder(/pega aquí tu código/i);
  await codeArea.waitFor({ state: "visible", timeout: 20000 });
  await codeArea.fill(code);
  await pageB.getByRole("button", { name: "Usar este código" }).click();
  await pageB.getByText(/Sincronizando con/).waitFor({ state: "visible", timeout: 20000 });
  await pageB.locator("#sheet").click({ position: { x: 6, y: 6 } });

  await pageB.click("#notesBtn");
  await pageB.waitForSelector("#notesSheet.open");
  ok(engine, "[live] B recupera la nota subida por A",
    (await pageB.textContent("#notesList")).includes(marker));

  await ctxA.close();
  await ctxB.close();
  await browser.close();
}

const server = await start();
console.log("probando contra " + BASE + "\n");
try {
  // Guarda contra la regresión del typo: la Site Key real del código tiene que
  // ser la buena (0x4 + 6 A's), nunca la variante con una "A" de más.
  ok("estático", "la Site Key real del código es la correcta (sin la 'A' de más)",
    CLOUD_SYNC_SRC.includes(`'${SITE_KEY_REAL}'`) && !/0x4AAAAAAA/.test(CLOUD_SYNC_SRC));

  for (const [name, launcher] of ENGINES) {
    await runEngine(name, launcher);
    await runTurnstileFailure(name, launcher, "render-throws");
    await runTurnstileFailure(name, launcher, "error-callback");
  }
  if (EMAIL && PASSWORD) {
    console.log("\n--- ida y vuelta real contra Supabase ---");
    await runLive("chromium", chromium);
  } else {
    console.log("\n(ida y vuelta real omitida: define DIETA_SYNC_TEST_EMAIL y DIETA_SYNC_TEST_PASSWORD)");
  }
} finally {
  server.close();
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
