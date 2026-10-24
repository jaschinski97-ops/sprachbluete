/**
 * Ein Bild je Begriff statt je Wort und Sprache (24.10.2026).
 *
 * Apfel, apple, manzana und แอปเปิ้ล tragen denselben Begriff `c:apple` und
 * teilen EIN Bild. Eine neue Lernsprache bekommt so jedes vorhandene Bild
 * mit, und ein Lauf bezahlt je Begriff höchstens einmal.
 *
 * Drei Arten Bild-Dokument, in dieser Reihenfolge gesucht:
 *   1. Sprach-Ausnahme: `concept` + `language` (Geld, typisches Essen) —
 *      gewinnt für diese Lernsprache vor dem gemeinsamen Bild.
 *   2. Gemeinsames Bild: `concept`, ohne `language`.
 *   3. Alter Bestand: Bild-ID = Wort-ID (`vocabId`), gilt nur für das Wort.
 *
 * Reine Logik ohne Expo: Helper, Paketbau und Katalog-Aufteilung laden die
 * Datei über `scripts/content/domain.cjs`.
 */

import { CONCEPT_PREFIX, isSharedConcept } from '../concepts';
import { LANGUAGE_CODES } from '../languages/types';

/** Präfix der Bild-IDs je Begriff — `c:` ist in IDs nicht erlaubt. */
export const CONCEPT_IMAGE_PREFIX = 'concept-';

/** Was die Bildsuche von einem Wort braucht. */
export type ImageWord = { id: string; concept?: string; language?: string };

/** Was die Sprachzuordnung von einem Bild-Dokument braucht. */
export type ImageDocLike = { id: string; vocabId?: string; concept?: string; language?: string };

/**
 * Bild-ID zu einem Bildschlüssel (`imageKeyOf`): `c:apple` → `concept-apple`,
 * mit Sprach-Ausnahme `concept-apple-th`. Eine Wort-ID bleibt, wie sie ist.
 */
export function imageIdFor(key: string, language?: string): string {
  if (!isSharedConcept(key)) return key;
  const base = `${CONCEPT_IMAGE_PREFIX}${key.slice(CONCEPT_PREFIX.length)}`;
  return language ? `${base}-${language}` : base;
}

/** Hängt das Bild an einem gemeinsamen Begriff (und nicht an einer Wort-ID)? */
export function isConceptImage(doc: { concept?: string }): boolean {
  return isSharedConcept(doc.concept);
}

/**
 * Bild-IDs, unter denen ein Wort sein Bild findet — wichtigste zuerst:
 * Ausnahme seiner Sprache, gemeinsames Bild des Begriffs, eigenes altes Bild.
 */
export function imageCandidateIds(word: ImageWord): string[] {
  const ids: string[] = [];
  if (isSharedConcept(word.concept)) {
    if (word.language) ids.push(imageIdFor(word.concept, word.language));
    ids.push(imageIdFor(word.concept));
  }
  ids.push(word.id);
  return ids;
}

/**
 * Welche Lernsprachen ein Bild zeigen: die Ausnahme nur ihre Sprache, das
 * gemeinsame Bild jede Sprache mit einem Wort dieses Begriffs, das alte
 * Bild die Sprache seines Worts. Leer heißt: kein Wort nutzt es (gerade).
 */
export function imageLanguagesOf(doc: ImageDocLike, words: readonly ImageWord[]): string[] {
  if (isConceptImage(doc)) {
    if (doc.language) return [doc.language];
    const used = new Set<string>();
    for (const word of words) {
      if (word.concept === doc.concept && word.language) used.add(word.language);
    }
    return [...used].sort();
  }
  const own = words.find((word) => word.id === (doc.vocabId || doc.id));
  return own?.language ? [own.language] : [];
}

/**
 * Die Sprache, deren Löschstichtag (`clearedBefore['images:<lang>']`) ein
 * Bild betrifft. Ein gemeinsames Bild gehört keiner einzelnen Sprache.
 */
export function imageOwnLanguage(doc: ImageDocLike, words: readonly ImageWord[]): string | undefined {
  if (isConceptImage(doc)) return doc.language || undefined;
  return words.find((word) => word.id === (doc.vocabId || doc.id))?.language;
}

/**
 * Gehört ein Bild zu einer Lösch-Auswahl von Sprachen? Ein gemeinsames Bild
 * nur, wenn ALLE Sprachen, die es zeigen, gewählt sind — „Thai-Bilder
 * löschen“ nimmt Englisch sein Bild nicht weg. Ein Bild, das (noch) kein
 * Wort nutzt, nur bei Auswahl aller Lernsprachen.
 */
export function imageInLanguageSelection(
  doc: ImageDocLike,
  words: readonly ImageWord[],
  languages: readonly string[]
): boolean {
  const used = imageLanguagesOf(doc, words);
  if (!isConceptImage(doc) || doc.language) return used.length > 0 && used.every((code) => languages.includes(code));
  if (used.length === 0) return LANGUAGE_CODES.every((code) => languages.includes(code));
  return used.every((code) => languages.includes(code));
}

/**
 * Muss das Bild mit diesen Wörtern gehen? Altes Bild: wenn sein Wort geht.
 * Begriffsbild: wenn danach kein Wort mehr übrig ist, das es zeigt.
 */
export function imageOrphanedBy(
  doc: ImageDocLike,
  removedIds: ReadonlySet<string>,
  words: readonly ImageWord[]
): boolean {
  if (!isConceptImage(doc)) return removedIds.has(doc.vocabId || doc.id);
  const before = words.filter((word) => word.concept === doc.concept && (!doc.language || word.language === doc.language));
  if (!before.some((word) => removedIds.has(word.id))) return false;
  return before.every((word) => removedIds.has(word.id));
}
