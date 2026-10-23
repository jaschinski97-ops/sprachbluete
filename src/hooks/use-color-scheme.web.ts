import { useSyncExternalStore } from 'react';

import { getErscheinung, subscribeErscheinung } from '@/lib/appearance';

/**
 * Hell/Dunkel im Web — direkt aus der Media-Query, bei jedem Rendern frisch.
 *
 * WARUM NICHT `useColorScheme` VON react-native-web (23.10.2026): Dessen Hook
 * hält den Modus als eigenen Zustand je Komponente und ändert ihn nur, wenn
 * das Änderungs-Ereignis eintrifft, während die Komponente angemeldet ist.
 * Ein gerade verdeckter Reiter verpasste den Wechsel und blieb dauerhaft im
 * alten Modus: Nach hell → dunkel stand die helle Seitenfläche unter heller
 * Schrift (Mischzustand). `useSyncExternalStore` liest den aktuellen Wert bei
 * jedem Rendern und beim Anmelden neu, kann also nicht veralten.
 *
 * Statisches Rendern: Der Server-Schnappschuss ist „light“; beim Hydrieren
 * gleicht React auf den echten Wert ab (vorher eigener `hasHydrated`-Zustand).
 *
 * Seit 23.10.2026 zählt zuerst die Wahl aus den Einstellungen (Tag, Nacht
 * oder wie das Gerät, `lib/appearance`).
 */

const query =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Gerätewechsel UND die eigene Wahl in den Einstellungen (`lib/appearance`). */
function subscribe(onChange: () => void): () => void {
  const abmelden = subscribeErscheinung(onChange);
  if (!query) return abmelden;
  query.addEventListener('change', onChange);
  return () => {
    abmelden();
    query.removeEventListener('change', onChange);
  };
}

function getSnapshot(): 'light' | 'dark' {
  const wahl = getErscheinung();
  if (wahl !== 'system') return wahl;
  return query?.matches ? 'dark' : 'light';
}

function getServerSnapshot(): 'light' | 'dark' {
  return 'light';
}

export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
