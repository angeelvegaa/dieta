/* ---------- Vista de solo lectura para automatización externa ----------
   Se carga SOLO cuando la URL lleva ?autoexport=1 (ver js/boot.js). En lugar
   de la app normal, pinta un único bloque de texto plano —dentro de un <pre>—
   con un resumen estructurado de los datos LOCALES de este dispositivo del
   último mes (~5 semanas).

   Pensado para que lo lea un Atajo de iPhone y se lo pase a otra IA como
   contexto, no para una persona: texto legible y etiquetado, nada de JSON en
   bruto, nada de estilos ni de JavaScript interactivo.

   Es una transformación puramente local de lo que ya hay en localStorage:
   NO toca la copia en la nube ni el cifrado y NO hace ninguna llamada de red. */

import { DEFAULT_MEALS, PHASE_LABEL, WEEKDAYS } from "./config.js";

const WINDOW_DAYS = 35;              // ~5 semanas: suficiente para un resumen mensual
const EXTRA = "__extra";
const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/* ---------- lectura cruda de localStorage (sin tocar nada más) ---------- */
function readJSON(key){
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : JSON.parse(v);
  } catch (e) { return null; }
}

function pad(n){ return String(n).padStart(2, "0"); }
function ymd(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

/* número con signo y coma decimal, estilo del resto de la app */
function signed(n){
  const s = (Math.round(n * 10) / 10).toString().replace(".", ",");
  return n > 0 ? "+" + s : s;
}
function kg(n){ return (Math.round(n * 10) / 10).toString().replace(".", ",") + " kg"; }

function mealsForMonth(monthData, comidas){
  if (monthData && Array.isArray(monthData.__meals) && monthData.__meals.length) return monthData.__meals;
  if (Array.isArray(comidas) && comidas.length) return comidas;
  return DEFAULT_MEALS.slice();
}

/* ---------- acumuladores de cumplimiento (misma fórmula que js/stats.js) ---------- */
function tally(){ return { pos: 0, half: 0, neg: 0, ex: 0, daysLogged: 0 }; }
function addDay(t, day){
  t.pos += day.pos; t.half += day.half; t.neg += day.neg; t.ex += day.ex;
  if (day.logged) t.daysLogged++;
}
function loggedCount(t){ return t.pos + t.half + t.neg + t.ex; }
function pctOf(t){
  const n = loggedCount(t);
  return n ? Math.round(((t.pos + t.half * 0.5) / n) * 100) : null;
}
function balanceOf(t){ return t.pos + t.half * 0.5 - t.neg - t.ex; }
function tallyBlock(t){
  const n = loggedCount(t);
  const pct = pctOf(t);
  return [
    "Cumplimiento: " + (pct === null ? "sin datos" : pct + "%") + (n ? " (sobre " + n + " registros de comida/extra)" : ""),
    "Balance: " + (n ? signed(balanceOf(t)) + " puntos" : "0"),
    "Cumplidas " + t.pos + " · a medias " + t.half + " · fuera de dieta " + t.neg + " · extras entre horas " + t.ex
  ];
}

/* ---------- construcción del resumen ----------
   Exportada: la usa también el botón "Compartir resumen" de Ajustes
   (js/ui/settings.js) para pasar el mismo texto a navigator.share(). */
export function buildSummaryText(){
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (WINDOW_DAYS - 1));
  const startYmd = ymd(start), todayYmd = ymd(today);

  const comidas = readJSON("dieta:comidas");
  const fase = readJSON("dieta:fase");
  const faseHistory = Array.isArray(readJSON("dieta:faseHistory")) ? readJSON("dieta:faseHistory") : [];
  const peso = readJSON("dieta:peso") || {};
  const plan = readJSON("dieta:planStructured");

  const monthCache = {};
  const monthOf = (d) => {
    const k = "dieta:" + d.getFullYear() + "-" + pad(d.getMonth() + 1);
    if (!(k in monthCache)) monthCache[k] = readJSON(k) || {};
    return monthCache[k];
  };

  // recorre día a día la ventana
  const days = [];
  for (let i = 0; i < WINDOW_DAYS; i++){
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = ymd(d);
    const md = monthOf(d);
    const meals = mealsForMonth(md, comidas);
    const entry = md[key] || {};
    let pos = 0, half = 0, neg = 0;
    const mid = [], out = [];
    meals.forEach(m => {
      const v = entry[m];
      if (v === 1) pos++;
      else if (v === 0.5){ half++; mid.push(m); }
      else if (v === -1){ neg++; out.push(m); }
    });
    const ex = entry[EXTRA] || 0;
    const extraNotes = Array.isArray(entry.__extraNotes) ? entry.__extraNotes.filter(Boolean) : [];
    const mealNotes = entry.__notes || {};
    days.push({
      d, key, dow: DOW[d.getDay()], total: meals.length,
      pos, half, neg, ex, mid, out, extraNotes, mealNotes,
      logged: (pos + half + neg + ex) > 0
    });
  }

  const overall = tally();
  days.forEach(day => addDay(overall, day));

  // semanas naturales (lunes-domingo) que tocan la ventana
  const weeks = new Map();
  days.forEach(day => {
    const monday = new Date(day.d);
    monday.setDate(day.d.getDate() - ((day.d.getDay() + 6) % 7));
    const wk = ymd(monday);
    if (!weeks.has(wk)) weeks.set(wk, { monday, days: [] });
    weeks.get(wk).days.push(day);
  });

  /* --- secciones --- */
  const faseLines = () => {
    const lines = [];
    const label = fase ? (PHASE_LABEL[fase] || fase) : "sin especificar";
    let since = "";
    if (faseHistory.length){
      const last = faseHistory[faseHistory.length - 1];
      if (last && !last.end && last.phase === fase) since = " (desde " + last.start + ")";
    }
    lines.push("Fase actual: " + label + since);
    const changed = faseHistory.filter(h => h && h.start >= startYmd);
    if (changed.length){
      lines.push("Cambios de fase dentro de la ventana:");
      changed.forEach(h => lines.push(
        "  " + h.start + ": " + (PHASE_LABEL[h.phase] || h.phase || "sin fase") +
        (h.end ? " (hasta " + h.end + ")" : " (en curso)")
      ));
    } else {
      lines.push("Cambios de fase dentro de la ventana: ninguno");
    }
    return lines;
  };

  const planLines = () => {
    if (!plan) return ["(sin dieta guardada en este dispositivo)"];
    const lines = ["Nombre: " + (plan.name || "Mi dieta")];
    if (plan.notes && plan.notes.trim()) lines.push("Notas generales: " + plan.notes.trim());
    const pd = plan.days || {};
    let anyDay = false;
    WEEKDAYS.forEach(wd => {
      const m = pd[wd] || {};
      const parts = Object.keys(m).filter(k => m[k] && m[k].trim()).map(k => k + ": " + m[k].trim());
      if (parts.length){ anyDay = true; lines.push("  " + wd + " — " + parts.join(" | ")); }
    });
    if (!anyDay) lines.push("  (ningún día del plan tiene comidas definidas)");
    return lines;
  };

  const weekLines = () => [...weeks.values()].sort((a, b) => a.monday - b.monday).map(w => {
    const t = tally();
    w.days.forEach(day => addDay(t, day));
    const sunday = new Date(w.monday); sunday.setDate(w.monday.getDate() + 6);
    const range = pad(w.monday.getDate()) + "/" + pad(w.monday.getMonth() + 1) +
                  "–" + pad(sunday.getDate()) + "/" + pad(sunday.getMonth() + 1);
    const pct = pctOf(t);
    return "  " + range + ": " + t.daysLogged + "/" + w.days.length + " días con registro · " +
           (pct === null ? "sin datos" : pct + "%") + " · balance " + signed(balanceOf(t)) +
           " · extras " + t.ex;
  });

  const pesoLines = () => {
    const dates = Object.keys(peso).sort();
    if (!dates.length) return ["(sin registros de peso)"];
    const lines = [];
    const lastDate = dates[dates.length - 1];
    lines.push("Último registro: " + kg(peso[lastDate]) + " (" + lastDate + ")");
    const win = dates.filter(dt => dt >= startYmd && dt <= todayYmd);
    if (win.length){
      lines.push("Dentro de la ventana (" + win.length + " registro" + (win.length > 1 ? "s" : "") + "):");
      win.forEach(dt => lines.push("  " + dt + ": " + kg(peso[dt])));
      if (win.length >= 2) lines.push("  Variación en la ventana: " + signed(peso[win[win.length - 1]] - peso[win[0]]) + " kg");
    } else {
      lines.push("Dentro de la ventana: sin registros");
    }
    return lines;
  };

  const dailyLines = () => {
    const lines = [];
    let emptyRun = 0;
    const flush = () => {
      if (emptyRun) lines.push("  (" + emptyRun + " día" + (emptyRun > 1 ? "s" : "") + " sin ningún registro)");
      emptyRun = 0;
    };
    days.forEach(day => {
      if (!day.logged){ emptyRun++; return; }
      flush();
      const bits = [day.pos + "/" + day.total + " comidas cumplidas"];
      if (day.half) bits.push(day.half + " a medias (" + day.mid.join(", ") + ")");
      if (day.neg) bits.push(day.neg + " fuera de dieta (" + day.out.join(", ") + ")");
      if (day.ex) bits.push(day.ex + " extra" + (day.ex > 1 ? "s" : "") + " entre horas" +
        (day.extraNotes.length ? " (" + day.extraNotes.join("; ") + ")" : ""));
      const notes = Object.keys(day.mealNotes).filter(k => day.mealNotes[k]).map(k => k + ": " + day.mealNotes[k]);
      if (notes.length) bits.push("notas — " + notes.join("; "));
      lines.push("  " + day.key + " (" + day.dow + "): " + bits.join("; "));
    });
    flush();
    return lines;
  };

  const L = [];
  L.push(todayYmd);   // primera línea: fecha de generación, para identificar el resumen después
  L.push("RESUMEN DIETA — exportación automática (solo lectura, para automatización externa)");
  L.push("Generado: " + todayYmd + " · datos LOCALES de este dispositivo (localStorage)");
  L.push("Ventana analizada: " + startYmd + " a " + todayYmd + " (" + WINDOW_DAYS + " días, ~5 semanas)");
  L.push("Comidas del día configuradas: " + mealsForMonth({}, comidas).join(" · ") + " · + columna Extra (comidas fuera de horas)");
  L.push("Escala de marcas: cumplida = +1 · a medias = +0,5 · fuera de dieta = −1 · cada extra = −1");
  L.push("");
  L.push("== FASE ==");
  faseLines().forEach(x => L.push(x));
  L.push("");
  L.push("== MI DIETA (plan objetivo) ==");
  planLines().forEach(x => L.push(x));
  L.push("");
  L.push("== CUMPLIMIENTO · VENTANA COMPLETA ==");
  L.push("Días con algún registro: " + overall.daysLogged + " de " + WINDOW_DAYS);
  tallyBlock(overall).forEach(x => L.push(x));
  L.push("");
  L.push("== CUMPLIMIENTO · POR SEMANAS (lunes a domingo) ==");
  weekLines().forEach(x => L.push(x));
  L.push("");
  L.push("== PESO ==");
  pesoLines().forEach(x => L.push(x));
  L.push("");
  L.push("== DETALLE DIARIO (solo días con algún registro) ==");
  const dl = dailyLines();
  if (dl.length) dl.forEach(x => L.push(x));
  else L.push("  (no hay ningún día con registro en la ventana)");
  L.push("");
  L.push("FIN DEL RESUMEN");
  return L.join("\n");
}

export function renderAutoExport(){
  let text;
  try { text = buildSummaryText(); }
  catch (e){ text = "ERROR al generar el resumen local: " + ((e && e.message) || String(e)); }

  // fuera estilos y cualquier resto de la app: solo texto plano
  document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], style').forEach(el => el.remove());
  document.title = "Resumen dieta (autoexport)";

  const pre = document.createElement("pre");
  pre.id = "autoexport";
  pre.style.whiteSpace = "pre-wrap";   // que envuelva: solo para revisar a ojo, no afecta al texto leído
  pre.style.wordBreak = "break-word";
  pre.style.margin = "12px";
  pre.textContent = text;
  document.body.replaceChildren(pre);
}
