// Keuerleber CRM – Fahrtenbuch-Endpunkt (Supabase Edge Function „fahrt“, ohne JWT-Prüfung).
//
// Der iPhone-Kurzbefehl ruft beim Verbinden/Trennen von CarPlay auf:
//   GET …/functions/v1/fahrt?k=<geheim>&a=start&lat=50,31&lon=11,91
//   GET …/functions/v1/fahrt?k=<geheim>&a=ende&lat=…&lon=…
// → fahrt_punkt() legt die Fahrt an bzw. schließt sie ab. Danach werden hier Adressen (OpenStreetMap/Nominatim)
//   und die Straßen-Kilometer (OSRM) ermittelt und mit fahrt_ergaenzen() nachgetragen.
// Zusätzlich für das CRM (gleicher Zufallswert): a=strecke (von/nach als Text oder Koordinaten) → km + Adressen, schreibt nichts.
// Keine Standortdaten in Logs.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || (() => {
  try { return Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>)[0] ?? ""; } catch { return ""; }
})();
const UA = "Keuerleber-CRM-Fahrtenbuch/1.0 (keuerleber-immobilien.de)";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info", "access-control-allow-methods": "GET, POST, OPTIONS" };

type Punkt = { lat: number; lon: number };
const zahl = (v: unknown) => { const n = parseFloat(String(v ?? "").trim().replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: SB_ANON, authorization: `Bearer ${SB_ANON}`, "content-type": "application/json" }, body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) { let m = t; try { m = JSON.parse(t).message || t; } catch { /* Text */ } throw new Error(m); }
  return t ? JSON.parse(t) : null;
}

async function mitZeit<T>(p: Promise<T>, ms = 6000): Promise<T | null> {
  return await Promise.race([p.catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))]);
}

// Adressen: Photon (OpenStreetMap, komoot) – Nominatim nur als Rückfall (blockiert oft Anfragen aus Rechenzentren)
// deno-lint-ignore no-explicit-any
const photonText = (p: any) => {
  const str = [p.street || (p.type === "street" ? p.name : ""), p.housenumber || ""].filter(Boolean).join(" ");
  const ort = p.city || p.town || p.village || p.locality || p.district || (p.type === "city" ? p.name : "") || "";
  const name = p.name && !str.includes(p.name) && p.name !== ort && !["house", "street", "city", "district", "locality"].includes(p.type) ? p.name : "";
  return [name, str, [p.postcode, ort].filter(Boolean).join(" ")].filter(Boolean).join(", ").slice(0, 200);
};
/** Koordinaten → kurze Adresse „Ludwigstraße 12, 95028 Hof“ */
async function adresse(p: Punkt): Promise<string> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${p.lat}&lon=${p.lon}&lang=de&limit=1`, { headers: { "user-agent": UA } });
    if (r.ok) { const f = (await r.json()).features?.[0]; const t = f ? photonText(f.properties || {}) : ""; if (t) return t; }
  } catch { /* Rückfall */ }
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lon}&zoom=18&addressdetails=1&accept-language=de`, { headers: { "user-agent": UA } });
  if (!r.ok) return "";
  const j = await r.json(); const a = j.address || {};
  const str = [a.road || a.pedestrian || a.footway || a.square || a.hamlet || "", a.house_number || ""].filter(Boolean).join(" ");
  const ort = a.city || a.town || a.village || a.municipality || a.suburb || "";
  return [str, [a.postcode, ort].filter(Boolean).join(" ")].filter(Boolean).join(", ").slice(0, 200) || String(j.display_name || "").slice(0, 200);
}
/** Text → Koordinaten (Suche bevorzugt die Gegend um Hof) */
async function suche(text: string): Promise<(Punkt & { adresse: string }) | null> {
  const q = text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=de&lat=50.31&lon=11.92`, { headers: { "user-agent": UA } });
    if (r.ok) { const f = (await r.json()).features?.[0]; if (f) return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], adresse: photonText(f.properties || {}) || q }; }
  } catch { /* Rückfall */ }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=de,at,cz,ch&accept-language=de&q=${encodeURIComponent(q)}`, { headers: { "user-agent": UA } });
  if (!r.ok) return null;
  const j = (await r.json())[0]; if (!j) return null;
  return { lat: Number(j.lat), lon: Number(j.lon), adresse: String(j.display_name || q).split(", ").slice(0, 4).join(", ") };
}
/** Straßen-Kilometer und Fahrzeit (schnellste Route) */
async function route(a: Punkt, b: Punkt): Promise<{ km: number; min: number } | null> {
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`, { headers: { "user-agent": UA } });
  if (!r.ok) return null;
  const j = await r.json(); const x = j.routes?.[0]; if (!x) return null;
  return { km: Math.round(x.distance / 100) / 10, min: Math.round(x.duration / 60) };
}

/** Schnellste Route plus bis zu zwei Alternativen (andere Strecke, z. B. über die Autobahn statt durch den Ort) */
async function routen(a: Punkt, b: Punkt): Promise<{ km: number; min: number }[]> {
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false&alternatives=3`, { headers: { "user-agent": UA } });
  if (!r.ok) return [];
  const j = await r.json();
  // deno-lint-ignore no-explicit-any
  const L = (j.routes || []).map((x: any) => ({ km: Math.round(x.distance / 100) / 10, min: Math.round(x.duration / 60) }));
  // deno-lint-ignore no-explicit-any
  return L.filter((x: any, i: number) => L.findIndex((y: any) => Math.abs(y.km - x.km) < 0.3) === i).slice(0, 3);
}

