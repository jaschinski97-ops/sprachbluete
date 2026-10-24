import type { VocabEntry } from '@/data/vocab-types';
import type { UiLanguage } from './i18n/types';

/**
 * Die gelieferte Bedeutung des Beispielsatzes in der App-Sprache (24.10.2026).
 *
 * Zuerst `exampleTranslations[anker]`, bei Anker `de` sonst `exampleGerman`
 * (älterer Bestand ohne das neue Feld). Nie wortweise zusammengesetzt: Fehlt
 * die Übersetzung, gibt es keine Bedeutung (`undefined`).
 */
export function exampleMeaning(entry: VocabEntry, anchor: UiLanguage): string | undefined {
  if (!(entry.exampleTerm ?? '').trim()) return undefined;
  const supplied = entry.exampleTranslations?.[anchor]?.trim();
  if (supplied) return supplied;
  if (anchor === 'de') return (entry.exampleGerman ?? '').trim() || undefined;
  return undefined;
}
