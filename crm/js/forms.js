// Formulare (Modals) für alle Datentypen
import * as db from './db.js';
import { html, raw, inp, area, sel, chk, modal, toast, today, uid, fullName } from './util.js';
import { KONTAKT_ARTEN, QUELLEN, OBJEKT_ARTEN, OBJEKT_STATUS, ENERGIE_KLASSEN, HEIZUNG, PIPELINES, DEFAULT_PROB, TERMIN_ARTEN, PRIOS, WIEDERHOLUNG, AKTIVITAET_ARTEN } from './consts.js';
import { contactOpts, propOpts } from './ui.js';

const STAT = ['Aktiv', 'Ruhend', 'Archiv'];

export function contactForm(c = {}, done) {
  const isNew = !c.id;
  modal(isNew ? 'Neuer Kontakt' : 'Kontakt bearbeiten', html`
    ${sel('kategorie', 'Art', KONTAKT_ARTEN, c.kategorie || 'Interessent (Kauf)')}
    ${sel('anrede', 'Anrede', ['Frau', 'Herr', 'Divers', 'Firma'], c.anrede || 'Frau')}
    ${inp('vorname', 'Vorname', c.vorname)}${inp('nachname', 'Nachname', c.nachname)}
    ${inp('firma', 'Firma', c.firma)}${inp('email', 'E-Mail', c.email, { type: 'email' })}
    ${inp('tel', 'Telefon', c.tel, { type: 'tel' })}${inp('mobil', 'Mobil', c.mobil, { type: 'tel' })}
    ${inp('strasse', 'Straße', c.strasse)}${inp('plz', 'PLZ', c.plz)}${inp('ort', 'Ort', c.ort)}
    ${sel('quelle', 'Quelle', QUELLEN, c.quelle, { blank: 1 })}${inp('tags', 'Tags (Komma)', c.tags)}
    ${sel('status', 'Status', STAT, c.status || 'Aktiv')}${inp('geburtstag', 'Geburtstag', c.geburtstag, { type: 'date' })}
    ${inp('followup', 'Wiedervorlage', c.followup, { type: 'date' })}${chk('dsgvo', 'Einwilligung zur Datenverarbeitung (DSGVO) liegt vor', c.dsgvo)}
    <h4 class="full">Suchprofil (für automatisches Objekt-Matching)</h4>
    ${chk('sp_aktiv', 'Suchprofil aktiv', c.sp_aktiv, { cls: 'full' })}
    ${sel('sp_vermarktung', 'Kauf / Miete', ['Kauf', 'Miete'], c.sp_vermarktung, { blank: 1 })}${sel('sp_art', 'Objektart', OBJEKT_ARTEN, c.sp_art, { blank: 1 })}
    ${inp('sp_budgetMax', 'Budget max. (€)', c.sp_budgetMax, { type: 'number' })}${inp('sp_flaecheMin', 'Wohnfläche min. (m²)', c.sp_flaecheMin, { type: 'number' })}
    ${inp('sp_zimmerMin', 'Zimmer min.', c.sp_zimmerMin, { type: 'number', step: '0.5' })}${inp('sp_orte', 'Orte / PLZ (Komma)', c.sp_orte)}
    ${area('notiz', 'Notizen', c.notiz)}`,
    {
      wide: true,
      onSave: async v => {
        if (!v.vorname && !v.nachname && !v.firma) { toast('Bitte Namen oder Firma angeben', 'err'); return false; }
        const rec = await db.save('contacts', { ...c, ...v });
        if (isNew) await db.log('system', 'Kontakt angelegt', { contactId: rec.id });
        toast('Kontakt gespeichert'); done && done(rec);
      },
      danger: isNew ? null : { label: 'Löschen', confirm: 'Kontakt wirklich löschen? Verknüpfte Aufgaben/Einträge bleiben ohne Zuordnung bestehen.', fn: async () => { await db.del('contacts', c.id); location.hash = '#/kontakte'; } },
    });
}

