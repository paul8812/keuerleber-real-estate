// Keuerleber CRM – Kundenseite (Supabase Edge Function „kunde“).
//
// Öffentliche Gegenstelle für Links, die aus dem CRM verschickt werden (keuerleber-immobilien.de/k/#<Link>).
// Der Link selbst ist der Schlüssel: ein langer Zufallswert, der im CRM als Datensatz der Sammlung „links“ liegt.
//   POST { t, a: "hole", g?, v? }                        → Inhalt der Seite (Objekt + Unterlagen | freie Termine | Selbstauskunft)
//   POST { t, a: "datei", id }                           → { ok, url }   kurzlebige Download-Adresse einer freigegebenen Unterlage
//   POST { t, a: "buche", g?, slot, name, tel, email, nachricht } → { ok, termin }   Besichtigungstermin buchen (legt den Termin im Kalender an)
//   POST { t, a: "storno", g }                           → { ok }        eigenen Termin absagen
//   POST { t, a: "auskunft", daten }                     → { ok }        ausgefüllte Selbstauskunft speichern
// Geschrieben wird nur in „linkstatus“ (Aufrufe, Antworten) und „events“ (gebuchte Termine) – nie in den Link selbst.
// Keine Inhalte in Logs.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => {
  try { return Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>)[0] ?? ""; } catch { return ""; }
})();
const BUCKET = "unterlagen";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const H = { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };
// deno-lint-ignore no-explicit-any
type J = Record<string, any>;

const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
async function rest(method: string, pfad: string, body?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(SB_URL + pfad, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) { let m = t; try { const j = JSON.parse(t); m = j.message || j.error || t; } catch { /* Text */ } const e = new Error(m) as Error & { status?: number }; e.status = r.status; throw e; }
  return t ? JSON.parse(t) : null;
}
const text = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const heute = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const jetztUhr = () => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

