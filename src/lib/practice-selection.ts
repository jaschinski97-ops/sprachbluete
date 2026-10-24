import { Random, shuffled } from './drills/random';
import { REQUEST_RETENTION, retrievability } from './fsrs/fsrs';
import type { FSRSCardState } from './fsrs/types';
import type { WordPractice } from './word-practice';

/**
 * Welche Wörter eine freie Übung abfragt (22.10.2026, Nutzerentscheidung).
 *
 * VORHER sortierten alle freien Übungen nach der Retrievability der Karte,
 * und ein nie gelerntes Wort zählte mit 0 als „am wackligsten“. Bei 2.000
 * Wörtern bestand das Auswahlfenster deshalb fast nur aus nie gelernten
 * Wörtern; gelernte, wacklige Wörter kamen praktisch nie dran. Und weil
 * Auswahlübungen keine Karten fortschreiben, zogen sie Runde für Runde
 * dieselben rund 30 Wörter.
 *
 * JETZT drei Gruppen, in dieser Reihenfolge:
 *
 * 1. **wacklig** — gelernt (mindestens einmal als Karte bewertet), aber
 *    der Bedarf liegt unter der FSRS-Zielerinnerung von 90 %: fällig, fast
 *    fällig oder zuletzt in einer Übung falsch beantwortet.
 * 2. **neu** — nie gelernt; frei nur wenige je Runde (`NEW_WORD_SHARE`),
 *    in Häufigkeitsreihenfolge des Wortschatzes.
 * 3. **sitzt** — gelernt und sicher; füllt eine Runde auf, wenn es nicht
 *    genug Wackliges gibt. Erst danach weitere neue Wörter.
 *
 * Wer noch gar nichts gelernt hat, bekommt eine Runde aus neuen Wörtern —
 * sonst gäbe es keinen Einstieg. Mit fester Wortliste (Kapitel, Heutige
 * Runde) gilt keine Neu-Grenze: Dort IST das Neue der Stoff.
 *
 * Das ÜBUNGSGEDÄCHTNIS (`word-practice.ts`) verschiebt den Bedarf: Was in
 * den letzten 12 Stunden richtig beantwortet wurde, pausiert (es zählt dann
 * als „sitzt“ und füllt nur noch auf). Mehrmals richtig in Folge macht ein
 * Wort für einige Tage weniger dringlich, eine falsche Antwort holt es nach
 * vorn. Beides verblasst mit einer Halbwertszeit von drei Tagen. Die
 * Abstände der Karteikarten bleiben davon unberührt.
 *
 * Innerhalb jeder Gruppe wird wie bisher aus einem Fenster der dringendsten
 * Wörter gezogen, damit sich Runden nicht wörtlich wiederholen.
 */

/** Anteil neuer Wörter an einer freien Runde (mindestens eins). */
export const NEW_WORD_SHARE = 0.2;

/** Aus wie vielen der dringendsten Wörter einer Gruppe gezogen wird. */
export const SELECTION_WINDOW = 3;

/** Halbwertszeit, mit der eine Übungsantwort an Gewicht verliert. */
export const PRACTICE_HALF_LIFE_DAYS = 3;

/** So lange pausiert ein gerade richtig beantwortetes Wort. */
export const PRACTICE_PAUSE_HOURS = 12;
/** Groß genug, um selbst ein überfälliges Wort in „sitzt“ zu schieben. */
const PAUSE_BONUS = 1;

/** Je richtiger Antwort in Folge (höchstens drei) steigt der Bedarf um so viel. */
const CORRECT_BONUS = 0.1;
const MAX_STREAK = 3;
/** Eine falsche Antwort senkt den Bedarf um so viel. */
const WRONG_PENALTY = 0.3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PracticeGroup = 'wacklig' | 'neu' | 'sitzt';

/** Verschiebung durch Übungsantworten: positiv = sitzt besser, negativ = dringender. */
export function practiceAdjustment(practice: WordPractice | undefined, now: number): number {
  if (!practice) return 0;
  const ageDays = Math.max(0, (now - practice.lastAt) / DAY_MS);
  const fade = Math.pow(0.5, ageDays / PRACTICE_HALF_LIFE_DAYS);
  if (!practice.lastCorrect) return -WRONG_PENALTY * fade;
  const pause = now - practice.lastAt < PRACTICE_PAUSE_HOURS * 60 * 60 * 1000 ? PAUSE_BONUS : 0;
  return pause + CORRECT_BONUS * Math.min(practice.streak, MAX_STREAK) * fade;
}

