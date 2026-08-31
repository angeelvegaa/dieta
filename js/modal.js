/* ---------- modal propio ----------
   iOS bloquea silenciosamente confirm()/prompt() en apps instaladas
   en pantalla de inicio (modo standalone). Estas funciones los sustituyen
   por una ventana propia que funciona igual en cualquier contexto.
   NO reintroducir confirm()/prompt()/alert() nativos en ningún sitio. */

export function showModal({ message, withInput = false, defaultValue = "" }){
  return new Promise((resolve) => {
    const overlay = document.getElementById("modalOverlay");
    const input = document.getElementById("modalInput");
    document.getElementById("modalMsg").textContent = message;
    input.hidden = !withInput;
    input.value = defaultValue || "";
    overlay.hidden = false;
    const ok = document.getElementById("modalOk");
    const cancel = document.getElementById("modalCancel");
    const cleanup = (result) => {
      overlay.hidden = true;
      ok.onclick = null; cancel.onclick = null;
      resolve(result);
    };
    ok.onclick = () => cleanup(withInput ? input.value : true);
    cancel.onclick = () => cleanup(withInput ? null : false);
    if (withInput) setTimeout(() => input.focus(), 60);
  });
}

export const customConfirm = (msg) => showModal({ message: msg });
export const customPrompt = (msg, def = "") => showModal({ message: msg, withInput: true, defaultValue: def });
