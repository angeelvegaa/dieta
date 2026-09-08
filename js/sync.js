// Copia en la nube: OPCIONAL, apagada por defecto. Si `isEnabled()` es
// false, esta app entera no hace ninguna llamada de red — ni siquiera
// carga el SDK de Supabase (import dinámico, no estático). Cifrado de
// extremo a extremo con AES-GCM (Web Crypto): la clave se genera en el
// dispositivo y nunca se sube al servidor, solo el texto ya cifrado.
//
// El proyecto de Supabase está COMPARTIDO con la app de running: cada fila
// lleva una columna `app` para no mezclarse. Esta app usa siempre
// app = 'dieta', fijo (constante APP). La seguridad (RLS) va por user_id;
// la columna `app` solo organiza los datos dentro de lo que ya es tuyo.
//
// Modelo "último cambio gana" por clave de localStorage completa (no por
// campo): cada clave sincronizable se sube/baja entera, comparando el
// timestamp local del último cambio (dieta.sync.timestamps) contra
// `updated_at` de la fila remota. En dieta los datos están repartidos en
// una clave por mes (`dieta:AAAA-MM`), que van naciendo solas: por eso la
// lista de claves no es fija, es un patrón (ver isSyncedKey).

import * as storage from './storage.js';

const APP = 'dieta';

const SUPABASE_URL = 'https://ozhvjtrsjskwshavlooo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AGtM17j39KxdYa85ByeqJA_8uwrFZyX';
const SUPABASE_SDK_URL = 'https://esm.sh/@supabase/supabase-js@2';

// Fijo a propósito, NUNCA calculado con window.location: GitHub Pages sirve
// esta app bajo /dieta/, y un valor dinámico (origin/href) puede perder esa
// ruta según desde dónde se abra, mandando el enlace de confirmación de
// email a la raíz del dominio (404).
const EMAIL_REDIRECT_TO = 'https://angeelvegaa.github.io/dieta/';

const META_ENABLED = 'dieta.sync.enabled';
const META_EMAIL = 'dieta.sync.email';
const META_KEY = 'dieta.sync.key';
const META_TIMESTAMPS = 'dieta.sync.timestamps';

const DEBOUNCE_MS = 2000;

// Claves de datos que la copia en la nube sincroniza. Las fijas más
// cualquier clave de mes (`dieta:AAAA-MM`). Se quedan FUERA a propósito:
// - dieta:backup:auto        -> red de seguridad local, redundante
// - dieta:ultimoPctConocido  -> línea base del aviso de %, propia del móvil
// (dieta:reminderDismissed vive en sessionStorage, ni se plantea).
const FIXED_SYNCED_KEYS = [
  'dieta:comidas',
  'dieta:fase',
  'dieta:faseHistory',
  'dieta:peso',
  'dieta:planStructured'
];
const MONTH_KEY_RE = /^dieta:\d{4}-\d{2}$/;

function isSyncedKey(key) {
  return FIXED_SYNCED_KEYS.includes(key) || MONTH_KEY_RE.test(key);
}

let clientPromise = null;
let cryptoKeyPromise = null;
let currentUserId = null;
let unsubscribeWrite = null;
const pendingKeys = new Set();
let flushTimer = null;

// --- utilidades base64 <-> bytes ---

function bufToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// --- cliente Supabase (import dinámico: cero red si no se llama nunca) ---

async function getClient() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_SDK_URL).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    );
  }
  return clientPromise;
}

// --- clave de cifrado / código de recuperación ---

export function hasEncryptionKey() {
  return !!localStorage.getItem(META_KEY);
}

export function getRecoveryCode() {
  return localStorage.getItem(META_KEY);
}

