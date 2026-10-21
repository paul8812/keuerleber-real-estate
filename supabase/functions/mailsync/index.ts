// deno-lint-ignore-file no-explicit-any no-control-regex -- JSON-Datensätze des CRM; \u0000 markiert IMAP-Literale
// Keuerleber CRM – Mail-Abgleich auf dem Server (Supabase Edge Function).
// Nachfolger von ~/crm-mailsync/crm_mailsync.py (lief nur, solange Pauls Mac an war).
//
// Wird alle 3 Minuten von pg_cron aufgerufen (siehe MAILSYNC_SQL in crm/js/db.js) und
//   - liest neue Mails im Strato-Postfach (IMAP, nur lesend: BODY.PEEK – Mails bleiben ungelesen),
//   - schreibt Anfragen (Website, ImmoScout24, Immowelt, Kleinanzeigen) als Kontakt/Vorgang/Aufgabe ins CRM,
//   - Mails bekannter Kontakte → Verlauf + Aufgabe „Antworten“, gesendete Antworten → Verlauf, Aufgaben erledigt,
//   - unbekannte Absender → CRM-Posteingang.
// Es wird nie etwas gesendet, verschoben oder gelöscht.
//
// Zugang: Das Strato-Passwort liegt verschlüsselt im Supabase Vault (gesetzt über die CRM-Karte),
// der Aufruf ist durch einen Zufallswert in privat.mailsync geschützt (Header x-mailsync).
// Keine Mail-Inhalte in Logs.

const VERSION = "2.0 (Server)";
const IMAP_HOST = Deno.env.get("MAILSYNC_IMAP_HOST") ?? "imap.strato.de";
const IMAP_PORT = Number(Deno.env.get("MAILSYNC_IMAP_PORT") ?? "993");
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_PER_RUN = 25;
const TZ = "Europe/Berlin";

const PORTALE: Record<string, string> = {
  "immobilienscout24.de": "ImmoScout24", "is24.de": "ImmoScout24", "scout24.com": "ImmoScout24",
  "immowelt.de": "Immowelt", "immonet.de": "Immowelt", "kleinanzeigen.de": "Kleinanzeigen",
  "ebay-kleinanzeigen.de": "Kleinanzeigen",
};
const FORMULARE: [string, string, string][] = [
  ["terminanfrage:", "termin", "Terminanfrage über die Website"],
  ["objektanfrage:", "objekt", "Objektanfrage über die Website"],
  ["neue anfrage:", "kontakt", "Anfrage über das Kontaktformular"],
  ["vorab-liste:", "vorab", "Eintragung in die Vorab-Liste"],
  ["neuer kontakt renditerechner:", "rendite", "Kontakt über den Renditerechner"],
];
const FELDER: Record<string, string[]> = {
  name: ["name", "anfrage von", "vor- und nachname", "ihr name", "vorname und nachname"],
  email: ["e-mail", "email", "e-mail-adresse", "mail", "ihre e-mail"],
  tel: ["telefon", "telefonnummer", "tel", "handy", "mobil", "anschrift", "rufnummer", "ihre telefonnummer"],
  betreff: ["betreff"],
  objekt: ["objekt", "immobilie", "objekttitel", "inserat"],
  termin: ["terminwunsch", "wunschtermin"],
  uhrzeit: ["uhrzeit"],
  art: ["art der beratung", "beratungsart"],
};
const MONATE: Record<string, number> = {
  januar: 1, februar: 2, "märz": 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};
const SENT_NAMES = new Set(["sent", "gesendet", "gesendete objekte", "gesendete elemente", "sent items", "sent messages", "gesendete nachrichten"]);

// ================================================================ Hilfen

type Rec = Record<string, any>;
const nowIso = () => new Date().toISOString();
const isoUtc = (d: Date | null) => (d ? d.toISOString() : nowIso());

export function sha1(s: string): string {
  const msg = new TextEncoder().encode(s);
  const buf = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  buf.set(msg); buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer), bits = msg.length * 8;
  dv.setUint32(buf.length - 4, bits >>> 0); dv.setUint32(buf.length - 8, Math.floor(bits / 2 ** 32));
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, "0")).join("");
}