export type WordNeed = {
  group: PracticeGroup;
  /** Kleiner heißt dringender. */
  need: number;
};

export function wordNeed(
  card: FSRSCardState | undefined,
  practice: WordPractice | undefined,
  now: number,
  /** Übungsantworten ohne Karte zählen als gelernt (siehe `knownFromPractice`). */
  knownFromPractice = false
): WordNeed {
  const adjustment = practiceAdjustment(practice, now);
  if (!card || card.lastReview === null) {
    if (knownFromPractice && practice && practice.total > 0) {
      // Ohne Karte keine Retrievability: die Trefferquote vertritt sie.
      const need = practice.correct / practice.total + adjustment;
      return { group: need < REQUEST_RETENTION ? 'wacklig' : 'sitzt', need };
    }
    return { group: 'neu', need: adjustment };
  }
  const need = retrievability(card, now) + adjustment;
  return { group: need < REQUEST_RETENTION ? 'wacklig' : 'sitzt', need };
}

export type PracticeSelectionOptions<T> = {
  /** Die Vokabel-ID eines Kandidaten — Schlüssel für Karte und Übungsgedächtnis. */
  idOf: (item: T) => string;
  cards: ReadonlyMap<string, FSRSCardState>;
  practice?: ReadonlyMap<string, WordPractice>;
  now: number;
  size: number;
  random: Random;
  /**
   * Neue Wörter begrenzen (Vorgabe: ja). `false` für feste Wortlisten wie
   * Kapitel — dort werden neue und wacklige Wörter gemeinsam nach Bedarf
   * gereiht, wie vor dem 22.10.2026.
   */
  limitNew?: boolean;
  /**
   * Ein Wort mit Übungsantworten, aber ohne bewertete Karte gilt als gelernt
   * statt als neu (Vorgabe: nein). Für die mitwachsenden Satzübungen
   * (24.10.2026): Wer ein Wort schon in Übungen hatte, kennt es.
   */
  knownFromPractice?: boolean;
};

/**
 * Wählt bis zu `size` Kandidaten. Die Eingabereihenfolge zählt als
 * Gleichstand-Regel (der Wortschatz kommt nach Häufigkeit sortiert).
 */
export function selectPracticeWords<T>(
  candidates: readonly T[],
  options: PracticeSelectionOptions<T>
): T[] {
  const { idOf, cards, practice, now, size, random } = options;
  const limitNew = options.limitNew ?? true;
  if (size <= 0 || candidates.length === 0) return [];

  const rated = candidates.map((item, index) => {
    const id = idOf(item);
    return { item, index, ...wordNeed(cards.get(id), practice?.get(id), now, options.knownFromPractice) };
  });
  type Rated = (typeof rated)[number];
  const byNeed = (a: Rated, b: Rated) => a.need - b.need || a.index - b.index;

  const take = (list: Rated[], count: number): Rated[] => {
    if (count <= 0) return [];
    const window = list.slice(0, Math.max(count, count * SELECTION_WINDOW));
    return shuffled(window, random).slice(0, count);
  };

  const sitzt = rated.filter((entry) => entry.group === 'sitzt').sort(byNeed);

  if (!limitNew) {
    const vorn = rated.filter((entry) => entry.group !== 'sitzt').sort(byNeed);
    const ausVorn = Math.min(vorn.length, size);
    const chosen = [...take(vorn, ausVorn), ...take(sitzt, Math.min(sitzt.length, size - ausVorn))];
    return shuffled(chosen, random).map((entry) => entry.item);
  }

  const wacklig = rated.filter((entry) => entry.group === 'wacklig').sort(byNeed);
  const neu = rated.filter((entry) => entry.group === 'neu').sort(byNeed);

  const nichtsGelernt = wacklig.length + sitzt.length === 0;
  const neuQuote = Math.min(neu.length, nichtsGelernt ? size : Math.max(1, Math.round(size * NEW_WORD_SHARE)));

  const ausWacklig = Math.min(wacklig.length, size - neuQuote);
  let rest = size - ausWacklig;
  const neuErst = Math.min(neuQuote, rest);
  rest -= neuErst;
  const ausSitzt = Math.min(sitzt.length, rest);
  rest -= ausSitzt;
  const ausNeu = neuErst + Math.min(neu.length - neuErst, rest);

  const chosen = [...take(wacklig, ausWacklig), ...take(neu, ausNeu), ...take(sitzt, ausSitzt)];
  return shuffled(chosen, random).map((entry) => entry.item);
}