async function getCryptoKey() {
  if (!cryptoKeyPromise) {
    const b64 = localStorage.getItem(META_KEY);
    if (!b64) throw new Error('No hay clave de cifrado configurada en este dispositivo.');
    cryptoKeyPromise = crypto.subtle.importKey('raw', base64ToBuf(b64), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  return cryptoKeyPromise;
}

// Primera activación en cualquier dispositivo: clave nueva, mostrada una
// vez como "código de recuperación" para que la persona la guarde.
export async function generateRecoveryCode() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  const b64 = bufToBase64(raw);
  localStorage.setItem(META_KEY, b64);
  cryptoKeyPromise = null;
  return b64;
}

// Dispositivo nuevo con cuenta ya sincronizada desde otro sitio: adopta la
// clave existente en vez de generar una (generar otra dejaría ilegibles
// los datos ya subidos con la anterior).
export function adoptRecoveryCode(code) {
  const cleaned = (code || '').replace(/\s+/g, '');
  let raw;
  try {
    raw = base64ToBuf(cleaned);
  } catch {
    throw new Error('Código de recuperación inválido.');
  }
  if (raw.byteLength !== 32) throw new Error('Código de recuperación inválido: longitud incorrecta.');
  localStorage.setItem(META_KEY, cleaned);
  cryptoKeyPromise = null;
}

async function encryptString(plaintext) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return bufToBase64(combined.buffer);
}

async function decryptString(encoded) {
  const key = await getCryptoKey();
  const combined = new Uint8Array(base64ToBuf(encoded));
  const iv = combined.slice(0, 12);
  const cipherBytes = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return new TextDecoder().decode(plainBuf);
}

// --- timestamps locales por clave (para decidir quién gana al fusionar) ---

function loadTimestamps() {
  try {
    return JSON.parse(localStorage.getItem(META_TIMESTAMPS)) || {};
  } catch {
    return {};
  }
}

function saveTimestamps(map) {
  localStorage.setItem(META_TIMESTAMPS, JSON.stringify(map));
}

// --- estado / auth ---

export function isEnabled() {
  return localStorage.getItem(META_ENABLED) === 'true';
}

export function getStatus() {
  return {
    enabled: isEnabled(),
    email: localStorage.getItem(META_EMAIL),
    hasKey: hasEncryptionKey()
  };
}

export async function signUp(email, password, captchaToken) {
  const supabase = await getClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: EMAIL_REDIRECT_TO, captchaToken }
  });
  if (error) throw error;
  if (!data.session) return { confirmEmailRequired: true, email };
  currentUserId = data.user.id;
  return { confirmEmailRequired: false, email };
}

export async function signIn(email, password, captchaToken) {
  const supabase = await getClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) throw error;
  currentUserId = data.user.id;
  return { confirmEmailRequired: false, email };
}

// Último paso del asistente de activación: ya hay sesión y clave de
// cifrado, falta encender el interruptor y hacer la primera fusión.
export async function finishActivation(email) {
  if (!hasEncryptionKey()) throw new Error('Falta la clave de cifrado.');
  if (!currentUserId) {
    const supabase = await getClient();
    const { data } = await supabase.auth.getUser();
    currentUserId = (data && data.user && data.user.id) || null;
  }
  if (!currentUserId) throw new Error('No hay sesión activa. Inicia sesión de nuevo.');

  localStorage.setItem(META_ENABLED, 'true');
  localStorage.setItem(META_EMAIL, email);
  startWriteSubscription();
  return pullAndMerge();
}

export async function disable() {
  localStorage.setItem(META_ENABLED, 'false');
  clearTimeout(flushTimer);
  pendingKeys.clear();
  if (unsubscribeWrite) { unsubscribeWrite(); unsubscribeWrite = null; }
  try {
    if (clientPromise) {
      const supabase = await getClient();
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.warn('sync: fallo al cerrar sesión', err);
  }
  clientPromise = null;
  currentUserId = null;
}

// --- subir / bajar / fusionar ---

function localSyncedKeys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isSyncedKey(k)) out.push(k);
  }
  return out;
}

async function pushKeys(keys) {
  if (!currentUserId || !keys.length) return;
  const supabase = await getClient();
  const timestamps = loadTimestamps();
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      const encrypted = await encryptString(raw);
      const ms = timestamps[key] ?? Date.now();
      const { error } = await supabase.from('sync_data').upsert({
        user_id: currentUserId,
        app: APP,
        storage_key: key,
        encrypted_value: encrypted,
        updated_at: new Date(ms).toISOString()
      }, { onConflict: 'user_id,app,storage_key' });
      if (error) console.warn(`sync: fallo al subir ${key}`, error);
    } catch (err) {
      console.warn(`sync: fallo al cifrar/subir ${key}`, err);
    }
  }
}

