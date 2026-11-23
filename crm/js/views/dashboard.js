import * as db from '../db.js';
import { html, today, addDays, fmtDate, fmtDateShort, eur, daysBetween, fullName } from '../util.js';
import { PIPELINES, DEFAULT_PROB } from '../consts.js';
import { cLink, pLink, empty, timeline, matchesForProperty, lastContact, dealProvision, avatar } from '../ui.js';
import { taskRow, bindTasks } from './tasks.js';
import { schnellerfassung } from '../schnellerfassung.js';
import { fokusKarte, bindFokus } from '../crmplus.js';
import { heuteKarte, nachfassenKarte, nachfassenListe } from '../kontakt.js';
import { raw } from '../util.js';
import { eventForm, taskForm, contactForm, propertyForm, activityForm } from '../forms.js';
import { newCount as mailsNeu } from './inbox.js';
import { neuAnzahl as anfragenNeu, aktiveGruppen, inserate, ordnerK, STATUS as ANF_STATUS, OFFEN as ANF_OFFEN } from '../portal.js';
import { vorWann } from '../kontakt.js';
import { istUeberfaellig } from '../finanzen.js';
import { offene as fahrtenOffen } from '../fahrtenbuch.js';
import { assistent as ueberfaelligAssistent } from '../ueberfaellig.js';

/** Was heute ansteht: vier große Kacheln (Anfragen, Termine, Aufgaben, Pipeline) + kleine Zähler für den Rest */
export function tagesleiste() {
  const t0 = today(), T = db.all('tasks'), jetzt = new Date().toTimeString().slice(0, 5);
  const offen = T.filter(t => !t.done && t.faellig), heute = offen.filter(t => t.faellig === t0).length, ueber = offen.filter(t => t.faellig < t0).length;
  const erledigt = T.filter(t => t.done && (t.doneAt || '').slice(0, 10) === t0).length;
  const E = db.all('events').filter(e => e.datum >= t0).sort((a, b) => (a.datum + (a.start || '')).localeCompare(b.datum + (b.start || '')));
  const eh = E.filter(e => e.datum === t0), naechster = eh.find(e => (e.start || '99') >= jetzt) || E.find(e => e.datum > t0);
  const wv = db.all('contacts').filter(c => c.status !== 'Archiv' && c.followup && c.followup <= t0).length;
  const belege = (db.all('buchungen') || []).filter(b => b.pruefen).length;
  const rechn = (db.all('rechnungen') || []).filter(istUeberfaellig).length;
  const G = aktiveGruppen(), aNeu = anfragenNeu(), aOffen = G.filter(g => ANF_OFFEN.includes(g.haupt.status || 'neu')).length;
  const D = db.all('deals').filter(isOpen), fc = D.reduce((x, d) => x + dealProvision(d) * prob(d) / 100, 0);
  const K = [
    ['#/anfragen', aNeu, aNeu === 1 ? 'neue Anfrage' : 'neue Anfragen', aOffen ? `${aOffen} offen insgesamt` : 'alles beantwortet', aNeu ? 'gold' : '', '✆'],
    ['#/kalender', eh.length, eh.length === 1 ? 'Termin heute' : 'Termine heute', naechster ? `${naechster.datum === t0 ? 'als Nächstes' : 'nächster ' + fmtDateShort(naechster.datum)} ${naechster.start || ''} · ${naechster.titel || naechster.art || ''}` : 'nichts geplant', eh.length ? 'gold' : '', '▦'],
    ['#/aufgaben', heute + ueber, heute + ueber === 1 ? 'Aufgabe fällig' : 'Aufgaben fällig', ueber ? `davon ${ueber} überfällig` : heute ? 'alle für heute' : erledigt ? `${erledigt} heute erledigt` : 'nichts offen', ueber ? 'dringend' : '', '✓'],
    ['#/pipeline', D.length, D.length === 1 ? 'offener Vorgang' : 'offene Vorgänge', fc ? `Prognose ${eur(fc)}` : `${D.filter(d => d.board === 'miete').length} Mietinteressenten`, '', '▤'],
  ];
  const C = [
    [ueber, 'überfällig – ordnen', 'uf', 'dringend'],
    [mailsNeu(), 'neue Mails', '#/posteingang', ''],
    [fahrtenOffen().length, fahrtenOffen().length === 1 ? 'Fahrt benennen' : 'Fahrten benennen', '#/fahrten/benennen', ''],
    [wv, wv === 1 ? 'Wiedervorlage' : 'Wiedervorlagen', '#/kontakte', ''],
    [belege, belege === 1 ? 'Beleg prüfen' : 'Belege prüfen', '#/finanzen', ''],
    [rechn, rechn === 1 ? 'Rechnung überfällig' : 'Rechnungen überfällig', '#/finanzen', 'dringend'],
    [erledigt, 'heute erledigt', '', 'ok'],
  ].filter(c => c[0]);
  return html`<div class="tagesleiste" aria-label="Heute">
    <div class="dtiles">${K.map(([h, n, l, sub, cls, ic], i) => html`<a class="dtile ${cls}" href="${h}" style="--i:${i}"><i aria-hidden="true">${ic}</i><b>${n > 999 ? '999+' : n}</b><span>${l}</span><small>${sub}</small></a>`)}</div>
    ${C.length ? html`<div class="dchips">${C.map(([n, l, h, cls]) => h === 'uf' ? html`<button type="button" class="tchip ${cls}" data-uf><b>${n > 999 ? '999+' : n}</b><span>${l}</span></button>` : h ? html`<a class="tchip ${cls}" href="${h}"><b>${n > 999 ? '999+' : n}</b><span>${l}</span></a>` : html`<span class="tchip ${cls}"><b>${n}</b><span>${l}</span></span>`)}</div>` : ''}
  </div>`;
}

