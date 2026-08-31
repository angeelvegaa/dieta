/* Hoja "Mi dieta": una dieta con nombre, notas generales y contenido por
   día de la semana y por comida. Se puede crear, editar y eliminar. */

import { WEEKDAYS } from "../config.js";
import { effectiveMeals } from "../state.js";
import { load, save } from "../storage.js";
import { customConfirm, customPrompt } from "../modal.js";
import { toast } from "../toast.js";

let currentPlanDay = null;

async function loadPlan(){ return (await load("dieta:planStructured")) || null; }
async function savePlan(p){ await save("dieta:planStructured", p); }

function daySummary(plan, day){
  const m = plan.days?.[day] || {};
  const filled = Object.values(m).filter(v => v && v.trim()).length;
  return filled ? filled + " comida" + (filled > 1 ? "s" : "") + " definidas" : "vacío";
}

async function renderPlanRoot(){
  const plan = await loadPlan();
  document.getElementById("planDayDetail").hidden = true;
  document.getElementById("planEmptyState").hidden = !!plan;
  document.getElementById("planMainState").hidden = !plan;
  if (!plan) return;
  document.getElementById("planNameLabel").textContent = plan.name || "Mi dieta";
  const notesEl = document.getElementById("planNotesText");
  const editNotesEl = document.getElementById("planEditNotes");
  if (plan.notes && plan.notes.trim()){
    notesEl.textContent = plan.notes;
    notesEl.style.display = "block";
    editNotesEl.textContent = "Editar notas generales";
  } else {
    notesEl.style.display = "none";
    editNotesEl.textContent = "+ Añadir notas generales (bebida, ejercicio, etc.)";
  }
  const list = document.getElementById("planDaysList");
  list.innerHTML = "";
  WEEKDAYS.forEach(day => {
    const row = document.createElement("div");
    row.className = "day-row";
    row.innerHTML = "<b>" + day + "</b><span>" + daySummary(plan, day) + "</span>";
    row.onclick = () => openPlanDay(day);
    list.appendChild(row);
  });
}

document.getElementById("planEditNotes").onclick = async () => {
  const plan = await loadPlan();
  if (!plan) return;
  const txt = await customPrompt("Notas generales de la dieta (opcional):", plan.notes || "");
  if (txt === null) return;
  plan.notes = txt.trim();
  await savePlan(plan);
  renderPlanRoot();
};

async function openPlanDay(day){
  const plan = await loadPlan();
  if (!plan) return;
  currentPlanDay = day;
  document.getElementById("planMainState").hidden = true;
  document.getElementById("planDayDetail").hidden = false;
  document.getElementById("planDayTitle").textContent = day;
  const box = document.getElementById("planDayMeals");
  box.innerHTML = "";
  const activeMeals = effectiveMeals();
  activeMeals.forEach(m => {
    const field = document.createElement("div");
    field.className = "meal-field";
    const val = (plan.days?.[day]?.[m]) || "";
    field.innerHTML =
      '<label>' + m + '</label>' +
      '<textarea data-meal="' + m.replace(/"/g, '&quot;') + '" placeholder="Qué toca comer...">' +
      val.replace(/</g, "&lt;") + '</textarea>';
    box.appendChild(field);
  });
}

document.getElementById("planBtn").onclick = () => {
  renderPlanRoot();
  document.getElementById("planSheet").classList.add("open");
};
document.getElementById("planSheet").onclick = e => { if (e.target.id === "planSheet") e.target.classList.remove("open"); };

document.getElementById("planCreateBtn").onclick = async () => {
  const name = await customPrompt("Nombre de la dieta (ej. Definición, Volumen...):", "");
  if (!name || !name.trim()) return;
  const plan = { name: name.trim(), days: {} };
  await savePlan(plan);
  renderPlanRoot();
  toast("Dieta creada");
};

document.getElementById("planDeleteBtn").onclick = async () => {
  if (!(await customConfirm("¿Eliminar esta dieta? No se puede deshacer."))) return;
  await save("dieta:planStructured", null);
  renderPlanRoot();
  toast("Dieta eliminada");
};

document.getElementById("planDayBack").onclick = () => {
  document.getElementById("planDayDetail").hidden = true;
  document.getElementById("planMainState").hidden = false;
};

document.getElementById("planDaySave").onclick = async () => {
  const plan = await loadPlan();
  if (!plan || !currentPlanDay) return;
  (plan.days ||= {});
  (plan.days[currentPlanDay] ||= {});
  document.querySelectorAll("#planDayMeals textarea").forEach(t => {
    const meal = t.dataset.meal;
    const v = t.value.trim();
    if (v) plan.days[currentPlanDay][meal] = v;
    else delete plan.days[currentPlanDay][meal];
  });
  await savePlan(plan);
  document.getElementById("planDayDetail").hidden = true;
  document.getElementById("planMainState").hidden = false;
  renderPlanRoot();
  toast("Guardado");
};
