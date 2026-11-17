/* „Angemeldet bleiben“ für Partnerbereich und Vermietung.
   Gemerkt wird nur der Zugang (ID + Code) – verschlüsselt mit einem nicht auslesbaren Schlüssel aus IndexedDB.
   Im localStorage steht nur das Chiffrat mit Ablaufdatum. Beim Öffnen wird der Zugang gegen den aktuellen
   Datenstand neu geprüft: Gesperrte oder geänderte Zugänge melden sich also trotzdem ab. */
const DB = 'nf-merken', STORE = 'k';
const b64 = (u) => btoa(String.fromCharCode(...u));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function schluessel(name, neu) {
  const db = await idb();
  let k = await req(db.transaction(STORE).objectStore(STORE).get(name));
  if (!k && neu) {
    k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(k, name));
  }
  return k || null;
}

/** Zugang für `tage` Tage merken. Gibt false zurück, wenn der Browser es nicht erlaubt (z. B. privater Modus). */
export async function merken(name, daten, tage) {
  try {
    const k = await schluessel(name, true), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(daten))));
    localStorage.setItem(name, JSON.stringify({ bis: Date.now() + tage * 864e5, iv: b64(iv), ct: b64(ct) }));
    try { await navigator.storage?.persist?.(); } catch { /* nur ein Wunsch an den Browser */ }
    return true;
  } catch { return false; }
}

/** Gemerkten Zugang lesen – null, wenn keiner da, abgelaufen oder nicht lesbar. */
export async function gemerkt(name) {
  let r; try { r = JSON.parse(localStorage.getItem(name) || 'null'); } catch { r = null; }
  if (!r?.ct) return null;
  if (!(Date.now() < r.bis)) { vergessen(name); return null; }
  try {
    const k = await schluessel(name, false); if (!k) { vergessen(name); return null; }
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(r.iv) }, k, unb64(r.ct));
    return { ...JSON.parse(new TextDecoder().decode(pt)), bis: r.bis };
  } catch { vergessen(name); return null; }
}

/** Gemerkten Zugang aktualisieren (z. B. nach Passwortänderung), ohne die Frist zu verlängern. */
export async function auffrischen(name, daten) {
  const alt = await gemerkt(name); if (!alt) return;
  await merken(name, daten, (alt.bis - Date.now()) / 864e5);
}

export function vergessen(name) {
  try { localStorage.removeItem(name); } catch { /* egal */ }
  idb().then((db) => db.transaction(STORE, 'readwrite').objectStore(STORE).delete(name)).catch(() => { /* egal */ });
}

/** Häkchen fürs Anmeldeformular */
export const merkenFeld = (text) => `<label class="lg-merk"><input type="checkbox" id="merk" checked><span>${text}</span></label>`;
