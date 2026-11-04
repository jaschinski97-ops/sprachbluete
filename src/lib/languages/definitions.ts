import type { DrillId } from '../drills/types';
import type { TranslationKey } from '../i18n/keys';

import type { LanguageCode, LanguageFeature } from './types';

/**
 * ALLES, WAS DIE APP ÜBER EINE LERNSPRACHE WISSEN MUSS — an EINER Stelle
 * (Sprach-Umbau 23.09.2026).
 *
 * Vorher stand dieses Wissen an rund 25 Stellen verteilt (Sprachausgabe,
 * Zeichenleiste, Legende, Übungsliste, Studio-Prompt, Schema, Pipeline …).
 * Jetzt lesen diese Stellen hier nach. Eine neue Lernsprache heißt:
 *
 *   1. Code in `LANGUAGE_CODES` (types.ts) anhängen.
 *   2. Hier eine Definition eintragen — der Typ `Record<LanguageCode, …>`
 *      erzwingt, dass nichts vergessen wird.
 *   3. Zwei i18n-Schlüssel `language.<code>.feature/.description` in allen
 *      20 Wörterbüchern ergänzen (der Paritätstest meldet fehlende).
 *   4. Im Entwicklerstudio Wortschatz, Dialoge und Audio erzeugen.
 *
 * Details: `docs/neue-lernsprache.md`. Sprachspezifische Sonderübungen (wie
 * die Thai-Töne) sind optional — ohne sie bekommt die Sprache alle
 * allgemeinen Übungen (Karten, Satzübungen, Diktat, Schreiben, Sag es,
 * Rollenspiel, Lesetexte, Heutige Runde).
 */
export type LearningLanguageDefinition = {
  code: LanguageCode;
  /** Name auf Deutsch (Studio, Protokolle). Die App zeigt `languageDisplayName`. */
  label: string;
  /** Eigenbezeichnung — steht neben dem Namen in der Auswahl. */
  endonym: string;
  /** Locale der Gerätestimme (`expo-speech`). */
  speechLocale: string;
  /** Sprechtempo der Gerätestimme (1 = normal). */
  speechRate: number;
  /** Schrift der Zielsprache — steuert Leerzeichen-Regeln, Lesehilfen, Schema-Prüfung. */
  script: 'thai' | 'latin';
  /** Welche Zeichenleiste Diktat und Schreiben einblenden (null = keine). */
  palette: 'thai' | 'german' | 'spanish' | 'french' | null;
  /**
   * Welche kleine Abweichung beim Schreiben als „fast richtig“ zählt:
   * fehlende Tonzeichen (Thai), Akzente (Spanisch), Umlaute/ß (Deutsch),
   * Groß-/Kleinschreibung (Englisch).
   */
  nearMiss: 'tone-mark' | 'accent' | 'umlaut' | 'case';
  /**
   * Diktat-Regeln: Groß-/Kleinschreibung falten, ß = ss gelten lassen,
   * Diakritika streng zählen. (Die übrigen Regeln sind für alle gleich,
   * siehe `data/dictation-config.ts`.)
   */
  dictation: { foldCase: boolean; eszettEquivalence: boolean; strictDiacritics: boolean };
  /**
   * Aufgabentexte mit Sprach-Hinweis („mit Tonzeichen“). `null` = der
   * allgemeine Text (`writing.promptGeneric` / `dictation.promptGeneric`).
   */
  prompts: { writing: TranslationKey | null; dictation: TranslationKey | null };
  /** Platzhalter im Eingabefeld — in der ZIELsprache (was man gleich tippt). */
  placeholders: { word: string; sentence: string };
  /** Merkhilfe in der Übersicht (null = keine). */
  legend: 'tones' | 'stress' | 'spelling' | null;
  /**
   * Wort-Sprechübung: `tone-contour` misst die Tonhöhenkontur (nur mit
   * geprüften Silbentönen sinnvoll), `repeat` ist Nachsprechen mit
   * Selbsteinschätzung, `null` = keine eigene Wortübung.
   */
  wordSpeaking: 'tone-contour' | 'repeat' | null;
  /** Sprachspezifische Übungen dieser Sprache (zusätzlich zu den allgemeinen). */
  drills: readonly DrillId[];
  /**
   * Der Gruß im Kopf der Übersicht (lateinische Schriften): Wort und kleine
   * Lesehilfe darunter. Thai hat eine eigene, handgeprüfte Tonfarben-Marke.
   */
  greeting: { word: string; hint: string | null };
  /** Was die Sprache besonders macht — Satz in der Auswahl. */
  challenge: TranslationKey;
  feature: LanguageFeature;
  /** Anweisungen an den Wortschatz-Erzeuger im Studio (sprachspezifische Felder). */
  generatorRules: string;
  /** Prüfpunkt 3 der KI-Kreuzprüfung (Umschrift/Ton/Betonung). */
  checkPoint3: string;
  /** Sprachhinweis für den Dialog-Erzeuger im Studio. */
  dialogRules: string;
};

