// Keuerleber CRM – E-Mail senden (Supabase Edge Function „mailsenden“).
//
// Das CRM schickt eine Mail über das eigene Strato-Postfach (SMTP, Port 465) und legt eine Kopie im Ordner „Gesendet“ ab (IMAP),
// damit sie auch in Outlook erscheint und der Mail-Abgleich sie dem Kontakt zuordnet.
//   POST { an, cc?, bcc?, betreff, text, html?, antwortAuf? }   mit dem Login des CRM-Benutzers (Authorization: Bearer <Sitzung>)
//   → { ok, id, abgelegt }  |  { ok: false, fehler }
//   POST { pruefen: true } → { ok, postfach }   (meldet sich nur am Postfach an, sendet nichts)
// Zugang: Der angemeldete Benutzer (mit 2FA) holt per mailsenden_ticket() einen Einmal-Schein; nur diese Funktion kann ihn
// gegen die Postfach-Daten aus dem Vault eintauschen (mailsenden_start, nur service_role). Das Passwort verlässt den Server nie.
// Gesendet wird ausschließlich auf ausdrücklichen Klick im CRM. Keine Mail-Inhalte in Logs.

const SMTP_HOST = Deno.env.get("MAILSENDEN_SMTP_HOST") ?? "smtp.strato.de";
const SMTP_PORT = Number(Deno.env.get("MAILSENDEN_SMTP_PORT") ?? "465");
const IMAP_HOST = Deno.env.get("MAILSYNC_IMAP_HOST") ?? "imap.strato.de";
const IMAP_PORT = Number(Deno.env.get("MAILSYNC_IMAP_PORT") ?? "993");
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const erster = (name: string) => { try { return Object.values(JSON.parse(Deno.env.get(name) ?? "{}") as Record<string, string>)[0] ?? ""; } catch { return ""; } };
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || erster("SUPABASE_SECRET_KEYS");
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || erster("SUPABASE_PUBLISHABLE_KEYS");
const SENT_NAMES = new Set(["sent", "gesendet", "gesendete objekte", "gesendete elemente", "sent items", "sent messages", "gesendete nachrichten"]);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const enc = new TextEncoder(), dec = new TextDecoder();
// deno-lint-ignore no-explicit-any
type J = Record<string, any>;
class Meldung extends Error {}

const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const b64text = (s: string) => b64(enc.encode(s));
const zeilen76 = (s: string) => s.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");
/** Kopfzeilen-Text: ASCII bleibt, sonst RFC 2047 (UTF-8, Base64) in Stücken */
function kopf(s: string): string {
  const t = s.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(t)) return t;
  const out: string[] = []; let teil = "";
  for (const ch of t) { if (enc.encode(teil + ch).length > 42) { out.push(teil); teil = ""; } teil += ch; }
  if (teil) out.push(teil);
  return out.map(x => `=?UTF-8?B?${b64text(x)}?=`).join("\r\n ");
}
const ADR = /^[^\s<>@,;"()]+@[^\s<>@,;"()]+\.[a-z0-9-]{2,}$/i;
function adressen(v: unknown): string[] {
  const L = (Array.isArray(v) ? v : String(v ?? "").split(/[,;\n]/)).map(x => String(x).trim().replace(/^.*<([^>]+)>\s*$/, "$1").toLowerCase()).filter(Boolean);
  for (const a of L) if (!ADR.test(a) || a.length > 200) throw new Meldung(`„${a.slice(0, 60)}“ ist keine gültige E-Mail-Adresse.`);
  return [...new Set(L)];
}

/** Zeilenweise TLS-Verbindung (SMTP und IMAP) */
class Leitung {
  private buf = new Uint8Array(0);
  constructor(private conn: Deno.Conn) {}
  static async auf(host: string, port: number) { return new Leitung(await Deno.connectTls({ hostname: host, port })); }
  private async mehr() {
    const chunk = new Uint8Array(16384), n = await this.conn.read(chunk);
    if (n === null) throw new Meldung("Verbindung zum Mailserver getrennt.");
    const all = new Uint8Array(this.buf.length + n); all.set(this.buf); all.set(chunk.subarray(0, n), this.buf.length); this.buf = all;
  }
  async zeile(): Promise<string> {
    for (;;) {
      const i = this.buf.indexOf(10);
      if (i >= 0) { const l = this.buf.subarray(0, i > 0 && this.buf[i - 1] === 13 ? i - 1 : i); this.buf = this.buf.subarray(i + 1); return dec.decode(l); }
      await this.mehr();
    }
  }
  async bytes(n: number) { while (this.buf.length < n) await this.mehr(); this.buf = this.buf.subarray(n); }
  async schreib(b: Uint8Array | string) { const d = typeof b === "string" ? enc.encode(b) : b; let o = 0; while (o < d.length) o += await this.conn.write(d.subarray(o)); }
  zu() { try { this.conn.close(); } catch { /* egal */ } }
}