export function propertyForm(p = {}, done) {
  const isNew = !p.id;
  modal(isNew ? 'Neues Objekt' : 'Objekt bearbeiten', html`
    ${inp('titel', 'Titel / Bezeichnung', p.titel, { req: 1, cls: 'full' })}
    ${sel('vermarktung', 'Vermarktung', ['Kauf', 'Miete'], p.vermarktung || 'Kauf')}${sel('art', 'Objektart', OBJEKT_ARTEN, p.art || 'Eigentumswohnung')}
    ${sel('status', 'Status', OBJEKT_STATUS, p.status || 'Akquise')}${sel('eigentuemerId', 'Eigentümer', contactOpts(), p.eigentuemerId, { blank: 1 })}
    ${inp('strasse', 'Straße / Nr.', p.strasse)}${inp('plz', 'PLZ', p.plz)}${inp('ort', 'Ort', p.ort)}
    ${inp('preis', 'Preis / Kaltmiete (€)', p.preis, { type: 'number' })}${inp('flaeche', 'Wohnfläche (m²)', p.flaeche, { type: 'number', step: '0.1' })}
    ${inp('grundstueck', 'Grundstück (m²)', p.grundstueck, { type: 'number' })}${inp('zimmer', 'Zimmer', p.zimmer, { type: 'number', step: '0.5' })}
    ${inp('baujahr', 'Baujahr', p.baujahr, { type: 'number' })}${inp('etage', 'Etage', p.etage)}
    ${inp('bad', 'Bäder', p.bad, { type: 'number' })}${inp('stellplaetze', 'Stellplätze', p.stellplaetze, { type: 'number' })}
    ${sel('heizung', 'Heizung', HEIZUNG, p.heizung, { blank: 1 })}${inp('hausgeld', 'Hausgeld mtl. (€)', p.hausgeld, { type: 'number' })}
    <h4 class="full">Energieausweis</h4>
    ${sel('eKlasse', 'Energieklasse', ENERGIE_KLASSEN, p.eKlasse, { blank: 1 })}${inp('eWert', 'Verbrauch (kWh/m²a)', p.eWert, { type: 'number' })}
    ${inp('eGueltig', 'Gültig bis', p.eGueltig, { type: 'date' })}
    <h4 class="full">Auftrag & Provision</h4>
    ${inp('auftragVon', 'Maklervertrag ab', p.auftragVon, { type: 'date' })}${inp('auftragBis', 'Maklervertrag bis', p.auftragBis, { type: 'date' })}
    ${chk('alleinauftrag', 'Alleinauftrag', p.alleinauftrag)}${inp('provisionGesamt', 'Provision gesamt (%)', p.provisionGesamt, { type: 'number', step: '0.01' })}
    ${inp('mieteJahr', 'Ist-Jahresmiete (€, für Rendite)', p.mieteJahr, { type: 'number' })}${inp('eingestelltAm', 'Online seit', p.eingestelltAm, { type: 'date' })}
    ${area('beschreibung', 'Objektbeschreibung (für Exposé)', p.beschreibung, { rows: 4 })}
    ${area('ausstattung', 'Ausstattung / Lage', p.ausstattung)}
    ${area('bilder', 'Bild-URLs (eine pro Zeile, z. B. objektbilder/xyz.jpg)', p.bilder, { rows: 3 })}
    ${area('notiz', 'Interne Notizen', p.notiz)}`,
    {
      wide: true,
      onSave: async v => {
        const rec = await db.save('properties', { ...p, ...v, nr: p.nr || db.nextNr('OBJ-', 'properties') });
        if (isNew) await db.log('system', 'Objekt angelegt', { propertyId: rec.id });
        else if (p.status !== v.status) await db.log('system', `Status: ${p.status} → ${v.status}`, { propertyId: rec.id });
        toast('Objekt gespeichert'); done && done(rec);
      },
      danger: isNew ? null : { label: 'Löschen', confirm: 'Objekt wirklich löschen?', fn: async () => { await db.del('properties', p.id); location.hash = '#/objekte'; } },
    });
}

export function dealForm(d = {}, done) {
  const isNew = !d.id; const board = d.board || 'akquise';
  modal(isNew ? 'Neuer Vorgang' : 'Vorgang bearbeiten', html`
    ${inp('titel', 'Titel', d.titel, { req: 1, cls: 'full' })}
    ${sel('board', 'Pipeline', Object.entries(PIPELINES).map(([k, v]) => [k, v.name]), board)}
    ${sel('stage', 'Phase', [...new Set(Object.values(PIPELINES).flatMap(p => p.stages))], d.stage || PIPELINES[board].stages[0])}
    ${sel('contactId', 'Kontakt', contactOpts(), d.contactId, { blank: 1 })}${sel('propertyId', 'Objekt', propOpts(), d.propertyId, { blank: 1 })}
    ${inp('wert', 'Objektwert / Kaufpreis (€)', d.wert, { type: 'number' })}${inp('provision', 'Provision gesamt (%) – leer = Standard', d.provision, { type: 'number', step: '0.01' })}
    ${inp('wahrscheinlichkeit', 'Wahrscheinlichkeit (%) – leer = automatisch', d.wahrscheinlichkeit, { type: 'number' })}${inp('naechsterSchritt', 'Nächster Schritt', d.naechsterSchritt)}
    ${inp('faellig', 'Fällig am', d.faellig, { type: 'date' })}${inp('verlustGrund', 'Verlustgrund (falls verloren)', d.verlustGrund)}
    ${area('notiz', 'Notiz', d.notiz)}`,
    {
      wide: true,
      onSave: async v => {
        const old = d.stage; const P = PIPELINES[v.board];
        if (!P.stages.includes(v.stage)) { toast('Phase passt nicht zur Pipeline', 'err'); return false; }
        const rec = { ...d, ...v };
        if ((v.stage === P.won || v.stage === P.lost) && !rec.closedAt) rec.closedAt = today(); if (v.stage !== P.won && v.stage !== P.lost) rec.closedAt = '';
        await db.save('deals', rec);
        if (isNew) await db.log('system', `Vorgang „${v.titel}“ angelegt (${v.stage})`, { contactId: v.contactId, propertyId: v.propertyId, dealId: rec.id });
        else if (old !== v.stage) await db.log('system', `Vorgang „${v.titel}“: ${old} → ${v.stage}`, { contactId: v.contactId, propertyId: v.propertyId, dealId: rec.id });
        toast('Vorgang gespeichert'); done && done(rec);
      },
      danger: isNew ? null : { label: 'Löschen', confirm: 'Vorgang löschen?', fn: async () => { await db.del('deals', d.id); } },
      onMount: el => { const b = el.querySelector('[name=board]'), s = el.querySelector('[name=stage]'); b.onchange = () => { s.value = PIPELINES[b.value].stages[0]; }; },
    });
}