export const LEARNING_LANGUAGES: Record<LanguageCode, LearningLanguageDefinition> = {
  th: {
    code: 'th',
    label: 'Thai',
    endonym: 'ภาษาไทย',
    speechLocale: 'th-TH',
    // Thai etwas langsamer, die Töne sind sonst kaum herauszuhören.
    speechRate: 0.8,
    script: 'thai',
    palette: 'thai',
    nearMiss: 'tone-mark',
    legend: 'tones',
    dictation: { foldCase: false, eszettEquivalence: false, strictDiacritics: true },
    prompts: { writing: 'writing.promptTh', dictation: 'dictation.promptTh' },
    placeholders: { word: 'ภาษาไทย', sentence: 'ภาษาไทย' },
    wordSpeaking: 'tone-contour',
    drills: ['tone', 'toneRule', 'polite', 'zaehlerwort', 'konsonantenklasse'],
    greeting: { word: 'สวัสดี', hint: 'sà-wàt-dii' },
    challenge: 'language.th.description',
    feature: {
      label: 'language.th.feature',
      description: 'language.th.description',
      kind: 'derivable',
      implemented: true,
      source: {
        title: 'Thai script',
        url: 'https://en.wikipedia.org/wiki/Thai_script',
        retrieved: '2026-09-03',
        quote:
          'Tones are realised in the vowels, but indicated in the script by a combination of the class of the initial consonant (high, mid or low), vowel length (long or short), closing consonant (plosive or sonorant, called dead or live) and, if present, one of four tone marks.',
      },
    },
    generatorRules:
      '- "term" in thailändischer Schrift; "syllables" mit JEDER Silbe als { "roman": Umschrift, "tone": "mid"|"low"|"falling"|"high"|"rising" }; "romanization" als Paiboon-artige Umschrift des ganzen Wortes.',
    checkPoint3: 'sind Silben und Töne plausibel und konsistent zur thailändischen Schrift?',
    dialogRules: 'Thai-Schrift, korrekte Höflichkeitspartikel passend zur Sprecherrolle; roman ist Paiboon-Umschrift mit Tönen.',
  },
  en: {
    code: 'en',
    label: 'Englisch',
    endonym: 'English',
    // Britisches Englisch, passend zur RP-Lautschrift im Bestand.
    speechLocale: 'en-GB',
    speechRate: 0.95,
    script: 'latin',
    palette: null,
    nearMiss: 'case',
    legend: 'spelling',
    dictation: { foldCase: true, eszettEquivalence: false, strictDiacritics: true },
    prompts: { writing: 'writing.promptEn', dictation: 'dictation.promptEn' },
    placeholders: { word: 'your answer', sentence: 'your sentence' },
    wordSpeaking: 'repeat',
    drills: ['soundSpelling', 'spelling', 'irregularPast', 'partizip'],
    greeting: { word: 'hello', hint: '/həˈləʊ/' },
    challenge: 'language.en.description',
    feature: {
      label: 'language.en.feature',
      description: 'language.en.description',
      // Ausdrücklich KEINE Herleitung: gleiche Buchstabenfolge, verschiedener Laut.
      kind: 'per-word',
      implemented: true,
      source: {
        title: 'English orthography',
        url: 'https://en.wikipedia.org/wiki/English_orthography',
        retrieved: '2026-09-03',
        quote:
          'in unfamiliar words and proper nouns, the pronunciation of some sequences, ⟨ough⟩ being the prime example, is unpredictable even for educated native speakers.',
      },
    },
    generatorRules:
      '- "ipa" mit IPA-Lautschrift (RP); "syllables" als [{ "roman": "/" + IPA + "/" }]; bei passenden Wörtern "englishSpelling" { "grapheme": "ea", "sound": "iː" } mit der tatsächlichen IPA-Lesart dieser Buchstabenfolge im Wort (z. B. ea in eat iː, bread e, great eɪ); Verben mit "englishVerb" { "past": "…", "participle": "…", "irregular": true|false } — bei regelmäßigen Verben irregular false, unregelmäßige mit ihren echten Formen (die Übungen „Unregelmäßige Verben"/„Dritte Form" lesen genau dieses Feld).',
    checkPoint3: 'ist die Lautschrift plausibel?',
    dialogRules: 'Natürliches britisches Englisch. roman enthält die IPA-Lesehilfe.',
  },
  es: {
    code: 'es',
    label: 'Spanisch',
    endonym: 'español',
    speechLocale: 'es-ES',
    speechRate: 0.95,
    script: 'latin',
    palette: 'spanish',
    nearMiss: 'accent',
    legend: 'stress',
    dictation: { foldCase: true, eszettEquivalence: false, strictDiacritics: true },
    prompts: { writing: 'writing.promptEs', dictation: 'dictation.promptEs' },
    placeholders: { word: 'tu respuesta', sentence: 'tu frase' },
    wordSpeaking: 'repeat',
    drills: ['stressHear', 'stressRule', 'serEstar', 'praesensEndung'],
    greeting: { word: 'hola', hint: null },
    challenge: 'language.es.description',
    feature: {
      label: 'language.es.feature',
      description: 'language.es.description',
      kind: 'derivable',
      implemented: true,
      source: {
        title: 'Spanish orthography',
        url: 'https://en.wikipedia.org/wiki/Spanish_orthography',
        retrieved: '2026-09-03',
        quote:
          'Stress in Spanish is marked unequivocally through a series of orthographic rules. The default stress is on the penultimate (next-to-last) syllable on words that end in a vowel, [n] or [s] (not preceded by another consonant) and on the final syllable when the word ends in any consonant other than [n] or [s] or in a consonant group. Words that do not follow the default stress have an acute accent over the stressed vowel.',
      },
    },
    generatorRules:
      '- "syllables" mit JEDER Silbe als { "roman": "Silbe", "stressed": true|false }, genau eine betonte Silbe; Feldname "roman", NICHT "syllable"; spanische Nomen mit "spanishNoun" { "gender": "m"|"f", "article": "el"|"la", "plural": "…" }, Verben mit "spanishVerb" { "conjugation": "ar"|"er"|"ir", "irregular": true|false }.',
    checkPoint3:
      'stimmt die im Feld "syllables" als "stressed" markierte Silbe mit den spanischen Betonungsregeln? Eine Betonungsmarkierung in der Umschrift ist nicht erforderlich.',
    dialogRules: 'Natürliches Spanisch mit korrekten Akzenten und einheitlicher Anrede. roman ist eine Lesehilfe.',
  },
  de: {
    code: 'de',
    label: 'Deutsch',
    endonym: 'Deutsch',
    speechLocale: 'de-DE',
    speechRate: 0.95,
    script: 'latin',
    palette: 'german',
    nearMiss: 'umlaut',
    legend: null,
    dictation: { foldCase: false, eszettEquivalence: true, strictDiacritics: true },
    prompts: { writing: 'writing.promptDe', dictation: 'dictation.promptDe' },
    placeholders: { word: 'deine Antwort', sentence: 'dein Satz' },
    // Keine eigene Wortübung — Sprechen läuft über Shadowing und Satzübungen.
    wordSpeaking: null,
    drills: ['article', 'verbForms', 'deutschLesen'],
    greeting: { word: 'Hallo', hint: 'guten Tag' },
    challenge: 'language.de.description',
    feature: {
      label: 'language.de.feature',
      description: 'language.de.description',
      // Genus steht nicht in der Schrift — der Artikel wird je Wort gelernt.
      kind: 'per-word',
      implemented: true,
      source: {
        title: 'German nouns',
        url: 'https://en.wikipedia.org/wiki/German_nouns',
        retrieved: '2026-09-23',
        quote:
          'As in many related Indo-European languages, German nouns possess a grammatical gender; the three genders are masculine, feminine, and neuter. … Words for objects without obvious masculine or feminine characteristics like "bridge" or "rock" can be masculine, feminine, or neuter.',
      },
    },
    generatorRules:
      '- "term" ist das deutsche Wort; ALLE Verben mit "germanVerb" { "thirdPerson": "er/sie/es-Form Präsens", "praeteritum": "3. Person Präteritum", "perfekt": "hat/ist + Partizip II", "irregular": true|false }; Nomen mit "germanNoun" { "article": "der"|"die"|"das", "plural": "…" } (Pflichtfeld des Schemas); "german" ist die kurze deutsche Bedeutung (Synonym oder Klarstellung), niemals Thai-Schrift.',
    checkPoint3: 'ist die Lautschrift plausibel?',
    dialogRules: 'Natürliches Deutsch, korrekte Artikel, Kasus und Wortstellung. roman ist eine Lesehilfe.',
  },
  // Französisch (04.11.2026, fünfte Lernsprache): Französisch aus Frankreich,
  // Preise in Euro. Wie Englisch wird die Aussprache je Wort gelernt
  // (`per-word`), dazu Genus und Artikel wie im Spanischen (`frenchNoun`).
  fr: {
    code: 'fr',
    label: 'Französisch',
    endonym: 'français',
    speechLocale: 'fr-FR',
    speechRate: 0.95,
    script: 'latin',
    palette: 'french',
    nearMiss: 'accent',
    legend: null,
    dictation: { foldCase: true, eszettEquivalence: false, strictDiacritics: true },
    prompts: { writing: 'writing.promptFr', dictation: 'dictation.promptFr' },
    placeholders: { word: 'ta réponse', sentence: 'ta phrase' },
    wordSpeaking: 'repeat',
    drills: ['genre'],
    greeting: { word: 'bonjour', hint: '/bɔ̃.ʒuʁ/' },
    challenge: 'language.fr.description',
    feature: {
      label: 'language.fr.feature',
      description: 'language.fr.description',
      // Stumme Buchstaben stehen nicht als Regel in der Schrift — die
      // Aussprache hängt am einzelnen Wort (Lautschrift je Eintrag).
      kind: 'per-word',
      implemented: true,
      source: {
        title: 'French orthography',
        url: 'https://en.wikipedia.org/wiki/French_orthography',
        retrieved: '2026-11-04',
        quote:
          'The spelling of words is largely based on the pronunciation of Old French c. 1100–1200 AD, and has stayed more or less the same since then, despite enormous changes to the pronunciation of the language in the intervening years. … This has resulted in a complicated relationship between spelling and sound, especially for vowels; a multitude of silent letters; and many homophones',
      },
    },
    generatorRules:
      '- "term" ist das französische Wort ohne Artikel; "syllables" mit JEDER gesprochenen Silbe als { "roman": "Silbe" }; "romanization" ist die IPA-Lautschrift des ganzen Wortes ohne Schrägstriche; Nomen mit "frenchNoun" { "gender": "m"|"f", "article": "le"|"la"|"l’", "plural": "…" } („l’“ vor Vokal und stummem h); Rechtschreibung nach den Rectifications von 1990 nur, wo sie üblich ist (sonst traditionell).',
    checkPoint3: 'ist die IPA-Lautschrift plausibel, und stimmen Genus und Artikel des Nomens?',
    dialogRules: 'Natürliches Französisch aus Frankreich mit korrekten Akzenten, Elisionen (l’, j’, qu’) und einheitlicher Anrede (tu oder vous passend zur Situation). roman ist eine Lesehilfe.',
  },
};

