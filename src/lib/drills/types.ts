import { Tone } from '@/constants/tones';

import { SpeechLanguage } from '../audio';
import { Direction } from '../fsrs/types';
import { drillsForDirectionViaFeature } from '../languages/feature';
import { contentDirectionOf, PairDirection, TargetLanguage } from '../languages/types';
import { DerivationStep } from '../reading/syllable';

/**
 * Übungstypen (Phase 6).
 *
 * WAS SIE VON DEN KARTEIKARTEN UNTERSCHEIDET: Eine Karteikarte prüft die
 * Vokabel als Ganzes — Form gegen Bedeutung. Die Übungen hier drillen genau
 * die **eine** Stelle, an der die jeweilige Zielgruppe scheitert, und zwar
 * für beide Gruppen eine andere:
 *
 *   de_to_th (Deutsche lernen Thai) → der **Ton**. Er trägt Bedeutung und
 *     ist im Deutschen kein Merkmal; wer ihn nicht hört, kann ihn auch nicht
 *     sprechen. Deshalb eine reine Hörübung.
 *   th_to_de (Thailänder lernen Deutsch) → **Genus** und **Stammformen**.
 *     Thai hat weder Artikel noch Konjugation; beides ist keine Regel, die
 *     man ableitet, sondern eine Liste, die man kennt.
 *
 * Alle Aufgaben entstehen aus dem bereits quellengeprüften Vokabel-Grundstock
 * (Phase 2). Es wird nichts erzeugt und nichts erfunden — auch die falschen
 * Antworten sind echte Formen aus derselben Datei oder mechanisch daraus
 * abgeleitet (vertauschtes Hilfsverb).
 */

export const DRILLS = [
  'tone',
  'toneRule',
  'article',
  'verbForms',
  /** Phase 16: das spanische Merkmal - Betonung herleiten. */
  'stressRule',
  /** Phase 16: das englische Merkmal - gleiche Schreibung, andere Aussprache. */
  'spelling',
  /** Phase 18: Betonung HOEREN - das Gegenstueck zu 'tone' fuer Spanisch. */
  'stressHear',
  /** Phase 18: Wort hoeren und die richtige Schreibung waehlen (Englisch). */
  'soundSpelling',
  /**
   * Lern-Reiter-Ausbau 13.09.2026, Stufe „Gleichstand“: jede lernbare
   * Sprache bekommt in JEDER Kategorie mindestens eine Übung. Neu:
   * Deutsch liest (Wort gelesen, Bedeutung gewählt), und Thai/Englisch/
   * Spanisch bekommen je eine Grammatikübung — die deutschen haben die
   * Kategorie bisher allein belegt.
   */
  'deutschLesen',
  'polite',
  'irregularPast',
  'serEstar',
  /** Schritt 5 (13.09.): die Grammatik wird voll ausgebaut. */
  'zaehlerwort',
  'konsonantenklasse',
  'praesensEndung',
  'partizip',
] as const;
export type DrillId = (typeof DRILLS)[number];

export type DrillMeta = {
  id: DrillId;
  /**
   * Auf welcher Seite des Sprachpaars die Übung liegt.
   *
   * SEIT PHASE 16 KEINE FESTE RICHTUNG MEHR. Vorher stand hier `th_to_de`,
   * und damit hätte die Artikel-Übung für Spanisch nicht funktioniert,
   * obwohl sie **Deutsch** prüft und für jedes Paar gilt (Pflicht 6 aus
   * Phase 15). Die Richtung entsteht jetzt aus Seite und gewählter Sprache.
   *
   *   `toHub`    — „X → Deutsch": die deutschen Grammatikübungen.
   *   `toTarget` — „Deutsch → X": die Merkmalsübungen der Zielsprache.
   */
  side: 'toHub' | 'toTarget';
  /**
   * Welche Fertigkeit geübt wird.
   *
   * SEIT PHASE 18, WEIL DIE LEISTE SONST EINE FLACHE LISTE WÄRE: „Töne hören",
   * „Ton herleiten", „Artikel" und „Schreiben" nebeneinander sagen nicht, dass
   * das vier verschiedene Fertigkeiten sind. Gruppiert man sie, sieht man auf
   * einen Blick, was eine Sprache abdeckt — und was ihr fehlt.
   */
  skill: 'hoeren' | 'lesen' | 'grammatik';
  /**
   * Zu welchem Sprachmerkmal die Übung gehört, oder `null` für die deutschen
   * Module, die zu jedem Paar gehören.
   *
   * Der Wert ist der Sprach-Code des Merkmals (`feature: "th"` fuer die
   * Ton-UEbungen usw.).
   */
  feature: TargetLanguage | null;
  label: string;
  /** Ein Satz, der sagt, was geübt wird und warum. */
  description: string;
  /** Frage über allen Aufgaben dieses Typs. */
  prompt: string;
};

