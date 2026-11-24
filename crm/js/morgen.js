// Morgenroutine: ein Knopf auf der Übersicht – kurzes Briefing (vorgelesen und zum Mitlesen), danach startet die Arbeits-Playlist.
// Aufruf auch per Link …/crm/#/morgen (z. B. aus einem Kurzbefehl); dort wartet die Routine auf einen Klick, weil Browser Ton erst nach einer Eingabe erlauben.
import * as db from './db.js';
import { html, today, fullName } from './util.js';
import { newCount as mailsNeu } from './views/inbox.js';
import { neuAnzahl as anfragenNeu } from './portal.js';

const STANDARD = { stimme: '', playlist: 'https://open.spotify.com/playlist/79LlED1T74BqFP2WmzC2x9', name: 'Arbeitsmotivation Hype Haftbefehl', vorlesen: true };
export const einstellung = () => ({ ...STANDARD, ...(db.settings().morgen || {}) });
const speichern = patch => db.saveSettings({ ...db.settings(), morgen: { ...(db.settings().morgen || {}), ...patch } });
const playlistId = url => (/playlist[/:]([A-Za-z0-9]{10,40})/.exec(String(url || '')) || [])[1] || '';
const n = (zahl, ein, mehr) => zahl === 1 ? `ein${ein}` : `${zahl} ${mehr}`;
const gross = t => t.charAt(0).toUpperCase() + t.slice(1);
const uhr = t => { const [h, m] = String(t).split(':'); return m === '00' ? `${+h} Uhr` : `${+h} Uhr ${+m}`; };

/** Die wichtigsten Punkte des Tages – kurz. Liefert { zeilen: [[Titel, Text]], sprechen } */
export function briefing(jetzt = new Date()) {
  const t0 = today(), S = db.settings(), vorname = (S.inhaber || '').split(' ')[0];
  const ev = db.all('events').filter(e => e.datum === t0).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const offen = db.all('tasks').filter(t => !t.done && t.faellig), heute = offen.filter(t => t.faellig === t0), ueber = offen.filter(t => t.faellig < t0);
  const wichtig = [...heute, ...ueber].sort((a, b) => (b.prio === 'hoch') - (a.prio === 'hoch') || a.faellig.localeCompare(b.faellig)).slice(0, 3).map(t => t.titel.replace(/^⚡ /, ''));
  let anf = 0, mails = 0; try { anf = anfragenNeu(); } catch { } try { mails = mailsNeu(); } catch { }
  const gruss = jetzt.getHours() < 11 ? 'Guten Morgen' : jetzt.getHours() < 18 ? 'Hallo' : 'Guten Abend';
  const datum = jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const zeilen = [], S2 = [`${gruss}${vorname ? ' ' + vorname : ''}. Heute ist ${datum}.`];
  if (ev.length) {
    zeilen.push(['Termine', ev.map(e => `${e.start || 'ganztägig'}  ${e.titel}`)]);
    S2.push(`Du hast ${n(ev.length, 'en Termin', 'Termine')}: ` + ev.slice(0, 5).map(e => `${e.start ? 'um ' + uhr(e.start) + ' ' : ''}${e.titel.replace(/[–—:]/g, ',')}`).join('. ') + '.');
  } else { zeilen.push(['Termine', ['Heute keine Termine']]); S2.push('Heute hast du keine Termine.'); }
  if (heute.length || ueber.length) {
    zeilen.push(['Aufgaben', [`${heute.length} heute fällig${ueber.length ? ` · ${ueber.length} überfällig` : ''}`, ...wichtig.map(t => '· ' + t)]]);
    S2.push(`${heute.length ? gross(n(heute.length, 'e Aufgabe ist', 'Aufgaben sind')) + ' heute fällig' : 'Heute ist keine Aufgabe fällig'}${ueber.length ? `, ${n(ueber.length, 'e ist', 'sind')} überfällig` : ''}.${wichtig.length ? ' Am wichtigsten: ' + wichtig[0] + '.' : ''}`);
  } else { zeilen.push(['Aufgaben', ['Nichts fällig']]); S2.push('Es sind keine Aufgaben fällig.'); }
  if (anf || mails) {
    zeilen.push(['Posteingang', [[anf ? n(anf, 'e neue Anfrage', 'neue Anfragen') : '', mails ? n(mails, 'e neue Mail', 'neue Mails') : ''].filter(Boolean).join(' · ')]]);
    S2.push(`Im Posteingang ${anf + mails === 1 ? 'wartet' : 'warten'} ${[anf ? n(anf, 'e neue Anfrage', 'neue Anfragen') : '', mails ? n(mails, 'e neue Mail', 'neue Mails') : ''].filter(Boolean).join(' und ')}.`);
  }
  S2.push('Viel Erfolg heute.');
  return { zeilen, sprechen: S2.join(' '), datum, gruss: gruss + (vorname ? ', ' + vorname : '') };
}