export function taskForm(t = {}, done) {
  const isNew = !t.id;
  modal(isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten', html`
    ${inp('titel', 'Aufgabe', t.titel, { req: 1, cls: 'full' })}
    ${inp('faellig', 'Fällig am', t.faellig ?? today(), { type: 'date' })}${sel('prio', 'Priorität', PRIOS, t.prio || 'normal')}
    ${sel('wiederholung', 'Wiederholung', WIEDERHOLUNG, t.wiederholung || '')}${chk('done', 'Erledigt', t.done)}
    ${sel('contactId', 'Kontakt', contactOpts(), t.contactId, { blank: 1 })}${sel('propertyId', 'Objekt', propOpts(), t.propertyId, { blank: 1 })}
    ${area('notiz', 'Notiz', t.notiz)}`,
    {
      onSave: async v => { await db.save('tasks', { ...t, ...v }); toast('Aufgabe gespeichert'); done && done(); },
      danger: isNew ? null : { label: 'Löschen', confirm: 'Aufgabe löschen?', fn: async () => { await db.del('tasks', t.id); } },
    });
}

export function eventForm(e = {}, done) {
  const isNew = !e.id;
  modal(isNew ? 'Neuer Termin' : 'Termin bearbeiten', html`
    ${inp('titel', 'Titel', e.titel, { req: 1, cls: 'full' })}
    ${sel('art', 'Art', TERMIN_ARTEN, e.art || 'Besichtigung')}${inp('datum', 'Datum', e.datum ?? today(), { type: 'date', req: 1 })}
    ${inp('start', 'Beginn', e.start ?? '10:00', { type: 'time' })}${inp('ende', 'Ende', e.ende ?? '11:00', { type: 'time' })}
    ${inp('ort', 'Ort', e.ort, { cls: 'full' })}
    ${sel('contactId', 'Kontakt', contactOpts(), e.contactId, { blank: 1 })}${sel('propertyId', 'Objekt', propOpts(), e.propertyId, { blank: 1 })}
    ${area('notiz', 'Notiz', e.notiz)}`,
    {
      onSave: async v => { const rec = await db.save('events', { ...e, ...v }); if (isNew && v.contactId) await db.log(v.art === 'Besichtigung' ? 'besichtigung' : 'meeting', `${v.art} geplant am ${v.datum} ${v.start}`, { contactId: v.contactId, propertyId: v.propertyId }); toast('Termin gespeichert'); done && done(rec); },
      danger: isNew ? null : { label: 'Löschen', confirm: 'Termin löschen?', fn: async () => { await db.del('events', e.id); } },
    });
}

export function activityForm(refs = {}, done) {
  modal('Eintrag hinzufügen', html`
    ${sel('art', 'Art', AKTIVITAET_ARTEN.filter(a => a[0] !== 'system').map(a => [a[0], a[2] + ' ' + a[1]]), 'notiz')}
    ${sel('contactId', 'Kontakt', contactOpts(), refs.contactId, { blank: 1 })}${sel('propertyId', 'Objekt', propOpts(), refs.propertyId, { blank: 1 })}
    ${area('text', 'Inhalt', '', { rows: 4, cls: 'full' })}
    ${inp('followup', 'Wiedervorlage setzen (optional)', '', { type: 'date' })}`,
    {
      onSave: async v => {
        if (!v.text) { toast('Bitte Text eingeben', 'err'); return false; }
        await db.log(v.art, v.text, { contactId: v.contactId, propertyId: v.propertyId });
        if (v.followup && v.contactId) { const c = db.get('contacts', v.contactId); if (c) await db.save('contacts', { ...c, followup: v.followup }); await db.save('tasks', { titel: 'Nachfassen: ' + fullName(c), faellig: v.followup, prio: 'normal', contactId: v.contactId, propertyId: v.propertyId, done: false }); }
        toast('Eintrag gespeichert'); done && done();
      },
    });
}
