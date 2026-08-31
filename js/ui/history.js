/* Hoja de Historial: balance y % de cumplimiento mes a mes, con gráfico
   de líneas navegable para abrir cualquier mes pasado. */

import { MONTHS } from "../config.js";
import { state, monthKey } from "../state.js";
import { fmt } from "../dates.js";
import { load, listKeys, isMonthKey } from "../storage.js";
import { statsFor } from "../stats.js";
import { renderHeader, renderGrid, renderSummary } from "./month.js";

function monthLabelFromKey(k){
  const [, y, m] = k.match(/^dieta:(\d{4})-(\d{2})$/);
  return { label: MONTHS[parseInt(m, 10) - 1] + " " + y, y: parseInt(y, 10), m: parseInt(m, 10) - 1 };
}

async function renderHistory(){
  const keys = (await listKeys()).filter(isMonthKey).sort();
  const list = document.getElementById("histList");
  if (!keys.length){ list.innerHTML = '<div class="hist-empty">Aún no hay meses registrados.</div>'; return; }
  let maxAbs = 1;
  const rows = [];
  for (const k of keys){
    const md = (await load(k)) || {};
    const { y, m, label } = monthLabelFromKey(k);
    const ml = (md.__meals && md.__meals.length) ? md.__meals : state.meals;
    const s = statsFor(md, ml, y, m);
    maxAbs = Math.max(maxAbs, Math.abs(s.balance));
    rows.push({ k, label, y, m, ...s });
  }
  rows.sort((a, b) => (a.y - b.y) || (a.m - b.m)); // cronológico para el gráfico
  renderHistCurve(rows);
  rows.reverse(); // más reciente primero para la lista
  list.innerHTML = "";
  rows.forEach(r => {
    const div = document.createElement("div");
    div.className = "hist-row";
    const col = r.balance > 0 ? "up" : r.balance < 0 ? "down" : "flat";
    const barPct = Math.min(100, Math.round((Math.abs(r.balance) / maxAbs) * 100));
    const barColor = r.balance > 0 ? "var(--pos)" : r.balance < 0 ? "var(--neg)" : "var(--ink-faint)";
    div.innerHTML =
      '<div style="flex:1">' +
        '<div class="hm">' + r.label + '</div>' +
        '<div class="hist-bar"><i style="width:' + barPct + '%;background:' + barColor + '"></i></div>' +
      '</div>' +
      '<div class="hb ' + col + '">' + fmt(r.balance) + '</div>' +
      '<div class="hp">' + (r.pct === null ? "—" : r.pct + "%") + '</div>';
    div.onclick = () => {
      state.view = new Date(r.y, r.m, 1);
      state.showPast = true;
      document.getElementById("histSheet").classList.remove("open");
      (async () => {
        state.data = (await load(monthKey())) || {};
        renderHeader(); renderGrid(); renderSummary();
      })();
    };
    list.appendChild(div);
  });
}

function renderHistCurve(rows){
  const svg = document.getElementById("histCurve");
  const note = document.getElementById("histCurveNote");
  const withPct = rows.filter(r => r.pct !== null);
  if (withPct.length === 0){
    svg.style.display = "none";
    note.textContent = "Registra algún día para empezar a ver la tendencia.";
    return;
  }
  if (withPct.length === 1){
    svg.style.display = "none";
    note.textContent = "Solo hay un mes con registros — la línea aparecerá cuando tengas dos o más.";
    return;
  }
  svg.style.display = "block";
  note.textContent = "";
  const W = 320, H = 120, PADX = 18, PADTOP = 22, PADBOT = 22;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  const vals = withPct.map(r => r.pct);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = Math.max(8, max - min);
  const lo = Math.max(0, min - range * 0.15), hi = Math.min(100, max + range * 0.15);
  const span = Math.max(1, hi - lo);
  const x = i => PADX + (i / Math.max(1, withPct.length - 1)) * (W - PADX * 2);
  const y = v => H - PADBOT - ((v - lo) / span) * (H - PADTOP - PADBOT);
  const pts = withPct.map((r, i) => x(i).toFixed(1) + "," + y(r.pct).toFixed(1));
  const area = "M" + pts.join("L") + "L" + x(withPct.length - 1).toFixed(1) + "," + (H - PADBOT) + "L" + x(0).toFixed(1) + "," + (H - PADBOT) + "Z";
  const dots = withPct.map((r, i) =>
    '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(r.pct).toFixed(1) + '" r="3" fill="var(--pos)"/>' +
    '<text x="' + x(i).toFixed(1) + '" y="' + (y(r.pct) - 8).toFixed(1) + '" font-size="9" font-weight="700" text-anchor="middle" fill="var(--ink)" font-family="var(--display)">' + r.pct + '%</text>'
  ).join("");
  const monthLabels = withPct.map((r, i) =>
    '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" font-size="7.5" text-anchor="middle" fill="var(--ink-faint)" font-family="var(--display)">' + r.label.slice(0, 3) + '</text>'
  ).join("");
  svg.innerHTML =
    '<path d="' + area + '" fill="var(--pos)" opacity=".1" stroke="none"/>' +
    '<path class="line" d="M' + pts.join("L") + '" stroke="var(--pos)" fill="none"/>' +
    dots + monthLabels;
}

document.getElementById("history").onclick = () => {
  renderHistory();
  document.getElementById("histSheet").classList.add("open");
};
document.getElementById("histSheet").onclick = e => { if (e.target.id === "histSheet") e.target.classList.remove("open"); };