// Stimme: bevorzugt die ElevenLabs-Stimme über die Function „sprache“ (Schlüssel liegt nur auf dem Server), sonst die Stimme des Geräts
let spieler = null;
export const stimmeVerfuegbar = () => db.isCloud() && !!db.klient() && db.settings().morgen?.stimme !== 'geraet';
async function holeAufnahme(text) {
  const { data } = await db.klient().auth.getSession(), token = data?.session?.access_token; if (!token) throw new Error('nicht angemeldet');
  const r = await fetch(`${(db.cfg().url || '').replace(/\/$/, '')}/functions/v1/sprache`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, apikey: db.cfg().key }, body: JSON.stringify({ text }) });
  if (!r.ok || !/audio/.test(r.headers.get('content-type') || '')) { let f = ''; try { f = (await r.json()).fehler || ''; } catch { } throw new Error(f || 'Sprachausgabe nicht erreichbar'); }
  return URL.createObjectURL(await r.blob());
}
const stopp = () => { try { spieler?.pause(); } catch { } spieler = null; try { speechSynthesis.cancel(); } catch { } };
/** Liest vor; liefert { ok, art: 'elevenlabs' | 'geraet', hinweis } */
async function vorlesen(text, bereit = null) {
  if (stimmeVerfuegbar()) {
    try {
      // Das Audio-Element wurde schon beim Klick angelegt (bereit) – sonst blockt Safari das Abspielen nach dem Laden
      const a = bereit || new Audio(); spieler = a; a.src = await holeAufnahme(text);
      await new Promise((ja, nein) => { a.onended = ja; a.onerror = () => nein(new Error('Abspielen fehlgeschlagen')); a.play().catch(nein); });
      return { ok: true, art: 'elevenlabs' };
    } catch (e) { if (spieler === null) return { ok: false, art: 'elevenlabs' }; const r = await geraeteStimme(text); return { ok: r, art: 'geraet', hinweis: e.message }; }
  }
  return { ok: await geraeteStimme(text), art: 'geraet' };
}
function geraeteStimme(text) {
  return new Promise(fertig => {
    const sy = window.speechSynthesis; if (!sy || !window.SpeechSynthesisUtterance) return fertig(false);
    try {
      sy.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 1.03;
      const st = sy.getVoices().filter(v => /^de/i.test(v.lang)), gut = st.find(v => /Anna|Petra|Markus|Viktor|Google Deutsch/i.test(v.name)) || st[0]; if (gut) u.voice = gut;
      let aus = false; const ende = ok => { if (!aus) { aus = true; clearInterval(wach); clearTimeout(not); fertig(ok); } };
      const wach = setInterval(() => { if (sy.speaking) sy.resume(); }, 8000);   // Chrome hält lange Texte sonst an
      const not = setTimeout(() => ende(false), Math.max(20000, text.length * 110));
      u.onend = () => ende(true); u.onerror = () => ende(false); sy.speak(u);
    } catch { fertig(false); }
  });
}
/** Playlist in der Spotify-App öffnen und abspielen lassen */
export function musik() {
  const id = playlistId(einstellung().playlist); if (!id) return false;
  location.href = `spotify:playlist:${id}:play`; return true;
}

