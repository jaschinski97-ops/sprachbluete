import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { ensureLanguages, holdLanguages } from '@/lib/content/catalog-languages';
import { catalogRevision, isLanguageLoaded, subscribeCatalog } from '@/lib/content/catalog-state';
import type { LanguageCode } from '@/lib/languages/types';

/** Zeichnet neu, sobald sich der geladene Katalog ändert (Sprache geladen oder entladen). */
export function useCatalogRevision(): number {
  return useSyncExternalStore(subscribeCatalog, catalogRevision, catalogRevision);
}

/**
 * Hält die Lernsprachen eines Bildschirms geladen (Katalog je Lernsprache).
 * `ready` ist sofort wahr, wenn alle schon da sind — im Entwicklungsbau
 * immer. Fehler (Datei fehlt, kaputt, Zeitüberschreitung) kommen als
 * `error`; `retry` versucht es noch einmal.
 */
export function useCatalogLanguages(languages: readonly LanguageCode[]): {
  ready: boolean;
  error: Error | null;
  retry: () => void;
} {
  useCatalogRevision();
  const key = languages.join('|');
  const [attempt, setAttempt] = useState(0);
  // Der Fehler gilt nur für die Anfrage, die ihn hatte (Sprachen und Versuch).
  const [failure, setFailure] = useState<{ key: string; attempt: number; error: Error } | null>(null);

  useEffect(() => {
    const list = (key ? key.split('|') : []) as LanguageCode[];
    const release = holdLanguages(list);
    let cancelled = false;
    ensureLanguages(list).catch((e: unknown) => {
      if (!cancelled) setFailure({ key, attempt, error: e instanceof Error ? e : new Error(String(e)) });
    });
    return () => {
      cancelled = true;
      release();
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const error = failure?.key === key && failure.attempt === attempt ? failure.error : null;
  return { ready: languages.every(isLanguageLoaded), error, retry };
}