/**
 * Die Standard-Richtung einer Übung für eine Lernsprache — die Inhalts-
 * Richtung dieser Sprache (`contentDirectionOf`). Sitzungen aus dem
 * Lern-Reiter reichen ihre echte Richtung (`anker_to_ziel`) immer mit; das
 * hier ist nur der Rückfall für Aufrufer ohne Richtung.
 */
export function directionForDrill(_drill: DrillId, language: TargetLanguage): Direction {
  return contentDirectionOf(language);
}

export const DRILL_META: Record<DrillId, DrillMeta> = {
  tone: {
    id: 'tone',
    side: 'toTarget',
    feature: 'th',
    skill: 'hoeren',
    label: 'Töne hören',
    description:
      'Wort anhören und den Ton bestimmen. Nur einsilbige Wörter — bei mehrsilbigen hat jede Silbe ihren eigenen Ton.',
    prompt: 'Welchen Ton hörst du?',
  },
  toneRule: {
    id: 'toneRule',
    side: 'toTarget',
    feature: 'th',
    skill: 'lesen',
    label: 'Ton herleiten',
    description:
      'Den Ton aus der Schrift ableiten statt ihn auswendig zu lernen: Konsonantenklasse, Vokallänge, Schlusslaut und Tonzeichen ergeben ihn. Nur einsilbige Wörter.',
    prompt: 'Welchen Ton hat dieses Wort?',
  },
  article: {
    id: 'article',
    side: 'toHub',
    feature: 'de',
    skill: 'grammatik',
    label: 'Artikel',
    description:
      'Das richtige Genus zum Substantiv. Im Deutschen ist es nicht ableitbar, sondern gehört zum Wort dazu.',
    prompt: 'Welcher Artikel gehört zum Wort?',
  },
  verbForms: {
    id: 'verbForms',
    side: 'toHub',
    feature: 'de',
    skill: 'grammatik',
    label: 'Stammformen',
    description:
      'Das Perfekt mit dem richtigen Hilfsverb. „haben" gegen „sein" ist eine eigene Fehlerquelle.',
    prompt: 'Wie lautet das Perfekt?',
  },
  stressRule: {
    id: 'stressRule',
    side: 'toTarget',
    feature: 'es',
    skill: 'lesen',
    label: 'Betonung herleiten',
    description:
      'Welche Silbe betont wird, steht in der Schreibung: Wortende und Akut entscheiden. ' +
      'Wer die Regel kennt, muss sie bei keinem neuen Wort nachschlagen.',
    prompt: 'Welche Silbe wird betont?',
  },
  spelling: {
    id: 'spelling',
    side: 'toTarget',
    feature: 'en',
    skill: 'lesen',
    label: 'Gleiche Schreibung, anderer Laut',
    description:
      'Im Englischen lässt sich die Aussprache nicht aus der Schreibung ableiten — „ough" ' +
      'allein hat mehrere Lesarten. Geübt wird deshalb der Vergleich, nicht die Herleitung.',
    prompt: 'Wie klingt diese Buchstabengruppe hier?',
  },
  stressHear: {
    id: 'stressHear',
    side: 'toTarget',
    feature: 'es',
    skill: 'hoeren',
    label: 'Betonung hören',
    description:
      'Wort anhören und die betonte Silbe bestimmen. Die Silben stehen ohne Akzentzeichen da — ' +
      'sonst wäre die Antwort abzulesen statt zu hören.',
    prompt: 'Welche Silbe hörst du betont?',
  },
  soundSpelling: {
    id: 'soundSpelling',
    side: 'toTarget',
    feature: 'en',
    skill: 'hoeren',
    label: 'Wort hören',
    description:
      'Wort anhören und aus Wörtern mit derselben Buchstabengruppe das richtige heraushören — ' +
      'though, through, thought und enough klingen verschieden, obwohl sie gleich aussehen.',
    prompt: 'Welches Wort hörst du?',
  },
  deutschLesen: {
    id: 'deutschLesen',
    side: 'toHub',
    feature: 'de',
    skill: 'lesen',
    label: 'Wort lesen',
    description:
      'Das deutsche Wort lesen und die richtige Bedeutung wählen. Lesen kommt vor dem ' +
      'Sprechen — wer geschriebene Wörter wiedererkennt, hat einen Anker, an dem er Gehörtes festmacht.',
    prompt: 'Was bedeutet dieses Wort?',
  },
  polite: {
    id: 'polite',
    side: 'toTarget',
    feature: 'th',
    skill: 'grammatik',
    label: 'Höflichkeitspartikel',
    description:
      'ครับ oder ค่ะ? Die Partikel am Satzende hängt am Geschlecht des Sprechers, nicht am ' +
      'Inhalt des Satzes. Alle Sätze stammen wörtlich aus dem quellengeprüften Grundstock.',
    prompt: 'Welche Partikel passt an das Ende?',
  },
  irregularPast: {
    id: 'irregularPast',
    side: 'toTarget',
    feature: 'en',
    skill: 'grammatik',
    label: 'Unregelmäßige Verben',
    description:
      'Die zweite Form unregelmäßiger Verben. Sie folgt keiner Regel und gehört — wie der ' +
      'Artikel im Deutschen — zum Wort dazu. Alle Formen stammen aus dem geprüften Grundstock.',
    prompt: 'Welche zweite Form gehört zu diesem Verb?',
  },
  serEstar: {
    id: 'serEstar',
    side: 'toTarget',
    feature: 'es',
    skill: 'grammatik',
    label: 'ser oder estar',
    description:
      'Beide Verben bedeuten „sein“ — ser klassifiziert (Herkunft, Beruf, Eigenschaft, Zeit, ' +
      'Ort von Ereignissen), estar beschreibt Zustand und Lage. Die Regel steht nach der Antwort.',
    prompt: 'ser oder estar?',
  },
  zaehlerwort: {
    id: 'zaehlerwort',
    side: 'toTarget',
    feature: 'th',
    skill: 'grammatik',
    label: 'Zählwörter',
    description:
      'Thai zählt mit einem Zählwort hinter der Zahl (Nomen + Zahl + Zählwort) — und das Zählwort hängt an der ' +
      'Wortklasse: คน Menschen, ตัว Tiere, เล่ม Bücher, แก้ว Gläser, หลัง Häuser.',
    prompt: 'Welches Zählwort passt zu diesem Nomen?',
  },
  konsonantenklasse: {
    id: 'konsonantenklasse',
    side: 'toTarget',
    feature: 'th',
    skill: 'grammatik',
    label: 'Konsonantenklassen',
    description:
      'Mittel-, Hoch- oder Tiefklasse? Die Klasse jedes der 44 Konsonanten ist der erste ' +
      'Eingang der Ton-Herleitung — die Übung nutzt dieselbe quellengeprüfte Schrifttabelle.',
    prompt: 'Zu welcher Klasse gehört dieser Konsonant?',
  },
  praesensEndung: {
    id: 'praesensEndung',
    side: 'toTarget',
    feature: 'es',
    skill: 'grammatik',
    label: 'Präsens-Endungen',
    description:
      'Die Endung folgt im Präsens der Konjugationsklasse (-ar, -er, -ir) und der Person — ' +
      'eine ableitbare Regel, geübt an den regelmäßigen Verben des Grundstocks.',
    prompt: 'Welche Endung bekommt die Form?',
  },
  partizip: {
    id: 'partizip',
    side: 'toTarget',
    feature: 'en',
    skill: 'grammatik',
    label: 'Dritte Form',
    description:
      'Die dritte Form (Past Participle) braucht jede zusammengesetzte Zeit — have gone, ' +
      'was eaten. Bei unregelmäßigen Verben folgt sie keiner Regel und gehört zum Wort.',
    prompt: 'Welche dritte Form gehört zu diesem Verb?',
  },
};

