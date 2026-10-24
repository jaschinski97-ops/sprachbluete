import type { VocabEntry } from '@/data/vocab-types';

import { seededRandom, shuffled } from './drills/random';
import type { FSRSCardState, Rating } from './fsrs/types';
import { anchorOf, type PairDirection, targetLanguageOf } from './languages/types';
import { inStage, type LearningStage } from './learning-stages';
import { wordNeed } from './practice-selection';
import { loadOrCreateCardState, rateCard } from './repository';
import { ensureCardStates } from './review-session';
import { type DataStore, getStore } from './storage';
import { loadWordPractice, recordWordPractice, type WordPractice } from './word-practice';
import { compareWriting, editDistance } from './writing/compare';
import { ankerwortFuer, buildWritingPrompt, type WritingPrompt, writingCandidates } from './writing/prompt';
import { WRITING_RATING } from './writing/rating';

/**
 * Wortliste (24.10.2026, Nutzerwunsch): 20 Wörter stehen links, ihre
 * Bedeutungen rechts. Nach „Start“ verschwindet eine Seite, man trägt sie
 * selbst ein, prüft alle auf einmal und macht mit den nächsten 20 weiter.
 *
 * ZWEI RICHTUNGEN:
 * - „Bedeutung eintragen“ (Vorgabe): Wort sehen, Bedeutung in der App-Sprache
 *   tippen — Wiedererkennen mit eigenem Abruf.
 * - „Wort eintragen“: Bedeutung sehen, Wort der Lernsprache tippen — genau die
 *   Prüfung der Schreibübung (`compareWriting`, Artikel, Tonzeichen, Akzente).
 *
 * BEWERTUNG: Beide Richtungen schreiben dieselbe Karte fort wie Karteikarte
 * und Schreibübung (`rateCard`), damit schwache Wörter früher wiederkommen.
 * „Wort eintragen“ bewertet wie die Schreibübung (Gut/Schwer/Nochmal).
 * „Bedeutung eintragen“ vergibt höchstens „Schwer“: Wer die Bedeutung kennt,
 * kann das Wort noch nicht unbedingt selbst bilden; die Karte fragt aber das
 * Bilden ab. Ein „Gut“ würde ihren Abstand zu weit strecken.
 *
 * AUSWAHL: Erst wacklige Wörter (fällig oder zuletzt falsch), dann neue in
 * Häufigkeitsreihenfolge, zuletzt sichere zum Auffüllen. Anders als in den
 * freien Übungen gibt es keine Neu-Grenze: Die Liste IST zum Lernen neuer
 * Wörter da. Was falsch war, steht danach als wacklig wieder vorn.
 */

export const WORD_LIST_SIZE = 20;

export type WordListMode = 'meaning' | 'word';

export type WordListItem = {
  vocabId: string;
  direction: PairDirection;
  /** Das Wort der Lernsprache, mit Artikel wo nötig. */
  word: string;
  /** Lesehilfe (Thai-Umschrift, IPA), oder `null`. */
  roman: string | null;
  /** Die Bedeutung in der App-Sprache, wie sie angezeigt wird. */
  meaning: string;
  /** Die Aufgabe der Schreibübung für die Richtung „Wort eintragen“. */
  writing: WritingPrompt;
};

export type WordList = {
  direction: PairDirection;
  items: WordListItem[];
  /** Wie viele Wörter für diese Richtung und Stufe überhaupt taugen. */
  available: number;
};

/**
 * Welche Wörter in die nächste Liste kommen. Rein, damit die Reihenfolge
 * testbar ist; die Anzeige mischt danach.
 */
