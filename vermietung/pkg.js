// Datenpaket der Vermietung – gleiche Technik wie Partner- und Handwerkerbereich (AES-256-GCM, PBKDF2-Slot pro Zugang).
// Alle Zugänge haben volle Rechte (Vermieter und Vermittler gleichberechtigt). Pro Mietobjekt gibt es einen gemeinsamen,
// dauerhaften Verlauf (Chat, Besichtigungen, Anzeigen, Mietdaten, Status); dessen Einträge liegen verschlüsselt beim Speicherdienst.
import { ITER, makeSlot, newKeyB64, openJson, openSlot, randomId, sealJson } from '../partner/crypto.js';

export { openJson, openSlot };

/** Jedes Objekt bekommt beim ersten Veröffentlichen einen Verlauf; Verläufe gelöschter Objekte bleiben lesbar (Archiv). */
export function syncThreads(threads, objekte) {
  for (const o of objekte) if (!threads.some((t) => t.oid === o.id)) threads.push({ tid: randomId() + randomId() + randomId(), k: newKeyB64(), oid: o.id });
  for (const t of threads) { const o = objekte.find((x) => x.id === t.oid); t.aktiv = !!o; if (o) t.tn = o.titel; }
  return threads;
}

export async function buildPackage({ stand, objekte, team, threads, sb = null, gh = null }) {
  const a = newKeyB64(), blobs = [], keys = {}, bidOf = {};
  for (const o of objekte) {
    const key = newKeyB64(), bid = randomId() + randomId();
    keys[bid] = key; bidOf[o.id] = bid;
    blobs.push({ b: bid, ...(await sealJson(key, o)) });
  }
  const tmap = Object.fromEntries(threads.map((t) => [t.tid, { k: t.k, oid: t.oid, bid: bidOf[t.oid], on: t.aktiv !== false, tn: t.tn || '' }]));
  const slots = [];
  for (const m of team) slots.push(await makeSlot(m.id, m.code, { r: 'admin', n: m.name, rolle: m.rolle || '', a, stand, keys, threads: tmap, ...(sb ? { sb } : {}) }));
  return { a, pkg: { v: 1, iter: ITER, slots, objekte: blobs, admin: await sealJson(a, { objekte, team, threads, sb, ...(gh ? { gh } : {}) }) } };
}

export async function openObjekte(payload, pkg) {
  const out = [];
  for (const blob of pkg.objekte) { const key = payload.keys?.[blob.b]; if (key) out.push({ ...(await openJson(key, blob)), bid: blob.b }); }
  return out;
}