const antwort = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), {
  status, headers: { ...CORS, "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const u = new URL(req.url);
  const p: Record<string, unknown> = Object.fromEntries(u.searchParams);
  if (req.method === "POST") { try { Object.assign(p, await req.json()); } catch { /* nur Query */ } }
  const k = String(p.k ?? p.geheim ?? ""), a = String(p.a ?? p.art ?? "").toLowerCase();
  if (!k) return antwort("Fahrtenbuch-Endpunkt: Zugangsschlüssel fehlt.", 401);
  try {
    if (a === "start" || a === "ende") {
      const lat = zahl(p.lat), lon = zahl(p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return antwort("Standort fehlt (lat/lon).", 400);
      const r = await rpc("fahrt_punkt", { p_geheim: k, p_art: a, p_lat: lat, p_lon: lon, p_genau: Number.isFinite(zahl(p.genau)) ? zahl(p.genau) : null, p_quelle: String(p.q ?? "carplay").slice(0, 20) });
      if (r?.fortgesetzt) return antwort("✓ Fahrt geht weiter");
      // Adressen + Strecke: im Hintergrund nachtragen, damit der Kurzbefehl sofort fertig ist
      const arbeit = (async () => {
        const hier = { lat, lon }, d: Record<string, unknown> = {};
        const s = r?.start && Number.isFinite(Number(r.start.lat)) ? { lat: Number(r.start.lat), lon: Number(r.start.lon) } : null;
        const [ad, rt] = await Promise.all([mitZeit(adresse(hier)), a === "ende" && s ? mitZeit(route(s, hier)) : Promise.resolve(null)]);
        if (ad) d[a === "start" ? "startAdresse" : "endeAdresse"] = ad;
        if (rt) { d.kmRoute = rt.km; d.minRoute = rt.min; }
        if (a === "ende" && s && !r?.start?.adresse) { const sa = await mitZeit(adresse(s)); if (sa) d.startAdresse = sa; }
        if (Object.keys(d).length) await rpc("fahrt_ergaenzen", { p_geheim: k, p_id: r.id, p_daten: d });
      })().catch(e => console.warn("Ergänzen:", (e as Error).message));
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(arbeit); else await arbeit;
      return antwort(a === "start" ? "✓ Fahrt gestartet" : "✓ Fahrt beendet – im CRM benennen");
    }
    if (a === "strecke") {
      // Prüft den Zugangsschlüssel ohne etwas zu schreiben (unbekannte Fahrt-ID → false)
      await rpc("fahrt_ergaenzen", { p_geheim: k, p_id: "-", p_daten: {} });
      const ort = async (t: unknown, la: unknown, lo: unknown) => Number.isFinite(zahl(la)) && Number.isFinite(zahl(lo))
        ? { lat: zahl(la), lon: zahl(lo), adresse: (await mitZeit(adresse({ lat: zahl(la), lon: zahl(lo) }))) || "" }
        : (String(t ?? "").trim() ? await mitZeit(suche(String(t))) : null);
      const [von, nach] = await Promise.all([ort(p.von, p.vonLat, p.vonLon), ort(p.nach, p.nachLat, p.nachLon)]);
      if (!von || !nach) return antwort({ ok: false, fehler: !von ? "Start nicht gefunden" : "Ziel nicht gefunden" }, 200);
      const rts = (await mitZeit(routen(von, nach), 8000)) || [], rt = rts[0] || (await mitZeit(route(von, nach), 6000));
      return antwort({ ok: !!rt, von, nach, km: rt?.km ?? null, min: rt?.min ?? null, alternativen: rts.slice(1) });
    }
    return antwort("Unbekannte Aktion (a=start|ende|strecke).", 400);
  } catch (e) {
    const m = (e as Error).message || "Fehler";
    return antwort(/nicht erlaubt/.test(m) ? "Zugangsschlüssel ungültig – im CRM unter Fahrtenbuch → Einrichten neu kopieren." : "Fehler: " + m, /nicht erlaubt/.test(m) ? 403 : 500);
  }
});