// Se llama al iniciar sesión / abrir la app con la sync activada. Descarga
// lo que haya en la nube PARA ESTA APP y decide, clave a clave, si gana lo
// remoto o lo local; lo que gane local se sube. Devuelve true si algo local
// cambió (para que quien llame refresque la pantalla).
async function pullAndMerge() {
  const supabase = await getClient();
  const { data: rows, error } = await supabase
    .from('sync_data')
    .select('storage_key, encrypted_value, updated_at')
    .eq('app', APP);
  if (error) throw error;

  const byKey = new Map((rows || []).map(r => [r.storage_key, r]));
  const timestamps = loadTimestamps();
  const toPush = [];
  let localChanged = false;

  // Unión de lo que hay aquí y lo que hay en la nube: así entran también los
  // meses que existen en otro dispositivo y aquí todavía no.
  const allKeys = new Set([...localSyncedKeys(), ...byKey.keys()]);

  for (const key of allKeys) {
    const remote = byKey.get(key);
    const localRaw = localStorage.getItem(key);
    const localMs = timestamps[key] ?? null;

    if (localRaw === null) {
      // Nada local: si hay algo remoto, este dispositivo lo adopta entero
      // (caso "dispositivo nuevo, recuperar datos ya sincronizados").
      if (remote) {
        const plaintext = await decryptString(remote.encrypted_value);
        storage.writeRaw(key, plaintext);
        timestamps[key] = Date.parse(remote.updated_at);
        localChanged = true;
      }
      continue;
    }

    if (remote && localMs !== null) {
      // Ya sincronizamos esta clave antes desde este dispositivo: último
      // cambio gana, comparando contra esa última vez.
      const remoteMs = Date.parse(remote.updated_at);
      if (remoteMs > localMs) {
        const plaintext = await decryptString(remote.encrypted_value);
        storage.writeRaw(key, plaintext);
        timestamps[key] = remoteMs;
        localChanged = true;
      }
      continue;
    }

    // O no hay fila remota, o hay dato local pero es la PRIMERA vez que este
    // dispositivo sincroniza esta clave (localMs === null): el dato local
    // manda. Importante para no perder en silencio el historial ya existente
    // de un móvil que activa la sync por primera vez, aunque la cuenta ya
    // tuviera datos de otro sitio.
    timestamps[key] = localMs ?? Date.now();
    toPush.push(key);
  }

  saveTimestamps(timestamps);
  if (toPush.length) await pushKeys(toPush);
  return localChanged;
}

// Llamada en cada arranque de la app (app.js). Si está apagada, no toca
// nada de red. Si está encendida pero la sesión de Supabase caducó, se
// queda en local sin romper nada — la persona puede volver a iniciar
// sesión desde Ajustes.
export async function init(onMerged) {
  if (!isEnabled()) return;
  try {
    const supabase = await getClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      console.warn('sync: sesión caducada, vuelve a iniciar sesión en Ajustes → Copia en la nube.');
      return;
    }
    currentUserId = data.session.user.id;
    startWriteSubscription();
    const changed = await pullAndMerge();
    if (changed && onMerged) onMerged();
  } catch (err) {
    console.warn('sync: fallo al iniciar', err);
  }
}

// --- reacción a escrituras locales ---

function startWriteSubscription() {
  if (unsubscribeWrite) return;
  unsubscribeWrite = storage.onWrite(handleLocalWrite);
}

function handleLocalWrite(key) {
  if (!isSyncedKey(key)) return;
  const timestamps = loadTimestamps();
  timestamps[key] = Date.now();
  saveTimestamps(timestamps);
  pendingKeys.add(key);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushPending, DEBOUNCE_MS);
}

function flushPending() {
  const keys = [...pendingKeys];
  pendingKeys.clear();
  pushKeys(keys).catch(err => console.warn('sync: fallo al sincronizar', err));
}
