/* Arranque. Ruta única de entrada de la app.

   Con ?autoexport=1 explícito en la URL se carga SOLO la vista de texto plano
   (js/autoexport.js), pensada para que la lea un Atajo de iPhone: nunca se
   monta la interfaz normal ni se registra el service worker desde aquí.

   Sin ese parámetro se carga la app normal (js/app.js) exactamente igual que
   siempre. */

if (new URLSearchParams(location.search).get("autoexport") === "1"){
  import("./autoexport.js").then(m => m.renderAutoExport());
} else {
  import("./app.js");
}