export function starten({ sofort = true } = {}) {
  document.querySelector('.morgen')?.remove();
  const E = einstellung(), B = briefing(), id = playlistId(E.playlist), web = id ? `https://open.spotify.com/playlist/${id}?go=1` : '';
  const el = document.createElement('div'); el.className = 'morgen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Morgenroutine');
  el.innerHTML = html`<div class="morgen-k">
      <button type="button" class="morgen-x" data-zu aria-label="Schließen">×</button>
      <p class="morgen-d">${B.datum}</p><h2>${B.gruss}</h2>
      <div class="morgen-z">${B.zeilen.map(([t, l]) => html`<section><h3>${t}</h3>${l.map(x => html`<p>${x}</p>`)}</section>`)}</div>
      <p class="morgen-s" data-stand aria-live="polite"></p>
      <div class="morgen-a"><button type="button" class="btn primary" data-los>▶ Routine starten</button><a class="btn" data-web href="${web}" target="_blank" rel="noopener" ${web ? '' : 'hidden'}>♫ Playlist öffnen</a><button type="button" class="btn ghost" data-zu>Zum CRM</button></div>
      <details class="morgen-e"><summary>Einstellungen</summary>
        <label class="f"><span>Spotify-Playlist (Link)</span><input name="playlist" value="${E.playlist}" placeholder="https://open.spotify.com/playlist/…"></label>
        <label class="chk"><input type="checkbox" name="vorlesen" ${E.vorlesen ? 'checked' : ''}><span>Briefing vorlesen</span></label>
        <label class="chk"><input type="checkbox" name="stimme" ${E.stimme === 'geraet' ? '' : 'checked'}><span>ElevenLabs-Stimme verwenden (sonst Stimme des Geräts)</span></label></details></div>`.s;
  document.body.appendChild(el);
  const stand = el.querySelector('[data-stand]'), los = el.querySelector('[data-los]'); let lauf = 0, hinweis = '';
  const zu = () => { lauf++; stopp(); el.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') zu(); }; document.addEventListener('keydown', esc);
  el.querySelectorAll('[data-zu]').forEach(b => b.onclick = zu); el.onclick = e => { if (e.target === el) zu(); };
  el.querySelector('[name=playlist]').onchange = async e => { const v = e.target.value.trim(); await speichern({ playlist: v }); const i = playlistId(v), a = el.querySelector('[data-web]'); a.hidden = !i; if (i) a.href = `https://open.spotify.com/playlist/${i}?go=1`; };
  el.querySelector('[name=vorlesen]').onchange = e => speichern({ vorlesen: e.target.checked });
  el.querySelector('[name=stimme]').onchange = e => speichern({ stimme: e.target.checked ? '' : 'geraet' });
  const ablauf = async () => {
    const meins = ++lauf; los.hidden = true;
    if (einstellung().vorlesen) {
      // Audio-Element sofort im Klick anlegen und „entsperren“, damit der Browser das spätere Abspielen erlaubt
      let a = null; if (stimmeVerfuegbar()) { a = new Audio(); a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='; a.play().catch(() => { }); }
      stand.textContent = '🔊 Briefing läuft …'; const r = await vorlesen(B.sprechen, a); if (meins !== lauf) return;
      if (r.hinweis) hinweis = ` (Gerätestimme, weil: ${r.hinweis})`;
    }
    if (playlistId(einstellung().playlist)) { stand.textContent = `♫ Starte „${einstellung().name}“ in Spotify … Falls nichts passiert: „Playlist öffnen“.${hinweis}`; musik(); }
    else stand.textContent = 'Keine Playlist hinterlegt – unter „Einstellungen“ den Spotify-Link einfügen.';
  };
  los.onclick = ablauf;
  if (sofort) ablauf();
  return el;
}
