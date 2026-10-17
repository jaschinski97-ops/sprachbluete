import { SpeechLanguage } from '../audio';
import { LEARNING_LANGUAGES } from '../languages/definitions';
import { isLanguageCode } from '../languages/types';

import { BlobStore, BlobStoreConfig, extensionOf } from '../blobs/types';
import { AudioFormat, ProviderId } from '../providers/types';

/**
 * Hörclips (Phase 11).
 *
 * WARUM ES SIE GIBT: Alles Hörbare lief bis hierher über die Sprachausgabe
 * des Geräts (`expo-speech`). Der Nutzer hat am eigenen Gerät erlebt, dass
 * dort **gar keine Thai-Stimme** vorhanden war — und dieser Rechner hat
 * ebenfalls keine (Windows: nur de-DE/en-US; Browser: nur de-DE, nachgemessen
 * in Phase 11). Ohne Clip bleibt „Thai anhören" auf solchen Geräten stumm.
 * Die Audio-Abstraktion aus Phase 3 hat den Weg vorgesehen: Clip vorhanden →
 * abspielen, sonst TTS. Hier wird er gefüllt.
 *
 * WAS EIN CLIP IST — UND WAS NICHT: eine **synthetische** Aufnahme eines
 * Sprachmodells, keine Muttersprachler-Aufnahme. Das Feld `synthetic: true`
 * ist ein Literaltyp, damit es keine Fassung dieses Dokuments geben kann, die
 * behauptet, etwas anderes zu sein — dieselbe Linie wie `sourceVerified` bei
 * den Vokabeln (Pflicht 4). Ob die Töne stimmen, ist gemessen, nicht
 * versprochen: AE-31.
 *
 * SCHLÜSSEL ÜBER DEN TEXT, NICHT ÜBER DIE QUELLE: Die Screens rufen
 * `playPronunciation({ text, language })` — die Gespräch-Seite ganz ohne
 * `audioAssetId`. Damit die Screens unangetastet bleiben (Vorgabe), muss sich
 * ein Clip aus genau diesen zwei Angaben finden lassen. Die ID ist deshalb
 * ein Hash aus Sprache und normalisiertem Text. Nebeneffekt, und ein
 * erwünschter: derselbe Satz („สวัสดีครับ") in zwanzig Dialogen ist **ein**
 * Clip, nicht zwanzig.
 */

/**
 * Welche Sprachen vertont werden koennen.
 *
 * SEIT PHASE 16 DIESELBE LISTE WIE DIE SPRACHAUSGABE. Vorher stand hier
 * `'th' | 'de'` als eigene Aufzaehlung; mit Englisch und Spanisch waeren das
 * zwei Listen gewesen, die auseinanderlaufen - und der Aufloeser haette
 * fuer 'en' schlicht nicht uebersetzt.
 *
 * ACHTUNG BEIM AENDERN: Die Kennung geht in die Clip-ID ein. Wer sie
 * umbenennt, macht jeden bereits abgelegten Clip unauffindbar.
 */
export type ClipLanguage = SpeechLanguage;

/** Woher der Text stammt — nur zur Anzeige und fürs Zählen. */
export type ClipKind = 'vocab' | 'example' | 'turn';

export type AudioClipSpec = {
  id: string;
  language: ClipLanguage;
  text: string;
  kind: ClipKind;
  /** Vokabel-ID bzw. `<situation>#<zug>` — für die Fehlerliste des Laufs. */
  sourceId: string;
};

/** Metadaten-Dokument in der Sammlung `audio`. */
export type AudioClip = {
  id: string;
  language: ClipLanguage;
  text: string;
  kind: ClipKind;
  sourceId: string;
  format: AudioFormat;
  /** Größe der Audiodaten in Byte (dekodiert, nicht Base64). */
  byteSize: number;
  /** Aus dem WAV-Kopf; bei mp3 nicht ohne Dekodieren bestimmbar. */
  durationMs?: number;
  /** Schlüssel im Blob-Speicher, inklusive Endung. */
  blobKey: string;
  provider: ProviderId;
  model: string;
  voice: string;
  /**
   * Kennung der Sprechanweisung, mit der der Clip erzeugt wurde
   * (`clips/tts-instructions`) — fehlt bei Clips ohne Anweisung. Der
   * Tonbericht vergleicht die Gruppen.
   */
  instructionsId?: string;
  generatedAt: number;
  /** Immer `true` — ein Sprachmodell, keine Muttersprachler-Aufnahme. */
  synthetic: true;
};

