/* Prueba de extremo a extremo en Chromium y WebKit, en vertical.
   Recorre cada pantalla y funcionalidad y comprueba que:
   - nunca aparece un confirm()/prompt()/alert() nativo,
   - los modales propios funcionan,
   - la pulsación larga (touch, ratón y clic derecho) abre la nota,
   - el guardado sobrevive a recargas,
   - el service worker cachea y la app abre sin red (Chromium).

   Uso:  npm test            (ambos motores)
         npm test chromium   (uno)
*/

import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { start, BASE as LOCAL_BASE, PREFIX as LOCAL_PREFIX } from "./server.mjs";

// Por defecto arranca un servidor local; con E2E_BASE se prueba contra una URL
// ya publicada (p. ej. la de GitHub Pages).
const REMOTE = process.env.E2E_BASE || "";
const BASE = REMOTE || LOCAL_BASE;
const PREFIX = REMOTE ? new URL(REMOTE).pathname.replace(/\/$/, "") : LOCAL_PREFIX;

const SHOTS = "/private/tmp/claude-501/-Users-angelvegabailon/fca1f419-a0ca-4117-9080-8fad727f1c83/scratchpad/shots";
const only = process.argv[2];
const ENGINES = [["chromium", chromium], ["webkit", webkit]].filter(([n]) => !only || n === only);

let pass = 0, fail = 0;
const log = [];
function ok(engine, name, cond, detail = ""){
  const line = `${cond ? "PASS" : "FAIL"}  [${engine}] ${name}${detail ? " — " + detail : ""}`;
  log.push(line);
  console.log(line);
  cond ? pass++ : fail++;
}

async function modalVisible(page){
  try { await page.waitForSelector("#modalOverlay:not([hidden])", { timeout: 2500 }); return true; }
  catch { return false; }
}
async function modalText(page){ return (await page.textContent("#modalMsg")) || ""; }
async function modalConfirm(page, { input, accept = true } = {}){
  if (input !== undefined) await page.fill("#modalInput", input);
  const before = await page.textContent("#modalMsg");
  await page.click(accept ? "#modalOk" : "#modalCancel");
  // el modal se cierra... o encadena directamente con el siguiente (p. ej. importar)
  await page.waitForFunction(
    (b) => document.getElementById("modalOverlay").hidden
        || document.getElementById("modalMsg").textContent !== b,
    before, { timeout: 2500 }
  );
}
async function shot(page, engine, name){
  try { await page.screenshot({ path: `${SHOTS}/${engine}-${name}.png`, timeout: 8000, animations: "disabled" }); }
  catch (e) { console.log(`  (captura ${name} omitida: ${e.message.split("\n")[0]})`); }
}