async function smtp(z: J, an: string[], roh: Uint8Array | null) {
  const l = await Leitung.auf(SMTP_HOST, SMTP_PORT);
  const lies = async (ok: RegExp, was: string) => {
    let z0 = "";
    for (;;) { z0 = await l.zeile(); if (!/^\d{3}-/.test(z0)) break; }
    if (!ok.test(z0)) throw new Meldung(was + (/^5\d\d/.test(z0) ? ` (${z0.slice(0, 120)})` : ""));
  };
  const sag = async (c: string, ok: RegExp, was: string) => { await l.schreib(c + "\r\n"); await lies(ok, was); };
  try {
    await lies(/^220/, "Der Mailserver antwortet nicht.");
    await sag("EHLO keuerleber-immobilien.de", /^250/, "Der Mailserver lehnt die Verbindung ab.");
    await sag("AUTH LOGIN", /^334/, "Anmeldung am Postfach nicht möglich.");
    await sag(b64text(z.postfach), /^334/, "Anmeldung am Postfach nicht möglich.");
    await sag(b64text(z.passwort), /^235/, "Anmeldung am Strato-Postfach fehlgeschlagen – Passwort geändert? Bitte im CRM unter Automationen neu eintragen.");
    if (!roh) { await l.schreib("QUIT\r\n").catch(() => {}); return; }   // nur Anmeldung prüfen
    await sag(`MAIL FROM:<${z.postfach}>`, /^250/, "Der Mailserver nimmt den Absender nicht an.");
    for (const a of an) await sag(`RCPT TO:<${a}>`, /^25[01]/, `Der Mailserver nimmt den Empfänger ${a} nicht an.`);
    await sag("DATA", /^354/, "Der Mailserver nimmt die Nachricht nicht an.");
    await l.schreib(roh); await l.schreib("\r\n.\r\n");
    await lies(/^250/, "Der Mailserver hat die Nachricht abgelehnt.");
    await l.schreib("QUIT\r\n").catch(() => {});
  } finally { l.zu(); }
}

