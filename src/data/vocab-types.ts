import { Tone } from '@/constants/tones';

import { LanguageCode, SyllableAnnotation } from '@/lib/languages/types';
import type { UiLanguage } from '@/lib/i18n/types';

/**
 * Die Form eines Vokabeleintrags.
 *
 * SEIT PHASE 16 EINE EIGENE DATEI. Vorher stand der Typ in `vocabulary.ts`
 * neben dem Thai-Grundstock; mit drei Grundstöcken hätte das einen Zirkel
 * ergeben (`vocabulary` → `vocabulary-es` → `vocabulary`). Der Typ steht
 * deshalb hier, die Listen dort.
 *
 * WAS ALLEN SPRACHEN GEMEINSAM IST, steht flach: Form, Bedeutung, Wortart,
 * die deutsche Seite. WAS EINER SPRACHE GEHÖRT, steht in einem eigenen,
 * optionalen Block (`spanishNoun`, `englishVerb`, …) — dann ist an jedem Feld
 * ablesbar, wofür es gilt, und ein englischer Eintrag trägt kein Feld `tone`
 * mit einem erfundenen Wert.
 */

export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'numeral'
  | 'particle'
  | 'interjection'
  /** Seit Phase 16: „through" ist eine Präposition, „though" eine Konjunktion. */
  | 'preposition'
  | 'conjunction';

export type Register = 'neutral' | 'formal' | 'informal';

export type VocabEntry = {
  id: string;
  learningStage?: import('@/lib/learning-stages').LearningStage;
  /** Zeitpunkt einer KI-Erzeugung; feste Grundstock-Einträge brauchen keinen. */
  generatedAt?: number;
  /**
   * Welche Zielsprache (Phase 15). Deutsch ist die Drehscheibe und steht
   * deshalb nicht hier, sondern auf der anderen Seite jedes Paars (AE-42).
   */
  language: LanguageCode;
  /**
   * Der gemeinsame Begriff, auf den sich dieser Eintrag und sein Gegenstück
   * in den anderen Sprachen beziehen — die ID des Thai-Eintrags, an dem der
   * Begriff zuerst geprüft wurde.
   *
   * WOFÜR DAS GUT IST: Ein Bildmotiv gehört zum **Begriff**, nicht zur
   * Sprache — „a small simple house" passt zu บ้าน, casa und house gleich gut.
   * Über den Begriff greift der Bildgenerator auf ein bereits formuliertes
   * Motiv zurück, statt es dreimal zu erfinden (AE-46). Zugleich macht das
   * Feld nachprüfbar, woher die deutsche Seite stammt: aus dem in Phase 2
   * geprüften Eintrag mit dieser ID.
   */
  /**
   * SEIT 24.10.2026 SPRACHÜBERGREIFEND: Neu erzeugte Wörter tragen eine
   * gemeinsame Begriffskennung im Format `c:<englisch_snake_case>`, bei
   * mehrdeutigen Wörtern mit Bedeutung (`c:apple`, `c:bank_money`,
   * `c:bank_seat`). Dieselbe Bedeutung in th/en/es/de hat dieselbe Kennung;
   * Bilder hängen an ihr statt am einzelnen Wort. Helfer: `lib/concepts.ts`.
   * Ältere Einträge tragen hier noch eine Wort-ID.
   */
  concept?: string;
  /**
   * Die fremdsprachige Form. Hieß bis Phase 15 `thai` — der Name war eine
   * Festlegung auf eine Sprache, die es nicht mehr gibt (AE-43).
   */
  term: string;
  /**
   * Die Lesehilfe, je Sprache eine andere Art von Angabe:
   * Thai die Paiboon-Umschrift, Spanisch die Silbentrennung mit dem
   * geschriebenen Akzent (`mé-di-co`), Englisch die Lautschrift.
   */
  romanization: string;
  /**
   * SPRACHSPEZIFISCH (Thai): Ton der ersten Silbe. Seit Phase 16 optional —
   * ein englischer oder spanischer Eintrag hat keinen Ton, und ein
   * Vorgabewert wäre eine Behauptung (AE-45).
   */
  tone?: Tone;
  /**
   * Silbenweise Auszeichnung. Thai trägt den Ton je Silbe (Phase 3),
   * Spanisch die Betonung (Phase 16). Englisch lässt die Liste leer: sein
   * Merkmal hängt am ganzen Wort, nicht an der Silbe (AE-44).
   */
  syllables: SyllableAnnotation[];
  /**
   * Lautschrift aus der Quelle.
   *
   * Bei Englisch ist sie **das Merkmal selbst** — die Aussprache lässt sich
   * dort nicht ableiten und muss je Wort dastehen. Bei Spanisch ist sie der
   * **unabhängige Beleg**, gegen den die Betonungsregel geprüft wird; ohne
   * sie wäre die Gegenprobe zirkulär.
   */
  ipa?: string;
  /** Welche Aussprachevariante die Quelle für `ipa` angibt (RP, UK, …). */
  ipaAccent?: string;
  /**
   * Die **enge** Umschrift aus der Quelle, mit Silbengrenzen.
   *
   * Nur bei Spanisch, und dort der ganze Punkt: Wiktionary markiert in dieser
   * Form die Silbengrenzen selbst (`[ˈme.ð̞i.ko]`, wobei der Betonungsstrich
   * eine Grenze mit vertritt). Damit lässt sich die Betonungsregel gegen eine
   * Angabe prüfen, die **nicht** aus der Regel stammt — sonst wäre die
   * Gegenprobe zirkulär. Ein Test fährt den ganzen spanischen Grundstock
   * dagegen (AE-45).
   */
  ipaSyllables?: string;
  german: string;
  /**
   * Brückentexte: das Wort in den Sprachen, in denen **erklärt** wird
   * (Roadmap v2 — die Brückensprache ist künftig die Systemsprache, nicht
   * immer Deutsch).
   *
   * WAS HIER HINGEHÖRT UND WAS NICHT: `de` steht bewusst nie im Feld — die
   * deutsche Seite ist und bleibt `german`, und eine Abschrift davon wäre ein
   * zweiter Ort für dieselbe Wahrheit. Die Auflösung läuft über
   * `bridgeText(entry, bridge)` (lib/languages/bridge.ts):
   * `translations[bridge]` → `german` → `translations.en` → `term`, und sie
   * sagt über `usedFallback` ehrlich, wenn gefallen worden ist. Ein
   * fehlender Brückentext ist damit kein Fehler, sondern ein Kennzeichen.
   */
  translations?: Partial<Record<UiLanguage, string>>;
  /** Pflicht bei deutschen Substantiven: Genus und Plural. */
  germanNoun?: { article: 'der' | 'die' | 'das'; plural: string };
  /** Stammformen — für Thai-Muttersprachler die eigentliche Hürde. */
  germanVerb?: {
    thirdPerson: string;
    praeteritum: string;
    perfekt: string;
    irregular: boolean;
  };
  germanAdjective?: { comparative: string; superlative: string; irregular: boolean };
  /**
   * SPRACHSPEZIFISCH (Spanisch): Genus und der Artikel, der davorsteht.
   * Beides zusammen, weil sie auseinanderfallen können — „el agua" ist
   * weiblich und steht trotzdem mit „el".
   */
  spanishNoun?: { gender: 'm' | 'f'; article: 'el' | 'la'; plural: string };
  /** SPRACHSPEZIFISCH (Spanisch): Konjugationsklasse und Unregelmäßigkeit. */
  spanishVerb?: { conjugation: 'ar' | 'er' | 'ir'; irregular: boolean };
  /** SPRACHSPEZIFISCH (Englisch): Vergangenheit und Partizip. */
  englishVerb?: { past: string; participle: string; irregular: boolean };
  /**
   * SPRACHSPEZIFISCH (Englisch): das Merkmal aus AE-44 — welches
   * Schriftstück sich hier nicht ableiten lässt und wie es klingt.
   * Steht nur an Wörtern, die mit anderen im Grundstock ein Paar bilden.
   */
  englishSpelling?: { grapheme: string; sound: string };
  partOfSpeech: PartOfSpeech;
  register: Register;
  /** Steuert die Bild-Pipeline in Phase 5: nur konkrete Begriffe bekommen Bilder. */
  isConcrete: boolean;
  /**
   * Beispiel in der Zielsprache. Seit Phase 16 optional: für Englisch und
   * Spanisch gibt es keine erfundenen Sätze (siehe PROGRESS.md, Phase 16).
   */
  exampleTerm?: string;
  exampleRoman?: string;
  exampleGerman?: string;
  /**
   * Der Beispielsatz in jeder App-Sprache (24.10.2026). Ohne ihn hatten
   * Satzübungen auf nicht-deutschen Oberflächen keine Beispielsätze. Für die
   * Lernsprache selbst steht hier `exampleTerm`.
   */
  exampleTranslations?: Partial<Record<UiLanguage, string>>;
  audioAssetId?: string;
  imageAssetId?: string;
  /** true nur, wenn die Quelle Aussprache, Form UND Bedeutung deckt. */
  sourceVerified: boolean;
  source?: string;
  /**
   * Benannte Unsicherheit — nur bei `sourceVerified: false` gesetzt und in der
   * Lernansicht als Warnhinweis sichtbar.
   */
  verificationNote?: string;
  /** Lernhinweis zur Grammatik (Genus, Stammformen, Steigerung, Homonyme). */
  note?: string;
};

