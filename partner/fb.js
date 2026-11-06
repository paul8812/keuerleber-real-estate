// Rückmeldungen der Vertriebe zu Objekten: Stufen und Auswertung (gemeinsam für Partner-Ansicht und Master-Dashboard).
export const STAGES = [
  { id: 'pruefung', label: 'Interessent in Prüfung', short: 'In Prüfung', hint: 'Ein Kunde prüft das Objekt (Unterlagen, Besichtigung).', color: 'var(--schiefer)' },
  { id: 'finanzierung', label: 'Finanzierungsanfrage', short: 'Finanzierung', hint: 'Die Finanzierung wird bei der Bank angefragt.', color: 'var(--gold)' },
  { id: 'reserviert', label: 'Reservieren – Kunde sagt zu', short: 'Reservierung', hint: 'Der Kunde möchte kaufen. Das Objekt soll für ihn reserviert werden.', color: 'var(--gut)' },
  { id: 'absage', label: 'Absage', short: 'Absage', hint: 'Kein Interesse mehr oder Finanzierung nicht möglich.', color: 'var(--muted)' },
];
export const stageOf = (id) => STAGES.find((s) => s.id === id) ?? STAGES[0];

/** Neuester Stand je Interessent (Partner × Objekt × Name). */
export function chains(events) {
  const m = new Map();
  for (const e of [...events].sort((a, b) => a.t - b.t)) m.set(`${e.pid}|${e.oid}|${String(e.k || '').trim().toLowerCase()}`, e);
  return [...m.values()];
}
