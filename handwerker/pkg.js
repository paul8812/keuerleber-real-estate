// Datenpaket des Handwerkerbereichs. Gleiche Technik wie der Partnerbereich (AES-256-GCM, PBKDF2-Slots pro Zugang).
// Neu: Pro Handwerker und Baustelle gibt es einen „Verlauf“ (Thread) mit eigenem, dauerhaftem Schlüssel.
// Fotos, Nachrichten und Rechnungen liegen verschlüsselt beim Speicherdienst; nur der Handwerker und die Master können sie lesen.
import { ITER, makeSlot, newKeyB64, openJson, openSlot, randomId, sealJson } from '../partner/crypto.js';

export { ITER, openJson, openSlot, randomId };

/** Stellt sicher, dass es für jede Freigabe (Handwerker × Baustelle) einen Verlauf gibt. Verläufe bleiben dauerhaft bestehen. */
export function syncThreads(threads, handwerker, projekte) {
  const ids = new Set(projekte.map((p) => p.id));
  for (const h of handwerker) for (const pid of h.projekte ?? []) {
    if (!ids.has(pid)) continue;
    if (!threads.some((t) => t.hid === h.id && t.pid === pid)) threads.push({ tid: randomId() + randomId() + randomId(), k: newKeyB64(), hid: h.id, pid, aktiv: true });
  }
  for (const t of threads) { // Freigabe entzogen: Verlauf archivieren (Master lesen weiter, Handwerker verliert den Schlüssel)
    const h = handwerker.find((x) => x.id === t.hid), p = projekte.find((x) => x.id === t.pid);
    t.aktiv = !!h && (h.projekte ?? []).includes(t.pid) && ids.has(t.pid);
    if (h) t.hn = h.name; // Namen merken, damit archivierte Verläufe auch nach dem Löschen lesbar bleiben
    if (p) t.pn = p.name;
  }
  return threads;
}

export async function buildPackage({ stand, projekte, handwerker, masters, threads, sb = null }) {
  const a = newKeyB64();
  const blobs = [], keyOf = {}, bidOf = {};
  for (const p of projekte) {
    const key = newKeyB64(), bid = randomId() + randomId();
    keyOf[p.id] = key; bidOf[p.id] = bid;
    blobs.push({ b: bid, ...(await sealJson(key, p)) });
  }
  const tmap = (list) => Object.fromEntries(list.map((t) => [t.tid, { k: t.k, pid: t.pid, hid: t.hid, bid: bidOf[t.pid], on: t.aktiv !== false }]));
  const slots = [];
  for (const m of masters) slots.push(await makeSlot(m.id, m.code, { r: 'admin', n: m.name, a, stand, keys: Object.fromEntries(projekte.map((p) => [bidOf[p.id], keyOf[p.id]])), threads: tmap(threads), ...(sb ? { sb } : {}) }));
  for (const h of handwerker) {
    const mine = threads.filter((t) => t.hid === h.id && t.aktiv !== false && keyOf[t.pid]);
    slots.push(await makeSlot(h.id, h.code, { r: 'hw', n: h.name, firma: h.firma ?? '', stand, keys: Object.fromEntries(mine.map((t) => [bidOf[t.pid], keyOf[t.pid]])), threads: tmap(mine), ...(sb ? { sb } : {}) }));
  }
  return { a, pkg: { v: 1, iter: ITER, slots, projekte: blobs, admin: await sealJson(a, { projekte, handwerker, masters, threads, sb }) } };
}

export async function openProjects(payload, pkg) {
  const out = [];
  for (const blob of pkg.projekte) { const key = payload.keys?.[blob.b]; if (key) out.push({ ...(await openJson(key, blob)), bid: blob.b }); }
  return out;
}
