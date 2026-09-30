import * as Speech from 'expo-speech';
import type { AudioPlayer } from 'expo-audio';
import { allowsThaiPlayback, clipToneLabel, type AudioPurpose, type ToneStatus } from './content/audio-policy';
import { LEARNING_LANGUAGES } from './languages/definitions';
import type { LanguageCode } from './languages/types';

/**
 * Aussprache-Wiedergabe.
 *
 * Aufrufer sagen nur *was* gesprochen werden soll und in welcher Sprache.
 * Ob dahinter ein vorproduzierter Clip oder die Sprachausgabe des Geräts
 * steckt, entscheidet dieses Modul:
 *
 *   1. Ist `audioAssetId` gesetzt UND lässt sich daraus eine Quelle auflösen
 *      -> vorproduzierter Clip.
 *   2. Sonst -> `expo-speech` (TTS), th-TH für Thai, de-DE für Deutsch.
 *
 * In Phase 3 gab es noch keine Clips, der Auflöser lieferte also immer `null`
 * und es lief alles über TTS. Seit Phase 11 hängt `lib/clips` einen
 * Auflöser ein — und zwar **über Text und Sprache**, nicht nur über eine
 * Asset-ID: die Gespräch-Seite ruft `playPronunciation({ text, language })`
 * ohne jede ID, und sie sollte dafür nicht angefasst werden. Reihenfolge:
 *
 *   1. `audioAssetId` gesetzt und auflösbar → Clip.
 *   2. Sonst: Clip zu (Sprache, Text) vorhanden → Clip.
 *   3. Sonst: `expo-speech`.
 *
 * Was abgespielt wurde, sagt der Rückgabewert (`asset` / `tts`) — die
 * Oberfläche kann damit ehrlich kennzeichnen, dass ein Clip eine
 * synthetische Stimme ist (Pflicht 4 der Phase 11).
 */

/**
 * Welche Sprachen gesprochen werden können.
 *
 * SEIT PHASE 16 ALLE DREI ZIELSPRACHEN plus Deutsch, seit dem
 * Paarmatrix-Start (Roadmap v2) auch Französisch — die Kennungen sind
 * dieselben wie in `lib/languages` — eine zweite Sprachliste wäre eine
 * Stelle, an der man das Nachtragen vergisst.
 */
export type SpeechLanguage = LanguageCode;

/** Locale und Tempo der Gerätestimme stehen in `definitions.ts`. */
const LOCALE = (language: SpeechLanguage): string => LEARNING_LANGUAGES[language].speechLocale;
const RATE = (language: SpeechLanguage): number => LEARNING_LANGUAGES[language].speechRate;

export type PronunciationRequest = {
  text: string;
  language: SpeechLanguage;
  /** Verweist auf einen vorproduzierten Clip, falls vorhanden. */
  audioAssetId?: string;
  /** Nur beim Mitsprechen: Player-Ende darf den laufenden Mikrofonstream nicht stoppen. */
  concurrentRecording?: boolean;
  purpose?: AudioPurpose;
};

/** Was tatsächlich abgespielt wurde — nützlich für Tests und Anzeige. */
export type PlaybackKind = 'asset' | 'tts' | 'unavailable';
export type ResolvedClip = { uri: string; id: string; toneStatus?: ToneStatus };
export type PlaybackResult = { kind: PlaybackKind; label: string; clipId?: string; toneStatus?: ToneStatus };

/** Löst eine Asset-ID in eine abspielbare Quelle auf — synchron oder asynchron. */
export type AudioAssetResolver = (assetId: string) => string | null | Promise<string | null>;

let resolveAudioAsset: AudioAssetResolver = () => null;

export function registerAudioAssetResolver(resolver: AudioAssetResolver): void {
  resolveAudioAsset = resolver;
}

/** Findet zu (Sprache, Text) einen Clip — der Weg, den `lib/clips` benutzt. */
export type PronunciationClipLookup = (request: {
  text: string;
  language: SpeechLanguage;
  purpose?: AudioPurpose;
}) => string | ResolvedClip | null | Promise<string | ResolvedClip | null>;

let lookupClip: PronunciationClipLookup = () => null;

export function registerPronunciationClipLookup(lookup: PronunciationClipLookup | null): void {
  lookupClip = lookup ?? (() => null);
}

