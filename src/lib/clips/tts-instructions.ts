import type { AudioClipSpec } from './types';

/**
 * Ausspracheanweisung für Thai-Clips (17.10.2026).
 *
 * WARUM: Gemessen an den 676 einsilbigen Thai-Wortclips (coral,
 * gpt-4o-mini-tts, ohne Anweisung) fällt ein MITTLERER Ton im Median um
 * 5,7 Halbtöne, bei 64 % stärker als in der Microsoft-Referenz (2,6 bzw.
 * 4,2). Mittel und tief enden praktisch gleich hoch (5,9 gegen
 * 4,1 Halbtöne über 100 Hz, stark überlappend). Die Stimme legt eine
 * Aussagemelodie über das Wort, und gerade mittel/tief verschwimmen darin.
 * `gpt-4o-mini-tts` nimmt eine Sprechanweisung (`instructions`) an; ältere
 * Modelle (tts-1) nicht — dort schickt der Client nichts.
 *
 * NICHT GEMESSEN: Ob die Anweisung die Töne wirklich verbessert, zeigt erst
 * ein kleiner Probelauf (vom Nutzer gestartet) und danach
 * `npm run content:tone-report`, der Clips nach `instructionsId` getrennt
 * auswertet. Die Kennung wandert deshalb in jedes Clip-Dokument; wer den
 * Text ändert, erhöht sie.
 */
export const THAI_TTS_INSTRUCTIONS_ID = 'th-ton-1';

const TONE_RULES =
  'Give every syllable its correct lexical tone: mid tones stay level in the middle of the voice, low tones stay low and level, falling tones start high and fall, high tones stay high, rising tones start low and rise.';

const THAI_WORD =
  `You are reading one Thai dictionary word for language learners. Say it once in standard Central Thai citation form, clearly and slightly slowly. ${TONE_RULES} Do not add statement intonation and do not let the pitch drop at the end of the word.`;

const THAI_SENTENCE =
  `You are reading a Thai sentence for language learners in standard Central Thai, clearly and at a calm pace. ${TONE_RULES} Keep the sentence melody flat so that it never overrides the tones, also on the last syllable.`;

export type TtsInstructions = { id: string; text: string };

/** Die Anweisung für einen Clip — `null` für alle Sprachen außer Thai. */
export function ttsInstructionsFor(spec: Pick<AudioClipSpec, 'language' | 'kind'>): TtsInstructions | null {
  if (spec.language !== 'th') return null;
  return { id: THAI_TTS_INSTRUCTIONS_ID, text: spec.kind === 'vocab' ? THAI_WORD : THAI_SENTENCE };
}

/**
 * Welche OpenAI-Sprachmodelle `instructions` kennen. Die Modellnamen sind
 * Freitext; bekannt ist das Feld für die gpt-4o-…-tts-Familie.
 */
export function supportsTtsInstructions(model: string): boolean {
  return /^gpt-4o/i.test(model.trim());
}
