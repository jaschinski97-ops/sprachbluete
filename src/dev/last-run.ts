/**
 * Ergebnis des letzten Studio-Laufs (25.10.2026). Am Laufende schreibt der
 * Helper den Katalog neu; die Entwicklungs-App lädt dann neu und springt zur
 * Übersicht. Damit die Meldung (übernommen, abgelehnt, Abbruchgrund) das
 * überlebt, liegt sie im localStorage des Browsers.
 */
const SCHLUESSEL = 'studio-letzter-lauf';

export type LetzterLauf = { text: string; at: number };

export function merkeLetztenLauf(text: string, at = Date.now()): void {
  try { globalThis.localStorage?.setItem(SCHLUESSEL, JSON.stringify({ text, at })); } catch { /* ohne Speicher keine Erinnerung */ }
}

export function ladeLetztenLauf(): LetzterLauf | null {
  try {
    const roh = globalThis.localStorage?.getItem(SCHLUESSEL);
    if (!roh) return null;
    const wert = JSON.parse(roh) as Partial<LetzterLauf>;
    return typeof wert.text === 'string' && typeof wert.at === 'number' ? { text: wert.text, at: wert.at } : null;
  } catch { return null; }
}

/** Kurzfassung der abgelehnten Einträge: Anzahl plus bis zu fünf Gründe. */
export function abgelehntZeile(rejected: readonly { id: string; reason: string }[]): string | null {
  if (!rejected.length) return null;
  const gruende = rejected.slice(0, 5).map((r) => `${r.id}: ${r.reason}`).join(' · ');
  return `${rejected.length} von der Helper-Prüfung abgelehnt (der nächste Lauf erzeugt sie neu): ${gruende}${rejected.length > 5 ? ' …' : ''}`;
}
