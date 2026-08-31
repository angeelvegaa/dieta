/* ---------- almacenamiento ----------
   Funciona en tres sitios: dentro de Claude (window.storage),
   como archivo suelto / web instalada en el móvil o el ordenador (localStorage),
   y si todo falla, en memoria durante la sesión.

   Regla de robustez: la escritura a localStorage es SÍNCRONA y va primero,
   antes de cualquier await, para que un cierre abrupto de la app no pierda
   el último cambio. */

const mem = {};

export const hasWS = typeof window.storage === "object" && window.storage !== null;

export const hasLS = (() => {
  try { localStorage.setItem("__probe", "1"); localStorage.removeItem("__probe"); return true; }
  catch (e) { return false; }
})();

let afterSave = () => {};
/* Permite que otro módulo (backup) reaccione tras cada guardado sin crear
   una dependencia circular. */
export function onAfterSave(fn){ afterSave = fn; }

export async function load(key){
  if (hasWS){
    try { const r = await window.storage.get(key); if (r) return JSON.parse(r.value); }
    catch (e) {}
  }
  if (hasLS){
    try { const v = localStorage.getItem(key); if (v !== null) return JSON.parse(v); }
    catch (e) {}
  }
  return mem[key] ?? null;
}

export async function save(key, val){
  mem[key] = val;
  const json = JSON.stringify(val);
  if (hasLS){ try { localStorage.setItem(key, json); } catch (e) {} }
  if (hasWS){ try { await window.storage.set(key, json); } catch (e) {} }
  afterSave();
}

/* Volcado síncrono a localStorage: se usa en pagehide / visibilitychange
   y en cada interacción, para no depender del temporizador. */
export function saveSync(key, val){
  mem[key] = val;
  if (hasLS){
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) {}
  }
  return false;
}

/* Escritura de una cadena ya serializada, sin disparar afterSave
   (para el backup, que si no se llamaría a sí mismo). */
export function writeRaw(key, json){
  if (hasLS){ try { localStorage.setItem(key, json); } catch (e) {} }
  if (hasWS){ try { window.storage.set(key, json); } catch (e) {} }
}

export async function listKeys(){
  if (hasLS){
    try { return Object.keys(localStorage).filter(k => k.indexOf("dieta:") === 0); } catch (e) {}
  }
  if (hasWS){
    try { const r = await window.storage.list("dieta:"); if (r && r.keys) return r.keys; } catch (e) {}
  }
  return Object.keys(mem);
}

export function isMonthKey(k){ return /^dieta:\d{4}-\d{2}$/.test(k); }
