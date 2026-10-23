import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

import { DataStore, getStore } from '@/lib/storage';

/**
 * Tag oder Nacht — vom Gerät übernommen oder vom Nutzer festgelegt
 * (Nutzerwunsch 23.10.2026: Wahl in den Einstellungen).
 *
 * Ein Modul-Speicher statt Kontext: Die Farb-Hooks (`use-color-scheme`)
 * lesen die Wahl in jeder Komponente, ohne dass ein Provider sie
 * durchreichen muss. Gespeichert wird in der Sammlung `meta`, wie die
 * App-Sprache (`lib/i18n/prefs`).
 *
 * Nativ setzt die Wahl zusätzlich `Appearance.setColorScheme`, damit auch
 * Systemelemente (Statusleiste, Tastatur, Dialoge) mitziehen. Im Web gibt
 * es das nicht; dort entscheidet allein der Hook.
 */
export type Erscheinung = 'system' | 'light' | 'dark';

const SCHLUESSEL = 'appearance';
const WERTE: readonly Erscheinung[] = ['system', 'light', 'dark'];

let aktuell: Erscheinung = 'system';
const hoerer = new Set<() => void>();

function setze(wert: Erscheinung) {
  if (wert === aktuell) return;
  aktuell = wert;
  if (Platform.OS !== 'web') Appearance.setColorScheme(wert === 'system' ? 'unspecified' : wert);
  // Web: Seitenfarbe des Browsers mitziehen (global.css, `data-erscheinung`).
  else if (typeof document !== 'undefined') document.documentElement.dataset.erscheinung = wert;
  for (const hoererFn of hoerer) hoererFn();
}

export function normalizeErscheinung(wert: unknown): Erscheinung {
  return WERTE.includes(wert as Erscheinung) ? (wert as Erscheinung) : 'system';
}

export function getErscheinung(): Erscheinung {
  return aktuell;
}

export function subscribeErscheinung(fn: () => void): () => void {
  hoerer.add(fn);
  return () => {
    hoerer.delete(fn);
  };
}

/** Liest die gespeicherte Wahl beim Start; ohne Speicherstand gilt `system`. */
export async function loadErscheinung(store?: DataStore): Promise<Erscheinung> {
  const db = store ?? (await getStore());
  const wert = normalizeErscheinung(await db.get<string>('meta', SCHLUESSEL));
  setze(wert);
  return wert;
}

/** Übernimmt die Wahl sofort und speichert sie. */
export async function saveErscheinung(wert: Erscheinung, store?: DataStore): Promise<void> {
  setze(wert);
  const db = store ?? (await getStore());
  await db.put('meta', SCHLUESSEL, wert);
}

/** Die aktuelle Wahl, mit Neuzeichnen bei jeder Änderung. */
export function useErscheinung(): Erscheinung {
  return useSyncExternalStore(subscribeErscheinung, getErscheinung, getErscheinung);
}

/** Nur für Tests: zurück auf „wie das Gerät“, ohne Speicher. */
export function resetErscheinungForTests(): void {
  aktuell = 'system';
  for (const hoererFn of hoerer) hoererFn();
}
