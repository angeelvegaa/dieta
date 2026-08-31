/* Hoja de Ajustes: fase actual (con histórico), comidas del día
   (con opción de aplicar a meses pasados) y copia de seguridad manual. */

import { EXTRA, PHASE_LABEL } from "../config.js";
import { state, monthKey } from "../state.js";
import { addDays } from "../dates.js";
import { load, save, listKeys, isMonthKey } from "../storage.js";
import { customConfirm, customPrompt } from "../modal.js";
import { toast } from "../toast.js";
import { renderHeader, renderGrid, renderSummary } from "./month.js";
import { syncPctBaseline } from "./pct-alert.js";

const sheet = document.getElementById("sheet");

function mealRow(val){
  const row = document.createElement("div");
  row.className = "meal-row";
  const inp = document.createElement("input");
  inp.type = "text"; inp.value = val; inp.placeholder = "Nombre de la comida";
  const rm = document.createElement("button");
  rm.className = "rm"; rm.innerHTML = "&times;"; rm.setAttribute("aria-label", "Quitar");
  rm.onclick = () => row.remove();
  row.append(inp, rm);
  return row;
}

document.getElementById("gear").onclick = async () => {
  document.getElementById("mealList").replaceChildren(...state.meals.map(mealRow));
  document.getElementById("phaseSelect").value = (await load("dieta:fase")) || "";
  sheet.classList.add("open");
};

sheet.onclick = e => { if (e.target === sheet) sheet.classList.remove("open"); };

/* ---------- fase actual ---------- */
export async function renderPhaseNote(){
  const ph = await load("dieta:fase");
  document.getElementById("phaseNote").textContent = ph ? PHASE_LABEL[ph] || "" : "";
}

document.getElementById("phaseSelect").onchange = async (e) => {
  await save("dieta:fase", e.target.value);
  await recordPhaseChange(e.target.value);
  renderPhaseNote();
};

/* Cada cambio de fase cierra el periodo anterior (el día antes de hoy) y abre
   uno nuevo desde hoy, para que el gráfico de peso pueda colorear cada tramo. */
async function recordPhaseChange(newPhase){
  const hist = (await load("dieta:faseHistory")) || [];
  if (hist.length){
    const last = hist[hist.length - 1];
    if (!last.end){
      if (last.phase === newPhase) return; // sin cambio real
      last.end = addDays(state.todayKey, -1);
    }
  }
  if (newPhase) hist.push({ phase: newPhase, start: state.todayKey, end: null });
  await save("dieta:faseHistory", hist);
}

/* ---------- comidas del día ---------- */
document.getElementById("addMeal").onclick = () => {
  document.getElementById("mealList").appendChild(mealRow(""));
};

document.getElementById("saveMeals").onclick = async () => {
  const vals = [...document.querySelectorAll("#mealList input")]
    .map(i => i.value.trim()).filter(v => v && v !== EXTRA);
  if (!vals.length){ toast("Deja al menos una comida"); return; }
  const newMeals = [...new Set(vals)];

  const keys = (await listKeys()).filter(isMonthKey);
  const retro = await customConfirm(
    "¿Aplicar este cambio también a los meses anteriores ya registrados?\n\n" +
    "Aceptar: se aplica también a lo pasado.\n" +
    "Cancelar: los meses anteriores conservan las comidas que tenían."
  );

  for (const k of keys){
    const isPast = k !== monthKey();
    if (!isPast) continue; // el mes actual se trata aparte, abajo
    const monthData = (await load(k)) || {};
    if (retro){
      monthData.__meals = newMeals;
    } else if (!monthData.__meals){
      monthData.__meals = state.meals;
    }
    await save(k, monthData);
  }

  state.data.__meals = newMeals;
  await save(monthKey(), state.data);

  state.meals = newMeals;
  await save("dieta:comidas", state.meals);
  sheet.classList.remove("open");
  { const s = renderSummary(); syncPctBaseline(s.pct, s.logged); }
  renderHeader(); renderGrid();
  toast("Comidas actualizadas");
};

/* ---------- copia de seguridad ---------- */
document.getElementById("exportBtn").onclick = async () => {
  const keys = (await listKeys()).filter(isMonthKey);
  const dump = {
    v: 2, comidas: state.meals,
    peso: (await load("dieta:peso")) || {},
    fase: (await load("dieta:fase")) || "",
    faseHistory: (await load("dieta:faseHistory")) || [],
    planStructured: (await load("dieta:planStructured")) || null,
    meses: {}
  };
  for (const k of keys){
    const val = await load(k);
    if (val) dump.meses[k] = val;
  }
  try { await navigator.clipboard.writeText(JSON.stringify(dump)); toast("Copia hecha, pégala en Notas"); }
  catch (e) { await customPrompt("Copia este texto y guárdalo (selecciona todo y copia):", JSON.stringify(dump)); }
};

document.getElementById("importBtn").onclick = async () => {
  const txt = await customPrompt("Pega aquí la copia de seguridad o la dieta que te han pasado:");
  if (!txt) return;
  let dump;
  try { dump = JSON.parse(txt); } catch (e) { toast("Ese texto no es una copia válida"); return; }
  if (!dump || (!dump.meses && !dump.planStructured)){ toast("Ese texto no es una copia válida"); return; }
  if (!(await customConfirm("Se sustituirán los datos que coincidan (dieta, meses, peso...). ¿Seguir?"))) return;
  if (Array.isArray(dump.comidas) && dump.comidas.length){
    state.meals = dump.comidas;
    await save("dieta:comidas", state.meals);
  }
  if (dump.peso) await save("dieta:peso", dump.peso);
  if (dump.fase !== undefined) await save("dieta:fase", dump.fase);
  if (Array.isArray(dump.faseHistory)) await save("dieta:faseHistory", dump.faseHistory);
  if (dump.planStructured) await save("dieta:planStructured", dump.planStructured);
  if (dump.meses) for (const k in dump.meses) await save(k, dump.meses[k]);
  state.data = (await load(monthKey())) || {};
  sheet.classList.remove("open");
  renderHeader(); renderGrid(); renderPhaseNote();
  { const s = renderSummary(); syncPctBaseline(s.pct, s.logged); }
  toast("Datos restaurados");
};
