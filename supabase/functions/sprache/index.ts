// Keuerleber CRM – Text vorlesen (Supabase Edge Function „sprache“).
//
// Macht aus einem kurzen Text (Morgen-Briefing) eine Sprachaufnahme mit einer ElevenLabs-Stimme.
//   POST { text }   mit dem Login des CRM-Benutzers (Authorization: Bearer <Sitzung>)   → audio/mpeg
//   POST { pruefen: true } → { ok, eingerichtet }
// Der ElevenLabs-Schlüssel liegt nur hier als Secret ELEVENLABS_API_KEY – nie im Browser und nie im Repository.
// Stimme: Secret ELEVENLABS_VOICE_ID (sonst die unten hinterlegte ruhige deutsche Stimme). Keine Texte in Logs.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const erster = (name: string) => { try { return Object.values(JSON.parse(Deno.env.get(name) ?? "{}") as Record<string, string>)[0] ?? ""; } catch { return ""; } };
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || erster("SUPABASE_PUBLISHABLE_KEYS");
const KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const STIMME = Deno.env.get("ELEVENLABS_VOICE_ID") || "MMwckqU477oQxnAk1SgA";   // „Ben – Conversational Voice“: ruhig, natürlich, deutsch
const MODELL = Deno.env.get("ELEVENLABS_MODEL") || "eleven_multilingual_v2";
const MAX = 900;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });

/** Nur ein angemeldeter CRM-Benutzer darf vorlesen lassen (der öffentliche Schlüssel allein reicht nicht) */
async function benutzer(req: Request): Promise<string> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token === SB_ANON) return "";
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, authorization: `Bearer ${token}` } });
    if (!r.ok) return "";
    return String((await r.json())?.id ?? "");
  } catch { return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return antwort({ ok: false, fehler: "Nur POST" }, 405);
  if (!(await benutzer(req))) return antwort({ ok: false, fehler: "Nicht angemeldet" }, 401);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* leer */ }
  if (b.pruefen) return antwort({ ok: true, eingerichtet: !!KEY });
  if (!KEY) return antwort({ ok: false, fehler: "ElevenLabs ist noch nicht eingerichtet (Secret ELEVENLABS_API_KEY fehlt)." }, 503);
  const text = String(b.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return antwort({ ok: false, fehler: "Kein Text" }, 400);
  if (text.length > MAX) return antwort({ ok: false, fehler: `Text zu lang (höchstens ${MAX} Zeichen)` }, 413);
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(STIMME)}?output_format=mp3_44100_128`, {
      method: "POST", headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODELL, voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.1, speed: 0.97 } }),
    });
    if (!r.ok) {
      let grund = ""; try { const j = await r.json(); grund = String(j?.detail?.message ?? j?.detail?.status ?? "").slice(0, 160); } catch { /* egal */ }
      console.log("sprache: ElevenLabs", r.status);
      return antwort({ ok: false, fehler: `ElevenLabs hat abgelehnt (${r.status})${grund ? ": " + grund : ""}` }, 502);
    }
    return new Response(r.body, { headers: { ...CORS, "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch { return antwort({ ok: false, fehler: "ElevenLabs nicht erreichbar" }, 502); }
});