export function selectWordListWords<T>(
  candidates: readonly T[],
  options: {
    idOf: (item: T) => string;
    cards: ReadonlyMap<string, FSRSCardState>;
    practice?: ReadonlyMap<string, WordPractice>;
    now: number;
    size: number;
  }
): T[] {
  const { idOf, cards, practice, now, size } = options;
  const rated = candidates.map((item, index) => {
    const id = idOf(item);
    return { item, index, ...wordNeed(cards.get(id), practice?.get(id), now) };
  });
  const byNeed = (a: (typeof rated)[number], b: (typeof rated)[number]) => a.need - b.need || a.index - b.index;
  const wacklig = rated.filter((entry) => entry.group === 'wacklig').sort(byNeed);
  // Neue Wörter in Häufigkeitsreihenfolge: so ist „die nächsten 20“ wörtlich gemeint.
  const neu = rated.filter((entry) => entry.group === 'neu').sort((a, b) => a.index - b.index);
  const sitzt = rated.filter((entry) => entry.group === 'sitzt').sort(byNeed);
  return [...wacklig, ...neu, ...sitzt].slice(0, Math.max(0, size)).map((entry) => entry.item);
}

function wordOf(entry: VocabEntry, language: string): string {
  const noun = language === 'de' ? entry.germanNoun : language === 'es' ? entry.spanishNoun : undefined;
  return noun && !entry.term.toLowerCase().startsWith(`${noun.article} `) ? `${noun.article} ${entry.term}` : entry.term;
}

function romanOf(entry: VocabEntry): string | null {
  const roman = entry.ipa ?? entry.romanization;
  return roman && roman !== entry.term ? roman : null;
}

export function wordListItem(entry: VocabEntry, direction: PairDirection, pool: VocabEntry[] = []): WordListItem {
  return {
    vocabId: entry.id,
    direction,
    word: wordOf(entry, targetLanguageOf(direction)),
    roman: romanOf(entry),
    meaning: ankerwortFuer(entry, direction),
    writing: buildWritingPrompt(entry, direction, pool),
  };
}

export async function buildWordList(options: {
  direction: PairDirection;
  store?: DataStore;
  now?: number;
  size?: number;
  stage?: LearningStage;
  seed?: number;
}): Promise<WordList> {
  const { direction } = options;
  const now = options.now ?? Date.now();
  const db = options.store ?? (await getStore());
  const { entries, cards } = await ensureCardStates(direction, db, now);
  const practice = await loadWordPractice(db);
  const candidates = writingCandidates(direction, inStage(entries, options.stage))
    .filter((entry) => ankerwortFuer(entry, direction).trim().length > 0);
  const synonymPool = writingCandidates(direction, entries);
  const chosen = selectWordListWords(candidates, {
    idOf: (entry) => entry.id,
    cards: new Map(cards.map((card) => [card.vocabId, card])),
    practice,
    now,
    size: options.size ?? WORD_LIST_SIZE,
  });
  return {
    direction,
    items: shuffled(chosen, seededRandom(options.seed ?? now)).map((entry) => wordListItem(entry, direction, synonymPool)),
    available: candidates.length,
  };
}

/* ---------- Bedeutung prüfen ---------- */

/** Artikel und Verbmarker, die man bei einer Bedeutung weglassen darf. */
const LEADING_WORDS: Partial<Record<string, RegExp>> = {
  de: /^(der|die|das|ein|eine|einen|sich)\s+/,
  en: /^(to|the|a|an)\s+/,
  es: /^(el|la|los|las|un|una)\s+/,
  fr: /^(le|la|les|un|une|se)\s+|^l'|^s'/,
  pt: /^(o|a|os|as|um|uma)\s+/,
};

function normalizeMeaning(text: string, language: string): string {
  let basis = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\([^)]*\)|（[^）]*）/g, ' ')
    .replace(/[\p{P}\p{S}]/gu, (character) => (character === "'" ? character : ' '))
    .replace(/\s+/g, ' ')
    .trim();
  const leading = LEADING_WORDS[language];
  if (leading) basis = basis.replace(leading, '').trim();
  return basis.replace(/'/g, '').trim();
}

/** Mehrere Bedeutungen stehen mit Komma, Semikolon oder Schrägstrich getrennt. */
export function meaningTargets(meaning: string): string[] {
  const parts = meaning.split(/[,;/、，；|]/).map((part) => part.trim()).filter(Boolean);
  return [...new Set([meaning.trim(), ...parts])].filter(Boolean);
}

