/* Pantalla principal: cabecera de mes, resumen + curva, rejilla de días,
   ciclo de toque en cada casilla, columna Extra y notas por pulsación larga. */

import { MONTHS, DOW, CYCLE, SYM, EXTRA, MAX_EXTRA } from "../config.js";
import { state, monthKey, effectiveMeals, isCurrentMonth, queueSave, flushSaveFull } from "../state.js";
import { ymd, daysIn, abbr, fmt } from "../dates.js";
import { customPrompt } from "../modal.js";
import { stats } from "../stats.js";
import { attachLongPress } from "../longpress.js";
import { load } from "../storage.js";

/* ---------- cabecera ---------- */
export function renderHeader(){
  document.getElementById("monthLabel").innerHTML =
    MONTHS[state.view.getMonth()] + '<small>' + state.view.getFullYear() + '</small>';
  document.getElementById("next").disabled = isCurrentMonth();
  document.getElementById("mealsNote").textContent = effectiveMeals().join(" · ") + " · Extra";

  const tog = document.getElementById("pastToggle");
  const hasPast = isCurrentMonth() && state.today.getDate() > 1;
  tog.hidden = !hasPast;
  if (hasPast) tog.textContent = state.showPast
    ? "Ocultar los días anteriores"
    : "Ver los días 1 – " + (state.today.getDate() - 1) + " de " + MONTHS[state.view.getMonth()].toLowerCase();
}

/* ---------- rejilla ---------- */
export function renderGrid(){
  const grid = document.getElementById("grid");
  const activeMeals = effectiveMeals();
  grid.style.gridTemplateColumns = "2.9rem repeat(" + (activeMeals.length + 1) + ", minmax(0,1fr))";
  const frag = document.createDocumentFragment();

  const h0 = document.createElement("div");
  h0.className = "gh day"; h0.textContent = "Día";
  frag.appendChild(h0);
  activeMeals.forEach(m => {
    const h = document.createElement("div");
    h.className = "gh"; h.textContent = abbr(m); h.title = m;
    frag.appendChild(h);
  });
  const hx = document.createElement("div");
  hx.className = "gh extra"; hx.textContent = "Extra"; hx.title = "Comidas fuera de horas";
  frag.appendChild(hx);

  const n = daysIn(state.view);
  const from = (isCurrentMonth() && !state.showPast) ? state.today.getDate() : 1;

  for (let d = from; d <= n; d++){
    const date = new Date(state.view.getFullYear(), state.view.getMonth(), d);
    const key = ymd(date);
    const isToday = key === state.todayKey;
    const future = date > state.today && !isToday;
    const wkd = date.getDay() === 0 || date.getDay() === 6;

    const lab = document.createElement("div");
    lab.className = "dl" + (isToday ? " row-today" : "") + (wkd ? " weekend" : "");
    lab.innerHTML = "<b>" + d + "</b><i>" + DOW[date.getDay()] + "</i>";
    frag.appendChild(lab);

    activeMeals.forEach(m => {
      const b = document.createElement("button");
      b.className = "cell" + (isToday ? " row-today" : "");
      b.dataset.day = key; b.dataset.meal = m;
      b.disabled = future;
      setCell(b, state.data[key]?.[m]);
      if (state.data[key]?.__notes?.[m]) b.classList.add("has-note");
      attachLongPress(b, () => editNote(key, m));
      frag.appendChild(b);
    });

    const x = document.createElement("button");
    x.className = "cell extra" + (isToday ? " row-today" : "");
    x.dataset.day = key; x.dataset.kind = "extra";
    x.disabled = future;
    setExtra(x, state.data[key]?.[EXTRA] || 0);
    if ((state.data[key]?.__extraNotes || []).some(nt => nt)) x.classList.add("has-note");
    attachLongPress(x, () => editExtraNote(key));
    frag.appendChild(x);
  }
  grid.replaceChildren(frag);
}

function setCell(btn, v){
  if (v === undefined || v === null){ delete btn.dataset.s; btn.textContent = "·"; }
  else { btn.dataset.s = String(v); btn.textContent = SYM[String(v)]; }
  const nice = { "1":"cumplida", "0.5":"a medias", "-1":"fuera de dieta" }[String(v)] || "sin registrar";
  btn.setAttribute("aria-label", btn.dataset.meal + ", día " + btn.dataset.day.slice(-2) + ": " + nice);
}

function setExtra(btn, n){
  if (!n){ delete btn.dataset.n; btn.textContent = "·"; }
  else { btn.dataset.n = String(n); btn.textContent = String(n); }
  btn.setAttribute("aria-label", "Extras fuera de horas, día " + btn.dataset.day.slice(-2) + ": " + (n || 0));
}

/* ---------- notas (comidas y extras) ---------- */
async function editNote(day, meal){
  const cur = state.data[day]?.__notes?.[meal] || "";
  const txt = await customPrompt("Nota para " + meal + " (opcional):", cur);
  if (txt === null) return;
  (state.data[day] ||= {});
  (state.data[day].__notes ||= {});
  if (txt.trim()) state.data[day].__notes[meal] = txt.trim();
  else delete state.data[day].__notes[meal];
  if (!Object.keys(state.data[day].__notes).length) delete state.data[day].__notes;
  renderGrid();
  queueSave();
}