function norm(s: string): string {
  s = (s || "").toLowerCase().replaceAll("ß", "ss").replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue");
  return s.replace(/[^a-z0-9@. ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Datum/Uhrzeit in Berlin: {date:'YYYY-MM-DD', hour, weekday(0=So)} */
function berlin(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
const wd = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextWorkday(iso: string): string {
  let d = addDays(iso, 1);
  while (wd(d) === 0 || wd(d) === 6) d = addDays(d, 1);
  return d;
}
const todayBerlin = () => berlin(new Date()).date;
function dueFor(dt: Date | null): string {
  const l = berlin(dt ?? new Date());
  let d = l.date;
  if (l.hour >= 16 || l.weekday === 0 || l.weekday === 6) d = nextWorkday(d);
  const t = todayBerlin();
  return d > t ? d : t;
}
const deDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

function fullName(c: Rec): string {
  const n = [c.vorname, c.nachname].filter(Boolean).join(" ");
  return n || c.firma || c.email || "(ohne Name)";
}
function splitName(name: string): [string, string] {
  name = (name || "").replaceAll('"', "").replace(/\s+/g, " ").trim();
  if (!name || name.includes("@")) return ["", ""];
  if (name.includes(",")) {
    const i = name.indexOf(",");
    return [name.slice(i + 1).trim(), name.slice(0, i).trim()];
  }
  const p = name.split(" ");
  return p.length > 1 ? [p.slice(0, -1).join(" "), p[p.length - 1]] : ["", p[0]];
}

// ================================================================ MIME (nur was der Abgleich braucht)

const latin1 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; };
const bytesOf = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };

function decodeCharset(b: Uint8Array, cs = "utf-8"): string {
  cs = (cs || "utf-8").toLowerCase().replace(/^"|"$/g, "");
  if (cs === "us-ascii" || cs === "ascii") cs = "utf-8";
  try { return new TextDecoder(cs).decode(b); } catch { /* unbekannter Zeichensatz */ }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1252").decode(b); }
}
/** 8-Bit-Kopfzeilen (roh UTF-8 oder Latin-1) */
function headerText(bin: string): string {
  if (!/[\x80-\xff]/.test(bin)) return bin;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytesOf(bin)); } catch { return new TextDecoder("windows-1252").decode(bytesOf(bin)); }
}
function b64bytes(s: string): Uint8Array {
  s = s.replace(/[^A-Za-z0-9+/]/g, "");
  s = s.slice(0, s.length - (s.length % 4 === 1 ? 1 : 0));
  while (s.length % 4) s += "=";
  try { return bytesOf(atob(s)); } catch { return new Uint8Array(); }
}
function qpBytes(s: string, header = false): Uint8Array {
  if (header) s = s.replaceAll("_", " ");
  s = s.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else out.push(s.charCodeAt(i) & 255);
  }
  return new Uint8Array(out);
}
/** RFC 2047: =?utf-8?Q?...?= / =?iso-8859-1?B?...?= */
function decodeWords(s: string): string {
  return headerText(s).replace(/(=\?[^?\s]+\?[QqBb]\?[^?\s]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?\s]+)\?([QqBb])\?([^?\s]*)\?=/g, (_m, cs, enc, txt) => {
      const b = enc.toUpperCase() === "B" ? b64bytes(txt) : qpBytes(txt, true);
      return decodeCharset(b, String(cs).split("*")[0]);
    });
}
function parseHeaders(bin: string): Map<string, string[]> {
  const h = new Map<string, string[]>();
  for (const line of bin.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    if (!h.has(k)) h.set(k, []);
    h.get(k)!.push(line.slice(i + 1).trim());
  }
  return h;
}
function params(v: string): { value: string; p: Record<string, string> } {
  const parts = v.match(/(?:[^;"]+|"(?:[^"\\]|\\.)*")+/g) ?? [""];
  const p: Record<string, string> = {};
  for (const x of parts.slice(1)) {
    const i = x.indexOf("=");
    if (i < 0) continue;
    const k = x.slice(0, i).trim().toLowerCase();
    let val = x.slice(i + 1).trim().replace(/^"|"$/g, "").replace(/\\(.)/g, "$1");
    if (/\*\d*\*?$/.test(k)) { // RFC 2231 (filename*=utf-8''...)
      const base = k.replace(/\*\d*\*?$/, "");
      const m = val.match(/^([^']*)'[^']*'(.*)$/);
      val = m ? decodeCharset(bytesOf(decodeURIComponentSafe(m[2])), m[1] || "utf-8") : decodeURIComponentSafe(val);
      p[base] = (p[base] ?? "") + val;
    } else p[k] = val;
  }
  return { value: (parts[0] || "").trim().toLowerCase(), p };
}
function decodeURIComponentSafe(s: string): string {
  return s.replace(/%([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

type Leaf = { type: string; charset: string; attach: boolean; filename: string; bin: string; cte: string };
function walk(bin: string, depth: number, out: Leaf[], headers?: Map<string, string[]>) {
  const sep = bin.search(/\r?\n\r?\n/);
  const hb = sep < 0 ? bin : bin.slice(0, sep);
  const body = sep < 0 ? "" : bin.slice(sep).replace(/^\r?\n\r?\n/, "");
  const h = headers ?? parseHeaders(hb);
  const ct = params(h.get("content-type")?.[0] ?? "text/plain");
  const cd = params(h.get("content-disposition")?.[0] ?? "");
  if (ct.value.startsWith("multipart/") && ct.p.boundary && depth < 8) {
    const b = "--" + ct.p.boundary;
    const chunks = body.split(new RegExp("(?:^|\\r?\\n)" + b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:--)?[ \\t]*(?=\\r?\\n|$)"));
    for (const ch of chunks.slice(1)) {
      const c = ch.replace(/^\r?\n/, "");
      if (c.trim()) walk(c, depth + 1, out);
    }
    return;
  }
  const filename = decodeWords(cd.p.filename ?? ct.p.name ?? "");
  out.push({
    type: ct.value || "text/plain", charset: ct.p.charset ?? "utf-8", attach: cd.value === "attachment" || !!filename,
    filename, bin: body, cte: (h.get("content-transfer-encoding")?.[0] ?? "").toLowerCase(),
  });
}
function leafText(l: Leaf): string {
  const b = l.cte.includes("base64") ? b64bytes(l.bin) : l.cte.includes("quoted-printable") ? qpBytes(l.bin) : bytesOf(l.bin);
  return decodeCharset(b, l.charset);
}
const ENT: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", euro: "€", ndash: "–", mdash: "—", bdquo: "„", ldquo: "“", rdquo: "”", middot: "·" };
function htmlToText(h: string): string {
  h = h.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<\/t[dh]>/gi, "\t").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/h\d>|<\/li>/gi, "\n").replace(/<[^>]+>/g, " ");
  h = h.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] ?? m));
  h = h.replace(/[  ]+/g, " ").replace(/ *\t */g, "\t");
  return h.replace(/\n\s*\n+/g, "\n\n").trim();
}

function parseAddr(v: string): [string, string] {
  v = (v || "").trim();
  const m = v.match(/^(.*?)<([^>]*)>\s*$/);
  if (m) return [m[1].trim().replace(/^"|"$/g, "").replace(/\\(.)/g, "$1").trim(), m[2].trim()];
  const c = v.match(/^([^\s(]+@[^\s(]+)\s*\((.*)\)$/);
  if (c) return [c[2].trim(), c[1]];
  return ["", v.includes("@") ? v.replace(/^"|"$/g, "") : ""];
}
function getAddresses(...vals: string[]): string[] {
  const out: string[] = [];
  for (const v of vals) for (const part of (v || "").match(/(?:[^,"<]+|"(?:[^"\\]|\\.)*"|<[^>]*>)+/g) ?? []) {
    const a = parseAddr(part)[1];
    if (a) out.push(a.toLowerCase());
  }
  return out;
}

type Mail = {
  key: string; folder: string; uid: number; message_id: string; datum: Date | null;
  von: string; von_name: string; von_adresse: string; antwort_an: string; antwort_name: string;
  an: string; cc: string; betreff: string; text: string; anhaenge: string[]; massenmail: boolean; automatisch: boolean;
};
function parseMail(raw: Uint8Array, folder: string, uid: number): Mail {
  const bin = latin1(raw);
  const sep = bin.search(/\r?\n\r?\n/);
  const h = parseHeaders(sep < 0 ? bin : bin.slice(0, sep));
  const hdr = (n: string) => decodeWords(h.get(n)?.[0] ?? "").trim();
  const leaves: Leaf[] = [];
  walk(bin, 0, leaves, h);
  const plain = leaves.find((l) => !l.attach && l.type === "text/plain");
  const html = leaves.find((l) => !l.attach && l.type === "text/html");
  let text = plain ? leafText(plain) : html ? htmlToText(leafText(html)) : "";
  text = text.replaceAll("\r\n", "\n").replace(/\n{3,}/g, "\n\n").trim();
  const frm = hdr("from"), reply = hdr("reply-to");
  let datum: Date | null = null;
  const ds = hdr("date").replace(/\([^)]*\)/g, "").trim();
  if (ds) { const d = new Date(ds); if (!isNaN(d.getTime())) datum = d; }
  const mid = hdr("message-id"), subject = hdr("subject");
  const key = sha1(mid || `${hdr("date")}|${frm}|${subject}`).slice(0, 20);
  const [vn, va] = parseAddr(frm), [rn, ra] = reply ? parseAddr(reply) : ["", ""];
  const prec = hdr("precedence").toLowerCase(), auto = hdr("auto-submitted").toLowerCase();
  return {
    key, folder, uid, message_id: mid, datum, von: frm, von_name: vn, von_adresse: va.toLowerCase(),
    antwort_an: ra.toLowerCase(), antwort_name: rn, an: hdr("to"), cc: hdr("cc"), betreff: subject, text,
    anhaenge: leaves.filter((l) => l.attach && l.filename).map((l) => l.filename),
    massenmail: !!hdr("list-unsubscribe") || ["bulk", "list", "junk"].includes(prec),
    automatisch: (!!auto && auto !== "no") || !!hdr("x-autoreply") || !!hdr("x-autorespond"),
  };
}

// ================================================================ IMAP (TLS, nur lesend)

class ImapError extends Error {}
type Resp = { line: string; lits: Uint8Array[] };
const enc = new TextEncoder(), dec = new TextDecoder();
const quote = (s: string) => '"' + s.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';

class Imap {
  private buf = new Uint8Array(0);
  private tag = 0;
  constructor(private conn: Deno.Conn) {}

  static async connect(opts: Rec = {}): Promise<Imap> {
    const conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT, ...opts });
    const i = new Imap(conn);
    const g = await i.response();
    if (!/^\* (OK|PREAUTH)/i.test(g.line)) throw new ImapError("Mailserver antwortet nicht wie erwartet");
    return i;
  }
  /** liest, bis mindestens `need` Bytes gepuffert sind – Teile werden nur einmal zusammengesetzt */
  private async fill(need: number) {
    const parts = [this.buf];
    let len = this.buf.length;
    do {
      const chunk = new Uint8Array(Math.max(65536, Math.min(need - len, 4 << 20)));
      const n = await this.conn.read(chunk);
      if (n === null) throw new ImapError("Verbindung zum Mailserver getrennt");
      parts.push(chunk.subarray(0, n)); len += n;
    } while (len < need);
    const all = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    this.buf = all;
  }
  private async line(): Promise<string> {
    let from = 0;
    for (;;) {
      for (let i = this.buf.indexOf(13, from); i >= 0 && i + 1 < this.buf.length; i = this.buf.indexOf(13, i + 1)) {
        if (this.buf[i + 1] === 10) { const l = this.buf.subarray(0, i); this.buf = this.buf.subarray(i + 2); return dec.decode(l); }
      }
      from = Math.max(0, this.buf.length - 1);
      await this.fill(this.buf.length + 1);
    }
  }
  private async bytes(n: number): Promise<Uint8Array> {
    if (this.buf.length < n) await this.fill(n);
    const b = this.buf.slice(0, n); this.buf = this.buf.subarray(n); return b;
  }
  private async response(): Promise<Resp> {
    let line = ""; const lits: Uint8Array[] = [];
    for (;;) {
      const l = await this.line();
      const m = l.match(/\{(\d+)\}$/);
      if (!m) { line += l; return { line, lits }; }
      line += l.slice(0, -m[0].length) + `\u0000${lits.length}\u0000`;
      lits.push(await this.bytes(Number(m[1])));
    }
  }
  private async write(s: string) { const b = enc.encode(s); let o = 0; while (o < b.length) o += await this.conn.write(b.subarray(o)); }
  async cmd(c: string, cont?: string): Promise<Resp[]> {
    const t = "A" + (++this.tag);
    await this.write(`${t} ${c}\r\n`);
    const out: Resp[] = [];
    for (;;) {
      const r = await this.response();
      if (r.line.startsWith("+") && cont !== undefined) { await this.write(cont + "\r\n"); cont = undefined; continue; }
      if (r.line.startsWith(t + " ")) {
        const st = r.line.slice(t.length + 1);
        if (!/^OK/i.test(st)) throw new ImapError(st);
        return out;
      }
      out.push(r);
    }
  }
  async login(user: string, pw: string) {
    try {
      if (/^[\x20-\x7e]*$/.test(pw)) await this.cmd(`LOGIN ${quote(user)} ${quote(pw)}`);
      else {
        const b = enc.encode(`\u0000${user}\u0000${pw}`);
        await this.cmd("AUTHENTICATE PLAIN", btoa(latin1(b)));
      }
    } catch (e) {
      if (e instanceof ImapError) throw new ImapError("Anmeldung am Strato-Postfach fehlgeschlagen – Passwort geändert? Bitte im CRM unter Automationen neu eintragen.");
      throw e;
    }
  }
  async status(folder: string): Promise<{ validity: string; next: number }> {
    const r = await this.cmd(`STATUS ${quote(folder)} (UIDNEXT UIDVALIDITY)`);
    const s = r.map((x) => x.line).join(" ");
    return { validity: s.match(/UIDVALIDITY (\d+)/)?.[1] ?? "", next: Number(s.match(/UIDNEXT (\d+)/)?.[1] ?? 1) };
  }
  async sentFolders(): Promise<string[]> {
    const out: string[] = [];
    for (const r of await this.cmd('LIST "" "*"')) {
      const line = r.line.replace(/\u0000(\d+)\u0000/g, (_m, i) => quote(dec.decode(r.lits[Number(i)])));
      const m = line.match(/^\* LIST \(([^)]*)\)\s+(?:"(?:[^"\\]|\\.)*"|NIL)\s+(.+)$/i);
      if (!m) continue;
      let name = m[2].trim();
      if (name.length >= 2 && name[0] === '"' && name.endsWith('"')) name = name.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
      const leaf = mutf7(name).split(/[/.]/).pop()!.trim().toLowerCase();
      if (/\\sent/i.test(m[1]) || SENT_NAMES.has(leaf)) out.push(name);
    }
    return out;
  }
  async fetchNew(folder: string, st: Rec, limit: number): Promise<[Mail[], Rec]> {
    const { validity, next } = await this.status(folder);
    const last = Number(st?.last ?? 0);
    if (!st || !Object.keys(st).length || (st.validity && validity !== String(st.validity))) return [[], { validity, last: Math.max(next - 1, 0) }];
    await this.cmd(`EXAMINE ${quote(folder)}`);
    const sr = await this.cmd(`UID SEARCH UID ${last + 1}:*`);
    const uids = sr.flatMap((r) => (r.line.match(/^\* SEARCH(.*)$/i)?.[1] ?? "").trim().split(/\s+/)).map(Number)
      .filter((u) => u > last).sort((a, b) => a - b).slice(0, limit);
    if (!uids.length) return [[], { validity, last }];
    const fr = await this.cmd(`UID FETCH ${uids.join(",")} (UID BODY.PEEK[]<0.1500000>)`);
    const mails: Mail[] = [];
    for (const r of fr) {
      const u = Number(r.line.match(/UID (\d+)/)?.[1] ?? 0);
      if (!u || !r.lits.length) continue;
      try { mails.push(parseMail(r.lits[r.lits.length - 1], folder, u)); }
      catch (e) { console.log(`Mail ${u} nicht lesbar: ${(e as Error).message}`); }
    }
    mails.sort((a, b) => a.uid - b.uid);
    return [mails, { validity, last: uids[uids.length - 1] }];
  }
  async logout() { try { await this.cmd("LOGOUT"); } catch { /* egal */ } try { this.conn.close(); } catch { /* egal */ } }
}

function mutf7(s: string): string {
  return s.replace(/&([^-]*)-/g, (_m, chunk) => {
    if (!chunk) return "&";
    const b = b64bytes(chunk.replaceAll(",", "/"));
    let out = "";
    for (let i = 0; i + 1 < b.length; i += 2) out += String.fromCharCode((b[i] << 8) | b[i + 1]);
    return out;
  });
}

// ================================================================ Auswertung (wie crm_mailsync.py)

function fields(text: string): Rec {
  const out: Rec = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-zÄÖÜäöüß .\-]{2,32}?)\s*(?::|\t)\s*(.+?)\s*$/);
    if (!m) continue;
    const label = m[1].trim().toLowerCase().replace(/\.$/, ""), val = m[2].trim();
    if (["—", "-", "–"].includes(val)) continue;
    for (const [k, names] of Object.entries(FELDER)) if (names.includes(label) && !(k in out)) out[k] = val;
  }
  return out;
}
function messagePart(text: string): string {
  for (const marker of ["─── Nachricht", "─── Anmerkungen"]) {
    const i = text.indexOf(marker);
    if (i < 0) continue;
    let part = text.slice(i + marker.length);
    const nl = part.indexOf("\n");
    part = nl >= 0 ? part.slice(nl + 1) : "";
    part = part.split("═══")[0].trim();
    if (part && part !== "—") return part;
  }
  return "";
}
const EMAIL_RE = /[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/g;
const isEmail = (s: string) => /^[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+$/.test(s);
function isServiceAddr(addr: string, own: string): boolean {
  const d = addr.split("@").pop()!.toLowerCase();
  return addr === own || d === own.split("@").pop() || d.includes("web3forms") || addr.includes("noreply") || addr.includes("no-reply") ||
    Object.keys(PORTALE).some((p) => p !== "kleinanzeigen.de" && (d === p || d.endsWith("." + p)));
}
function leadEmail(m: Mail, f: Rec, own: string): string {
  const cand: string[] = [];
  if (f.email) cand.push(...(f.email.match(EMAIL_RE) ?? []));
  if (m.antwort_an) cand.push(m.antwort_an);
  cand.push(...(m.text.match(EMAIL_RE) ?? []));
  for (let c of cand) { c = c.toLowerCase().replace(/^\.+|\.+$/g, ""); if (!isServiceAddr(c, own)) return c; }
  return "";
}
function leadPhone(f: Rec, text: string): string {
  if (f.tel && f.tel.replace(/\D/g, "").length >= 6) return f.tel.trim();
  const m = text.match(/(?:tel(?:efon)?\.?|handy|mobil)[^\d+]{0,12}((?:\+|0)[\d\s/()\-]{6,20}\d)/i);
  return m ? m[1].trim() : "";
}
function leadName(m: Mail, f: Rec): string {
  if (f.name && !isEmail(f.name.trim())) return f.name.trim();
  for (let n of [m.antwort_name, m.von_name]) {
    n = (n || "").replace(/\s+(via|über|ueber)\s+.*$/i, "").trim();
    if (n && !isEmail(n) && !/immoscout|immowelt|kleinanzeigen|web3forms|keuerleber/i.test(n)) return n;
  }
  return "";
}
function parseTermin(...texts: string[]): [string, string] {
  for (const t of texts) {
    if (!t) continue;
    let d = "", end = 0;
    let mm = t.match(new RegExp("(\\d{1,2})\\.\\s*(" + Object.keys(MONATE).join("|") + ")\\s+(\\d{4})", "i"));
    if (mm) { d = `${mm[3]}-${String(MONATE[mm[2].toLowerCase()]).padStart(2, "0")}-${mm[1].padStart(2, "0")}`; end = (mm.index ?? 0) + mm[0].length; }
    else {
      mm = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
      if (mm && +mm[2] >= 1 && +mm[2] <= 12 && +mm[1] >= 1 && +mm[1] <= 31) { d = `${mm[3]}-${mm[2].padStart(2, "0")}-${mm[1].padStart(2, "0")}`; end = (mm.index ?? 0) + mm[0].length; }
    }
    if (d) {
      const tm = t.slice(end).match(/\b(\d{1,2}):(\d{2})\b/) ?? t.match(/\b(\d{1,2}):(\d{2})\b/) ?? texts.join(" ").match(/\b(\d{1,2}):(\d{2})\b/);
      return [d, tm ? `${tm[1].padStart(2, "0")}:${tm[2]}` : ""];
    }
  }
  return ["", ""];
}
function formKind(m: Mail): [string, string] | null {
  const s = (m.betreff || "").trim().toLowerCase();
  for (const [prefix, kind, label] of FORMULARE) if (s.startsWith(prefix)) return [kind, label];
  if (m.von_adresse.includes("web3forms")) return ["kontakt", "Anfrage über die Website"];
  return null;
}
function portalOf(addr: string): string {
  const d = addr.split("@").pop()!.toLowerCase();
  for (const [p, name] of Object.entries(PORTALE)) if (d === p || d.endsWith("." + p)) return name;
  return "";
}

/** Website-Anfrage schon über website_anfragen (lead-sync.js) im CRM bzw. unterwegs dorthin? */
type Spiegel = { email: string; digits: string; at: number }[];
function digitsOf(s: string) { return (s || "").replace(/\D/g, "").replace(/^(0049|49)/, "0"); }

class Run {
  contacts: Rec[]; tasks: Rec[]; deals: Rec[]; props: Rec[]; mails: Map<string, Rec>; acts: Rec[];
  byEmail = new Map<string, Rec>();
  changes = new Map<string, [string, Rec]>();
  notes: string[] = [];
  /** Telegram-Texte für Website-Anfragen, die nicht über website_anfragen kamen (Auffangnetz) */
  pushes: string[] = [];
  constructor(crm: Rec, public own: string, public stats: Rec, public spiegel: Spiegel) {
    this.contacts = crm.contacts ?? []; this.tasks = crm.tasks ?? []; this.deals = crm.deals ?? []; this.props = crm.properties ?? [];
    this.mails = new Map((crm.mails ?? []).map((x: Rec) => [x.id, x])); this.acts = crm.activities ?? [];
    for (const c of this.contacts) for (const k of ["email", "email2"]) if (c[k]) { const e = String(c[k]).trim().toLowerCase(); if (!this.byEmail.has(e)) this.byEmail.set(e, c); }
  }
  put(col: string, rec: Rec) { const ts = nowIso(); rec.created ??= ts; rec.updated = ts; this.changes.set(rec.id, [col, rec]); }
  activity(id: string, art: string, text: string, when: Date | null, refs: Rec = {}) {
    this.put("activities", { id, art, text, datum: isoUtc(when), ...Object.fromEntries(Object.entries(refs).filter(([, v]) => v)) });
  }
  task(id: string, auto: string, titel: string, faellig: string, prio: string, mailDt: Date | null, refs: Rec = {}): boolean {
    if (this.tasks.some((t) => t.auto === auto)) return false;
    const t = { id, titel: "⚡ " + titel, faellig, prio, done: false, auto, mailDatum: isoUtc(mailDt), ...Object.fromEntries(Object.entries(refs).filter(([, v]) => v)) };
    this.tasks.push(t); this.put("tasks", t);
    this.activity(id + "-log", "system", `⚡ Automatisch: Aufgabe „${titel}“ erstellt (E-Mail)`, null, { contactId: refs.contactId, propertyId: refs.propertyId });
    this.stats.aufgaben = (this.stats.aufgaben ?? 0) + 1;
    return true;
  }
  mailRecord(m: Mail, status: string, typ: string, contactId = "", quelle = "") {
    const id = "mail-" + m.key, old = this.mails.get(id) ?? {};
    const rec = {
      ...old, id, richtung: "ein", messageId: m.message_id, vonName: m.von_name, vonAdresse: m.von_adresse,
      antwortAn: m.antwort_an !== m.von_adresse ? m.antwort_an : "", an: m.an.slice(0, 300), betreff: m.betreff.slice(0, 300),
      datum: isoUtc(m.datum), text: m.text.slice(0, 6000), anhaenge: m.anhaenge.slice(0, 20), status: old.status ?? status, typ,
      contactId: contactId || old.contactId || "", quelle,
    };
    this.mails.set(id, rec); this.put("mails", rec);
  }
  matchProperty(...texts: string[]): Rec | null {
    const hay = norm(texts.filter(Boolean).join(" "));
    for (const p of this.props) {
      if (p.status === "Archiv") continue;
      for (const k of [p.titel, p.nr, p.strasse]) { const n = norm(k || ""); if (n.length >= 6 && hay.includes(n)) return p; }
    }
    return null;
  }

  inbound(m: Mail) {
    if (m.von_adresse === this.own) return;
    this.stats.eingang = (this.stats.eingang ?? 0) + 1;
    const portal = portalOf(m.von_adresse) || portalOf(m.antwort_an || "");
    const form = formKind(m);
    if (portal && !form && m.massenmail) { const f = fields(m.text); if (!(f.name || f.email)) return; }
    if (form || portal) return this.lead(m, form, portal);
    if (m.automatisch || m.massenmail) return;
    const c = this.byEmail.get(m.von_adresse) ?? (m.antwort_an ? this.byEmail.get(m.antwort_an) : undefined);
    if (c) return this.known(m, c);
    this.mailRecord(m, "neu", "unbekannt");
    this.stats.posteingang = (this.stats.posteingang ?? 0) + 1;
  }
  known(m: Mail, c: Rec) {
    const snippet = m.text.replace(/\s+/g, " ").slice(0, 400);
    this.activity("mail-act-" + m.key, "email", `✉️ E-Mail erhalten: ${m.betreff || "(ohne Betreff)"}\n${snippet}`, m.datum, { contactId: c.id });
    this.task("mail-task-" + m.key, "mail:" + m.key, `Antworten: ${fullName(c)} – ${m.betreff || "(ohne Betreff)"}`, dueFor(m.datum), "normal", m.datum, { contactId: c.id });
    this.mailRecord(m, "zugeordnet", "kontakt", c.id);
  }
  /** Website-Formular, das lead-sync.js schon gespiegelt hat (bzw. das CRM schon übernommen hat): nicht doppelt anlegen. */
  schonGespiegelt(m: Mail, addr: string, tel: string): Rec | "offen" | null {
    const t = (m.datum ?? new Date()).getTime(), win = 3 * 3600_000, dg = digitsOf(tel);
    if (this.spiegel.some((s) => Math.abs(s.at - t) < win && ((addr && s.email === addr) || (dg.length > 5 && s.digits === dg)))) return "offen";
    const c = addr ? this.byEmail.get(addr) : undefined;
    if (c && this.acts.some((a) => a.contactId === c.id && String(a.text || "").startsWith("🌐") && Math.abs(Date.parse(a.datum) - t) < win)) return c;
    return null;
  }
  lead(m: Mail, form: [string, string] | null, portal: string) {
    const [kind, label] = form ?? ["portal", `Anfrage über ${portal}`];
    const quelle = portal || "Website";
    const f = fields(m.text);
    const msg = messagePart(m.text) || m.text;
    const addr = leadEmail(m, f, this.own), name = leadName(m, f), tel = leadPhone(f, m.text);
    if (!addr && !name) { this.mailRecord(m, "neu", "anfrage", "", quelle); return; }
    if (form && !portal) {
      const sp = this.schonGespiegelt(m, addr, tel);
      if (sp === "offen") { this.stats.gespiegelt = (this.stats.gespiegelt ?? 0) + 1; return; }
      if (sp) { this.stats.gespiegelt = (this.stats.gespiegelt ?? 0) + 1; this.mailRecord(m, "zugeordnet", "anfrage", sp.id, quelle); return; }
    }
    this.stats.anfragen = (this.stats.anfragen ?? 0) + 1;
    if (form && !portal && Date.now() - (m.datum ?? new Date()).getTime() < 2 * 3600_000) {
      const details = [name ? `👤 ${name}` : "", tel ? `📞 ${tel}` : "", addr ? `✉️ ${addr}` : ""].filter(Boolean).join("\n");
      this.pushes.push(`🆕 Neue Website-Anfrage (per E-Mail erkannt)\n${m.betreff}\n\n${details}`.trim());
    }
    const prop = this.matchProperty(f.objekt ?? "", m.betreff, m.text.slice(0, 3000));
    const akquise = kind === "kontakt" && /verkauf|verkaufen|bewert|marktwert|eigentümer|eigentuemer|anbieten/i.test(((f.betreff ?? "") + " " + msg).slice(0, 2000));
    let c = addr ? this.byEmail.get(addr) : undefined;
    const neu = !c;
    if (!c) {
      let [vor, nach] = splitName(name);
      if (!vor && !nach) nach = addr;
      const cid = addr ? "c-" + sha1(addr).slice(0, 20) : crypto.randomUUID();
      c = {
        id: cid, kategorie: akquise ? "Eigentümer" : "Interessent (Kauf)", anrede: "", vorname: vor, nachname: nach, firma: "",
        email: addr, tel, mobil: "", strasse: "", plz: "", ort: "",
        quelle: ["Website", "ImmoScout24", "Immowelt", "Kleinanzeigen"].includes(quelle) ? quelle : "Sonstige",
        tags: kind === "vorab" ? "Vorab-Liste" : "", status: "Aktiv", geburtstag: "", followup: "", dsgvo: false,
        notiz: `${label} (${deDate(berlin(m.datum ?? new Date()).date)}):\n${msg.slice(0, 800)}`,
      };
      this.contacts.push(c);
      if (addr) this.byEmail.set(addr, c);
      this.put("contacts", c);
      this.activity("mail-new-" + m.key, "system", "Kontakt angelegt (aus E-Mail-Anfrage)", m.datum, { contactId: c.id });
      this.notes.push(`Neue Anfrage: ${fullName(c)}`);
    } else if (tel && !c.tel && !c.mobil) { c.tel = tel; this.put("contacts", c); }
    const cname = fullName(c), pid = prop?.id ?? "";
    this.activity("mail-act-" + m.key, "email", `✉️ ${label}: ${m.betreff || ""}\n${msg.slice(0, 600)}`, m.datum, { contactId: c.id, propertyId: pid });
    const due = dueFor(m.datum);

    const board = akquise ? "akquise" : "vertrieb";
    if (["objekt", "termin", "portal", "rendite"].includes(kind) || prop || akquise) {
      const closed = board === "akquise" ? ["Auftrag erhalten", "Verloren"] : ["Abgeschlossen", "Absage"];
      const offen = this.deals.filter((d) => d.contactId === c!.id && d.board === board && !closed.includes(d.stage) && (!pid || !d.propertyId || d.propertyId === pid));
      if (!offen.length) {
        const titel = (akquise ? `Akquise: ${cname}` : `Anfrage ${cname}`) + (prop ? ` – ${prop.titel}` : "");
        const d = {
          id: "mail-deal-" + m.key, titel, board, stage: akquise ? "Neuer Lead" : "Anfrage", contactId: c.id, propertyId: pid,
          wert: prop?.preis ?? "", provision: "", wahrscheinlichkeit: "", naechsterSchritt: "Erstkontakt", faellig: due,
          verlustGrund: "", notiz: msg.slice(0, 500), closedAt: "",
        };
        this.deals.push(d); this.put("deals", d);
        this.activity("mail-deal-log-" + m.key, "system", `Vorgang „${titel}“ angelegt (${d.stage}) – aus E-Mail`, m.datum, { contactId: c.id, propertyId: pid, dealId: d.id });
      }
    }

    let terminTxt = "";
    const [tdatum, tzeit] = kind === "termin" ? parseTermin(f.termin ?? "", `${f.termin ?? ""} ${f.uhrzeit ?? ""}`.trim(), m.betreff) : ["", ""];
    if (tdatum && tdatum >= todayBerlin()) {
      const art = f.art ?? "";
      let ende = "";
      if (tzeit) { const [h, mi] = tzeit.split(":").map(Number); ende = `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(mi).padStart(2, "0")}`; }
      this.put("events", {
        id: "mail-ev-" + m.key, titel: `${art && art !== "—" ? art : "Beratung"} ${cname} (angefragt)`,
        art: art.toLowerCase().includes("besicht") ? "Besichtigung" : "Beratungsgespräch", datum: tdatum, start: tzeit, ende, ort: "",
        contactId: c.id, propertyId: pid, notiz: `Über die Website angefragt – bitte bestätigen.\nTelefon: ${tel || "–"}\nE-Mail: ${addr || "–"}\n\n${msg.slice(0, 500)}`,
      });
      this.activity("mail-ev-log-" + m.key, "meeting", `Termin angefragt: ${tdatum} ${tzeit}`, m.datum, { contactId: c.id, propertyId: pid });
      terminTxt = ` – Termin ${tdatum.slice(8, 10)}.${tdatum.slice(5, 7)}. ${tzeit} bestätigen`;
    }

    if (kind === "vorab") {
      if (neu) this.task("mail-task-" + m.key, "ni:" + c.id, `Vorab-Liste: ${addr} begrüßen`, nextWorkday(todayBerlin()), "niedrig", m.datum, { contactId: c.id });
    } else if (neu) {
      this.task("mail-task-" + m.key, "ni:" + c.id, `Erstkontakt: ${cname} – ${label}${terminTxt}`, due, "hoch", m.datum, { contactId: c.id, propertyId: pid });
    } else {
      this.task("mail-task-" + m.key, "mail:" + m.key, `Anfrage beantworten: ${cname} – ${m.betreff || label}${terminTxt}`, due, "hoch", m.datum, { contactId: c.id, propertyId: pid });
    }
    this.mailRecord(m, "zugeordnet", "anfrage", c.id, quelle);
  }

  outbound(m: Mail) {
    const empf = [...new Set(getAddresses(m.an, m.cc))].filter((a) => a !== this.own).sort();
    for (const addr of empf) {
      const c = this.byEmail.get(addr);
      if (c) {
        const snippet = m.text.replace(/\s+/g, " ").slice(0, 300);
        this.activity(`mail-out-${m.key}-${c.id.slice(0, 8)}`, "email", `✉️ E-Mail gesendet: ${m.betreff || "(ohne Betreff)"}\n${snippet}`, m.datum, { contactId: c.id });
        const sentAt = isoUtc(new Date((m.datum ?? new Date()).getTime() + 2 * 60_000));
        for (const t of this.tasks) {
          if (!t.done && t.contactId === c.id && /^(mail:|ni:)/.test(String(t.auto ?? "")) && String(t.mailDatum || t.created || "") <= sentAt) {
            t.done = true; t.doneAt = nowIso(); this.put("tasks", t);
            this.activity(`mail-done-${String(t.id).slice(0, 24)}`, "system", `Aufgabe erledigt (Antwort gesendet): ${t.titel ?? ""}`, m.datum, { contactId: c.id });
            this.stats.erledigt = (this.stats.erledigt ?? 0) + 1;
          }
        }
      }
      for (const rec of this.mails.values()) {
        if (rec.status === "neu" && (rec.vonAdresse === addr || rec.antwortAn === addr || (c && rec.contactId === c.id))) { rec.status = "erledigt"; this.put("mails", rec); }
      }
    }
  }
}

// ================================================================ Supabase

async function rest(method: string, path: string, body?: unknown, headers: Rec = {}): Promise<any> {
  const r = await fetch(SB_URL + path, {
    method, headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Datenbank ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const rpc = (name: string, args: Rec) => rest("POST", `/rest/v1/rpc/${name}`, args);
async function load(cols: string[], extra = ""): Promise<Rec> {
  const out: Rec = Object.fromEntries(cols.map((c) => [c, []]));
  for (let off = 0; ; off += 1000) {
    const rows = await rest("GET", `/rest/v1/records?select=collection,data&collection=in.(${cols.join(",")})${extra}&order=id&limit=1000&offset=${off}`) ?? [];
    for (const r of rows) (out[r.collection] ??= []).push(r.data);
    if (rows.length < 1000) return out;
  }
}
async function upsert(rows: [string, Rec][], userId: string) {
  const body = rows.map(([col, rec]) => ({ id: rec.id, collection: col, data: rec, user_id: userId, updated_at: nowIso() }));
  for (let i = 0; i < body.length; i += 200) {
    await rest("POST", "/rest/v1/records?on_conflict=id", body.slice(i, i + 200), { Prefer: "resolution=merge-duplicates,return=minimal" });
  }
}
async function spiegelLaden(): Promise<Spiegel> {
  const rows = await rest("GET", "/rest/v1/website_anfragen?select=created_at,daten&order=created_at.desc&limit=200") ?? [];
  return rows.map((r: Rec) => {
    const d = r.daten ?? {};
    return { email: String(d.email || d["E-Mail"] || d.Email || "").trim().toLowerCase(), digits: digitsOf(String(d.Telefon || d.tel || d.telefon || "")), at: Date.parse(r.created_at) };
  });
}

// ================================================================ Ablauf

export async function syncOnce(geheim: string, imapOpts: Rec = {}): Promise<Rec> {
  const z = await rpc("mailsync_start", { p_geheim: geheim });
  if (!z?.ok) return { skipped: z?.grund ?? "nicht aktiv" };
  const stand: Rec = z.stand ?? {};
  const stats: Rec = stand.stats ?? (stand.stats = {});
  const own = String(z.postfach).toLowerCase();
  const status = async (error = "", ok = true) => {
    const rec: Rec = { id: "mailsync", lastRun: nowIso(), error, version: VERSION, stats, postfach: z.postfach, ort: "server" };
    rec.lastOk = ok ? rec.lastRun : (stand.last_ok ?? "");
    if (ok) stand.last_ok = rec.lastOk;
    rec.created = rec.updated = nowIso();
    try { await upsert([["sync", rec]], z.user_id); } catch (e) { console.log("Status nicht gespeichert: " + (e as Error).message); }
  };
  let summary = "";
  try {
    let imap: Imap;
    try {
      imap = await Imap.connect(imapOpts);
      await imap.login(z.postfach, z.passwort);
    } catch (e) {
      const msg = e instanceof ImapError ? e.message : `Mailserver nicht erreichbar (${(e as Error).message})`;
      await status(msg, false);
      return { error: msg };
    }
    let inbox: Mail[] = [], stIn: Rec = {};
    const sent: Mail[] = [], stSent: Rec = { ...(stand.sent ?? {}) };
    try {
      [inbox, stIn] = await imap.fetchNew("INBOX", stand.inbox ?? {}, MAX_PER_RUN);
      for (const folder of await imap.sentFolders()) {
        const [got, st] = await imap.fetchNew(folder, (stand.sent ?? {})[folder] ?? {}, MAX_PER_RUN);
        stSent[folder] = st; sent.push(...got);
      }
    } finally { await imap.logout(); }

    if (inbox.length || sent.length) {
      const oldest = Math.min(...[...inbox, ...sent].map((m) => (m.datum ?? new Date()).getTime()));
      const crm = await load(["contacts", "tasks", "deals", "properties", "mails"]);
      crm.activities = (await load(["activities"], `&data->>datum=gte.${encodeURIComponent(new Date(oldest - 4 * 3600_000).toISOString())}`)).activities;
      const spiegel = inbox.some((m) => formKind(m)) ? await spiegelLaden() : [];
      const run = new Run(crm, own, stats, spiegel);
      const seen = new Set<string>(stand.seen ?? []);
      for (const m of inbox) {
        if (seen.has(m.key)) continue;
        try { run.inbound(m); } catch (e) { console.log(`Mail ${m.uid} übersprungen: ${(e as Error).message}`); }
        seen.add(m.key);
      }
      for (const m of sent.sort((a, b) => isoUtc(a.datum).localeCompare(isoUtc(b.datum)))) {
        if (seen.has("out:" + m.key)) continue;
        try { run.outbound(m); } catch (e) { console.log(`Gesendete Mail ${m.uid} übersprungen: ${(e as Error).message}`); }
        seen.add("out:" + m.key);
      }
      if (run.changes.size) await upsert([...run.changes.values()], z.user_id);
      for (const text of run.pushes.slice(0, 10)) {
        try { await rpc("mailsync_push", { p_geheim: geheim, p_text: text }); stats.push = (stats.push ?? 0) + 1; }
        catch (e) { console.log("Telegram-Auffangnetz: " + (e as Error).message); }
      }
      stand.seen = [...seen].slice(-800);
      summary = `${inbox.length} neu im Eingang, ${sent.length} gesendet, ${run.changes.size} Änderungen im CRM`;
    }
    stand.inbox = stIn; stand.sent = stSent;
    await status();
    return { ok: true, summary, eingang: inbox.length, gesendet: sent.length };
  } catch (e) {
    const msg = (e as Error).message;
    console.log("Fehler: " + msg);
    await status(msg, false);
    return { error: msg };
  } finally {
    try { await rpc("mailsync_ende", { p_geheim: geheim, p_stand: stand }); } catch (e) { console.log("Stand nicht gespeichert: " + (e as Error).message); }
  }
}

if (!Deno.env.get("MAILSYNC_TEST")) {
  Deno.serve(async (req) => {
    const geheim = req.headers.get("x-mailsync") ?? "";
    if (req.method !== "POST" || geheim.length < 32) return new Response("nicht erlaubt", { status: 403 });
    const r = await syncOnce(geheim);
    console.log(JSON.stringify({ ...r, summary: undefined }));
    return Response.json(r, { status: r.error ? 500 : 200 });
  });
}
