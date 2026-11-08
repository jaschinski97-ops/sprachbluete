import { readingOf, termWithArticle } from '@/data/vocab-helpers';
import type { VocabEntry } from '@/data/vocab-types';

import { seededRandom, shuffled } from './drills/random';
import type { FSRSCardState } from './fsrs/types';
import { zeigtUmschrift } from './languages/definitions';
import { targetLanguageOf, type PairDirection } from './languages/types';
import { readMeta, writeMeta } from './repository';
import type { DataStore } from './storage';
import { ankerwortFuer } from './writing/prompt';

/**
 * Die Tempo-Runde (08.11.2026): Flüssigkeitstraining. Nation zählt es zu
 * den vier gleich wichtigen Teilen des Sprachenlernens — bekannter, leichter
 * Stoff, aber schneller als gewohnt, damit Wissen ohne Nachdenken abrufbar
 * wird. Deshalb nur Wörter, die schon sitzen: Karten im Zustand „review“
 * oder „mastered“ und Wörter aus bestandenen Kapiteln.
 *
 * Eine Minute, je Wort zwei Bedeutungen. Die Runde schreibt weder Karten
 * (FSRS) noch Übungsgedächtnis: Sie übt Tempo, nicht Neues. Gespeichert wird
 * nur der eigene Bestwert je Richtung.
 */

export const TEMPO_SECONDS = 60;
/** Darunter wiederholen sich die Wörter zu schnell. */
export const TEMPO_MIN_WORDS = 8;

export type TempoWord = { entry: VocabEntry; meaning: string };

export type TempoItem = {
  id: string;
  vocabId: string;
  /** Wort in der Lernsprache. */
  prompt: string;
  /** Lesehilfe bei eigenen Schriften. */
  roman?: string;
  options: [string, string];
  correctIndex: 0 | 1;
};

/** Die sicheren Wörter einer Richtung, je Bedeutung nur eines. */
export function tempoWords(
  entries: readonly VocabEntry[],
  cards: readonly FSRSCardState[],
  passedChapterWords: ReadonlySet<string>,
  direction: PairDirection
): TempoWord[] {
  const sitzt = new Set(
    cards
      .filter((card) => card.direction === direction && (card.state === 'review' || card.state === 'mastered'))
      .map((card) => card.vocabId)
  );
  const target = targetLanguageOf(direction);
  const seen = new Set<string>();
  return entries.flatMap((entry): TempoWord[] => {
    if (String(entry.language) !== target) return [];
    if (!sitzt.has(entry.id) && !passedChapterWords.has(entry.id)) return [];
    const meaning = ankerwortFuer(entry, direction).trim();
    // Zwei Wörter mit derselben Bedeutung gäben zwei richtige Antworten.
    if (!meaning || seen.has(meaning)) return [];
    seen.add(meaning);
    return [{ entry, meaning }];
  });
}

/**
 * Die Aufgaben einer Runde: alle sicheren Wörter gemischt, bei Bedarf
 * mehrmals hintereinander, nie dasselbe Wort zweimal direkt nacheinander.
 */
export function tempoItems(
  words: readonly TempoWord[],
  direction: PairDirection,
  seed: number,
  // Mehr, als eine Minute schafft (ein Wort braucht mindestens ~0,3 s).
  count = 300
): TempoItem[] {
  if (words.length < 2) return [];
  const random = seededRandom(seed);
  const lesehilfe = zeigtUmschrift(targetLanguageOf(direction));
  const items: TempoItem[] = [];
  let previous: string | null = null;
  while (items.length < count) {
    for (const word of shuffled(words, random)) {
      if (items.length >= count) break;
      if (word.entry.id === previous) continue;
      const others = words.filter((other) => other.meaning !== word.meaning);
      const distractor = others[Math.floor(random() * others.length)].meaning;
      const correctIndex: 0 | 1 = random() < 0.5 ? 0 : 1;
      items.push({
        id: `${items.length}:${word.entry.id}`,
        vocabId: word.entry.id,
        prompt: termWithArticle(word.entry),
        roman: lesehilfe ? readingOf(word.entry) || undefined : undefined,
        options: correctIndex === 0 ? [word.meaning, distractor] : [distractor, word.meaning],
        correctIndex,
      });
      previous = word.entry.id;
    }
  }
  return items;
}

function bestKey(direction: PairDirection): string {
  return `tempo-best:${direction}`;
}

export async function loadTempoBest(direction: PairDirection, store?: DataStore): Promise<number> {
  const value = await readMeta<unknown>(bestKey(direction), 0, store);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Speichert einen neuen Bestwert; liefert den gültigen Bestwert. */
export async function saveTempoBest(direction: PairDirection, score: number, store?: DataStore): Promise<number> {
  const best = await loadTempoBest(direction, store);
  if (score <= best) return best;
  await writeMeta(bestKey(direction), score, store);
  return score;
}