async function editExtraNote(day){
  const notes = (state.data[day]?.__extraNotes || []).filter(Boolean);
  const cur = notes.join("; ");
  const txt = await customPrompt(
    "Notas de los extras de hoy (separadas por ; si hay varias):", cur
  );
  if (txt === null) return;
  (state.data[day] ||= {});
  const parts = txt.split(";").map(s => s.trim()).filter(Boolean);
  if (parts.length) state.data[day].__extraNotes = parts;
  else delete state.data[day].__extraNotes;
  renderGrid();
  queueSave();
}

/* ---------- resumen + curva ---------- */
export function renderSummary(){
  const s = stats();
  const b = document.getElementById("balance");
  b.textContent = s.logged ? fmt(s.balance) : "0";
  b.className = "balance " + (s.balance > 0 ? "up" : s.balance < 0 ? "down" : "flat");
  document.getElementById("pct").textContent = s.pct === null ? "—" : s.pct + "%";
  document.getElementById("loggedNote").textContent = s.logged ? "de " + s.logged + " registros" : "sin registros";
  document.getElementById("cPos").textContent = s.pos;
  document.getElementById("cHalf").textContent = s.half;
  document.getElementById("cNeg").textContent = s.neg;
  document.getElementById("cEx").textContent = s.ex;
  renderCurve(s.daily);
}

function renderCurve(daily){
  const svg = document.getElementById("curve");
  const W = 300, H = 62, PAD = 6;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  let acc = 0;
  const cum = daily.map(v => (acc += v));
  const max = Math.max(1, ...cum.map(Math.abs));
  const x = i => PAD + (i / Math.max(1, cum.length - 1)) * (W - PAD * 2);
  const y = v => H / 2 - (v / max) * (H / 2 - PAD);
  const pts = cum.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1));
  const line = "M" + pts.join("L");
  const area = line + "L" + x(cum.length - 1).toFixed(1) + "," + y(0).toFixed(1) + "L" + x(0).toFixed(1) + "," + y(0).toFixed(1) + "Z";
  const last = cum[cum.length - 1];
  const col = last > 0 ? "var(--pos)" : last < 0 ? "var(--neg)" : "var(--ink-faint)";
  let li = -1;
  for (let i = daily.length - 1; i >= 0; i--) if (daily[i] !== 0){ li = i; break; }
  svg.innerHTML =
    '<line class="zero" x1="0" y1="' + (H / 2) + '" x2="' + W + '" y2="' + (H / 2) + '"/>' +
    '<path class="fill" d="' + area + '" fill="' + col + '"/>' +
    '<path class="line" d="' + line + '" stroke="' + col + '"/>' +
    (li >= 0 ? '<circle cx="' + x(li).toFixed(1) + '" cy="' + y(cum[li]).toFixed(1) + '" r="3" fill="' + col + '"/>' : '');
  const path = svg.querySelector(".line");
  try { path.style.setProperty("--len", path.getTotalLength()); } catch (e) {}
}

/* ---------- interacción ---------- */
document.getElementById("grid").addEventListener("click", async (e) => {
  const btn = e.target.closest(".cell");
  if (!btn || btn.disabled) return;
  if (btn._longPressFired && btn._longPressFired()) return; // ya se gestionó como pulsación larga
  const day = btn.dataset.day;

  if (btn.dataset.kind === "extra"){
    const cur = state.data[day]?.[EXTRA] || 0;
    const next = (cur + 1) % (MAX_EXTRA + 1);
    if (!next){
      if (state.data[day]){ delete state.data[day][EXTRA]; delete state.data[day].__extraNotes; if (!Object.keys(state.data[day]).length) delete state.data[day]; }
      setExtra(btn, next);
    } else {
      (state.data[day] ||= {})[EXTRA] = next;
      setExtra(btn, next);
      // nota opcional para ESTE extra en concreto (no solo el primero del día)
      const note = await customPrompt("Extra nº " + next + " de hoy — ¿qué picoteaste? (opcional):", "");
      if (note !== null){
        (state.data[day].__extraNotes ||= []);
        state.data[day].__extraNotes[next - 1] = note.trim() || "";
      }
      renderGrid();
    }
  } else {
    const meal = btn.dataset.meal;
    const cur = state.data[day]?.[meal] ?? null;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    if (next === null){
      if (state.data[day]){ delete state.data[day][meal]; if (!Object.keys(state.data[day]).length) delete state.data[day]; }
    } else {
      (state.data[day] ||= {})[meal] = next;
    }
    setCell(btn, next);
  }
  renderSummary();
  queueSave();
});

document.getElementById("pastToggle").onclick = () => {
  state.showPast = !state.showPast;
  renderHeader(); renderGrid();
  if (!state.showPast) window.scrollTo({ top: 0, behavior: "smooth" });
};

async function goto(delta){
  await flushSaveFull();
  state.view = new Date(state.view.getFullYear(), state.view.getMonth() + delta, 1);
  state.showPast = false;
  state.data = (await load(monthKey())) || {};
  renderHeader(); renderGrid(); renderSummary();
}
document.getElementById("prev").onclick = () => goto(-1);
document.getElementById("next").onclick = () => goto(1);
