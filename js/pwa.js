/* Registro del service worker y aviso de actualización.
   Rutas relativas: la app se sirve desde una subruta de GitHub Pages,
   no desde la raíz del dominio. */

export function initPWA(){
  if (!("serviceWorker" in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js");

      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);

      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller){
            showUpdateBanner(reg);
          }
        });
      });

      // comprueba si hay versión nueva de vez en cuando
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    } catch (e) { /* sin SW la app sigue funcionando igual */ }
  });
}

function showUpdateBanner(reg){
  const b = document.getElementById("updateBanner");
  if (!b) return;
  b.hidden = false;
  document.getElementById("updateReload").onclick = () => {
    if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
  };
}
