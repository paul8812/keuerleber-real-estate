// Keuerleber CRM – Objekt-Import (Supabase Edge Function „unterlagen“).
//
// Damit lassen sich Objekte samt Unterlagen von außen ins CRM legen (z. B. aus dem Ordner „Keuerleber Objekte“),
// ohne dass ein Login-Passwort im Spiel ist. Geschützt durch einen Zufallswert in privat.unterlagen.
//   POST { k, a: "konto" }                      → { ok, uid }                       (Schlüssel prüfen)
//   POST { k, a: "liste" }                      → { ok, objekte: [{id, nr, titel, strasse, ort}], unterlagen: [{id, propertyId, name}] }
//   POST { k, a: "hole", ids: [...] }          → { ok, records: [{id, collection, data}] }
//   POST { k, a: "upload", pfad, typ }          → { ok, pfad, url }                 (einmalige Adresse zum Hochladen einer Datei, PUT)
//   POST { k, a: "records", records: [...] }    → { ok, n }                         (Datensätze anlegen/aktualisieren)
// Dateien liegen im privaten Speicher-Bereich „unterlagen“ unter <Benutzer-ID>/<Objekt-ID>/<Dateiname>.
// Keine Inhalte in Logs.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => {
  try { return Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>)[0] ?? ""; } catch { return ""; }
})();
const BUCKET = "unterlagen";
const ERLAUBT = ["properties", "exposes", "dateien", "unterlagen"];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const H = { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };

const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
async function rest(method: string, pfad: string, body?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(SB_URL + pfad, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) { let m = t; try { const j = JSON.parse(t); m = j.message || j.error || t; } catch { /* Text */ } throw new Error(m); }
  return t ? JSON.parse(t) : null;
}
// Pfad-Teile: keine Sprünge nach oben, keine Steuerzeichen
const sauber = (s: string) => String(s).split("/").map(x => x.trim()).filter(x => x && x !== "." && x !== "..").join("/").replace(/[\u0000-\u001f\\]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return antwort({ ok: false, fehler: "nur POST" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return antwort({ ok: false, fehler: "kein JSON" }, 400); }
  try {
    const uid = await rest("POST", "/rest/v1/rpc/unterlagen_konto", { p_geheim: String(b.k ?? "") });
    if (!uid) return antwort({ ok: false, fehler: "nicht erlaubt" }, 403);
    const a = String(b.a ?? "");
    if (a === "konto") return antwort({ ok: true, uid });
    if (a === "liste") {
      const rows = await rest("GET", `/rest/v1/records?select=id,collection,data&user_id=eq.${uid}&collection=in.(properties,unterlagen,exposes)&order=id&limit=2000`) ?? [];
      // deno-lint-ignore no-explicit-any
      const von = (c: string) => rows.filter((r: any) => r.collection === c);
      return antwort({ ok: true,
        // deno-lint-ignore no-explicit-any
        objekte: von("properties").map((r: any) => ({ id: r.id, nr: r.data?.nr ?? "", titel: r.data?.titel ?? "", strasse: r.data?.strasse ?? "", ort: r.data?.ort ?? "", exposeId: r.data?.exposeId ?? "" })),
        // deno-lint-ignore no-explicit-any
        unterlagen: von("unterlagen").map((r: any) => ({ id: r.id, propertyId: r.data?.propertyId ?? "", name: r.data?.name ?? "", pfad: r.data?.pfad ?? "" })),
        // deno-lint-ignore no-explicit-any
        exposes: von("exposes").map((r: any) => ({ id: r.id, name: r.data?.name ?? "", propertyId: r.data?.propertyId ?? "", quelle: r.data?.quelle ?? "" })) });
    }
    if (a === "hole") {       // vollständige Datensätze (z. B. ein Objekt), damit beim Ergänzen nichts überschrieben wird
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter(x => typeof x === "string" && /^[\w.:-]+$/.test(x)).slice(0, 50);
      if (!ids.length) return antwort({ ok: true, records: [] });
      const rows = await rest("GET", `/rest/v1/records?select=id,collection,data&user_id=eq.${uid}&collection=in.(${ERLAUBT.filter(c => c !== "dateien").join(",")})&id=in.(${ids.map(x => `"${x}"`).join(",")})`) ?? [];
      return antwort({ ok: true, records: rows });
    }
    if (a === "upload") {
      const rel = sauber(String(b.pfad ?? "")); if (!rel) return antwort({ ok: false, fehler: "Pfad fehlt" }, 400);
      const pfad = `${uid}/${rel}`;
      const j = await rest("POST", `/storage/v1/object/upload/sign/${BUCKET}/${pfad.split("/").map(encodeURIComponent).join("/")}`, {}, { "x-upsert": "true" });
      return antwort({ ok: true, pfad, url: `${SB_URL}/storage/v1${j.url}` });
    }
    if (a === "records") {
      const jetzt = new Date().toISOString();
      // deno-lint-ignore no-explicit-any
      const rows = (Array.isArray(b.records) ? b.records : []).filter((r: any) => r && typeof r.id === "string" && r.id && ERLAUBT.includes(r.collection) && r.data && typeof r.data === "object")
        // deno-lint-ignore no-explicit-any
        .map((r: any) => ({ id: r.id, collection: r.collection, data: { ...r.data, id: r.id }, user_id: uid, updated_at: jetzt }));
      if (!rows.length) return antwort({ ok: false, fehler: "keine gültigen Datensätze" }, 400);
      await rest("POST", "/rest/v1/records?on_conflict=id", rows, { Prefer: "resolution=merge-duplicates,return=minimal" });
      return antwort({ ok: true, n: rows.length });
    }
    return antwort({ ok: false, fehler: "unbekannte Aktion" }, 400);
  } catch (e) {
    const m = (e as Error).message || "Fehler";
    return antwort({ ok: false, fehler: /nicht erlaubt/.test(m) ? "nicht erlaubt" : m }, /nicht erlaubt/.test(m) ? 403 : 500);
  }
});