/** Kopie in „Gesendet“ ablegen (als gelesen). Liefert den Ordnernamen oder "" */
async function ablegen(z: J, roh: Uint8Array): Promise<string> {
  const l = await Leitung.auf(IMAP_HOST, IMAP_PORT); let n = 0;
  const q = (s: string) => '"' + s.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
  const cmd = async (c: string, daten?: Uint8Array): Promise<string[]> => {
    const t = "M" + (++n), out: string[] = [];
    await l.schreib(`${t} ${c}\r\n`);
    for (;;) {
      const z0 = await l.zeile();
      if (z0.startsWith("+") && daten) { await l.schreib(daten); await l.schreib("\r\n"); daten = undefined; continue; }
      if (z0.startsWith(t + " ")) { if (!/^OK/i.test(z0.slice(t.length + 1))) throw new Meldung("IMAP: " + z0.slice(t.length + 1, t.length + 90)); return out; }
      const lit = z0.match(/\{(\d+)\}$/); if (lit) { await l.bytes(Number(lit[1])); continue; }   // Ordnernamen als Literal: überspringen
      out.push(z0);
    }
  };
  try {
    if (!/^\* (OK|PREAUTH)/i.test(await l.zeile())) return "";
    if (/^[\x20-\x7e]*$/.test(z.passwort)) await cmd(`LOGIN ${q(z.postfach)} ${q(z.passwort)}`);
    else await cmd("AUTHENTICATE PLAIN", enc.encode(b64text(`\u0000${z.postfach}\u0000${z.passwort}`)));
    let ordner = "", ersatz = "";
    for (const z0 of await cmd('LIST "" "*"')) {
      const m = z0.match(/^\* LIST \(([^)]*)\)\s+(?:"(?:[^"\\]|\\.)*"|NIL)\s+(.+)$/i); if (!m || /\\noselect/i.test(m[1])) continue;
      let name = m[2].trim(); if (name.length >= 2 && name[0] === '"' && name.endsWith('"')) name = name.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
      if (/\\sent/i.test(m[1])) { ordner = name; break; }
      if (!ersatz && SENT_NAMES.has(name.split(/[/.]/).pop()!.trim().toLowerCase())) ersatz = name;
    }
    ordner ||= ersatz; if (!ordner) return "";
    await cmd(`APPEND ${q(ordner)} (\\Seen) {${roh.length}}`, roh);
    await cmd("LOGOUT").catch(() => {});
    return ordner;
  } finally { l.zu(); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return antwort({ ok: false, fehler: "nur POST" }, 405);
  let b: J;
  try { const t = await req.text(); if (t.length > 300000) return antwort({ ok: false, fehler: "Die Nachricht ist zu lang." }, 413); b = JSON.parse(t); } catch { return antwort({ ok: false, fehler: "kein JSON" }, 400); }
  try {
    // 1) Wer ruft? Einmal-Schein mit dem Login des Benutzers holen, dann serverseitig gegen die Postfach-Daten tauschen
    const auth = req.headers.get("authorization") ?? "";
    const tr = await fetch(`${SB_URL}/rest/v1/rpc/mailsenden_ticket`, { method: "POST", headers: { apikey: SB_ANON, authorization: auth, "content-type": "application/json" }, body: "{}" });
    if (!tr.ok) return antwort({ ok: false, fehler: "Nicht angemeldet – bitte im CRM neu anmelden." }, 401);
    const ticket = await tr.json();
    const zr = await fetch(`${SB_URL}/rest/v1/rpc/mailsenden_start`, { method: "POST", headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ p_ticket: ticket }) });
    const z: J = zr.ok ? await zr.json() : { ok: false };
    if (!z?.ok) return antwort({ ok: false, fehler: z?.grund === "kein Postfach" ? "Es ist noch kein Postfach hinterlegt (CRM → Automationen → Mail-Abgleich)." : "Nicht erlaubt." }, 403);
    if (b.pruefen) { await smtp(z, [], null); return antwort({ ok: true, postfach: z.postfach }); }   // Verbindung + Anmeldung testen, nichts senden

    // 2) Nachricht prüfen und bauen
    const an = adressen(b.an), cc = adressen(b.cc), bcc = adressen(b.bcc);
    if (!an.length) throw new Meldung("Bitte einen Empfänger angeben.");
    if (an.length + cc.length + bcc.length > 20) throw new Meldung("Höchstens 20 Empfänger je Mail.");
    const betreff = String(b.betreff ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 250), text = String(b.text ?? "").replace(/\r\n?/g, "\n");
    if (!betreff) throw new Meldung("Bitte einen Betreff angeben.");
    if (!text.trim()) throw new Meldung("Die Nachricht ist leer.");
    const name = String(z.name ?? "").replace(/["\r\n]/g, "").trim().slice(0, 80);
    const id = `<${crypto.randomUUID()}@${String(z.postfach).split("@")[1] || "keuerleber-immobilien.de"}>`;
    const bezug = String(b.antwortAuf ?? "").trim(), bezugOk = /^<[^<>\s]{3,300}>$/.test(bezug);
    const kopfZ = [
      `From: ${name ? `${/^[\x20-\x7e]*$/.test(name) ? `"${name}"` : kopf(name)} ` : ""}<${z.postfach}>`,
      `To: ${an.join(", ")}`, ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
      `Subject: ${kopf(betreff)}`, `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`, `Message-ID: ${id}`,
      ...(bezugOk ? [`In-Reply-To: ${bezug}`, `References: ${bezug}`] : []),
      "MIME-Version: 1.0", "X-Mailer: Keuerleber CRM",
    ];
    // Mit HTML-Fassung (Signatur mit Logo): multipart/alternative – Text zuerst, HTML danach
    const htmlT = typeof b.html === "string" && b.html.trim() && b.html.length <= 200000 ? b.html.replace(/\r\n?/g, "\n") : "";
    const teil = (typ: string, inhalt: string) => `Content-Type: ${typ}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${zeilen76(b64text(inhalt.replace(/\n/g, "\r\n")))}\r\n`;
    const grenze = "kre-" + crypto.randomUUID().replaceAll("-", "");
    const rumpf = htmlT
      ? `Content-Type: multipart/alternative; boundary="${grenze}"\r\n\r\n--${grenze}\r\n${teil("text/plain", text)}--${grenze}\r\n${teil("text/html", `<!doctype html><html><body>${htmlT}</body></html>`)}--${grenze}--\r\n`
      : teil("text/plain", text);
    const roh = enc.encode(kopfZ.join("\r\n") + "\r\n" + rumpf);

    // 3) Senden, dann Kopie in „Gesendet“ (scheitert die Ablage, ist die Mail trotzdem raus)
    await smtp(z, [...new Set([...an, ...cc, ...bcc])], roh);
    let ordner = "";
    try { ordner = await ablegen(z, roh); } catch (_e) { /* nur die Ablage fehlt */ }
    return antwort({ ok: true, id, abgelegt: !!ordner, von: z.postfach });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Meldung ? e.message : "Senden fehlgeschlagen – bitte später noch einmal versuchen." }, e instanceof Meldung ? 400 : 502);
  }
});
