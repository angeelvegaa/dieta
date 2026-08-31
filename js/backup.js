/* ---------- backup automático y silencioso ----------
   Tras cada guardado, con un pequeño retraso para no repetir en cada tap,
   se vuelca todo a una clave aparte con marca de tiempo. No requiere
   ninguna acción del usuario; el export/import manual sigue disponible
   como red de seguridad adicional. */

import { listKeys, load, writeRaw, isMonthKey, onAfterSave } from "./storage.js";
import { state } from "./state.js";

let backupTimer = null;

export function queueAutoBackup(){
  clearTimeout(backupTimer);
  backupTimer = setTimeout(buildAutoBackup, 1200);
}

export async function buildAutoBackup(){
  try {
    const keys = await listKeys();
    const dump = { v: 2, ts: Date.now(), comidas: state.meals, peso: await load("dieta:peso") || {}, meses: {} };
    for (const k of keys){
      if (!isMonthKey(k)) continue;
      const val = await load(k);
      if (val) dump.meses[k] = val;
    }
    writeRaw("dieta:backup:auto", JSON.stringify(dump));
  } catch (e) { /* backup silencioso: si falla, no interrumpe el uso normal */ }
}

onAfterSave(queueAutoBackup);
