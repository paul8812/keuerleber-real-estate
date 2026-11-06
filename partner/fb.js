// Rückmeldungen der Vertriebe zu Objekten: Stufen und Auswertung (gemeinsam für Partner-Ansicht und Master-Dashboard).
export const STAGES = [
  { id: 'pruefung', label: 'Interessent in Prüfung', short: 'In Prüfung', hint: 'Ein Kunde prüft das Objekt (Unterlagen, Besichtigung).', color: '#6f9bc9' },
  { id: 'finanzierung', label: 'Finanzierungsanfrage', short: 'Finanzierung', hint: 'Die Finanzierung wird bei der Bank angefragt.', color: '#2f5d8a' },
  { id: 'reserviert', label: 'Reservieren – Kunde sagt zu', short: 'Reservierung', hint: 'Der Kunde möchte kaufen. Das Objekt soll für ihn reserviert werden.', color: '#c98a1b' },
  { id: 'absage', label: 'Absage', short: 'Absage', hint: 'Kein Interesse mehr oder Finanzierung nicht möglich.', color: '#98a2ab' },
];
export const stageOf = (id) => STAGES.find((s) => s.id === id) ?? STAGES[0];

/** Neuester Stand je Interessent (Partner × Objekt × Name). */
export function chains(events) {
  const m = new Map();
  for (const e of [...events].sort((a, b) => a.t - b.t)) m.set(`${e.pid}|${e.oid}|${String(e.k || '').trim().toLowerCase()}`, e);
  return [...m.values()];
}