export async function hasPronunciationClip(request: { text: string; language: SpeechLanguage; purpose?: AudioPurpose }): Promise<boolean> {
  const clip = await Promise.resolve(lookupClip(request)).catch(() => null);
  if (request.purpose === 'tone') return typeof clip === 'object' && clip !== null && clip.toneStatus === 'passed';
  return Boolean(clip);
}

/** Trennt die Wiedergabe von der Entscheidungslogik, damit sie testbar bleibt. */
export type PronunciationBackend = {
  playAsset(uri: string, concurrentRecording?: boolean): Promise<void>;
  speak(text: string, locale: string, rate: number, concurrentRecording?: boolean): Promise<void>;
  stop(): Promise<void>;
  /** Sprachkennungen der installierten Stimmen, z. B. `['de-DE', 'en-US']`. */
  availableLocales(): Promise<string[]>;
};

type ActiveAssetPlayback = {
  player: AudioPlayer;
  subscription: { remove(): void } | null;
};

let activeAssetPlayback: ActiveAssetPlayback | null = null;

function releaseAssetPlayback(expected?: ActiveAssetPlayback): void {
  const active = activeAssetPlayback;
  if (!active || (expected && active !== expected)) return;
  activeAssetPlayback = null;
  active.subscription?.remove();
  try {
    active.player.pause();
  } catch {
    // `remove` gibt die Ressource auch frei, wenn Pause bereits unmoeglich ist.
  }
  try {
    active.player.remove();
  } catch {
    // Ein bereits freigegebener Player braucht nichts mehr.
  }
}

const defaultBackend: PronunciationBackend = {
  async playAsset(uri, concurrentRecording) {
    // Natives Modul erst bei Bedarf laden. Der Lazy-Require bleibt auch im
    // Jest-Prozess austauschbar, damit der echte Player-Lebenszyklus pruefbar ist.
    const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
    const player = createAudioPlayer({ uri }, { keepAudioSessionActive: concurrentRecording === true });
    const playback: ActiveAssetPlayback = { player, subscription: null };
    activeAssetPlayback = playback;
    try {
      playback.subscription = player.addListener('playbackStatusUpdate', (status) => {
        // `didJustFinish` erreicht eine gescheiterte Wiedergabe nie. expo-audio
        // (v57) meldet das als `error` am Status — ohne Freigabe auch in diesem
        // Fall bliebe der Player bis zum naechsten Stopp als aktiv belegt.
        if (status.didJustFinish || status.error !== null) releaseAssetPlayback(playback);
      });
      player.play();
    } catch (error) {
      // Weder Listener noch play() duerfen einen halb angelegten Player als
      // "aktiv" hinterlassen — der naechste Stopp wuerde ihn sonst trotzdem
      // wieder freigeben wollen. Der Fehler selbst geht weiter raus: Aufrufer
      // duerfen nicht glauben, es waere etwas zu hoeren gewesen.
      releaseAssetPlayback(playback);
      throw error;
    }
  },
  async speak(text, language, rate, concurrentRecording) {
    Speech.speak(text, { language, rate, ...(concurrentRecording ? { useApplicationAudioSession: true } : {}) });
  },
  async stop() {
    // Wichtig fuer die Sprechuebung: Ein lokaler KI-Clip darf beim Start der
    // Mikrofonaufnahme nicht weiterlaufen und in die Messung uebersprechen.
    releaseAssetPlayback();
    await Speech.stop();
  },
  async availableLocales() {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.map((voice) => voice.language);
  },
};

let backend = defaultBackend;

// Wiedergabe- und Stoppvorgaenge laufen geordnet. Sonst koennte ein langsamer
// Clip-Aufloeser *nach* einem bereits angeforderten Stopp doch noch starten.
let playbackQueue: Promise<void> = Promise.resolve();

