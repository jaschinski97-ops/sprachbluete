/**
 * Thai tone metadata.
 *
 * Colours, labels and contour paths are carried over from the verified web
 * reference prototype ("Thai Lernbegleiter.html"). The five tones are the
 * standard Thai tone inventory; `roman` is the vowel mark the app's
 * romanization uses for the tone (a, à, â, á, ǎ).
 *
 * SEIT 25.10.2026 `roman` STATT `mark`: Die Legende zeigte vorher das
 * Thai-Tonzeichen (่ = tief, ้ = fallend). Das stimmt nur für Mittel- und
 * Hochklasse; bei Tiefklasse ergibt ่ „fallend“ (เล่น lên), und die Übung
 * „Ton herleiten“ widersprach der Legende (Testrunde 25.10.). Die Farben
 * hängen ohnehin an der Umschrift, deren Zeichen eindeutig sind.
 *
 * FARBEN JE MODUS (Phase 9, AE-24): Der Referenzprototyp hatte **eine**
 * Farbe je Ton. Nachgerechnet nach WCAG 2.1 verfehlte die in beiden
 * Anzeigemodi die Stufe AA — im hellen Modus fielen „mittel", „hoch" und
 * „steigend" durch, im dunklen „tief", „fallend" und teils „mittel". Die
 * Farbtöne sind deshalb erhalten, aber die Helligkeit ist je Modus so gesetzt,
 * dass jede Farbe gegen den ungünstigsten Untergrund (`backgroundSelected`)
 * mindestens 4,5:1 erreicht. `tones.test.ts` rechnet das bei jedem Testlauf
 * nach.
 */

export const TONES = {
  mid: {
    label: 'Mittel',
    adjective: 'Mittlerer',
    colors: { light: '#546850', dark: '#88a083' },
    /** contour path drawn in a 34x21 viewBox */
    path: 'M3 10 L31 10',
    roman: 'a',
  },
  low: {
    label: 'Tief',
    adjective: 'Tiefer',
    colors: { light: '#4f6076', dark: '#8a9bb1' },
    path: 'M3 16 L31 16',
    roman: 'à',
  },
  falling: {
    label: 'Fallend',
    adjective: 'Fallender',
    colors: { light: '#95503e', dark: '#c88b7a' },
    path: 'M3 5 Q17 5 31 17',
    roman: 'â',
  },
  high: {
    label: 'Hoch',
    adjective: 'Hoher',
    colors: { light: '#78602b', dark: '#ba9443' },
    path: 'M3 5 L31 5',
    roman: 'á',
  },
  rising: {
    label: 'Steigend',
    adjective: 'Steigender',
    colors: { light: '#4f6861', dark: '#82a097' },
    path: 'M3 16 Q17 16 31 4',
    roman: 'ǎ',
  },
} as const;

export type Tone = keyof typeof TONES;

export const TONE_KEYS = Object.keys(TONES) as Tone[];

export type ColorScheme = 'light' | 'dark';

/**
 * Die Farbe eines Tons im jeweiligen Anzeigemodus.
 *
 * Bewusst eine Funktion statt eines Feldes `color`: So gibt es keine Stelle
 * mehr, an der sich versehentlich „die" Tonfarbe abgreifen lässt, ohne den
 * Modus zu nennen — genau der Fehler, der vor Phase 9 durch die ganze App ging.
 */
export function toneColor(tone: Tone, scheme: ColorScheme): string {
  return TONES[tone].colors[scheme];
}
