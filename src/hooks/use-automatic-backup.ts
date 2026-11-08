import { useEffect } from 'react';
import { AppState } from 'react-native';

import { writeLocalBackup } from '@/lib/local-backup';

/** Erst nach dem Start sichern, damit das Laden nicht wartet. */
const START_DELAY_MS = 8_000;
/** Höchstens so oft — der Wechsel in den Hintergrund kann oft kommen. */
const MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Die automatische Sicherung (`lib/local-backup.ts`): einmal kurz nach dem
 * Start und beim Wechsel in den Hintergrund, höchstens alle zehn Minuten.
 * Fehler bleiben still — die Sicherung ist ein Netz, keine Aufgabe.
 */
export function useAutomaticBackup(): void {
  useEffect(() => {
    let last = 0;
    let running = false;
    const save = () => {
      const now = Date.now();
      if (running || now - last < MIN_INTERVAL_MS) return;
      running = true;
      last = now;
      void writeLocalBackup()
        .catch(() => {})
        .finally(() => {
          running = false;
        });
    };
    const start = setTimeout(save, START_DELAY_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') save();
    });
    return () => {
      clearTimeout(start);
      subscription.remove();
    };
  }, []);
}