async function status(token: string, uid: string): Promise<J> {
  const r = await rest("GET", `/rest/v1/records?select=data&id=eq.${token}:s&collection=eq.linkstatus&user_id=eq.${uid}&limit=1`) ?? [];
  return r[0]?.data ?? { id: `${token}:s`, linkId: token };
}
async function statusSpeichern(token: string, uid: string, s: J) {
  const jetzt = new Date().toISOString();
  await rest("POST", "/rest/v1/records?on_conflict=id", [{ id: `${token}:s`, collection: "linkstatus", data: { ...s, id: `${token}:s`, linkId: token, updated: jetzt }, user_id: uid, updated_at: jetzt }], { Prefer: "resolution=merge-duplicates,return=minimal" });
}
/** gebuchte Termine dieses Links */
async function termine(token: string, uid: string): Promise<J[]> {
  const r = await rest("GET", `/rest/v1/records?select=id,data&collection=eq.events&user_id=eq.${uid}&data->>linkId=eq.${token}&limit=500`) ?? [];
  // deno-lint-ignore no-explicit-any
  return r.map((x: any) => x.data);
}
const frei = (L: J, gebucht: J[]) => {
  const t = heute(), u = jetztUhr(), belegt = new Set(gebucht.map(e => e.slot));
  return (Array.isArray(L.slots) ? L.slots : []).filter((s: J) => s && s.id && s.datum && s.start && !belegt.has(s.id) && (s.datum > t || (s.datum === t && s.start > u)))
    .sort((a: J, b: J) => (a.datum + a.start).localeCompare(b.datum + b.start)).map((s: J) => ({ id: s.id, datum: s.datum, start: s.start, ende: s.ende || "" }));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return antwort({ ok: false, fehler: "nur POST" }, 405);
  let b: J;
  try { const roh = await req.text(); if (roh.length > 60000) return antwort({ ok: false, fehler: "zu groß" }, 413); b = JSON.parse(roh); } catch { return antwort({ ok: false, fehler: "kein JSON" }, 400); }
  try {
    const token = String(b.t ?? "");
    if (!/^[a-z0-9]{20,48}$/.test(token)) return antwort({ ok: false, fehler: "unbekannt" }, 404);
    const rows = await rest("GET", `/rest/v1/records?select=data,user_id&id=eq.${token}&collection=eq.links&limit=1`) ?? [];
    if (!rows.length) return antwort({ ok: false, fehler: "unbekannt" }, 404);
    const L: J = rows[0].data ?? {}, uid: string = rows[0].user_id;
    if (L.aktiv === false || (L.gueltigBis && String(L.gueltigBis) < heute())) return antwort({ ok: false, fehler: "abgelaufen", absender: L.absender ?? null }, 410);
    const a = String(b.a ?? "hole"), g = /^[a-z0-9]{4,16}$/.test(String(b.g ?? "")) ? String(b.g) : "";
    const gast: J | null = g && L.gaeste && typeof L.gaeste === "object" ? L.gaeste[g] ?? null : null;
    const kopf = { typ: L.typ, titel: L.titel ?? "", adresse: L.adresse ?? "", bild: L.bild ?? "", absender: L.absender ?? {}, name: gast?.name ?? L.name ?? "", text: L.text ?? "" };

    if (a === "hole") {
      const S = await status(token, uid);
      if (!b.v) {   // Aufruf zählen (nicht bei der Vorschau aus dem CRM)
        const jetzt = new Date().toISOString();
        S.aufrufe = (Number(S.aufrufe) || 0) + 1; S.erster ||= jetzt; S.letzter = jetzt;
        if (g) { S.gaeste ||= {}; const x = S.gaeste[g] ?? {}; S.gaeste[g] = { ...x, n: (Number(x.n) || 0) + 1, erster: x.erster || jetzt, letzter: jetzt }; }
        await statusSpeichern(token, uid, S).catch(() => {});
      }
      if (L.typ === "objekt") {
        // deno-lint-ignore no-explicit-any
        return antwort({ ok: true, ...kopf, unterlagen: (Array.isArray(L.unterlagen) ? L.unterlagen : []).map((u: any) => ({ id: u.id, name: u.name, kategorie: u.kategorie ?? "", groesse: u.groesse ?? 0 })) });
      }
      if (L.typ === "termin") {
        const E = await termine(token, uid), mein = g ? E.find(e => e.gast === g) : null;
        return antwort({ ok: true, ...kopf, ort: L.ort ?? "", hinweis: L.hinweis ?? "", slots: frei(L, E), gast: gast ? { name: gast.name ?? "", email: gast.email ?? "", tel: gast.tel ?? "" } : null,
          mein: mein ? { datum: mein.datum, start: mein.start, ende: mein.ende ?? "" } : null });
      }
      if (L.typ === "auskunft") return antwort({ ok: true, ...kopf, vorgabe: { name: L.name ?? "", email: L.email ?? "", tel: L.tel ?? "" }, eingereicht: S.eingereicht ?? "", antwort: S.antwort ?? null });
      return antwort({ ok: false, fehler: "unbekannt" }, 404);
    }

    if (a === "datei" && L.typ === "objekt") {
      // deno-lint-ignore no-explicit-any
      const u = (Array.isArray(L.unterlagen) ? L.unterlagen : []).find((x: any) => x.id === b.id);
      if (!u || !u.pfad || !String(u.pfad).startsWith(uid + "/")) return antwort({ ok: false, fehler: "Datei nicht freigegeben" }, 404);
      const j = await rest("POST", `/storage/v1/object/sign/${BUCKET}/${String(u.pfad).split("/").map(encodeURIComponent).join("/")}`, { expiresIn: 900 });
      const url = `${SB_URL}/storage/v1${j.signedURL}${b.laden ? `&download=${encodeURIComponent(u.name || "Unterlage")}` : ""}`;
      if (!b.v) {
        const S = await status(token, uid), jetzt = new Date().toISOString();
        S.downloads = [...(Array.isArray(S.downloads) ? S.downloads : []), { id: u.id, name: u.name, zeit: jetzt }].slice(-200); S.letzter = jetzt;
        await statusSpeichern(token, uid, S).catch(() => {});
      }
      return antwort({ ok: true, url });
    }

    if (a === "buche" && L.typ === "termin") {
      const name = text(b.name ?? gast?.name, 120), tel = text(b.tel ?? gast?.tel, 60), email = text(b.email ?? gast?.email, 160), nachricht = text(b.nachricht, 800);
      if (name.length < 2) return antwort({ ok: false, fehler: "Bitte Ihren Namen angeben." }, 400);
      if (!tel && !email) return antwort({ ok: false, fehler: "Bitte Telefon oder E-Mail angeben." }, 400);
      const E = await termine(token, uid), slot = frei(L, E).find((s: J) => s.id === b.slot);
      if (!slot) return antwort({ ok: false, fehler: "Dieser Termin ist leider nicht mehr frei.", slots: frei(L, E) }, 409);
      const jetzt = new Date().toISOString(), id = `ev-${token.slice(0, 12)}-${String(slot.id).replace(/[^\w-]/g, "")}`;
      const ev = { id, titel: `Besichtigung: ${name}`, art: "Besichtigung", datum: slot.datum, start: slot.start, ende: slot.ende, ort: L.ort ?? L.adresse ?? "",
        contactId: gast?.contactId ?? "", propertyId: L.propertyId ?? "", anfrageId: gast?.anfrageId ?? "", notiz: [tel, email, nachricht].filter(Boolean).join(" · "),
        quelle: "online", linkId: token, slot: slot.id, gast: g, gastName: name, gastTel: tel, gastEmail: email, created: jetzt, updated: jetzt };
      try { await rest("POST", "/rest/v1/records", [{ id, collection: "events", data: ev, user_id: uid, updated_at: jetzt }], { Prefer: "return=minimal" }); }
      catch (e) { if ((e as { status?: number }).status === 409) return antwort({ ok: false, fehler: "Dieser Termin wurde gerade vergeben.", slots: frei(L, await termine(token, uid)) }, 409); throw e; }
      // Umbuchung: früheren Termin desselben Gasts freigeben
      const alt = g ? E.filter(e => e.gast === g && e.id !== id).map(e => e.id) : [];
      if (alt.length) await rest("DELETE", `/rest/v1/records?user_id=eq.${uid}&collection=eq.events&id=in.(${alt.map(x => `"${x}"`).join(",")})`, undefined, { Prefer: "return=minimal" }).catch(() => {});
      return antwort({ ok: true, termin: { datum: slot.datum, start: slot.start, ende: slot.ende }, ort: L.ort ?? "" });
    }

    if (a === "storno" && L.typ === "termin" && g) {
      const E = (await termine(token, uid)).filter(e => e.gast === g);
      if (E.length) await rest("DELETE", `/rest/v1/records?user_id=eq.${uid}&collection=eq.events&id=in.(${E.map(e => `"${e.id}"`).join(",")})`, undefined, { Prefer: "return=minimal" });
      const S = await status(token, uid); S.storno = [...(Array.isArray(S.storno) ? S.storno : []), { gast: g, name: gast?.name ?? "", zeit: new Date().toISOString(), termin: E[0] ? `${E[0].datum} ${E[0].start}` : "" }].slice(-50);
      await statusSpeichern(token, uid, S).catch(() => {});
      return antwort({ ok: true, n: E.length });
    }

    if (a === "auskunft" && L.typ === "auskunft") {
      const d = b.daten;
      if (!d || typeof d !== "object" || Array.isArray(d)) return antwort({ ok: false, fehler: "keine Angaben" }, 400);
      const sauber: J = {};
      for (const [k, v] of Object.entries(d).slice(0, 120)) if (/^[\w.-]{1,40}$/.test(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) sauber[k] = typeof v === "string" ? text(v, 1500) : v;
      if (!text(sauber.nachname, 80) || !sauber.richtig) return antwort({ ok: false, fehler: "Bitte Name angeben und die Richtigkeit bestätigen." }, 400);
      const S = await status(token, uid), jetzt = new Date().toISOString();
      S.antwort = sauber; S.erstEingereicht ||= jetzt; S.eingereicht = jetzt; S.letzter = jetzt;
      await statusSpeichern(token, uid, S);
      return antwort({ ok: true, eingereicht: jetzt });
    }
    return antwort({ ok: false, fehler: "unbekannte Aktion" }, 400);
  } catch (_e) {
    return antwort({ ok: false, fehler: "Das hat gerade nicht geklappt – bitte später noch einmal versuchen." }, 500);
  }
});
