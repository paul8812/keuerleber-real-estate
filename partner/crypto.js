// Verschlüsselung für den Partnerbereich (Browser und Node, nur Web Crypto).
// Aufbau: Ein zufälliger Datenschlüssel (DEK) verschlüsselt die Inhalte (AES-256-GCM).
// Jeder Zugang (Master/Partner) hat einen „Slot“: der DEK ist mit einem Schlüssel aus seinem Code (PBKDF2) verpackt.
// Zugang entziehen = Slot entfernen und mit neuem DEK neu veröffentlichen.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const ITER = 600000;

export const toB64 = (buf) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

async function kdf(code, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const aes = (raw, usage) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usage);

export const newKeyB64 = () => toB64(rnd(32));

async function seal(keyObj, bytes) {
  const iv = rnd(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyObj, bytes);
  return { iv: toB64(iv), ct: toB64(ct) };
}
async function unseal(keyObj, box) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, keyObj, fromB64(box.ct));
}

export const sealJson = async (keyB64, obj) => seal(await aes(fromB64(keyB64), ['encrypt']), enc.encode(JSON.stringify(obj)));
export const openJson = async (keyB64, box) => JSON.parse(dec.decode(await unseal(await aes(fromB64(keyB64), ['decrypt']), box)));

/** Slot für einen Zugangscode: verpackt {k, a?, r} (Datenschlüssel, Admin-Schlüssel, Rolle). */
export async function makeSlot(id, code, payload, iter = ITER) {
  const salt = rnd(16);
  const box = await seal(await kdf(code, salt, iter), enc.encode(JSON.stringify(payload)));
  return { id, salt: toB64(salt), ...box };
}
/** Gibt den Slot-Inhalt zurück oder null, wenn der Code nicht passt. */
export async function openSlot(code, slot, iter = ITER) {
  try {
    return JSON.parse(dec.decode(await unseal(await kdf(code, fromB64(slot.salt), iter), slot)));
  } catch {
    return null;
  }
}

/** Baut die komplette Datei {pkg, k, a}.
 *  Jedes Objekt hat einen eigenen Schlüssel. Ein Partner-Slot enthält nur die Schlüssel seiner freigegebenen Objekte,
 *  ein Master-Slot alle Schlüssel plus den Admin-Schlüssel. Alle Schlüssel werden bei jedem Veröffentlichen neu erzeugt. */
export async function buildPackage({ stand, objekte, partners, masters, fb = null, ev = [], evx = null }) {
  const a = newKeyB64();
  const blobs = [];
  const keyOf = {}; // interne Objekt-ID -> Schlüssel
  const bidOf = {}; // interne Objekt-ID -> zufällige Blob-ID
  for (const o of objekte) {
    const key = newKeyB64();
    const bid = randomId() + randomId();
    keyOf[o.id] = key;
    bidOf[o.id] = bid;
    blobs.push({ b: bid, ...(await sealJson(key, o)) });
  }
  const keysFor = (ids) => Object.fromEntries(ids.filter((id) => keyOf[id]).map((id) => [bidOf[id], keyOf[id]]));
  const slots = [];
  for (const m of masters) slots.push(await makeSlot(m.id, m.code, { r: 'admin', n: m.name, a, stand, keys: keysFor(objekte.map((o) => o.id)), ...(fb ? { fb } : {}) }));
  for (const p of partners) slots.push(await makeSlot(p.id, p.code, { r: 'partner', n: p.name, stand, keys: keysFor(p.objekte ?? []), ...(fb ? { fb: { token: fb.token, pub: fb.pub } } : {}) }));
  return { a, pkg: { v: 2, iter: ITER, slots, objekte: blobs, admin: await sealJson(a, { partners, masters, fb, ev, evx }) } };
}

/** Entschlüsselt alle Objekte, für die der Slot einen Schlüssel hat (Reihenfolge wie veröffentlicht). */
export async function openObjects(payload, pkg) {
  const out = [];
  for (const blob of pkg.objekte) {
    const key = payload.keys?.[blob.b];
    if (key) out.push(await openJson(key, blob));
  }
  return { stand: payload.stand, objekte: out };
}

export function randomCode(len = 24) {
  const A = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const lim = 256 - (256 % A.length);
  let out = '';
  while (out.length < len) for (const b of rnd(len)) if (b < lim && out.length < len) out += A[b % A.length];
  return out;
}
export const randomId = () => [...rnd(4)].map((b) => b.toString(16).padStart(2, '0')).join('');

/* ---------- Rückmeldungen: Partner verschlüsseln mit dem öffentlichen Schlüssel, nur Master können lesen ---------- */
const RSA = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
export async function newFeedbackKeys() {
  const k = await crypto.subtle.generateKey(RSA, true, ['encrypt', 'decrypt']);
  return { pub: await crypto.subtle.exportKey('jwk', k.publicKey), priv: await crypto.subtle.exportKey('jwk', k.privateKey) };
}
/** Hybrid: zufälliger AES-Schlüssel verschlüsselt die Nachricht, RSA verpackt den AES-Schlüssel. */
export async function sealFeedback(pubJwk, obj) {
  const pub = await crypto.subtle.importKey('jwk', pubJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const raw = rnd(32);
  const box = await seal(await aes(raw, ['encrypt']), enc.encode(JSON.stringify(obj)));
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
  return JSON.stringify({ w: toB64(wrapped), ...box });
}
export async function openFeedback(privJwk, text) {
  const priv = await crypto.subtle.importKey('jwk', privJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  const m = JSON.parse(text);
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, fromB64(m.w)));
  return JSON.parse(dec.decode(await unseal(await aes(raw, ['decrypt']), m)));
}

/* ---------- Dateien (Handwerkerbereich): Bytes mit dem Schlüssel des Verlaufs verschlüsseln, IV vorangestellt ---------- */
export async function sealBytes(keyB64, bytes) {
  const iv = rnd(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(fromB64(keyB64), ['encrypt']), bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return out;
}
export async function openBytes(keyB64, bytes) {
  const u = new Uint8Array(bytes);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, await aes(fromB64(keyB64), ['decrypt']), u.subarray(12)));
}
