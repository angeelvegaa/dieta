/* Cálculo de balance, cumplimiento y curva del mes. */

import { EXTRA } from "./config.js";
import { state, effectiveMeals } from "./state.js";
import { ymd, daysIn } from "./dates.js";

export function stats(){
  let pos = 0, half = 0, neg = 0, ex = 0;
  const n = daysIn(state.view);
  const daily = [];
  const activeMeals = effectiveMeals();
  for (let d = 1; d <= n; d++){
    const key = ymd(new Date(state.view.getFullYear(), state.view.getMonth(), d));
    let sum = 0;
    activeMeals.forEach(m => {
      const v = state.data[key]?.[m];
      if (v === 1){ pos++; sum += 1; }
      else if (v === 0.5){ half++; sum += 0.5; }
      else if (v === -1){ neg++; sum -= 1; }
    });
    const e = state.data[key]?.[EXTRA] || 0;
    ex += e; sum -= e;
    daily.push(sum);
  }
  const logged = pos + half + neg + ex;
  const balance = pos + half * 0.5 - neg - ex;
  const pct = logged ? Math.round(((pos + half * 0.5) / logged) * 100) : null;
  return { pos, half, neg, ex, logged, balance, pct, daily };
}

export function statsFor(monthData, mealsList, year, monthIdx){
  let pos = 0, half = 0, neg = 0, ex = 0;
  const n = new Date(year, monthIdx + 1, 0).getDate();
  for (let d = 1; d <= n; d++){
    const key = year + "-" + String(monthIdx + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    mealsList.forEach(m => {
      const v = monthData[key]?.[m];
      if (v === 1) pos++; else if (v === 0.5) half++; else if (v === -1) neg++;
    });
    ex += monthData[key]?.[EXTRA] || 0;
  }
  const logged = pos + half + neg + ex;
  const balance = pos + half * 0.5 - neg - ex;
  const pct = logged ? Math.round(((pos + half * 0.5) / logged) * 100) : null;
  return { balance, pct, logged };
}

/* ---------- histórico de fases (para segmentar el gráfico de peso) ----------
   Devuelve qué fase estaba activa en un día dado. */
export function phaseAt(hist, day){
  for (const h of hist){
    if (day >= h.start && (h.end === null || day <= h.end)) return h.phase || null;
  }
  return null;
}