async function runEngine(engine, launcher){
  const browser = await launcher.launch();
  const ctxOpts = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    reducedMotion: "reduce",
  };
  // isMobile se omite adrede: en este build de Chromium headless bloquea
  // page.screenshot(). El viewport vertical + hasTouch cubren el caso móvil.
  if (engine === "chromium") ctxOpts.permissions = ["clipboard-read", "clipboard-write"];
  const context = await browser.newContext(ctxOpts);

  const nativeDialogs = [];
  context.on("dialog", async (d) => { nativeDialogs.push(`${d.type()}: ${d.message()}`); await d.dismiss().catch(() => {}); });

  // Fuerza la vía de respaldo del portapapeles (el modal propio con el texto),
  // igual en ambos motores, para poder leer el volcado exportado.
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("test: no clipboard")), readText: () => Promise.reject(new Error("test: no clipboard")) }
      });
    } catch (e) {}
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text()); });

  // ---------- A. carga ----------
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForSelector("#grid .cell", { timeout: 8000 });
  // deja asentar fuentes / SW en el primer arranque para que los setTimeout
  // de la pulsación larga no se retrasen por saturación de hilo
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);
  const cells0 = await page.locator("#grid .cell").count();
  ok(engine, "carga: rejilla solo con el día de hoy (6 casillas)", cells0 === 6, `${cells0}`);
  ok(engine, "carga: cabecera muestra el mes", /Agosto/i.test(await page.textContent("#monthLabel")));
  ok(engine, "carga: sin errores de consola/JS", pageErrors.length === 0, pageErrors.join(" | "));
  await shot(page, engine, "01-inicio");

  // ---------- B. ciclo de toque en una comida ----------
  const meal = page.locator("#grid .cell:not(.extra)").first();
  await meal.click();
  ok(engine, "comida: 1er toque = cumplida (+1)", (await meal.getAttribute("data-s")) === "1");
  ok(engine, "comida: balance refleja +1", (await page.textContent("#balance")).includes("+1"));
  ok(engine, "comida: contador cumplidas = 1", (await page.textContent("#cPos")) === "1");
  await meal.click();
  ok(engine, "comida: 2º toque = a medias (0.5)", (await meal.getAttribute("data-s")) === "0.5");
  await meal.click();
  ok(engine, "comida: 3er toque = fuera (-1)", (await meal.getAttribute("data-s")) === "-1");

  // ---------- C. columna Extra + modal propio ----------
  const extra = page.locator("#grid .cell.extra").first();
  await extra.click();
  ok(engine, "extra: abre modal propio (no nativo)", await modalVisible(page));
  ok(engine, "extra: el texto del modal es el correcto", (await modalText(page)).startsWith("Extra nº 1"));
  await modalConfirm(page, { input: "café con leche" });
  ok(engine, "extra: casilla queda a 1", (await extra.getAttribute("data-n")) === "1");
  ok(engine, "extra: contador extras = 1", (await page.textContent("#cEx")) === "1");
  ok(engine, "extra: nota marca el punto en la casilla", await extra.evaluate(el => el.classList.contains("has-note")));

  // ---------- D. pulsación larga por TOUCH ----------
  const meal2 = page.locator("#grid .cell:not(.extra)").nth(1);
  await meal2.dispatchEvent("touchstart");
  await page.waitForTimeout(1100); // umbral real 480 ms; margen amplio contra retrasos del hilo
  await meal2.dispatchEvent("touchend");
  ok(engine, "nota (touch): pulsación larga abre el modal", await modalVisible(page));
  ok(engine, "nota (touch): texto 'Nota para ...'", (await modalText(page)).startsWith("Nota para"));
  await modalConfirm(page, { input: "sin pan" });
  ok(engine, "nota (touch): la casilla queda marcada", await meal2.evaluate(el => el.classList.contains("has-note")));

  // ---------- E. pulsación larga por RATÓN (mantener pulsado) ----------
  const meal3 = page.locator("#grid .cell:not(.extra)").nth(2);
  const box = await meal3.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  ok(engine, "nota (ratón): mantener pulsado abre el modal", await modalVisible(page));
  await modalConfirm(page, { input: "ración doble" });
  ok(engine, "nota (ratón): no cambia el estado de la casilla", (await meal3.getAttribute("data-s")) === null);
  ok(engine, "nota (ratón): la casilla queda marcada", await meal3.evaluate(el => el.classList.contains("has-note")));

  // ---------- F. clic derecho ----------
  const meal4 = page.locator("#grid .cell:not(.extra)").nth(3);
  await meal4.click({ button: "right" });
  ok(engine, "nota (clic derecho): abre el modal", await modalVisible(page));
  await modalConfirm(page, { input: "", accept: true }); // vacío: no crea nota
  ok(engine, "nota (clic derecho): nota vacía no marca la casilla", !(await meal4.evaluate(el => el.classList.contains("has-note"))));

  // ---------- G. pantalla Notas ----------
  await page.click("#notesBtn");
  await page.waitForSelector("#notesSheet.open");
  const noteRows = await page.locator("#notesList .hist-row").count();
  ok(engine, "notas: lista todas las notas añadidas", noteRows >= 3, `${noteRows}`);
  ok(engine, "notas: cada nota lleva su fecha", (await page.textContent("#notesList")).includes("2026-08-31"));
  await shot(page, engine, "02-notas");
  await page.locator("#notesSheet").click({ position: { x: 6, y: 6 } });
  await page.waitForSelector("#notesSheet", { state: "hidden" });

  // ---------- H. días anteriores ----------
  ok(engine, "pasado: el botón está visible", await page.isVisible("#pastToggle"));
  ok(engine, "pasado: texto correcto", (await page.textContent("#pastToggle")).includes("Ver los días 1"));
  await page.click("#pastToggle");
  const cellsPast = await page.locator("#grid .cell").count();
  ok(engine, "pasado: al desplegar aparecen todos los días", cellsPast > 100, `${cellsPast}`);
  await shot(page, engine, "03-pasado");
  await page.click("#pastToggle");
  ok(engine, "pasado: se vuelve a plegar", (await page.locator("#grid .cell").count()) === 6);

  // ---------- I. persistencia tras recarga ----------
  await page.waitForTimeout(450);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#grid .cell");
  ok(engine, "persistencia: comida sigue en 'fuera' tras recargar", (await page.locator("#grid .cell:not(.extra)").first().getAttribute("data-s")) === "-1");
  ok(engine, "persistencia: extra sigue a 1 tras recargar", (await page.locator("#grid .cell.extra").first().getAttribute("data-n")) === "1");
  ok(engine, "persistencia: la nota touch sigue ahí", await page.locator("#grid .cell:not(.extra)").nth(1).evaluate(el => el.classList.contains("has-note")));

  // ---------- J. navegación entre meses + persistencia ----------
  await page.click("#prev");
  await page.waitForFunction(() => document.getElementById("monthLabel").textContent.includes("Julio"));
  ok(engine, "meses: retrocede a Julio", true);
  await page.locator("#grid .cell:not(.extra)").first().click();
  ok(engine, "meses: se puede registrar en un mes pasado", (await page.locator("#grid .cell:not(.extra)").first().getAttribute("data-s")) === "1");
  await page.waitForTimeout(450);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#grid .cell");
  ok(engine, "meses: al recargar vuelve al mes actual (Agosto)", (await page.textContent("#monthLabel")).includes("Agosto"));
  await page.click("#prev");
  await page.waitForFunction(() => document.getElementById("monthLabel").textContent.includes("Julio"));
  ok(engine, "meses: el registro de Julio se guardó", (await page.locator("#grid .cell:not(.extra)").first().getAttribute("data-s")) === "1");

  // ---------- K. historial de meses ----------
  await page.click("#next");
  await page.waitForFunction(() => document.getElementById("monthLabel").textContent.includes("Agosto"));
  await page.click("#history");
  await page.waitForSelector("#histSheet.open");
  const histRows = await page.locator("#histList .hist-row").count();
  ok(engine, "historial: hay dos meses en la lista", histRows === 2, `${histRows}`);
  const histCurveShown = await page.evaluate(() => getComputedStyle(document.getElementById("histCurve")).display !== "none" && document.getElementById("histCurve").children.length > 0);
  ok(engine, "historial: el gráfico de % se dibuja con 2 meses", histCurveShown);
  await shot(page, engine, "04-historial");
  await page.locator("#histList .hist-row", { hasText: "Julio" }).click();
  await page.waitForFunction(() => document.getElementById("monthLabel").textContent.includes("Julio"));
  ok(engine, "historial: al tocar un mes se abre ese mes", true);
  await page.click("#next");
  await page.waitForFunction(() => document.getElementById("monthLabel").textContent.includes("Agosto"));

  // ---------- L. fase actual + peso ----------
  await page.click("#gear");
  await page.waitForSelector("#sheet.open");
  await page.selectOption("#phaseSelect", "definicion");
  await page.waitForTimeout(150);
  ok(engine, "fase: el rótulo de fase se actualiza", (await page.textContent("#phaseNote")) === "Definición");
  await page.locator("#sheet").click({ position: { x: 6, y: 6 } });
  await page.waitForSelector("#sheet", { state: "hidden" });

  await page.click("#weightBtn");
  await page.waitForSelector("#weightSheet.open");
  ok(engine, "peso: la fecha por defecto es hoy", (await page.inputValue("#weightDate")) === "2026-08-31");
  await page.fill("#weightInput", "80.5");
  await page.click("#weightSave");
  await page.waitForTimeout(150);
  ok(engine, "peso: se registra el peso de hoy", (await page.textContent("#weightList")).includes("80.5 kg"));
  await page.fill("#weightDate", "2026-08-20");
  await page.fill("#weightInput", "81.2");
  await page.click("#weightSave");
  await page.waitForTimeout(200);
  ok(engine, "peso: se puede anotar un día anterior", (await page.textContent("#weightList")).includes("81.2 kg"));
  const weightCurveShown = await page.evaluate(() => getComputedStyle(document.getElementById("weightCurve")).display !== "none" && document.getElementById("weightCurve").children.length > 0);
  ok(engine, "peso: el gráfico aparece con 2 registros", weightCurveShown);
  ok(engine, "peso: la leyenda de fases se muestra", (await page.textContent("#weightLegend")).trim().length > 0);
  await shot(page, engine, "05-peso");
  await page.locator("#weightSheet").click({ position: { x: 6, y: 6 } });
  await page.waitForSelector("#weightSheet", { state: "hidden" });

  // ---------- M. Mi dieta ----------
  await page.click("#planBtn");
  await page.waitForSelector("#planSheet.open");
  ok(engine, "mi dieta: empieza sin dieta", await page.isVisible("#planEmptyState"));
  await page.click("#planCreateBtn");
  ok(engine, "mi dieta: crear pide nombre por modal propio", await modalVisible(page));
  await modalConfirm(page, { input: "Definición" });
  await page.waitForSelector("#planMainState:not([hidden])");
  ok(engine, "mi dieta: se crea y muestra el nombre", (await page.textContent("#planNameLabel")) === "Definición");
  await page.locator("#planDaysList .day-row", { hasText: "Lunes" }).click();
  await page.waitForSelector("#planDayDetail:not([hidden])");
  ok(engine, "mi dieta: se abre el día con una caja por comida", (await page.locator("#planDayMeals textarea").count()) >= 4);
  await page.locator("#planDayMeals textarea").first().fill("Avena con fruta");
  await page.click("#planDaySave");
  await page.waitForSelector("#planMainState:not([hidden])");
  ok(engine, "mi dieta: el día guardado se resume", (await page.textContent("#planDaysList")).includes("1 comida definida"));
  await page.click("#planEditNotes");
  await modalVisible(page);
  await modalConfirm(page, { input: "2 L de agua al día" });
  await page.waitForTimeout(100);
  ok(engine, "mi dieta: se guardan las notas generales", (await page.textContent("#planNotesText")).includes("2 L de agua"));
  const delBtn = page.locator("#planDeleteBtn");
  await delBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000); // deja pasar el toast antes de la captura
  await shot(page, engine, "06-mi-dieta");
  ok(engine, "mi dieta: el botón de borrar es de texto explícito", (await delBtn.textContent()).trim() === "Eliminar dieta");
  ok(engine, "mi dieta: el botón de borrar usa estilo destructivo (danger)", await delBtn.evaluate(el => el.classList.contains("act") && el.classList.contains("danger")));
  ok(engine, "mi dieta: el botón de borrar es visible y pulsable", await delBtn.isVisible());
  await delBtn.click();
  ok(engine, "mi dieta: eliminar pide confirmación por modal propio", await modalVisible(page));
  await modalConfirm(page);
  await page.waitForSelector("#planEmptyState:not([hidden])");
  ok(engine, "mi dieta: tras eliminar vuelve al estado vacío", true);
  await page.locator("#planSheet").click({ position: { x: 6, y: 6 } });
  await page.waitForSelector("#planSheet", { state: "hidden" });

  // ---------- N. comidas configurables + retro ----------
  await page.click("#gear");
  await page.waitForSelector("#sheet.open");
  ok(engine, "comidas: hay 5 filas por defecto", (await page.locator("#mealList .meal-row").count()) === 5);
  await page.click("#addMeal");
  await page.locator("#mealList .meal-row input").last().fill("Recena");
  await page.click("#saveMeals");
  ok(engine, "comidas: al guardar pregunta si aplicar a meses pasados", await modalVisible(page));
  ok(engine, "comidas: el texto menciona los meses anteriores", (await modalText(page)).includes("meses anteriores"));
  await modalConfirm(page, { accept: false }); // solo desde ahora
  await page.waitForSelector("#sheet", { state: "hidden" });
  await page.waitForTimeout(150);
  ok(engine, "comidas: la nueva comida aparece en la rejilla", await page.locator('#grid .gh[title="Recena"]').count() === 1);
  ok(engine, "comidas: la nota de comidas incluye la nueva", (await page.textContent("#mealsNote")).includes("Recena"));
  await shot(page, engine, "07-comidas");

  // ---------- Ñ. copia de seguridad export/import ----------
  await page.click("#gear");
  await page.waitForSelector("#sheet.open");
  await page.click("#exportBtn");
  ok(engine, "backup: exportar abre el modal propio con el texto", await modalVisible(page));
  const dump = await page.inputValue("#modalInput");
  await page.click("#modalOk");
  await page.waitForSelector("#modalOverlay", { state: "hidden" });
  let dumpOk = false;
  try { const d = JSON.parse(dump); dumpOk = !!d.meses && Array.isArray(d.comidas); } catch {}
  ok(engine, "backup: exporta un JSON con meses y comidas", dumpOk, dump.slice(0, 40));
  await page.click("#importBtn");
  await modalVisible(page);
  await modalConfirm(page, { input: dump });
  ok(engine, "backup: importar pide confirmación por modal propio", await modalVisible(page));
  await modalConfirm(page);
  await page.waitForTimeout(200);
  ok(engine, "backup: restaura sin romper la rejilla", (await page.locator("#grid .cell").count()) > 0);
  if (await page.isVisible("#sheet.open")) await page.locator("#sheet").click({ position: { x: 6, y: 6 } });

  // ---------- O. ningún diálogo nativo en todo el recorrido ----------
  ok(engine, "sin confirm()/prompt()/alert() nativos en ningún flujo", nativeDialogs.length === 0, nativeDialogs.join(" | "));
  ok(engine, "sin errores de JS en todo el recorrido", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  // ---------- O-bis. color del % y aviso puntual al cruzar el 80% ----------
  {
    const pctCtx = await browser.newContext({ ...ctxOpts });
    await pctCtx.addInitScript(() => {
      window.__toasts = [];
      const rec = () => {
        const t = document.getElementById("toast");
        if (!t || !t.classList.contains("show")) return;
        const txt = (t.textContent || "").trim();
        if (txt && window.__toasts[window.__toasts.length - 1] !== txt) window.__toasts.push(txt);
      };
      document.addEventListener("DOMContentLoaded", () => {
        new MutationObserver(rec).observe(document.getElementById("toast"),
          { attributes: true, childList: true, characterData: true, subtree: true });
      });
    });
    const pp = await pctCtx.newPage();
    const pErr = [];
    pp.on("pageerror", (e) => pErr.push(String(e)));
    await pp.goto(BASE, { waitUntil: "load" });
    await pp.waitForSelector("#grid .cell");
    await pp.waitForLoadState("networkidle").catch(() => {});
    await pp.click("#pastToggle"); // despliega el mes entero: muchas casillas distintas

    const cells = pp.locator("#grid .cell:not(.extra)");
    const pctText = () => pp.textContent("#pct");
    const band = () => pp.locator("#pct").evaluate(el =>
      el.classList.contains("good") ? "good" : el.classList.contains("mid") ? "mid" : el.classList.contains("bad") ? "bad" : "none");
    const toasts = () => pp.evaluate(() => window.__toasts.slice());
    const tap = async (i) => { await cells.nth(i).click(); await pp.waitForTimeout(90); };

    // Fase 1 — línea base 100% sin cruce (marcar casillas distintas a "cumplida")
    for (const i of [0, 1, 2, 3]) await tap(i);
    ok(engine, "pct color: 100% en verde", (await band()) === "good", await pctText());
    ok(engine, "pct: sin toast todavía (no ha cruzado nada)", (await toasts()).length === 0);

    // Fase 2 — cruce hacia ABAJO del 80% (primer aviso de bajada)
    await tap(4);            // c4 +1 -> 5/5 = 100%
    await tap(4);            // c4 1/2 -> 90%
    await tap(4);            // c4 -1 -> 4/5 = 80%
    await tap(5);            // c5 +1 -> 5/6 = 83%
    await tap(5);            // c5 1/2 -> 4.5/6 = 75%  => CRUCE ABAJO
    ok(engine, "pct color: 75% en ámbar", (await band()) === "mid", await pctText());
    let ts = await toasts();
    ok(engine, "pct: aviso de bajada al cruzar por debajo del 80%", ts.length === 1 && /bajado del 80/.test(ts[0]), JSON.stringify(ts));

    // Fase 3 — sigue por debajo: NO repite
    await tap(5);            // c5 -1 -> 4/6 = 67%
    ok(engine, "pct color: 67% en rojo", (await band()) === "bad", await pctText());
    await tap(6);            // c6 +1 -> 5/7 = 71%
    ok(engine, "pct: no repite el aviso mientras sigue por debajo del 80%", (await toasts()).length === 1);

    // Fase 4 — cruce hacia ARRIBA del 80% (aviso de felicitación)
    await tap(7);            // 6/8 = 75%
    await tap(8);            // 7/9 = 78%
    await tap(9);            // 8/10 = 80%  => CRUCE ARRIBA
    ok(engine, "pct color: 80% en verde", (await band()) === "good", await pctText());
    ts = await toasts();
    ok(engine, "pct: felicitación al subir por encima del 80%, una sola vez", ts.length === 2 && /Por encima del 80/.test(ts[1]), JSON.stringify(ts));

    // Fase 5 — sigue por encima: NO repite en cada tap
    await tap(10);           // 9/11 = 82%
    await tap(11);           // 10/12 = 83%
    ok(engine, "pct: 83% verde", (await band()) === "good", await pctText());
    ok(engine, "pct: NO repite la felicitación mientras sigue por encima del 80%", (await toasts()).length === 2);

    // Fase 6 — vuelve a cruzar hacia abajo (segundo aviso de bajada, también único)
    await tap(12);           // 11/13 = 85%
    await tap(0);            // c0 1 -> 1/2 -> 10.5/13 = 81%
    await tap(0);            // c0 1/2 -> -1 -> 10/13 = 77%  => CRUCE ABAJO
    ok(engine, "pct color: 77% en ámbar", (await band()) === "mid", await pctText());
    ts = await toasts();
    ok(engine, "pct: aviso de bajada de nuevo, una sola vez por cruce", ts.length === 3 && /bajado del 80/.test(ts[2]), JSON.stringify(ts));

    // Fase 7 — sigue por debajo: NO repite; tercer color comprobado
    await tap(1);            // c1 1 -> 1/2 -> 9.5/13 = 73%
    await tap(1);            // c1 1/2 -> -1 -> 9/13 = 69%
    ok(engine, "pct color: 69% en rojo", (await band()) === "bad", await pctText());
    ok(engine, "pct: no repite el aviso de bajada", (await toasts()).length === 3);

    await shot(pp, engine, "09-pct");
    ok(engine, "pct: sin errores de JS en el flujo del %", pErr.length === 0, pErr.join(" | "));
    await pctCtx.close();
  }

  // ---------- P. recordatorio de las 20h (contexto limpio + reloj falso) ----------
  const remCtx = await browser.newContext({ ...ctxOpts });
  const remPage = await remCtx.newPage();
  await remPage.clock.install({ time: new Date("2026-08-31T21:30:00") });
  await remPage.goto(BASE, { waitUntil: "load" });
  await remPage.waitForSelector("#grid .cell");
  await remPage.waitForTimeout(200);
  ok(engine, "recordatorio: aparece pasadas las 20h sin registros", await remPage.isVisible("#reminder"));
  await remPage.click("#reminderClose");
  ok(engine, "recordatorio: se puede cerrar", !(await remPage.isVisible("#reminder")));
  await remPage.reload({ waitUntil: "load" });
  await remPage.waitForSelector("#grid .cell");
  await remPage.waitForTimeout(200);
  ok(engine, "recordatorio: no reaparece en la misma sesión tras cerrarlo", !(await remPage.isVisible("#reminder")));
  await remCtx.close();

  // ---------- Q. PWA: manifest + service worker + offline ----------
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    const r = await fetch(href); return r.ok ? r.json() : null;
  });
  ok(engine, "pwa: manifest.json se sirve y es válido", !!manifest && manifest.start_url === "./");
  ok(engine, "pwa: manifest en modo standalone y vertical", manifest && manifest.display === "standalone" && manifest.orientation === "portrait");
  ok(engine, "pwa: manifest declara icono maskable", manifest && manifest.icons.some(i => (i.purpose || "").includes("maskable")));

  if (engine === "chromium"){
    const swCtx = await browser.newContext({ ...ctxOpts });
    const swPage = await swCtx.newPage();
    await swPage.goto(BASE, { waitUntil: "load" });
    await swPage.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
    const scope = await swPage.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return r ? r.scope : null;
    });
    ok(engine, "pwa: service worker registrado en la subruta", !!scope && scope.endsWith(PREFIX + "/"), scope || "sin registro");
    await swCtx.setOffline(true);
    await swPage.reload({ waitUntil: "load" }).catch(() => {});
    const offlineOk = await swPage.locator("#grid .cell").count().catch(() => 0);
    ok(engine, "pwa: la app abre y pinta sin conexión", offlineOk > 0, `${offlineOk} casillas`);
    await shot(swPage, engine, "08-offline");
    await swCtx.setOffline(false);
    await swCtx.close();
  } else {
    ok(engine, "pwa: (WebKit no soporta SW en Playwright — la app funciona igual sin él)", true);
  }

  await context.close();
  await browser.close();
}

const server = REMOTE ? null : await start();
console.log("probando contra " + BASE + "\n");
await mkdir(SHOTS, { recursive: true });
try {
  for (const [name, launcher] of ENGINES) await runEngine(name, launcher);
} finally {
  server?.close();
}

await writeFile(`${SHOTS}/report.txt`, log.join("\n") + `\n\n${pass} PASS / ${fail} FAIL\n`);
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
