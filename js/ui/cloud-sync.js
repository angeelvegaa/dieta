/* UI de "Copia en la nube" dentro de la hoja de Ajustes: la tarjeta
   (activar / ver código / desactivar) y el asistente de activación de 2-3
   pasos (email+contraseña → clave de cifrado → listo).

   Se engancha al mismo botón del engranaje que abre Ajustes (con
   addEventListener, sin pisar el .onclick de settings.js) y se repinta a
   sí misma en #cloudSyncBody. Nada de esto hace red hasta que la persona
   pulsa "Activar copia en la nube". */

import { toast } from '../toast.js';
import * as sync from '../sync.js';

const TURNSTILE_SITE_KEY = '0x4AAAAAAAEroqMIQUWfcnssE';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Estado efímero de la tarjeta: se reinicia al reabrir Ajustes.
let wizardOpen = false;
let revealCode = false;
let confirmDisable = false;

// --- mini helpers de DOM (esta app no tiene un `el()` compartido) ---
function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'onClick') n.addEventListener('click', v);
    else n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) n.appendChild(kid);
  return n;
}
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

// --- carga perezosa del script de Turnstile (solo al abrir el asistente) ---
let turnstileScriptPromise = null;
function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TURNSTILE_SCRIPT_URL;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar la verificación anti-bot.'));
      document.head.appendChild(s);
    });
  }
  return turnstileScriptPromise;
}

function fireMerged() {
  window.dispatchEvent(new CustomEvent('dieta:cloud-merged'));
}

export function renderCloudSync() {
  const body = document.getElementById('cloudSyncBody');
  if (!body) return;
  clear(body);
  const status = sync.getStatus();

  if (!status.enabled) {
    if (!wizardOpen) {
      body.appendChild(el('p', {
        class: 'cloud-msg',
        text: 'Opcional y apagada por defecto: si no la activas, la app sigue 100% local, sin ninguna conexión. Al activarla, tus datos se cifran en este dispositivo y se guardan en la nube para poder recuperarlos en otro móvil.'
      }));
      body.appendChild(el('button', {
        class: 'act', id: 'cloudActivate', text: 'Activar copia en la nube',
        onClick: () => { wizardOpen = true; renderCloudSync(); }
      }));
      return;
    }
    const container = el('div', {});
    body.appendChild(container);
    mountWizard(container, {
      initialEmail: status.email || '',
      onCancel: () => { wizardOpen = false; renderCloudSync(); },
      onDone: () => { wizardOpen = false; toast('Copia en la nube activada'); renderCloudSync(); }
    });
    return;
  }

  body.appendChild(el('p', {
    class: 'cloud-msg',
    text: `Sincronizando con ${status.email || 'tu cuenta'}. Cada cambio se cifra y se sube; al abrir la app se baja y se fusiona.`
  }));

  body.appendChild(el('button', {
    class: 'act',
    text: revealCode ? 'Ocultar código de recuperación' : 'Ver código de recuperación',
    onClick: () => { revealCode = !revealCode; renderCloudSync(); }
  }));
  if (revealCode) {
    body.appendChild(el('p', {
      class: 'cloud-msg',
      text: 'Guárdalo en un sitio seguro (Notas, gestor de contraseñas). Es la única forma de recuperar tus datos ya sincronizados en un dispositivo nuevo — nadie puede recuperarlo por ti.'
    }));
    body.appendChild(el('div', { class: 'recovery-code', text: sync.getRecoveryCode() || '' }));
  }

  if (!confirmDisable) {
    body.appendChild(el('button', {
      class: 'act danger',
      text: 'Desactivar en este dispositivo',
      onClick: () => { confirmDisable = true; renderCloudSync(); }
    }));
    return;
  }
  body.appendChild(el('p', {
    class: 'cloud-msg',
    text: 'Este dispositivo deja de sincronizar y se cierra la sesión. Tus datos siguen tal cual aquí y en la nube.'
  }));
  body.appendChild(el('div', { class: 'cloud-actions' }, [
    el('button', {
      class: 'act danger', text: 'Sí, desactivar',
      onClick: async () => {
        await sync.disable();
        confirmDisable = false; revealCode = false;
        toast('Copia en la nube desactivada');
        renderCloudSync();
      }
    }),
    el('button', {
      class: 'act', text: 'Cancelar',
      onClick: () => { confirmDisable = false; renderCloudSync(); }
    })
  ]));
}