export function learningLanguage(code: LanguageCode): LearningLanguageDefinition {
  return LEARNING_LANGUAGES[code];
}

/** Aufgabentext der Schreibübung (mit `{{language}}` im allgemeinen Fall). */
export function writingPromptKey(code: LanguageCode): TranslationKey {
  return LEARNING_LANGUAGES[code].prompts.writing ?? 'writing.promptGeneric';
}

/** Aufgabentext des Diktats. */
export function dictationPromptKey(code: LanguageCode): TranslationKey {
  return LEARNING_LANGUAGES[code].prompts.dictation ?? 'dictation.promptGeneric';
}

/** Thai-Schrift-Zeichen (Block U+0E00–U+0E7F). */
const THAI_ZEICHEN = /[฀-๿]/;

/**
 * Passt ein Text zur Schrift der Sprache? Thai verlangt Thai-Zeichen, alle
 * anderen dürfen keine enthalten (häufigster Erzeugungsfehler: Thai-Anker
 * rutscht in den Zieltext).
 */
export function passtZurSchrift(code: LanguageCode, text: string): boolean {
  return LEARNING_LANGUAGES[code].script === 'thai' ? THAI_ZEICHEN.test(text) : !THAI_ZEICHEN.test(text);
}

/**
 * Die Wort-Hörübung einer Sprache (für die Heutige Runde): die erste ihrer
 * Übungen aus dem Bereich „Hören“ — `undefined`, wenn sie keine hat.
 */
export function hoerDrillFuer(code: LanguageCode): DrillId | undefined {
  return LEARNING_LANGUAGES[code].drills.find((drill) => HOER_DRILLS.includes(drill));
}

/** Übungen, die ein Wort HÖREN lassen (Skill „hoeren“ in `drills/types`). */
const HOER_DRILLS: readonly DrillId[] = ['tone', 'soundSpelling', 'stressHear'];
