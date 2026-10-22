import type { FSRSCardState } from './fsrs/types';
import type { PairDirection } from './languages/types';
import { loadCardStatesForDirection } from './repository';
import { DataStore, getStore, withStoreLock } from './storage';

/**
 * Übungsgedächtnis je Wort (22.10.2026).
 *
 * WARUM NEBEN DEN FSRS-KARTEN: Auswahlübungen (Hören, Ton, Artikel …)
 * schreiben bewusst keine Karten fort (AE-16) — eine Auswahl aus vier
 * Antworten ist kein freier Abruf. Ohne eigenes Gedächtnis wussten sie aber
 * nicht, was man gerade richtig hatte, und zogen Runde für Runde dieselben
 * Wörter. Hier steht deshalb je Vokabel, wie die letzten Übungsantworten
 * ausfielen. Das beeinflusst NUR die Auswahl freier Übungen
 * (`practice-selection.ts`), nie die Abstände der Karteikarten.
 *
 * Schlüssel ist die Vokabel-ID ohne Richtung: Ob man ein Thai-Wort beim
 * Hören erkennt, hängt nicht an der Sprache der Oberfläche.
 */
export type WordPractice = {
  vocabId: string;
  /** Alle Übungsantworten zu diesem Wort. */
  total: number;
  correct: number;
  /** Richtige Antworten in Folge seit der letzten falschen. */
  streak: number;
  /** Zeitpunkt der letzten Antwort (ms). */
  lastAt: number;
  lastCorrect: boolean;
};

export async function loadWordPractice(store?: DataStore): Promise<Map<string, WordPractice>> {
  const db = store ?? (await getStore());
  const all = await db.getAll<WordPractice>('practice');
  return new Map(all.filter((entry) => entry && typeof entry.vocabId === 'string').map((entry) => [entry.vocabId, entry]));
}

/** Alle Einträge als Liste — für die Sicherung. */
export async function loadAllWordPractice(store?: DataStore): Promise<WordPractice[]> {
  return [...(await loadWordPractice(store)).values()];
}

/**
 * Eine Übungsantwort festhalten. Fehler hier dürfen keine Übung stoppen —
 * die Aufrufer fangen sie ab, wie beim Tagesprotokoll.
 */
export async function recordWordPractice(
  vocabId: string,
  correct: boolean,
  at: number = Date.now(),
  store?: DataStore
): Promise<WordPractice> {
  const db = store ?? (await getStore());
  return withStoreLock(db, async () => {
    const before = await db.get<WordPractice>('practice', vocabId);
    const next: WordPractice = {
      vocabId,
      total: (before?.total ?? 0) + 1,
      correct: (before?.correct ?? 0) + (correct ? 1 : 0),
      streak: correct ? (before?.streak ?? 0) + 1 : 0,
      lastAt: at,
      lastCorrect: correct,
    };
    await db.put('practice', vocabId, next);
    return next;
  });
}

export function isValidWordPractice(value: unknown): value is WordPractice {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const zahl = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  return (
    typeof entry.vocabId === 'string' &&
    entry.vocabId.length > 0 &&
    zahl(entry.total) &&
    zahl(entry.correct) &&
    zahl(entry.streak) &&
    zahl(entry.lastAt) &&
    typeof entry.lastCorrect === 'boolean'
  );
}

/** Was `selectPracticeWords` zum Gewichten braucht, ohne Karten anzulegen. */
export type PracticeContext = {
  cards: ReadonlyMap<string, FSRSCardState>;
  practice: ReadonlyMap<string, WordPractice>;
  now: number;
};

/**
 * Kartenstand einer Richtung und Übungsgedächtnis NUR LESEND — für Runner,
 * die ihre Runde synchron aus Daten bauen (Diktat).
 */
export async function loadPracticeContext(
  direction: PairDirection,
  store?: DataStore,
  now: number = Date.now()
): Promise<PracticeContext> {
  const db = store ?? (await getStore());
  const [cards, practice] = await Promise.all([loadCardStatesForDirection(direction, db), loadWordPractice(db)]);
  return { cards: new Map(cards.map((card) => [card.vocabId, card])), practice, now };
}
