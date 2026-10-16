/**
 * Freie Eingabe gegen die geprüfte Zielform abgleichen (Phase 14).
 *
 * DER GANZE PUNKT DIESES MODULS IST DIE UNTERSCHEIDUNG zwischen einem
 * **Vertipper** und einem **Fehler**, der genau das Lernziel verfehlt. Eine
 * großzügige Ähnlichkeitsprüfung, die beides gleich behandelt, wäre hier
 * schädlicher als gar keine Toleranz:
 *
 * - Deutsche Substantive werden großgeschrieben. „haus" ist kein Vertipper.
 * - Umlaute unterscheiden Bedeutungen: schon/schön, Mutter/Mütter. „schon"
 *   für „schön" ist kein Vertipper.
 * - Artikel und Stammformen sind laut Phase 2 der eigentliche Stolperstein
 *   für Thai-Muttersprachler. Ein fehlender oder falscher Artikel ist die
 *   Aufgabe, nicht ein Ausrutscher.
 * - Im Thai trägt das Tonzeichen die Bedeutung. ไก (ohne Zeichen) ist nicht
 *   ไก่ mit einem Tippfehler, sondern ein anderes Wort.
 *
 * Deshalb läuft der Abgleich in dieser Reihenfolge: erst exakt, dann auf
 * **geschützte Unterschiede** prüfen (die als benannter Fehler gelten, nie als
 * Vertipper), und erst danach Tippfehler-Toleranz. So kann keine Toleranz ein
 * Lernziel wegräumen.
 *
 * OFFLINE-FIRST (Pflicht 2): Hier ist kein Netzaufruf, kein Anbieter und kein
 * Schlüssel. Der Abgleich läuft gegen den quellengeprüften Grundstock aus
 * Phase 2 und funktioniert vollständig ohne Internet.
 */

import type { TranslationKey } from '@/lib/i18n/keys';
import type { TParams } from '@/lib/i18n/types';
import { learningLanguage } from '@/lib/languages/definitions';
import type { LanguageCode } from '@/lib/languages/types';

/**
 * In welcher Sprache die Antwort getippt wird.
 *
 * SEIT PHASE 16 ALLE VIER. Was sich dabei je Sprache unterscheidet, ist
 * nicht die Toleranz an sich, sondern **was geschuetzt ist** — siehe
 * `stripProtected`.
 */
export type WritingLanguage = LanguageCode;

/** Thai-Schrift: Tonzeichen geschützt, keine Tipp-Toleranz. */
function thaiScript(language: WritingLanguage): boolean {
  return learningLanguage(language).script === 'thai';
}

/**
 * Warum eine Antwort nicht zählt — benannt, damit die Rückmeldung sagen kann,
 * *was* falsch war, statt nur „falsch".
 */
export type MistakeKind =
  | 'case'
  | 'umlaut'
  | 'eszett'
  | 'article-missing'
  | 'article-wrong'
  | 'tone-mark'
  /** Spanisch: fehlender oder falscher Akut, oder ñ statt n. */
  | 'accent'
  | 'different';

export type WritingVerdict = {
  /** Zählt die Antwort als richtig? Ein Vertipper zählt, ein Lernzielfehler nicht. */
  correct: boolean;
  /** Genau richtig, ohne jede Abweichung. */
  exact: boolean;
  /** Richtig, aber mit toleriertem Vertipper. */
  typo: boolean;
  /** Gesetzt, wenn die Antwort nicht zählt. */
  mistake: MistakeKind | null;
  /**
   * Die Abweichung ALS WÖRTERBUCHSCHLÜSSEL (21.09.2026, en-UI-Befund):
   * bisher standen hier deutsche Sätze auf jeder Oberfläche; der Runner
   * übersetzt. `article` trägt den richtigen Artikel, wenn der Fehler am
   * Artikel lag (`writing.correctArticle` hängt ihn an).
   */
  message: { key: TranslationKey; params?: TParams } | null;
  /** Der richtige Artikel — nur wenn der Fehler der Artikel war. */
  article?: string;
  /** Die Zielform, gegen die verglichen wurde (bei mehreren die beste). */
  matched: string;
  /** Editierabstand zur besten Zielform. */
  distance: number;
};

const THAI_TONE_MARKS = /[่-๋]/g;
const GERMAN_ARTICLES = ['der', 'die', 'das'] as const;

/** Leerraum vereinheitlichen. Mehr passiert bei einem exakten Vergleich nicht. */
export function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Alles wegnehmen, was ein **geschützter** Unterschied ist.
 *
 * Wenn zwei Formen erst nach dieser Behandlung gleich sind, lag der
 * Unterschied genau im Lernziel — dann ist es ein benannter Fehler und kein
 * Vertipper.
 */