/**
 * Ein Eintrag eines **Brücken-Pools** — die Ankerwörter einer
 * Oberflächen-/Brückensprache für die Karten-VORDERSEITE (Stufe 1, Pilot
 * Ägyptisch-Arabisch, siehe `vocabulary-ar.ts`).
 *
 * WARUM EIN EIGENER, MINIMALER TYP: Ein BridgeEntry ist bewusst KEIN
 * `VocabEntry` — er hat keinen Ziel-Sprachstoff (keine `language`, keine
 * Beispiele, keine Quellprüfung), sondern genau das, was die Kreuzkopplung
 * braucht: die Pool-ID, die `concept`-ID des Begriffs (die ID des
 * Thai-Ankers, über die Brücke und Zielseite zusammenfinden) und das Wort
 * für die Vorderseite. Die Pool-Datei ist GENERIERT
 * (`scripts/content/generate-bridge-vocab.cjs`), nicht handgeprüft — deshalb
 * trägt sie auch keinen Grundstoff-Vertrag, den sie nicht erfüllt.
 */
export type BridgeEntry = {
  id: string;
  /** Der gemeinsame Begriff — die ID des Thai-Ankers (Kopplungsschlüssel). */
  concept: string;
  /** Das Wort der Brückensprache — die (stumme) Karten-Vorderseite. */
  term: string;
};

/** Ein Eintrag des französischen Grundstuffs (`vocabulary-fr.ts`). */
