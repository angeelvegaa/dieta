/* Estado mutable compartido y guardado del mes en curso. */

import { DEFAULT_MEALS } from "./config.js";
import { ymd, pad } from "./dates.js";
import { save, saveSync } from "./storage.js";

const now = new Date();

export const state = {
  today: now,
  todayKey: ymd(now),
  view: new Date(now.getFullYear(), now.getMonth(), 1),
  meals: DEFAULT_MEALS.slice(),
  data: {},
  showPast: false,
};

export function monthKey(){
  return "dieta:" + state.view.getFullYear() + "-" + pad(state.view.getMonth() + 1);
}

export function effectiveMeals(){
  return (state.data.__meals && state.data.__meals.length) ? state.data.__meals : state.meals;
}

export function isCurrentMonth(){
  return state.view.getFullYear() === state.today.getFullYear()
      && state.view.getMonth() === state.today.getMonth();
}

/* ---------- guardado sin botón, en cada interacción ----------
   Se persiste de inmediato y en síncrono a localStorage (sobrevive a recargas
   y a cierre completo de la app); la escritura completa —que incluye
   window.storage y dispara el backup— se agrupa con un margen corto para no
   repetirla en cada tap. */
let saveTimer = null;

export function queueSave(){
  saveSync(monthKey(), state.data);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { save(monthKey(), state.data); }, 300);
}

/* Vuelca ya lo pendiente. Se llama al ocultarse/cerrarse la app y antes de
   cambiar de mes. */
export function flushSave(){
  clearTimeout(saveTimer);
  saveSync(monthKey(), state.data);
}

export async function flushSaveFull(){
  clearTimeout(saveTimer);
  await save(monthKey(), state.data);
}