export function stripProtected(text: string, language: WritingLanguage): string {
  const base = tidy(text);
  if (thaiScript(language)) return base.replace(THAI_TONE_MARKS, '');
  // Spanisch: Der Akut ist geschuetzt, und zwar aus demselben Grund wie das
  // Thai-Tonzeichen — er traegt Bedeutung. „hablo" (ich spreche) gegen
  // „habló" (er sprach) ist kein Vertipper, sondern eine andere Zeitform;
  // dasselbe gilt fuer „ano" gegen „año". Englisch hat nichts Vergleichbares
  // und laeuft wie Deutsch.
  return base
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Editierabstand mit Vertauschung (Damerau-Levenshtein, benachbarte Zeichen).
 *
 * Die Vertauschung zählt als **ein** Schritt und nicht als zwei: „Huas" statt
 * „Haus" ist der häufigste Tippfehler überhaupt, und ihn doppelt zu zählen
 * hieße, ausgerechnet den typischsten Ausrutscher am härtesten zu bestrafen.
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Wie viele Zeichen Abweichung noch als Vertipper durchgehen.
 *
 * **Thai: null.** Jedes Zeichen einer thailändischen Silbe trägt; ein
 * ausgetauschter Konsonant ergibt ein anderes Wort, keinen Ausrutscher. Und
 * die Eingabe läuft über eine Zeichenpalette (AE-39) — dort verrutscht nichts
 * so, wie es auf einer Tastatur passiert.
 *
 * **Deutsch: ein Zeichen, aber erst ab fünf Zeichen Länge.** Bei „gut", „neu"
 * oder „acht" ist ein Zeichen Unterschied fast immer ein anderes Wort und kein
 * Ausrutscher; bei „Höflichkeitspartikel" wäre Nulltoleranz Schikane.
 */
export function typoTolerance(target: string, language: WritingLanguage): number {
  if (thaiScript(language)) return 0;
  return target.length >= 5 ? 1 : 0;
}

function articleOf(text: string): string | null {
  const first = tidy(text).split(' ')[0]?.toLowerCase();
  return (GERMAN_ARTICLES as readonly string[]).includes(first ?? '') ? first! : null;
}

/**
 * Weicht die Eingabe NUR in der Groß-/Kleinschreibung des ersten Buchstabens
 * ab, und ist das am Satzanfang unbedenklich? (Testlauf 16.10.2026)
 *
 * - Großschreiben geht immer: „Oder“, „Das Haus“ sind Satzanfänge.
 * - Kleinschreiben geht im Deutschen, wenn die Zielform keinen Artikel trägt:
 *   Dann ist sie kein Substantiv, sondern eine als Satz notierte Formel
 *   („Hallo“, „Tschüss“, „Gleichfalls“). Substantive stehen in der
 *   Schreibübung immer mit Artikel, ihr Großbuchstabe liegt also nie vorn.
 * - Englisch „i“ für „I“ bleibt ein Fehler — dort ist der Großbuchstabe Teil
 *   des Wortes.
 */
function onlySentenceStartCase(given: string, target: string, language: WritingLanguage): boolean {
  if (given.length !== target.length || given.slice(1) !== target.slice(1)) return false;
  const [g, z] = [given[0], target[0]];
  if (g === z || g.toLowerCase() !== z.toLowerCase()) return false;
  if (z === z.toLowerCase()) return true;
  return language === 'de' && !articleOf(target);
}

/**
 * Welche Erklärung passt zu einem Fehler in der Groß-/Kleinschreibung? Vorher
 * hieß es überall „im Deutschen werden Substantive großgeschrieben“ — auch
 * bei „Oder“ und beim Englischlernen.
 */
function caseMessage(given: string, target: string, language: WritingLanguage): TranslationKey {
  // Die erste Abweichung hinter dem Satzanfang zählt; nur wenn es sonst
  // keine gibt, der erste Buchstabe selbst.
  const differs = (i: number) => given[i] !== target[i];
  let index = -1;
  for (let i = 1; i < target.length; i++) if (differs(i)) { index = i; break; }
  if (index < 0) index = 0;
  const letter = target[index] ?? '';
  if (letter === letter.toLowerCase()) return 'writing.mistakeCaseLower';
  return language === 'de' && articleOf(target) ? 'writing.mistakeCase' : 'writing.mistakeCaseUpper';
}

const MISTAKE_MESSAGE: Record<MistakeKind, TranslationKey> = {
  case: 'writing.mistakeCase',
  umlaut: 'writing.mistakeUmlaut',
  eszett: 'writing.mistakeEszett',
  'article-missing': 'writing.mistakeArticleMissing',
  'article-wrong': 'writing.mistakeArticleWrong',
  'tone-mark': 'writing.mistakeToneMark',
  accent: 'writing.mistakeAccent',
  different: 'writing.mistakeDifferent',
};

/**
 * Welcher geschützte Unterschied liegt vor, wenn zwei Formen ohne Schutz
 * gleich sind? Die Reihenfolge sagt, was zuerst genannt wird — der Artikel
 * steht vorn, weil er die eigentliche Aufgabe ist.
 */
function protectedMistake(
  given: string,
  target: string,
  language: WritingLanguage
): MistakeKind {
  // Was „fast richtig“ heißt, sagt die Sprachdefinition; nur der deutsche
  // Fall (Umlaute/ß/Artikel) braucht die feinere Unterscheidung unten.
  const nearMiss = learningLanguage(language).nearMiss;
  if (nearMiss !== 'umlaut') return nearMiss;

  const givenArticle = articleOf(given);
  const targetArticle = articleOf(target);
  if (targetArticle && !givenArticle) return 'article-missing';
  if (targetArticle && givenArticle && givenArticle !== targetArticle) return 'article-wrong';

  const withoutCase = (text: string) => tidy(text).toLowerCase();
  if (withoutCase(given) !== withoutCase(target)) {
    // Unterschied bleibt auch ohne Groß-/Kleinschreibung: dann sind es die
    // Diakritika. ß zuerst, weil es die eindeutigere Meldung ist.
    if (/ß/.test(target) !== /ß/.test(given)) return 'eszett';
    return 'umlaut';
  }
  return 'case';
}

export type CompareOptions = {
  language: WritingLanguage;
  /** Alle zulässigen Zielformen; bei mehreren Bedeutungen zählt jede. */
  targets: string[];
};

/**
 * Vergleicht eine Eingabe mit den zulässigen Zielformen.
 *
 * Bei mehreren Zielformen gewinnt die **beste** — sonst würde ein Lernender,
 * der „ja" statt „ja, richtig" schreibt, an der Alternative scheitern, die er
 * gar nicht gemeint hat.
 */
export function compareWriting(given: string, options: CompareOptions): WritingVerdict {
  const { language, targets } = options;
  const input = tidy(given);
  const candidates = targets.map(tidy).filter(Boolean);

  if (candidates.length === 0) {
    throw new Error('Keine Zielform angegeben — dagegen lässt sich nichts prüfen.');
  }
  if (!input) {
    return {
      correct: false,
      exact: false,
      typo: false,
      mistake: 'different',
      message: { key: 'writing.msgEmpty' },
      matched: candidates[0],
      distance: candidates[0].length,
    };
  }

  // 1. Exakt — ohne Abweichung oder nur mit dem Großbuchstaben eines Satzanfangs.
  const exact = candidates.find((candidate) => candidate === input)
    ?? candidates.find((candidate) => onlySentenceStartCase(input, candidate, language));
  if (exact) {
    return { correct: true, exact: true, typo: false, mistake: null, message: null, matched: exact, distance: 0 };
  }

  // 2. Geschützte Unterschiede: gelten NIE als Vertipper (Pflicht 3).
  const strippedInput = stripProtected(input, language);
  const protectedMatch = candidates.find(
    (candidate) => stripProtected(candidate, language) === strippedInput
  );
  if (protectedMatch) {
    const mistake = protectedMistake(input, protectedMatch, language);
    return {
      correct: false,
      exact: false,
      typo: false,
      mistake,
      message: { key: mistake === 'case' ? caseMessage(input, protectedMatch, language) : MISTAKE_MESSAGE[mistake] },
      matched: protectedMatch,
      distance: editDistance(input, protectedMatch),
    };
  }

  // 3. Der Artikel wird eigenstaendig geprueft, BEVOR die Toleranz greift.
  //    Sonst verschwindet der interessanteste Fehler in „anderes Wort": bei
  //    „der Haus" gegen „das Haus" betraegt der Abstand zwei Zeichen und
  //    laege damit ohnehin ueber der Toleranz - die Meldung waere aber
  //    nichtssagend.
  if (language === 'de') {
    const withoutArticle = (text: string) => {
      const article = articleOf(text);
      return article ? tidy(text).slice(article.length).trim() : tidy(text);
    };
    const restMatches = (candidate: string) =>
      stripProtected(withoutArticle(input), language) ===
      stripProtected(withoutArticle(candidate), language);

    const articleIssue = candidates.find((candidate) => articleOf(candidate) && restMatches(candidate));
    if (articleIssue) {
      const mistake: MistakeKind = articleOf(input) ? 'article-wrong' : 'article-missing';
      return {
        correct: false,
        exact: false,
        typo: false,
        mistake,
        message: { key: MISTAKE_MESSAGE[mistake] },
        article: articleOf(articleIssue)!,
        matched: articleIssue,
        distance: editDistance(input, articleIssue),
      };
    }
  }

  // 4. Erst jetzt Tippfehler-Toleranz.
  let best = candidates[0];
  let bestDistance = editDistance(input, best);
  for (const candidate of candidates.slice(1)) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  if (bestDistance <= typoTolerance(best, language)) {
    return {
      correct: true,
      exact: false,
      typo: true,
      mistake: null,
      message: { key: 'writing.msgTypo', params: { answer: best } },
      matched: best,
      distance: bestDistance,
    };
  }

  return {
    correct: false,
    exact: false,
    typo: false,
    mistake: 'different',
    message: { key: MISTAKE_MESSAGE.different },
    matched: best,
    distance: bestDistance,
  };
}
