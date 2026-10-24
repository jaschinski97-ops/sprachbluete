import { ProviderId } from '@/lib/providers/types';

/**
 * Die Stimmen der Sprachausgabe-Anbieter — erhoben, nicht geraten.
 *
 * DER AUSLÖSER WAR EIN WUNSCH, DER SICH NICHT DIREKT ERFÜLLEN LIESS: „männlich
 * oder weiblich auswählen". Die Gemini-Unterlagen, aus denen die Stimmnamen
 * stammen, nennen zu jeder Stimme nur einen Stilbegriff („Firm", „Upbeat") und
 * **kein Geschlecht**. Bei OpenAI steht dazu ebenfalls nichts.
 *
 * Google veröffentlicht es aber an anderer Stelle: Die Cloud-Text-to-Speech-
 * Seite zu „Chirp 3: HD voices" führt **dieselben dreißig Namen** in einer
 * Tabelle mit den Spalten „Name" und „Gender". Beide Listen wurden am
 * 2026-09-04 abgerufen und Name für Name abgeglichen — sie stimmen vollständig
 * überein. Damit ist die Geschlechtsangabe belegt und nicht aus dem Klang des
 * Namens geschlossen.
 *
 * FÜR OPENAI GIBT ES SIE NICHT, und dann steht hier auch keine. Die Auswahl
 * sagt das in der Oberfläche ausdrücklich, statt eine Zuordnung zu erfinden,
 * die niemand nachprüfen kann.
 */

export const VOICE_SOURCES = {
  geminiVoices: {
    title: 'Speech generation (text-to-speech) — Gemini API',
    url: 'https://ai.google.dev/gemini-api/docs/speech-generation',
    retrieved: '2026-09-04',
    note: 'Liefert die Stimmnamen und je einen Stilbegriff; nennt kein Geschlecht. Am 2026-10-24 für gemini-3.8-flash-tts erneut abgeglichen: dieselben dreißig Namen und Stilbegriffe.',
  },
  geminiGender: {
    title: 'Chirp 3: HD voices — Cloud Text-to-Speech',
    url: 'https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd',
    retrieved: '2026-09-04',
    note: 'Tabelle „Voice options" mit den Spalten Name und Gender — dieselben dreißig Namen.',
  },
  openaiVoices: {
    title: 'Text to speech — OpenAI API',
    url: 'https://developers.openai.com/api/docs/guides/text-to-speech',
    retrieved: '2026-09-04',
    note: 'Nennt die Stimmnamen; macht zum Geschlecht keine Angabe.',
  },
} as const;

export type VoiceGender = 'female' | 'male';

export type Voice = {
  /** Der Name, wie ihn die API erwartet. */
  name: string;
  /**
   * Das Geschlecht laut Anbieterunterlagen — oder `null`, wenn der Anbieter
   * dazu nichts sagt. `null` ist eine Aussage, keine Lücke.
   */
  gender: VoiceGender | null;
  /** Der Stilbegriff des Anbieters, wörtlich übernommen. */
  style?: string;
};

/**
 * Gemini: Stimmname und Stil aus der Gemini-Seite, Geschlecht aus der
 * Cloud-Tabelle. Reihenfolge wie in der Gemini-Seite.
 */
