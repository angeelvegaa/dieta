/* Recordatorio si no se ha registrado nada hoy a partir de las 20h. */

import { state, isCurrentMonth } from "../state.js";

export function checkReminder(){
  const hour = new Date().getHours();
  const hasToday = !!state.data[state.todayKey] && Object.keys(state.data[state.todayKey]).some(k => k !== "__meals");
  const dismissed = sessionStorage.getItem("dieta:reminderDismissed") === state.todayKey;
  if (hour >= 20 && !hasToday && !dismissed && isCurrentMonth()){
    document.getElementById("reminder").hidden = false;
  }
}

document.getElementById("reminderClose").onclick = () => {
  sessionStorage.setItem("dieta:reminderDismissed", state.todayKey);
  document.getElementById("reminder").hidden = true;
};
