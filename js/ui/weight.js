/* Hoja de Peso: registro con fecha seleccionable y gráfico de líneas
   coloreado por fase (verde definición, amarillo mantenimiento, azul volumen). */

import { PHASE_LABEL, PHASE_COLOR } from "../config.js";
import { state } from "../state.js";
import { load, save } from "../storage.js";
import { phaseAt } from "../stats.js";
import { toast } from "../toast.js";

async function renderWeight(){
  const w = (await load("dieta:peso")) || {};
  const hist = (await load("dieta:faseHistory")) || [];
  const entries = Object.keys(w).sort().reverse();
  const list = document.getElementById("weightList");
  list.innerHTML = entries.length ? "" : '<div class="hist-empty">Sin registros de peso todavía.</div>';
  entries.slice(0, 20).forEach(day => {
    const row = document.createElement("div");
    row.className = "weight-row";
    row.innerHTML = '<span>' + day + '</span><span><b>' + w[day] + ' kg</b><span class="rmw">quitar</span></span>';
    row.querySelector(".rmw").onclick = async () => {
      delete w[day]; await save("dieta:peso", w); renderWeight();
    };
    list.appendChild(row);
  });

  const svg = document.getElementById("weightCurve");
  const legend = document.getElementById("weightLegend");
  const ordered = Object.keys(w).sort();
  if (ordered.length < 2){
    svg.style.display = "none"; legend.innerHTML = "";
    return;
  }
  svg.style.display = "block";
  const vals = ordered.map(d => w[d]);
  const W = 320, H = 140, PADX = 20, PADTOP = 26, PADBOT = 26;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = Math.max(0.3, max - min);
  const x = i => PADX + (i / Math.max(1, ordered.length - 1)) * (W - PADX * 2);
  const y = v => H - PADBOT - ((v - min) / range) * (H - PADTOP - PADBOT);

  const phases = ordered.map(d => phaseAt(hist, d));
  const colorFor = (p) => PHASE_COLOR[p] || "var(--ink-faint)";

  // agrupar en tramos contiguos de la misma fase (repitiendo el punto de unión)
  const segments = [];
  let curPhase = phases[0], curIdx = [0];
  for (let i = 1; i < ordered.length; i++){
    curIdx.push(i);
    if (phases[i] !== curPhase){
      segments.push({ phase: curPhase, idx: curIdx });
      curPhase = phases[i];
      curIdx = [i];
    }
  }
  segments.push({ phase: curPhase, idx: curIdx });

  const allPts = ordered.map((d, i) => x(i).toFixed(1) + "," + y(vals[i]).toFixed(1));
  const area = "M" + allPts.join("L") + "L" + x(ordered.length - 1).toFixed(1) + "," + (H - PADBOT) + "L" + x(0).toFixed(1) + "," + (H - PADBOT) + "Z";

  let pathsHtml = '<path d="' + area + '" fill="var(--ink)" opacity=".06" stroke="none"/>';
  segments.forEach(seg => {
    if (seg.idx.length < 2) return;
    const pts = seg.idx.map(i => x(i).toFixed(1) + "," + y(vals[i]).toFixed(1));
    pathsHtml += '<path class="line" d="M' + pts.join("L") + '" stroke="' + colorFor(seg.phase) + '" fill="none"/>';
  });

  let labelIdx;
  if (ordered.length <= 10){
    labelIdx = ordered.map((_, i) => i);
  } else {
    const minI = vals.indexOf(min), maxI = vals.indexOf(max);
    labelIdx = [...new Set([0, ordered.length - 1, minI, maxI])];
  }
  const dots = ordered.map((d, i) =>
    '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(vals[i]).toFixed(1) + '" r="2.8" fill="' + colorFor(phases[i]) + '"/>'
  ).join("");
  const labels = labelIdx.map(i =>
    '<text x="' + x(i).toFixed(1) + '" y="' + (y(vals[i]) - 8).toFixed(1) + '" font-size="9" font-weight="700" text-anchor="middle" fill="var(--ink)" font-family="var(--display)">' + vals[i] + '</text>'
  ).join("");
  const dateLabels = labelIdx.map(i => {
    const [, mo, da] = ordered[i].split("-");
    return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="7.5" text-anchor="middle" fill="var(--ink-faint)" font-family="var(--display)">' + da + '/' + mo + '</text>';
  }).join("");

  svg.innerHTML = pathsHtml + dots + labels + dateLabels;

  const present = [...new Set(phases)];
  const LABEL_WITH_NULL = { ...PHASE_LABEL, null: "Sin fase asignada" };
  legend.innerHTML = present.map(p =>
    '<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:.68rem;color:var(--ink-soft)">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + colorFor(p) + ';display:inline-block"></span>' +
      (LABEL_WITH_NULL[p] || "Sin fase asignada") +
    '</span>'
  ).join("");
}

document.getElementById("weightBtn").onclick = () => {
  document.getElementById("weightInput").value = "";
  const dateInput = document.getElementById("weightDate");
  dateInput.value = state.todayKey;
  dateInput.max = state.todayKey; // no se puede anotar peso de un día futuro
  renderWeight();
  document.getElementById("weightSheet").classList.add("open");
};
document.getElementById("weightSheet").onclick = e => { if (e.target.id === "weightSheet") e.target.classList.remove("open"); };

document.getElementById("weightSave").onclick = async () => {
  const val = parseFloat(document.getElementById("weightInput").value);
  if (!val || val <= 0){ toast("Introduce un peso válido"); return; }
  const day = document.getElementById("weightDate").value || state.todayKey;
  if (day > state.todayKey){ toast("No puedes anotar un día futuro"); return; }
  const w = (await load("dieta:peso")) || {};
  w[day] = val;
  await save("dieta:peso", w);
  document.getElementById("weightInput").value = "";
  document.getElementById("weightDate").value = state.todayKey;
  renderWeight();
  toast("Peso guardado (" + day + ")");
};