// Asistente autocontenido: gestiona su propio estado y solo repinta
// `topWrap`/`bottomWrap`. El widget de Turnstile vive en un nodo fijo
// (turnstileSlot) que NO se borra en cada render, para que escribir en el
// email/contraseña no lo reinicie.
function mountWizard(container, { initialEmail = '', onCancel, onDone }) {
  let step = 'auth'; // 'auth' | 'key-choice' | 'show-code' | 'ready'
  let email = initialEmail;
  let busy = false;
  let error = null;
  let generatedCode = null;
  let captchaToken = null;
  let widgetId = null;

  clear(container);
  const topWrap = el('div', {});
  const turnstileSlot = el('div', { class: 'turnstile-slot' });
  const bottomWrap = el('div', {});
  container.append(topWrap, turnstileSlot, bottomWrap);

  mountTurnstile();
  render();

  async function mountTurnstile() {
    try {
      await loadTurnstileScript();
      if (widgetId !== null) return;
      widgetId = window.turnstile.render(turnstileSlot, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t) => { captchaToken = t; },
        'expired-callback': () => { captchaToken = null; },
        'error-callback': () => { captchaToken = null; }
      });
    } catch (err) {
      console.warn('turnstile: fallo al cargar la verificación anti-bot', err);
    }
  }
  function resetTurnstile() {
    captchaToken = null;
    if (widgetId !== null && window.turnstile) {
      try { window.turnstile.reset(widgetId); } catch { /* noop */ }
    }
  }
  function destroyTurnstile() {
    if (widgetId !== null && window.turnstile) {
      try { window.turnstile.remove(widgetId); } catch { /* noop */ }
      widgetId = null;
    }
  }

  function render() {
    turnstileSlot.style.display = step === 'auth' ? '' : 'none';
    clear(topWrap);
    clear(bottomWrap);
    const { top, bottom } = build();
    topWrap.appendChild(top);
    bottomWrap.appendChild(bottom);
  }

  function build() {
    const top = el('div', {});
    const bottom = el('div', {});
    if (error) top.appendChild(el('p', { class: 'cloud-msg warn', text: `⚠ ${error}` }));

    if (step === 'auth') {
      const emailInput = el('input', { type: 'email', placeholder: 'tu@email.com', value: email, autocomplete: 'email' });
      const passwordInput = el('input', { type: 'password', placeholder: 'Contraseña (mín. 6 caracteres)', autocomplete: 'current-password' });
      emailInput.addEventListener('input', () => { email = emailInput.value; });
      top.append(emailInput, passwordInput);

      const runAuth = async (fn) => {
        if (busy) return;
        if (!emailInput.value || !passwordInput.value) { error = 'Rellena email y contraseña.'; render(); return; }
        if (!captchaToken) { error = 'Completa la verificación anti-bot de arriba antes de continuar.'; render(); return; }
        busy = true; error = null; render();
        try {
          const result = await fn(emailInput.value.trim(), passwordInput.value, captchaToken);
          busy = false;
          if (result.confirmEmailRequired) {
            error = 'Cuenta creada. Revisa tu email para confirmarla y luego vuelve aquí e inicia sesión.';
            resetTurnstile(); render(); return;
          }
          email = result.email;
          step = sync.hasEncryptionKey() ? 'ready' : 'key-choice';
          render();
        } catch (err) {
          busy = false;
          error = translateAuthError(err);
          resetTurnstile(); // el token de Turnstile es de un solo uso
          render();
        }
      };

      bottom.appendChild(el('div', { class: 'cloud-actions' }, [
        el('button', { class: 'act', text: busy ? '…' : 'Crear cuenta', onClick: () => runAuth(sync.signUp) }),
        el('button', { class: 'act', text: busy ? '…' : 'Iniciar sesión', onClick: () => runAuth(sync.signIn) })
      ]));
      bottom.appendChild(el('button', { class: 'act', text: 'Cancelar', onClick: () => { destroyTurnstile(); onCancel(); } }));
      return { top, bottom };
    }

    if (step === 'key-choice') {
      top.appendChild(el('p', {
        class: 'cloud-msg',
        text: 'Falta la clave de cifrado: tus datos se cifran en este dispositivo antes de subirlos; nadie más (ni el servidor) puede leerlos sin ella.'
      }));
      top.appendChild(el('button', {
        class: 'act',
        text: 'Es la primera vez que activo esto (crear clave nueva)',
        onClick: async () => { generatedCode = await sync.generateRecoveryCode(); step = 'show-code'; render(); }
      }));
      const codeInput = el('textarea', { rows: 3, placeholder: 'O pega aquí tu código de recuperación de otro dispositivo' });
      top.appendChild(el('p', { class: 'cloud-msg', text: 'O, si ya activaste la sincronización antes en otro móvil, pega aquí ese código:' }));
      top.appendChild(codeInput);
      top.appendChild(el('button', {
        class: 'act',
        text: 'Usar este código',
        onClick: async () => {
          try { sync.adoptRecoveryCode(codeInput.value); error = null; await finish(); }
          catch (err) { error = err.message; render(); }
        }
      }));
      top.appendChild(el('button', { class: 'act', text: 'Cancelar', onClick: () => { destroyTurnstile(); onCancel(); } }));
      return { top, bottom };
    }

    if (step === 'show-code') {
      top.appendChild(el('p', {
        class: 'cloud-msg',
        text: 'Guarda este código de recuperación en un sitio seguro (Notas, gestor de contraseñas) AHORA. Es la única forma de recuperar tus datos si borras los datos del navegador o cambias de móvil — nadie puede recuperarlo por ti.'
      }));
      top.appendChild(el('div', { class: 'recovery-code', text: generatedCode }));
      top.appendChild(el('button', { class: 'act', text: 'Ya lo he guardado, continuar', onClick: finish }));
      return { top, bottom };
    }

    // step === 'ready'
    top.appendChild(el('p', { class: 'cloud-msg', text: 'Este dispositivo ya tiene una clave de cifrado configurada.' }));
    top.appendChild(el('button', { class: 'act', text: 'Continuar', onClick: finish }));
    return { top, bottom };
  }

  async function finish() {
    try {
      const changed = await sync.finishActivation(email);
      destroyTurnstile();
      if (changed) fireMerged();
      onDone();
    } catch (err) {
      error = err.message;
      render();
    }
  }
}

function translateAuthError(err) {
  const msg = (err && err.message) || '';
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos (o email sin confirmar todavía).';
  if (/User already registered/i.test(msg)) return 'Ya existe una cuenta con ese email. Usa "Iniciar sesión".';
  if (/Password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  return msg || 'Ha ocurrido un error. Inténtalo de nuevo.';
}

// Se engancha al botón del engranaje SIN pisar el handler de settings.js.
document.getElementById('gear').addEventListener('click', renderCloudSync);