export const prob = d => d.wahrscheinlichkeit !== '' && d.wahrscheinlichkeit != null ? d.wahrscheinlichkeit : (DEFAULT_PROB[d.stage] ?? 0);
export const isOpen = d => { const P = PIPELINES[d.board]; return P && d.stage !== P.won && d.stage !== P.lost; };

// Einblend-Animation nur beim Öffnen (nicht bei jedem Neuzeichnen durch Datenabgleich)
let zuletztGezeichnet = 0, uhrTimer = 0;
function uhrStarten(el) {
  clearInterval(uhrTimer);
  uhrTimer = setInterval(() => { const u = document.getElementById('d-uhr'); if (!u || !el.isConnected) return clearInterval(uhrTimer); u.textContent = new Date().toTimeString().slice(0, 5); }, 20000);
}
export function render(el) {
  const frisch = Date.now() - zuletztGezeichnet > 45000; zuletztGezeichnet = Date.now();
  const t0 = today(), s = db.settings();
  const tasks = db.all('tasks').filter(t => !t.done && t.faellig && t.faellig <= t0).sort((a, b) => a.faellig.localeCompare(b.faellig));
  const events = db.all('events').filter(e => e.datum >= t0 && e.datum <= addDays(t0, 7)).sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
  const props = db.all('properties'), deals = db.all('deals'), contacts = db.all('contacts');
  const open = deals.filter(isOpen);
  const pipeVal = open.reduce((s, d) => s + (d.wert || 0), 0);
  const forecast = open.reduce((s, d) => s + dealProvision(d) * prob(d) / 100, 0);
  const year = t0.slice(0, 4);
  const won = deals.filter(d => PIPELINES[d.board] && d.stage === PIPELINES[d.board].won && d.board === 'vertrieb' && (d.closedAt || '').startsWith(year));
  const umsatz = won.reduce((s, d) => s + dealProvision(d), 0);
  const nachfassen = nachfassenListe();
  const expiring = [];
  props.filter(p => !['Archiv', 'Verkauft / Vermietet'].includes(p.status)).forEach(p => {
    if (p.auftragBis && p.auftragBis >= t0 && p.auftragBis <= addDays(t0, 60)) expiring.push({ p, txt: `Vertriebsvereinbarung endet ${fmtDate(p.auftragBis)}` });
    if (p.auftragBis && p.auftragBis < t0) expiring.push({ p, txt: `Vertriebsvereinbarung abgelaufen ${fmtDate(p.auftragBis)}` });
    if (p.eGueltig && p.eGueltig <= addDays(t0, 60)) expiring.push({ p, txt: `Energieausweis ${p.eGueltig < t0 ? 'abgelaufen' : 'läuft ab'} ${fmtDate(p.eGueltig)}` });
    if (p.status === 'Aktiv' && !p.preis) expiring.push({ p, txt: 'Aktiv ohne Preis' });
  });
  const bdays = contacts.filter(c => c.geburtstag).map(c => { const [, m, d] = c.geburtstag.split('-'); let n = `${year}-${m}-${d}`; if (n < t0) n = `${+year + 1}-${m}-${d}`; return { c, n }; }).filter(x => x.n <= addDays(t0, 14)).sort((a, b) => a.n.localeCompare(b.n));
  const matches = props.filter(p => p.status === 'Aktiv').flatMap(p => matchesForProperty(p).slice(0, 2).map(x => ({ p, ...x }))).slice(0, 6);
  const hour = new Date().getHours(), greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const kpi = (v, l, href, cls = '') => html`<a class="kpi ${cls}" href="${href}"><b>${v}</b><span>${l}</span></a>`;
  const ueber = tasks.filter(t => t.faellig < t0).length, neu = db.all('tasks').filter(t => !t.done && /^ni:/.test(t.auto || '')).length, termHeute = events.filter(e => e.datum === t0).length;
  const satz = [tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'Aufgabe steht' : 'Aufgaben stehen'} an${ueber ? `, davon ${ueber} überfällig` : ''}` : 'Keine Aufgaben fällig',
    termHeute ? `${termHeute} ${termHeute === 1 ? 'Termin' : 'Termine'} heute` : events.length ? `nächster Termin ${fmtDateShort(events[0].datum)}${events[0].start ? ' um ' + events[0].start : ''}` : 'keine Termine diese Woche',
    neu ? `${neu} neue ${neu === 1 ? 'Anfrage wartet' : 'Anfragen warten'}` : ''].filter(Boolean).join(', ') + '.';
  const SEK = [
    ['Neue Objekt-Treffer', matches.length, () => html`<ul class="list">${matches.map(x => html`<li><b class="when">${x.m.score}%</b><div class="grow"><div class="ttl">${cLink(x.c.id)} ↔ ${pLink(x.p.id)}</div><div class="sub">passt: ${x.m.hits.join(', ')}</div></div></li>`)}</ul>`],
    ['Achtung bei Objekten', expiring.length, () => html`<ul class="list">${expiring.slice(0, 8).map(x => html`<li><span class="ic">⚠️</span><div class="grow"><div class="ttl">${pLink(x.p.id)}</div><div class="sub">${x.txt}</div></div></li>`)}</ul>`],
    ['Geburtstage (14 Tage)', bdays.length, () => html`<ul class="list">${bdays.map(x => html`<li><span class="ic">🎂</span><div class="grow"><div class="ttl">${cLink(x.c.id)}</div><div class="sub">${fmtDate(x.n)}</div></div></li>`)}</ul>`],
  ];
  const voll = SEK.filter(x => x[1]), leer = [...(nachfassen.length ? [] : ['Nachfassen']), ...SEK.filter(x => !x[1]).map(x => x[0].replace(/ \(.*\)/, ''))];
  const acts = db.all('activities').filter(a => a.art !== 'system').sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 6);
  // ---- Kopf: Begrüßung, Tagesfortschritt, Schnellaktionen
  const jetzt = new Date(), vorname = (s.inhaber || '').split(' ')[0];
  const tz = hour < 5 ? 'nacht' : hour < 11 ? 'morgen' : hour < 18 ? 'tag' : hour < 22 ? 'abend' : 'nacht';
  const gruss = hour < 5 ? 'Noch wach' : greet;
  const kw = (() => { const d = new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); })();
  const erledigtHeute = db.all('tasks').filter(t => t.done && (t.doneAt || '').slice(0, 10) === t0).length, gesamtHeute = erledigtHeute + tasks.length;
  const anteil = gesamtHeute ? erledigtHeute / gesamtHeute : 1, U = 2 * Math.PI * 52;
  // ---- rechte Spalte: Termine + neueste Anfragen
  const ordnerName = new Map(inserate().map(i => [i.k, i.name]));
  const anf = aktiveGruppen().filter(g => ANF_OFFEN.includes(g.haupt.status || 'neu')).slice(0, 4);
  const ini = n => String(n || '?').replace(/^(Herr|Frau)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const tagLabel = d => d === t0 ? 'Heute' : d === addDays(t0, 1) ? 'Morgen' : new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const evTage = [...new Set(events.slice(0, 7).map(e => e.datum))];
  // ---- Geschäft: Trichter je Pipeline + Vergütung je Monat
  const trichter = (b) => { const P = PIPELINES[b], L = P.stages.filter(x => x !== P.lost && x !== P.won).map(st => [st, deals.filter(d => d.board === b && d.stage === st).length]), max = Math.max(1, ...L.map(x => x[1])), n = L.reduce((x, y) => x + y[1], 0);
    return html`<section class="card dbiz"><h2>${P.name}<a class="lnk small" href="#/pipeline">Pipeline →</a></h2>${n ? html`<ul class="dfunnel">${L.map(([st, c]) => html`<li class="${c ? '' : 'null'}"><span>${st}</span><i><u style="width:${Math.round(c / max * 100)}%"></u></i><b>${c}</b></li>`)}</ul>` : html`<p class="muted">Noch keine offenen Vorgänge.</p>`}</section>`; };
  const MN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'], MV = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const monate = MN.map((_, i) => won.filter(d => (d.closedAt || '').slice(5, 7) === String(i + 1).padStart(2, '0')).reduce((x, d) => x + dealProvision(d), 0)), mMax = Math.max(1, ...monate), mJetzt = jetzt.getMonth();
  el.innerHTML = html`<section class="hero ${tz} ${frisch ? 'anim' : ''}">
      <div class="hero-l">
        <p class="hero-d">${jetzt.toLocaleDateString('de-DE', { weekday: 'long' })} · ${jetzt.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })} · KW ${kw}</p>
        <h1>${gruss}${vorname ? html`, <em>${vorname}</em>` : ''}${hour < 5 ? '?' : ''}</h1>
        <p class="briefing">${satz}</p>
        <div class="hero-a"><button class="btn primary" data-q="anfrage">＋ Anfrage einfügen</button><button class="btn" data-q="task">Aufgabe</button><button class="btn" data-q="event">Termin</button><button class="btn" data-q="note">Notiz</button><button class="btn" data-q="contact">Kontakt</button></div>
      </div>
      <div class="hero-r" title="${gesamtHeute ? `${erledigtHeute} von ${gesamtHeute} Aufgaben für heute erledigt` : 'Heute sind keine Aufgaben fällig'}">
        <div class="dring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="rb"/><circle cx="60" cy="60" r="52" class="rf" style="stroke-dasharray:${U.toFixed(1)};stroke-dashoffset:${(U * (1 - anteil)).toFixed(1)}"/></svg>
          <div class="dring-t"><b>${gesamtHeute ? html`${erledigtHeute}<small>/${gesamtHeute}</small>` : '✓'}</b><span>${gesamtHeute ? 'erledigt' : 'frei'}</span></div></div>
        <div class="hero-uhr"><b id="d-uhr">${jetzt.toTimeString().slice(0, 5)}</b><span>${anteil >= 1 && gesamtHeute ? 'Tagesziel geschafft' : gesamtHeute ? `noch ${tasks.length} offen` : 'nichts fällig'}</span></div>
      </div>
    </section>
    ${tagesleiste()}
    <div class="dmain">
      ${fokusKarte()}
      <div class="dside">
        <section class="card dterm"><h2>Nächste Termine<a class="lnk small" href="#/kalender">Kalender →</a></h2>
          ${events.length ? evTage.map(d => html`<div class="dtag"><span class="${d === t0 ? 'heute' : ''}">${tagLabel(d)}</span><ul>${events.slice(0, 7).filter(e => e.datum === d).map(e => html`<li data-ev="${e.id}"><b>${e.start || 'ganztags'}</b><div><div class="ttl">${e.titel}</div><div class="sub">${[e.art, e.ort].filter(Boolean).join(' · ')}</div></div></li>`)}</ul></div>`) : html`<p class="muted">Keine Termine in den nächsten 7 Tagen.</p><button type="button" class="btn small" data-q="event">＋ Termin anlegen</button>`}
          ${events.length > 7 ? html`<a class="fokusmehr" href="#/kalender">Alle ${events.length} Termine dieser Woche</a>` : ''}</section>
        <section class="card danf"><h2>Offene Anfragen<a class="lnk small" href="#/anfragen">Alle →</a></h2>
          ${anf.length ? html`<ul>${anf.map(g => { const st = g.haupt.status || 'neu', tel = String(g.tel || '').replace(/[^\d+]/g, ''); return html`<li><span class="dav" aria-hidden="true">${ini(g.name)}</span><a class="grow" href="#/anfragen"><div class="ttl">${g.name}</div><div class="sub">${ordnerName.get(ordnerK(g.haupt)) || g.haupt.inseratNr || ''} · ${vorWann(g.eingang)}</div></a><span class="dst" style="--a:${ANF_STATUS[st]?.farbe || '#888'}">${ANF_STATUS[st]?.name || st}</span>${tel ? html`<a class="dtel" href="tel:${tel}" title="${g.name} anrufen" aria-label="${g.name} anrufen">📞</a>` : ''}</li>`; })}</ul>` : html`<p class="muted">Keine offenen Anfragen – alles beantwortet.</p>`}</section>
      </div>
    </div>
    <h2 class="dsec">Dein Geschäft</h2>
    <div class="kpis strip">
      ${kpi(props.filter(p => p.status === 'Aktiv').length, 'Aktive Objekte', '#/objekte')}
      ${kpi(contacts.filter(c => c.status !== 'Archiv').length, 'Kontakte', '#/kontakte')}
      ${kpi(open.length, 'Offene Vorgänge', '#/pipeline')}
      ${kpi(eur(pipeVal), 'Pipeline-Volumen', '#/pipeline')}
      ${kpi(eur(forecast), 'Prognose Vergütung', '#/pipeline')}
      ${kpi(eur(umsatz), `Vergütung ${year}`, '#/statistik')}
    </div>
    <div class="dbizrow">
      ${trichter('vertrieb')}${trichter('miete')}
      <section class="card dbiz"><h2>Vergütung ${year}<a class="lnk small" href="#/statistik">Statistik →</a></h2>
        <div class="dumsatz"><b>${eur(umsatz)}</b><span>${won.length} ${won.length === 1 ? 'Abschluss' : 'Abschlüsse'} · Prognose offen ${eur(forecast)}</span></div>
        <div class="dmonate" role="img" aria-label="Vergütung je Monat ${year}">${monate.map((v, i) => html`<div class="${i === mJetzt ? 'jetzt' : i > mJetzt ? 'zukunft' : ''}" title="${MV[i]}: ${eur(v)}"><i><u style="height:${v ? Math.max(6, Math.round(v / mMax * 100)) : 0}%"></u></i><span>${MN[i]}</span></div>`)}</div></section>
    </div>
    <h2 class="dsec">Im Blick</h2>
    <div class="cols dashcols">
      ${heuteKarte()}${nachfassen.length ? nachfassenKarte(nachfassen) : ''}
      ${voll.map(([t, , f]) => html`<section class="card"><h2>${t}</h2>${f()}</section>`)}
      ${acts.length ? html`<section class="card dzuletzt"><h2>Zuletzt passiert</h2>${timeline(acts, { showRefs: true })}</section>` : ''}
    </div>
    ${leer.length ? html`<p class="ruhig">Nichts offen bei ${leer.join(', ').replace(/, ([^,]*)$/, ' und $1')}.</p>` : ''}`.s;
  uhrStarten(el);
  bindTasks(el); bindFokus(el);
  el.querySelector('[data-uf]')?.addEventListener('click', ueberfaelligAssistent);
  el.querySelectorAll('[data-ev]').forEach(li => li.onclick = e => { if (!e.target.closest('a')) eventForm(db.get('events', li.dataset.ev)); });
  const q = { anfrage: () => schnellerfassung(), contact: () => contactForm({}, c => location.hash = '#/kontakte/' + c.id), property: () => propertyForm({}, p => location.hash = '#/objekte/' + p.id), task: () => taskForm(), event: () => eventForm(), note: () => activityForm() };
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = q[b.dataset.q]);
}
