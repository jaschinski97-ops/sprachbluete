import { translate, type UiLanguage } from '@/lib/i18n';
import { bridgeText } from '@/lib/languages/bridge';
import { spokenText, situationTranslation, type ConversationSituation } from '@/lib/conversation/types';
import { LANGUAGE_CODES, type LanguageCode } from '@/lib/languages/types';

import { activeVocabulary } from './active-vocabulary';
import type { VocabEntry } from './vocab-types';

export type SentenceTask = {
  id: string;
  /** Die Vokabel, aus deren Beispielsatz die Aufgabe entstand — FSRS-Schlüssel. */
  vocabId: string;
  /** Der Satz in der Zielsprache. */
  text: string;
  /** Deutsche Bedeutung des Satzes. */
  german: string;
  /** A complete, supplied translation; never assembled from word meanings. */
  meaning?: string;
  /** Lesehilfe (Thai: Umschrift; lateinische Sprachen: der Satz selbst). */
  roman: string;
  /** Hinweis unter der Aufgabe — beim generierten Bestand das Kernwort. */
  focus: string;
  /** Bedeutung + Ablenker für „Satz verstehen“ (erste Antwort ist richtig). */
  answers: string[];
  /** Lesehilfe zu Zielsprachen-Optionen im Erkennungsmodus. */
  answersRoman?: string[];
  eligible?: boolean;
  reason?: string;
  lexicalSources?: string[];
  ruleSource?: string | null;
  reviewedAt?: string;
  reviewMethod?: string;
};

/** Die Satzsprachen = alle Lernsprachen. */
export type SatzSprache = LanguageCode;

/** Guided lessons use their own dialogue, including its complete translations. */
export function dialogueSentenceTasks(situation: ConversationSituation, anchor: UiLanguage): SentenceTask[] {
  const translation = situationTranslation(situation, anchor);
  // A missing foreign translation must not silently become German.
  if (anchor !== 'de' && !situation.translations?.[anchor]) return [];
  const meanings = [...new Set(translation.turns.filter(Boolean))];
  return situation.scriptTurns.flatMap((turn, index) => {
    const meaning = translation.turns[index];
    if (!meaning || meanings.length < 2) return [];
    return [{ id: `${situation.id}:${index}`, vocabId: '', text: spokenText(situation, turn),
      german: turn.german, meaning, roman: turn.roman, focus: meaning,
      answers: [meaning, ...meanings.filter(value => value !== meaning).slice(0, 3)] }];
  });
}

/**
 * Baut Satz-Aufgaben aus dem AKTIVEN Wortschatzbestand (18.09.2026).
 *
 * Jede generierte Vokabel trägt einen vollständigen Beispielsatz
 * (exampleTerm/exampleRoman/exampleGerman, „ganz oder gar nicht" im
 * Schema-Vertrag). Diese Funktion macht daraus Aufgaben: Bedeutung aus dem
 * Satz, Ablenker aus den Nachbarn im Bestand (deterministisch — die Sitzung
 * mischt später mit ihrer Aussaat), Fokus-Hinweis = das Kernwort mit seiner
 * Bedeutung.
 *
 * DER ANKER BESTIMMT DIE BEDEUTUNGSSEITE (21.09.2026, Nutzerbefund en-UI):
 * Bis hierher las alles stillschweigend Deutsch — auf der englischen
 * Oberfläche zeigten die Satzübungen deutsche Bedeutungen. Seitdem gilt:
 *
 *   - `anchor: 'de'` (bisheriges Verhalten): „Satz verstehen" fragt die
 *     deutsche Bedeutung ab (`exampleGerman` ist der einzige Satzbestand).
 *   - `anchor ≠ 'de'`: Eine Satz-Übersetzung in der Ankersprache gibt es im
 *     Datenbestand NICHT — die Übung wechselt ehrlich in den
 *     **Erkennungsmodus**: gehört wird der Satz der Zielsprache, gewählt
 *     wird seine geschriebenene Form (dasselbe Design wie beim Deutsch-Ziel,
 *     dessen Optionen immer schon die Zielsätze waren). Der Fokus-Hinweis
 *     bleibt WORTweise übersetzt (`translations[anchor]`).
 */
