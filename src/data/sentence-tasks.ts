import { translate, type UiLanguage } from '@/lib/i18n';
import { bridgeText } from '@/lib/languages/bridge';
import { spokenText, situationTranslation, type ConversationSituation } from '@/lib/conversation/types';
import { LANGUAGE_CODES, type LanguageCode } from '@/lib/languages/types';
import { inStage, type LearningStage } from '@/lib/learning-stages';
import { exampleMeaning } from '@/lib/example-meaning';

import { activeVocabulary } from './active-vocabulary';
import type { VocabEntry } from './vocab-types';

export type SentenceTask = {
  id: string;
  /** Die Vokabel, aus deren Beispielsatz die Aufgabe entstand — FSRS-Schlüssel. */
  vocabId: string;
  /** Der Satz in der Zielsprache. */
  text: string;
  /** Deutsche Bedeutung des Satzes (`exampleGerman`, kann leer sein). */
  german: string;
  /** Gelieferte Satzbedeutung in der Ankersprache; nie aus Wortbedeutungen zusammengesetzt. */
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

const satzText = (word: VocabEntry) => (word.exampleTerm ?? '').trim();

/** Wörter mit Beispielsatz, doppelte Satztexte entfernt — der erste gewinnt. */
function eindeutigeSaetze(words: readonly VocabEntry[]): VocabEntry[] {
  const gesehen = new Set<string>();
  return words.filter((word) => {
    const text = satzText(word);
    // Doppelsätze würden doppelte Aufgaben mit derselben Lösung ergeben.
    if (!text || gesehen.has(text)) return false;
    gesehen.add(text);
    return true;
  });
}

/**
 * Baut Satz-Aufgaben aus Wörtern mit Beispielsatz (18.09.2026).
 *
 * Jede generierte Vokabel trägt einen vollständigen Beispielsatz. Daraus
 * wird je Wort eine Aufgabe: Bedeutung aus dem Satz, Ablenker aus den
 * Nachbarn in `pool` (deterministisch — die Sitzung mischt später mit ihrer
 * Aussaat), Fokus-Hinweis = das Kernwort mit seiner Bedeutung.
 *
 * DIE BEDEUTUNGSSEITE (seit 24.10.2026 je Wort): Hat der Satz eine gelieferte
 * Übersetzung in der Ankersprache (`exampleMeaning`: `exampleTranslations`,
 * bei `de` sonst `exampleGerman`), fragt „Satz verstehen" diese Bedeutung ab
 * (`meaning`). Fehlt sie, wechselt die Aufgabe in den **Erkennungsmodus**:
 * gehört wird der Zielsatz, gewählt seine geschriebene Form. Wortweise
 * zusammengesetzte Satzbedeutungen gibt es nie.
 *
 * `pool` (Vorgabe: `words`) liefert die Ablenker — so bekommt auch eine
 * kleine Auswahl Ablenker aus dem ganzen Bestand.
 */
export function buildSentenceTasks(
  words: readonly VocabEntry[],
  anchor: UiLanguage = 'de',
  pool: readonly VocabEntry[] = words
): SentenceTask[] {
  const basis = eindeutigeSaetze(pool);
  const position = new Map(basis.map((word, index) => [word.id, index]));
  const romanByText = new Map<string, string>();
  for (const word of [...words, ...basis]) {
    if (!romanByText.has(satzText(word))) romanByText.set(satzText(word), (word.exampleRoman ?? '').trim());
  }
  return eindeutigeSaetze(words).map((word) => {
    const text = satzText(word);
    const meaning = exampleMeaning(word, anchor);
    const ablenkerFeld = meaning
      ? (other: VocabEntry) => exampleMeaning(other, anchor) ?? ''
      : satzText;
    const loesung = meaning ?? text;
    const ablenker: string[] = [];
    const start = position.get(word.id) ?? -1;
    for (let schritt = 1; ablenker.length < 2 && schritt <= basis.length; schritt += 1) {
      const andere = basis[(start + schritt + basis.length) % basis.length];
      if (satzText(andere) === text) continue;
      const vorschlag = ablenkerFeld(andere);
      if (!vorschlag || vorschlag === loesung || ablenker.includes(vorschlag)) continue;
      ablenker.push(vorschlag);
    }
    // Fokus-Hinweis: das Kernwort mit seiner Bedeutung in der ANKERSPRACHE —
    // wortweise gibt es sie für alle 20 Sprachen.
    const bedeutung = anchor === String(word.language)
      ? word.term
      : bridgeText(word, anchor).text;
    const answers = [loesung, ...ablenker];
    return {
      id: `sentence-${word.id}`,
      vocabId: word.id,
      text,
      german: (word.exampleGerman ?? '').trim(),
      ...(meaning ? { meaning } : {}),
      roman: (word.exampleRoman ?? '').trim(),
      focus: `${word.term} · ${bedeutung}`,
      answers,
      answersRoman: meaning ? undefined : answers.map((answer) => romanByText.get(answer) ?? ''),
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
 * Alle Wörter einer Lernsprache (optional einer Stufe) mit Beispielsatz, in
 * Erzeugungsreihenfolge — der Erzeuger schreibt häufige Wörter zuerst.
 *
 * Bis 24.10.2026 schnitt hier eine feste Grenze von 400 Wörtern ab
 * (`GRUNDWORTSCHATZ_GROESSE`), damit Anfänger keine schweren Sätze bekamen.
 * Jetzt wählt die Sitzung aus dem ganzen Bestand nach Lernstand
 * (`selectPracticeWords`): Wer nichts gelernt hat, bekommt die häufigsten
 * Wörter, danach wächst der Pool mit den gelernten Wörtern mit.
 */
export function satzwortschatz(language: SatzSprache, stage?: LearningStage): VocabEntry[] {
  return eindeutigeSaetze(inStage(activeVocabulary(), stage)
    .filter((word) => String(word.language) === language)
    .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0) || a.id.localeCompare(b.id)));
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
