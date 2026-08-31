/* Acciones del pie: copiar resumen del mes y borrar el mes. */

import { MONTHS, EXTRA } from "../config.js";
import { state, monthKey, effectiveMeals } from "../state.js";
import { ymd, daysIn, fmt } from "../dates.js";
import { customConfirm } from "../modal.js";
import { toast } from "../toast.js";
import { stats } from "../stats.js";
import { save } from "../storage.js";
import { renderGrid, renderSummary } from "./month.js";
import { syncPctBaseline } from "./pct-alert.js";

document.getElementById("copy").onclick = async () => {
  const s = stats();
  const off = [];
  const activeMeals = effectiveMeals();
  for (let d = 1; d <= daysIn(state.view); d++){
    const key = ymd(new Date(state.view.getFullYear(), state.view.getMonth(), d));
    const bad = activeMeals.filter(m => state.data[key]?.[m] === -1);
    const e = state.data[key]?.[EXTRA] || 0;
    if (e){
      const notes = (state.data[key]?.__extraNotes || []).filter(Boolean);
      bad.push(e + " extra" + (e > 1 ? "s" : "") + " entre horas" + (notes.length ? " (" + notes.join("; ") + ")" : ""));
    }
    const notes = state.data[key]?.__notes || {};
    Object.keys(notes).forEach(m => bad.push(m + ": " + notes[m]));
    if (bad.length) off.push("  " + d + ": " + bad.join(", "));
  }
  const txt = [
    MONTHS[state.view.getMonth()] + " " + state.view.getFullYear(),
    "Balance: " + fmt(s.balance) + " puntos",
    "Cumplimiento: " + (s.pct === null ? "—" : s.pct + "%") + " de " + s.logged + " registros",
    "Cumplidas " + s.pos + " · a medias " + s.half + " · fuera " + s.neg + " · extras " + s.ex,
    off.length ? "\nSaltos de dieta:\n" + off.join("\n") : ""
  ].join("\n");
  try { await navigator.clipboard.writeText(txt); toast("Resumen copiado"); }
  catch (e) { toast("No se pudo copiar"); }
};

document.getElementById("clear").onclick = async () => {
  if (!(await customConfirm("¿Borrar todas las marcas de " + MONTHS[state.view.getMonth()] + "? No se puede deshacer."))) return;
  state.data = {};
  await save(monthKey(), state.data);
  renderGrid();
  { const s = renderSummary(); syncPctBaseline(s.pct, s.logged); }
  toast("Mes borrado");
};