function withoutMarks(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

export type MeaningVerdict = { correct: boolean; exact: boolean };

/**
 * Bedeutung gegen die Bedeutungen des Eintrags. Hier ist die App-Sprache die
 * Antwortsprache, nicht das Lernziel: Großschreibung, Artikel und Akzente
 * zählen deshalb nicht als Fehler, ein kleiner Vertipper bei längeren
 * Wörtern gilt als „richtig, nicht genau“.
 */
export function compareMeaning(given: string, meaning: string, language: string): MeaningVerdict {
  const answer = normalizeMeaning(given, language);
  if (!answer) return { correct: false, exact: false };
  const targets = meaningTargets(meaning).map((target) => normalizeMeaning(target, language)).filter(Boolean);
  if (targets.includes(answer)) return { correct: true, exact: true };
  const bare = withoutMarks(answer);
  for (const target of targets) {
    if (withoutMarks(target) === bare) return { correct: true, exact: false };
    const length = [...target].length;
    // Schriften ohne Wortabstände (Chinesisch, Japanisch, Thai) und kurze
    // Wörter bekommen keine Toleranz: Ein Zeichen anders ist dort ein anderes Wort.
    const tolerance = /\s|[a-zÀ-ɏЀ-ӿ]/.test(target) ? (length >= 9 ? 2 : length >= 5 ? 1 : 0) : 0;
    if (tolerance > 0 && editDistance(bare, withoutMarks(target)) <= tolerance) return { correct: true, exact: false };
  }
  return { correct: false, exact: false };
}

/** Bedeutung erkannt: höchstens „Schwer“ (siehe Kopfkommentar). */
export function ratingForMeaning(verdict: MeaningVerdict): Rating {
  return verdict.correct ? 2 : 1;
}

/* ---------- Auswerten und speichern ---------- */

export type WordListAnswer = {
  item: WordListItem;
  given: string;
  correct: boolean;
  exact: boolean;
  /** Von Hand als richtig gezählt (Synonym, das die Liste nicht kennt). */
  accepted?: boolean;
};

export function checkWordListAnswer(item: WordListItem, mode: WordListMode, given: string): WordListAnswer {
  if (mode === 'word') {
    const verdict = compareWriting(given, { language: item.writing.language, targets: item.writing.targets });
    return { item, given, correct: verdict.correct, exact: verdict.exact };
  }
  const verdict = compareMeaning(given, item.meaning, anchorOf(item.direction));
  return { item, given, correct: verdict.correct, exact: verdict.exact };
}

export function ratingForAnswer(answer: WordListAnswer, mode: WordListMode): Rating {
  if (answer.accepted) return 2;
  if (mode === 'word') {
    // Wie die Schreibübung (`writing/rating.ts`): genau → Gut, Vertipper → Schwer.
    return !answer.correct ? WRITING_RATING.wrong : answer.exact ? WRITING_RATING.exact : WRITING_RATING.typo;
  }
  return ratingForMeaning(answer);
}

/** Schreibt jede Antwort einmal in die Karte (wie die Schreibübung). */
export async function saveWordListAnswers(
  answers: WordListAnswer[],
  mode: WordListMode,
  options: { store?: DataStore; now?: number } = {}
): Promise<void> {
  const now = options.now ?? Date.now();
  const db = options.store ?? (await getStore());
  for (const answer of answers) {
    const card = await loadOrCreateCardState(answer.item.vocabId, answer.item.direction, db, now);
    await rateCard(card, ratingForAnswer(answer, mode), db, now);
    // Auch ins Übungsgedächtnis: Ein falsches Wort steht dann in der nächsten
    // Liste vorn, ein richtiges pausiert einige Stunden (`practice-selection`).
    await recordWordPractice(answer.item.vocabId, answer.correct || Boolean(answer.accepted), now, db).catch(() => {});
  }
}
