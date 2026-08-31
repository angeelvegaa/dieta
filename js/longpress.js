/* Pulsación larga para añadir notas.
   Combina touch, ratón y clic derecho para máxima compatibilidad
   entre navegador de escritorio, móvil y PWA instalada. */

export function attachLongPress(el, fn){
  let t = null, fired = false;
  const start = () => { fired = false; t = setTimeout(() => { fired = true; fn(); }, 480); };
  const cancel = () => { clearTimeout(t); };
  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", cancel);
  el.addEventListener("touchcancel", cancel);
  el.addEventListener("touchmove", cancel);
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", cancel);
  el.addEventListener("mouseleave", cancel);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); fired = true; fn(); });
  el._longPressFired = () => fired;
}