export function buildSentenceTasks(words: VocabEntry[], anchor: UiLanguage = 'de'): SentenceTask[] {
  const gesehen = new Set<string>();
  const basis: VocabEntry[] = [];
  for (const word of words) {
    const text = (word.exampleTerm ?? '').trim();
    // Doppelsätze (gleicher Text über zwei Wörtern) würden doppelte Aufgaben
    // mit derselben Lösung ergeben — der erste gewinnt.
    if (!text || gesehen.has(text)) continue;
    gesehen.add(text);
    basis.push(word);
  }
  const ablenkerFeld = anchor === 'de'
    ? (word: VocabEntry) => (word.exampleGerman ?? '').trim()
    : (word: VocabEntry) => (word.exampleTerm ?? '').trim();
  return basis.map((word, index) => {
    const german = (word.exampleGerman ?? '').trim();
    const loesung = anchor === 'de' ? german : (word.exampleTerm ?? '').trim();
    const ablenker: string[] = [];
    for (let schritt = 1; ablenker.length < 2 && schritt < basis.length; schritt += 1) {
      const andere = basis[(index + schritt) % basis.length];
      const vorschlag = ablenkerFeld(andere);
      if (!vorschlag || vorschlag === loesung || ablenker.includes(vorschlag)) continue;
      ablenker.push(vorschlag);
    }
    // Fokus-Hinweis: das Kernwort mit seiner Bedeutung in der ANKERSPRACHE —
    // wortweise gibt es sie für alle 20 Sprachen (satzebene nicht).
    const bedeutung = anchor === String(word.language)
      ? word.term
      : bridgeText(word, anchor).text;
    const answers = [loesung, ...ablenker];
    return {
      id: `sentence-${word.id}`,
      vocabId: word.id,
      text: (word.exampleTerm ?? '').trim(),
      german,
      roman: (word.exampleRoman ?? '').trim(),
      focus: `${word.term} · ${bedeutung}`,
      answers,
      answersRoman: anchor === 'de' ? undefined : answers.map((answer) =>
        basis.find((candidate) => candidate.exampleTerm?.trim() === answer)?.exampleRoman?.trim() ?? ''),
      reason: 'KI-erzeugter Beispielsatz des generierten Wortschatzbestands; mit dem Worteintrag erzeugt und kreuzgeprüft.',
      reviewMethod: 'KI-Erzeugung mit Kreuzprüfung (Studio-Pipeline)',
    };
  });
}

/**
 * Satzaufgaben je Zielsprache UND Ankersprache (21.09.2026).
 *
 * Die Registry ist seit dem Anker-Umbau eine Funktion: Dieselbe Zielsprache
 * trägt VERSCHIEDENE Aufgaben je Brücke (de-Brücke: Bedeutungen abfragen;
 * andere Brücken: Zielsatz erkennen). Bewusst OHNE Cache — der Bestand kann
 * sich zwischen zwei Aufrufen ändern (Studio-Publish im laufenden Betrieb),
 * und der Aufbau über die aktive Vokabelliste kostet Millisekunden.
 */
/**
 * Die Satzaufgaben einer Lernsprache — gebaut aus den Beispielsätzen des
 * erzeugten Wortschatzes. (Bis zum Sprach-Umbau lag daneben noch der
 * alte, von Hand geprüfte Thai-Satzbestand; der ist mit dem alten
 * Grundstock aus der App verschwunden.)
 */
export function satzaufgabenFuer(language: SatzSprache, anchor: UiLanguage = 'de'): SentenceTask[] {
  return buildSentenceTasks(
    activeVocabulary().filter(word => String(word.language) === language),
    anchor
  );
}

/**
 * Wie viele Wörter der Grundwortschatz für Satzübungen ohne Kapitel umfasst.
 *
 * WARUM (Testlauf 16.10.2026): „Satz verstehen“ und das Diktat zogen aus allen
 * 2.000 Beispielsätzen einer Sprache. Fast der ganze Wortschatz trägt keine
 * `learningStage` und gilt damit als Anfängerstoff — so kamen auf der
 * Anfängerstufe Sätze wie „Besucher müssen am Wachhäuschen ihren Ausweis
 * hinterlegen“. Die ersten Wörter in Erzeugungsreihenfolge sind die häufigen
 * (dieselbe Ordnung wie neue Karteikarten in `review-session.ts`).
 */
export const GRUNDWORTSCHATZ_GROESSE = 400;

/** Die häufigsten Wörter einer Lernsprache, in Erzeugungsreihenfolge. */
export function grundwortschatz(language: SatzSprache): VocabEntry[] {
  return activeVocabulary()
    .filter((word) => String(word.language) === language)
    .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0) || a.id.localeCompare(b.id))
    .slice(0, GRUNDWORTSCHATZ_GROESSE);
}

/** Satzaufgaben aus dem Grundwortschatz — für Übungen, die ohne Kapitel starten. */
export function grundsaetzeFuer(language: SatzSprache, anchor: UiLanguage = 'de'): SentenceTask[] {
  return buildSentenceTasks(grundwortschatz(language), anchor);
}

/** Die Satzaufgaben je Lernsprache (lazy — der Katalog kann sich zur Laufzeit ändern). */
export const SENTENCE_TASKS_BY_LANGUAGE: Record<SatzSprache, SentenceTask[]> = Object.defineProperties(
  {} as Record<SatzSprache, SentenceTask[]>,
  Object.fromEntries(
    LANGUAGE_CODES.map((code) => [code, { enumerable: true, get: () => satzaufgabenFuer(code) }])
  )
);

/** Inhaltshinweis ohne Behauptung über eine noch nicht abgespielte Stimme. */
export function sentenceFootnote(language: SatzSprache, uiLanguage: UiLanguage = 'de'): string {
  const count = SENTENCE_TASKS_BY_LANGUAGE[language].length;
  if (!count) return translate(uiLanguage, 'sentence.stockEmpty');
  return translate(uiLanguage, 'sentence.stockGenerated', { count });
}