/**
 * Welche Übungen zu welcher Richtung gehören.
 *
 * SEIT PHASE 15 EINE FUNKTION (Pflicht 6): Die Grammatikübungen prüfen
 * **Deutsch** — Genus und Stammformen. Sie gehören damit zu jedem „X → Deutsch"
 * und nicht zu Thai allein; sobald Englisch oder Spanisch Inhalte haben, sind
 * sie dort ohne weiteres Zutun verfügbar. Die Ton-Übungen dagegen sind das
 * Thai-**Merkmal** und hängen an der Sprache (AE-44).
 *
 * SEIT DEN KREUZRICHTUNGEN AUF `PairDirection` (reine Weitung): Kreuzpaare
 * erben in `drillsForDirectionViaFeature` die Merkmalsübungen ihrer
 * Zielsprache; de-geankerte Aufrufer verhalten sich unverändert.
 */
export function drillsForDirection(direction: PairDirection): DrillId[] {
  return drillsForDirectionViaFeature(direction);
}



export type DrillOption = {
  label: string;
  roman?: string;
  /** Zweite Zeile, etwa die Tonkontur-Beschriftung. */
  hint?: string;
  /** Nur bei der Ton-Übung gesetzt: färbt die Antwort wie in der Legende. */
  tone?: Tone;
};

