/**
 * Diktat-Toleranzen je Zielsprache.
 *
 * Das Diktat vergleicht Gehörtes mit Getipptem — und nicht jede Sprache
 * verzeiht dieselben Abweichungen. Diese Datei ist der EINZIGE Ort, an dem
 * steht, was in welcher Sprache als Fehler zählt; `lib/dictation/scoring.ts`
 * liest sie nur. Eine neue Zielsprache braucht hier einen Eintrag, sonst
 * wirft `dictationConfigFor` — absichtlich — einen Fehler statt still
 *Deutsch-Regeln auf fremde Schrift anzuwenden.
 *
 * DIE ENTSCHEIDUNGEN UND WARUM:
 *
 * - **Interpunktion wird ignoriert** (in allen Sprachen). Ein Audioclip
 *   enthält keine hörbare Interpunktion; wer sie verlangt, bewertet Raten,
 *   kein Diktat. Sie steht weiterhin in der Lösung sichtbar da.
 * - **Deutsch faltet die Groß-/Kleinschreibung NICHT** (Substantive werden
 *   großgeschrieben — dieselbe Entscheidung wie im freien Schreiben,
 *   `lib/writing/compare.ts`), toleriert aber den Satzanfang: Nach einem
 *   Punkt hört man den Großbuchstaben nicht.
 * - **ß ≡ ss** ist eine gleichwertige Schreibung (Straße/Strasse), kein
 *   Fehler. **ä ≠ ae** bleibt ein Fehler — „März" und „Maerz" sind zwei
 *   Schreibkonventionen, und das Diktat übt die eigene der Zielsprache.
 * - **Thai vergleicht zweistufig** (Basisschrift ohne Tonzeichen, dann
 *   Tonzeichen separat) — die Aufteilung steht in `scoring.ts`, hier stehen
 *   nur die Schwellen.
 */

/** Sprachen, für die es Diktat-Regeln geben kann. `de` ist Zielsprache der Roadmap v2 und noch ohne Stoff. */
/** Jede Lernsprache hat ein Diktat — die Regeln stehen in `definitions.ts`. */
import { LEARNING_LANGUAGES } from '@/lib/languages/definitions';
import { LANGUAGE_CODES, type LanguageCode } from '@/lib/languages/types';

export type DictationLanguage = LanguageCode;

export type DictationLanguageConfig = {
  /** Thai vergleicht zeichenweise zweistufig, Latein wortweise. */
  script: 'thai' | 'latin' | 'han' | 'japanese';
  /** Groß-/Kleinschreibung vor dem Vergleich absenken (en, es). */
  foldCase: boolean;
  /** Den Großbuchstaben am Satzanfang tolerieren — man hört ihn nicht. */
  tolerateSentenceInitialCase: boolean;
  /** Interpunktion aus dem Vergleich nehmen (das Ohr hört sie nicht). */
  ignorePunctuation: boolean;
  /** Deutsch: ß und ss als gleichwertige Schreibungen. */
  eszettEquivalence: boolean;
  /**
   * Diakritika hart werten: ein Wort, dessen einzige Abweichung ein
   * Akzent/Umlaut ist, zählt dann als Fehler und nicht durch das
   * Tippfehler-Fenster (de: ja — Rechtschreibung zählt; fr: nein — der
   * Akzentfehler wird weich über `diacriticScore` gemeldet). Thai ist
   * unabhängig davon immer zweistufig.
   */
  strictDiacritics: boolean;
  /** Nur dokumentiert, Default aus — siehe Dateikommentar. */
  ignoreFinalSilentLetters: boolean;
  /** Bestanden ab dieser Basisschrift-Punktzahl (0–100). */
  passThreshold: number;
  /** Weiche Schwelle für Tonzeichen/Diakritika (0–100). */
  diacriticThreshold: number;
  /**
   * Latein: bis zu so viele Zeichen Abweichung machen ein Wort (ab 5
   * Zeichen) noch zu einem Tippfehler-Wort statt zu einem Fehler —
   * derselbe Wert wie `typoTolerance` im freien Schreiben.
   */
  wordTypoWindow: number;
};

const BASE: Omit<DictationLanguageConfig, 'script' | 'foldCase' | 'eszettEquivalence' | 'strictDiacritics'> = {
  tolerateSentenceInitialCase: true,
  ignorePunctuation: true,
  ignoreFinalSilentLetters: false,
  passThreshold: 90,
  diacriticThreshold: 50,
  wordTypoWindow: 1,
};

export const DICTATION_CONFIG: Record<DictationLanguage, DictationLanguageConfig> = Object.fromEntries(
  LANGUAGE_CODES.map((code) => [
    code,
    { ...BASE, script: LEARNING_LANGUAGES[code].script, ...LEARNING_LANGUAGES[code].dictation },
  ])
) as Record<DictationLanguage, DictationLanguageConfig>;

export function dictationConfigFor(language: DictationLanguage): DictationLanguageConfig {
  const config = DICTATION_CONFIG[language];
  if (!config) throw new Error(`Keine Diktat-Regeln für „${language}" hinterlegt.`);
  return config;
}
