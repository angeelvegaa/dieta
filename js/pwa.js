/* Registro del service worker y actualización automática.
   Rutas relativas: la app se sirve desde una subruta de GitHub Pages,
   no desde la raíz del dominio.

   El SW hace skipWaiting + clients.claim, así que al publicar una versión
   nueva se activa sola y toma el control. Aquí recargamos la página una vez
   cuando eso ocurre. No hay aviso que pulsar: el guardado es en cada
   interacción, la recarga no pierde nada.

   No se recarga en la primera visita (cuando el SW toma el control por
   primera vez): solo escuchamos el cambio de controlador si la página ya
   venía controlada por un SW anterior. */

export function initPWA(){
  if (!("serviceWorker" in navigator)) return;

  if (navigator.serviceWorker.controller){
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      reg.update().catch(() => {});
      setInterval(() => { reg.update().catch(() => {}); }, 30 * 60 * 1000);
    } catch (e) { /* sin SW la app sigue funcionando igual */ }
  });
}