export type DrillQuestion = {
  /** Eindeutig innerhalb einer Sitzung. */
  id: string;
  drill: DrillId;
  direction: Direction;
  vocabId: string;
  /**
   * Was **vor** der Antwort sichtbar ist. Bei der Ton-Übung bewusst leer:
   * die Thai-Schrift trägt das Tonzeichen und wäre die halbe Lösung.
   */
  visible: string | null;
  visibleRoman?: string;
  /** Zweite Zeile unter `visible`, etwa die Bedeutung als Kontext. */
  visibleHint: string | null;
  visibleHintRoman?: string;
  /** Wird abgespielt, sobald die Aufgabe erscheint. */
  speak: { text: string; language: SpeechLanguage } | null;
  options: DrillOption[];
  correctIndex: number;
  /** Wird nach der Antwort gezeigt — immer, auch wenn richtig geantwortet wurde. */
  explanation: string;
  /** Die Auflösung in Klartext, für die Anzeige nach der Antwort. */
  solution: string;
  solutionRoman?: string;
  /**
   * Die Herleitung Schritt für Schritt — nur bei „Ton herleiten" (Phase 13).
   *
   * Der Punkt der Übung ist nicht die richtige Antwort, sondern der Weg
   * dorthin: Wer die vier Schritte einmal nachvollzogen hat, kann den Ton
   * eines Wortes bestimmen, das er noch nie gesehen hat. Deshalb steht das
   * hier als Liste und nicht als Fließtext in `explanation`.
   */
  derivation?: DerivationStep[];
  /** Benannte Unsicherheit der Herleitung, falls die Quelle mehrdeutig ist. */
  uncertain?: string | null;
};

export type DrillAnswer = {
  question: DrillQuestion;
  chosenIndex: number;
  correct: boolean;
};