export const GEMINI_VOICES: Voice[] = [
  { name: 'Zephyr', gender: 'female', style: 'Bright' },
  { name: 'Puck', gender: 'male', style: 'Upbeat' },
  { name: 'Charon', gender: 'male', style: 'Informative' },
  { name: 'Kore', gender: 'female', style: 'Firm' },
  { name: 'Fenrir', gender: 'male', style: 'Excitable' },
  { name: 'Leda', gender: 'female', style: 'Youthful' },
  { name: 'Orus', gender: 'male', style: 'Firm' },
  { name: 'Aoede', gender: 'female', style: 'Breezy' },
  { name: 'Callirrhoe', gender: 'female', style: 'Easy-going' },
  { name: 'Autonoe', gender: 'female', style: 'Bright' },
  { name: 'Enceladus', gender: 'male', style: 'Breathy' },
  { name: 'Iapetus', gender: 'male', style: 'Clear' },
  { name: 'Umbriel', gender: 'male', style: 'Easy-going' },
  { name: 'Algieba', gender: 'male', style: 'Smooth' },
  { name: 'Despina', gender: 'female', style: 'Smooth' },
  { name: 'Erinome', gender: 'female', style: 'Clear' },
  { name: 'Algenib', gender: 'male', style: 'Gravelly' },
  { name: 'Rasalgethi', gender: 'male', style: 'Informative' },
  { name: 'Laomedeia', gender: 'female', style: 'Upbeat' },
  { name: 'Achernar', gender: 'female', style: 'Soft' },
  { name: 'Alnilam', gender: 'male', style: 'Firm' },
  { name: 'Schedar', gender: 'male', style: 'Even' },
  { name: 'Gacrux', gender: 'female', style: 'Mature' },
  { name: 'Pulcherrima', gender: 'female', style: 'Forward' },
  { name: 'Achird', gender: 'male', style: 'Friendly' },
  { name: 'Zubenelgenubi', gender: 'male', style: 'Casual' },
  { name: 'Vindemiatrix', gender: 'female', style: 'Gentle' },
  { name: 'Sadachbia', gender: 'male', style: 'Lively' },
  { name: 'Sadaltager', gender: 'male', style: 'Knowledgeable' },
  { name: 'Sulafat', gender: 'female', style: 'Warm' },
];

/** OpenAI: nur die Namen — mehr gibt die Quelle nicht her. */
export const OPENAI_VOICES: Voice[] = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
].map((name) => ({ name, gender: null }));

export function voicesFor(provider: ProviderId): Voice[] {
  if (provider === 'gemini') return GEMINI_VOICES;
  if (provider === 'chatgpt') return OPENAI_VOICES;
  return [];
}

export function findVoice(provider: ProviderId, name: string): Voice | null {
  const wanted = name.trim().toLowerCase();
  return voicesFor(provider).find((voice) => voice.name.toLowerCase() === wanted) ?? null;
}

/** Sagt der Anbieter überhaupt etwas über das Geschlecht seiner Stimmen? */
export function documentsGender(provider: ProviderId): boolean {
  return voicesFor(provider).some((voice) => voice.gender !== null);
}

/**
 * Die Vorgabestimme je Geschlecht.
 *
 * Bewusst zwei ruhige, deutlich sprechende Stimmen statt der ersten aus der
 * Liste: „Firm" und „Informative" passen zu Vokabeln und Beispielsätzen
 * besser als „Excitable". Wer eine andere will, wählt sie namentlich.
 */
const PREFERRED: Record<VoiceGender, string> = { female: 'Kore', male: 'Charon' };

export function defaultVoiceForGender(provider: ProviderId, gender: VoiceGender): string | null {
  const voices = voicesFor(provider).filter((voice) => voice.gender === gender);
  if (voices.length === 0) return null;
  const preferred = voices.find((voice) => voice.name === PREFERRED[gender]);
  return (preferred ?? voices[0]).name;
}

/** Wie die Stimme in der Oberfläche beschrieben wird. */
export function describeVoice(provider: ProviderId, name: string): string {
  const voice = findVoice(provider, name);
  if (!voice) return 'Unbekannter Name — der Anbieter führt ihn nicht in seiner Liste.';
  const gender =
    voice.gender === 'female'
      ? 'weiblich'
      : voice.gender === 'male'
        ? 'männlich'
        : 'Geschlecht nicht dokumentiert';
  return voice.style ? `${gender} · „${voice.style}"` : gender;
}

/**
 * Vorschlag für den Thai-Kalibrierlauf (24.10.2026): drei ruhige, deutlich
 * sprechende Gemini-Stimmen — „Firm“, „Informative“, „Clear“. Kore ist die
 * bisherige Vorgabe des großen Laufs; welche wirklich trägt, misst erst der
 * Lauf (der Stilbegriff sagt nichts über Töne).
 */
export const KALIBRIER_STIMMEN_VORSCHLAG = ['Kore', 'Charon', 'Erinome'] as const;
export const MAX_KALIBRIER_STIMMEN = 3;