function enqueuePlayback<T>(operation: () => Promise<T>): Promise<T> {
  const result = playbackQueue.then(operation, operation);
  playbackQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/** Nur für Tests. */
export function setPronunciationBackend(next: PronunciationBackend | null): void {
  backend = next ?? defaultBackend;
}

/**
 * Spielt die Aussprache ab. Eine laufende Ausgabe wird vorher abgebrochen —
 * sonst stapeln sich die Äußerungen, wenn schnell mehrfach getippt wird.
 */
async function playPronunciationNow(
  request: PronunciationRequest
): Promise<PlaybackResult> {
  const text = request.text.trim();
  const unavailable: PlaybackResult = { kind: 'unavailable', label: 'advanced.unavailable' };
  if (!text) return unavailable;

  await backend.stop().catch(() => {
    // Nichts lief, das ist kein Fehler.
  });

  let uri: string | null = null;
  let resolved: ResolvedClip | null = null;
  if (request.audioAssetId && request.language !== 'th') {
    uri = await resolveAudioAsset(request.audioAssetId);
  }
  if (!uri) {
    // Ein Fehler beim Nachschlagen darf die Wiedergabe nicht verhindern -
    // dann eben TTS, wie vor Phase 11.
    const clip = await Promise.resolve(lookupClip({ text, language: request.language, ...(request.purpose ? { purpose: request.purpose } : {}) })).catch(
      () => null
    );
    resolved = typeof clip === 'object' ? clip : null;
    uri = typeof clip === 'string' ? clip : clip?.uri ?? null;
    if (request.language === 'th' && resolved && !allowsThaiPlayback(resolved.toneStatus, request.purpose)) uri = null;
    // A legacy string resolver has no gate evidence and can never feed a tone test.
    if (request.language === 'th' && request.purpose === 'tone' && !allowsThaiPlayback(resolved?.toneStatus, 'tone')) uri = null;
  }
  if (uri) {
    if (request.concurrentRecording) await backend.playAsset(uri, true);
    else await backend.playAsset(uri);
    return { kind: 'asset', label: clipToneLabel(resolved?.toneStatus ?? (request.language === 'th' ? undefined : 'not-applicable')),
      ...(resolved ? { clipId: resolved.id, toneStatus: resolved.toneStatus } : {}) };
  }

  // The scored tone-recognition exercise must never fall back to untested TTS.
  if (request.purpose === 'tone') return unavailable;

  if (request.concurrentRecording) await backend.speak(text, LOCALE(request.language), RATE(request.language), true);
  else await backend.speak(text, LOCALE(request.language), RATE(request.language));
  // Wörterbuchschlüssel statt deutscher Sätze — die Runner übersetzen (21.09.2026).
  return { kind: 'tts', label: request.language === 'th' ? 'audio.systemVoiceUnchecked' : 'audio.systemVoice' };
}

export function playPronunciation(request: PronunciationRequest): Promise<PlaybackKind> {
  return playPronunciationWithStatus(request).then(result => result.kind);
}

export function playPronunciationWithStatus(request: PronunciationRequest): Promise<PlaybackResult> {
  return enqueuePlayback(() => playPronunciationNow(request));
}

export function stopPronunciation(): Promise<void> {
  return enqueuePlayback(async () => {
    await backend.stop().catch(() => {});
  });
}

/**
 * Gibt es auf diesem Gerät eine Stimme für diese Sprache?
 *
 * Drei Antworten, nicht zwei: `true`, `false` und **`null` für „weiß ich
 * nicht"**. Das ist keine Bequemlichkeit, sondern nötig — manche Plattformen
 * liefern eine leere Stimmenliste, obwohl die Sprachausgabe funktioniert. Aus
 * einer leeren Liste „keine Thai-Stimme" zu schließen, würde die Ton-Übung
 * auf Geräten sperren, auf denen sie läuft. Gewarnt wird deshalb nur bei einem
 * eindeutigen `false`: die Liste ist da, aber die Sprache fehlt darin.
 *
 * Der Hinweis ist wichtig, weil eine fehlende Thai-Stimme keine Fehlfunktion
 * der App ist, sondern eine Systemeinstellung — ohne Erklärung bliebe die
 * Ton-Übung einfach stumm und wirkte kaputt.
 */
export async function isLanguageAvailable(
  language: SpeechLanguage
): Promise<boolean | null> {
  let locales: string[];
  try {
    locales = await backend.availableLocales();
  } catch {
    return null;
  }
  if (locales.length === 0) return null;
  const prefix = language.toLowerCase();
  return locales.some((locale) => locale.toLowerCase().startsWith(prefix));
}