/** Ergebnis eines einzelnen Aufrufs, noch nicht abgelegt. */
export type GeneratedClip = {
  base64: string;
  format: AudioFormat;
  model: string;
  voice: string;
  provider: ProviderId;
  durationMs?: number;
  instructionsId?: string;
};

export const AUDIO_MIME: Record<AudioFormat, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};

export function isAudioFormat(value: unknown): value is AudioFormat {
  return value === 'wav' || value === 'mp3';
}

export function audioFormatOfKey(key: string): AudioFormat {
  const extension = extensionOf(key);
  if (isAudioFormat(extension)) return extension;
  throw new Error(`Unbekannte Audio-Endung in "${key}".`);
}

export const AUDIO_BLOB_CONFIG: BlobStoreConfig = {
  name: 'audio',
  mimeOf: (key) => AUDIO_MIME[audioFormatOfKey(key)],
};

export type AudioBlobStore = BlobStore;

export function clipBlobKey(id: string, format: AudioFormat): string {
  return `${id}.${format}`;
}

/**
 * Leerraum zusammenziehen, Ränder abschneiden — so steht der Text im Dokument.
 */
export function normalizeClipText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Der Text, aus dem der Schlüssel entsteht.
 *
 * Bei **Thai fällt jeder Leerraum weg**: Thai setzt zwischen Wörtern keine
 * Leerzeichen, der Grundstock tut es als Lernhilfe trotzdem („สวัสดี ครับ"),
 * ein Dialog aus Phase 4 nicht („สวัสดีครับ"). Im Web-Build nachgestellt: ohne
 * diese Regel spielte der Dialogzug die Sprachausgabe, obwohl der Clip zum
 * Beispielsatz längst da war. Bei Deutsch bleiben Wortgrenzen erhalten.
 *
 * Mehr Normalisierung gibt es bewusst nicht: Thai kennt keine Groß- und
 * Kleinschreibung, und Satzzeichen ändern die Aussprache. Und: Diese Regel ist
 * Teil der gespeicherten Daten — wer sie später ändert, macht jeden bereits
 * abgelegten Clip unauffindbar.
 */
export function clipKeyText(language: ClipLanguage, text: string): string {
  const collapsed = normalizeClipText(text);
  return LEARNING_LANGUAGES[language].script === 'thai' ? collapsed.replace(/\s/g, '') : collapsed;
}

/**
 * FNV-1a, zweimal mit verschiedenem Startwert → 64 Bit als 16 Hex-Zeichen.
 *
 * Über Codepunkte, nicht UTF-16-Einheiten, damit die ID auf jeder Plattform
 * gleich ausfällt. Ein einzelner 32-Bit-Hash hätte bei ~1500 Texten eine
 * Kollisionswahrscheinlichkeit im Promillebereich — zu viel für etwas, das
 * still den falschen Clip abspielen würde.
 */
function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function clipIdFor(language: ClipLanguage, text: string): string {
  const key = clipKeyText(language, text);
  return `${language}-${fnv1a(key, 0x811c9dc5)}${fnv1a(key, 0x9747b28c)}`;
}

/**
 * Prüft ein Dokument aus dem Speicher, bevor es benutzt wird (AE-25).
 * Ein Clip aus einer älteren Fassung darf die Wiedergabe nicht abstürzen
 * lassen — er fällt dann einfach auf TTS zurück.
 */
export function isValidAudioClip(value: unknown): value is AudioClip {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    c.id !== '' &&
    isLanguageCode(c.language) &&
    typeof c.text === 'string' &&
    isAudioFormat(c.format) &&
    typeof c.blobKey === 'string' &&
    c.blobKey !== '' &&
    c.synthetic === true
  );
}
