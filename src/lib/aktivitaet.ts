import { useSyncExternalStore } from 'react';

/**
 * Ist der Nutzer gerade aktiv? (25.10.2026, Akku)
 *
 * Die Kirschblüten-Szenen und das Glanzlicht laufen nur, solange jemand die
 * App benutzt. Nach `RUHE_NACH_MS` ohne Berührung, Tastendruck oder Scrollen
 * gilt der Nutzer als ruhend: Die Deko bleibt als stilles Bild stehen und
 * läuft bei der nächsten Berührung an derselben Stelle weiter. Wer liest
 * oder nachdenkt, zahlt so keinen Akku für bewegte Deko.
 *
 * Gemeldet wird von der Wurzel (`app/_layout.tsx`); lesen über
 * `useNutzerAktiv()`.
 */
export const RUHE_NACH_MS = 45_000;

let aktiv = true;
let uhr: ReturnType<typeof setTimeout> | null = null;
const hoerer = new Set<() => void>();

function setze(wert: boolean): void {
  if (aktiv === wert) return;
  aktiv = wert;
  for (const hoeren of hoerer) hoeren();
}

/** Eine Berührung, ein Tastendruck oder Scrollen: aktiv, und die Ruhe-Uhr beginnt neu. */
export function meldeAktivitaet(): void {
  setze(true);
  if (uhr) clearTimeout(uhr);
  uhr = setTimeout(() => setze(false), RUHE_NACH_MS);
}

export function istNutzerAktiv(): boolean {
  return aktiv;
}

function abonniere(hoeren: () => void): () => void {
  hoerer.add(hoeren);
  // Die Uhr läuft erst, wenn jemand zuhört (keine Uhr in Tests ohne Szene).
  if (!uhr) meldeAktivitaet();
  return () => {
    hoerer.delete(hoeren);
  };
}

/** Rendert neu, wenn der Nutzer ruhend wird oder wieder aktiv. */
export function useNutzerAktiv(): boolean {
  return useSyncExternalStore(abonniere, istNutzerAktiv, istNutzerAktiv);
}
