/* Punto de entrada. Importa cada pantalla (cada módulo engancha sus propios
   controladores al cargarse) y arranca el estado inicial. */

import { state, monthKey, flushSave } from "./state.js";
import { load } from "./storage.js";
import { buildAutoBackup } from "./backup.js";
import { renderHeader, renderGrid, renderSummary } from "./ui/month.js";
import { renderPhaseNote } from "./ui/settings.js";
import { checkReminder } from "./ui/reminder.js";
import { syncPctBaseline } from "./ui/pct-alert.js";
import "./ui/history.js";
import "./ui/weight.js";
import "./ui/plan.js";
import "./ui/notes.js";
import "./ui/actions.js";
import "./ui/cloud-sync.js";
import { initPWA } from "./pwa.js";
import * as sync from "./sync.js";

initPWA();

/* Vuelca lo pendiente si la app se oculta o se cierra: el guardado no
   depende solo del temporizador. */
window.addEventListener("pagehide", flushSave);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
});

/* Recarga el mes en curso y las comidas desde el almacenamiento y repinta.
   Se usa al arrancar y cada vez que la copia en la nube fusiona cambios. */
async function renderAll(){
  const saved = await load("dieta:comidas");
  if (Array.isArray(saved) && saved.length) state.meals = saved;
  state.data = (await load(monthKey())) || {};
  renderHeader(); renderGrid();
  const s = renderSummary();
  renderPhaseNote();
  return s;
}

async function applyMerged(){
  const s = await renderAll();
  syncPctBaseline(s.pct, s.logged); // sin avisar: la fusión no dispara el toast del %
  checkReminder();
}
window.addEventListener("dieta:cloud-merged", applyMerged);

(async () => {
  const s = await renderAll();
  checkReminder();
  buildAutoBackup();
  // fija la línea base del % sin avisar: abrir la app nunca dispara el toast
  syncPctBaseline(s.pct, s.logged);

  // Copia en la nube: si está apagada (caso por defecto) esto retorna de
  // inmediato SIN ninguna llamada de red. Si está activada, baja y fusiona.
  sync.init(applyMerged);
})();
