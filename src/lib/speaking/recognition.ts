/**
 * Spracherkennung als austauschbare Naht (Schritt 3, Lern-Reiter-Ausbau).
 *
 * WARUM EINE NAHT UND KEIN FESTES MODUL: „Sag es auf …“ prüft Gesprochenes,
 * WENN das Gerät es kann — sonst bewertet die lernende Person selbst nach
 * der Musterlösung.
 *
 * - Web: die SpeechRecognition-API des Browsers (Chrome: ja). Sie sendet an
 *   den Browseranbieter — deshalb nur auf Zuruf; die Runner sagen das neben
 *   dem Knopf (`production.recognitionPrivacy`).
 * - iPhone/Android (seit 28.10.2026): expo-speech-recognition, AUSSCHLIESSLICH
 *   auf dem Gerät (`requiresOnDeviceRecognition`). So bleibt die Zusage des
 *   Mikrofon-Hinweises wahr: keine Audiodaten an einen Anbieter. Fehlt die
 *   Offline-Sprache, sagt die Naht das (`bereitschaft`), statt still ins Netz
 *   auszuweichen; auf Android lässt sie sich nachladen (`ladeSprache`).
 *   Ein App-Build ohne das native Modul (älterer Build) bekommt die
 *   geschlossene Naht, wie vorher.
 *
 * Erkannt werden bis zu fünf Varianten; mit `hinweise` (das erwartete Wort
 * oder der Satz) wird das dem Erkenner als Kontext gegeben UND die Variante
 * gewählt, die dem Ziel am nächsten ist — so arbeiten auch Lern-Apps, die
 * ein Bild zeigen und ein Wort hören wollen.
 */

import { Platform } from 'react-native';

import type { TranslationKey } from '@/lib/i18n/keys';

/** Warum nichts erkannt wurde — die Runner zeigen dazu einen Satz. */
export type ErkennungsFehler = 'nicht-erlaubt' | 'kein-netz' | 'nichts' | 'sprache-fehlt';

export const ERKENNUNGS_FEHLER_KEYS: Record<ErkennungsFehler, TranslationKey> = {
  'nicht-erlaubt': 'production.recognitionDenied',
  'kein-netz': 'production.recognitionOffline',
  nichts: 'production.recognitionNothing',
  'sprache-fehlt': 'recognition.languageMissing',
};

/** Die Fehlercodes der Web Speech API (und des Gerätemoduls), auf die Fälle der Oberfläche verteilt. */
export function erkennungsFehlerAus(code: string | undefined): ErkennungsFehler {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return 'nicht-erlaubt';
  if (code === 'network') return 'kein-netz';
  if (code === 'language-not-supported') return 'sprache-fehlt';
  return 'nichts';
}

/** Kann das Gerät diese Sprache OFFLINE erkennen? */
export type Bereitschaft = 'bereit' | 'laden-moeglich' | 'nicht-verfuegbar';

export type ErkennungsOptionen = {
  language: string;
  onHoeren?: (hoert: boolean) => void;
  onFehler?: (grund: ErkennungsFehler) => void;
  /** Erwartete Antwort(en): Kontext für den Erkenner und Auswahl der besten Variante. */
  hinweise?: string[];
};

export type ErkennungsNaht = {
  verfuegbar: boolean;
  /** `geraet` = offline auf dem Gerät, `browser` = Browserdienst. */
  art?: 'geraet' | 'browser';
  /**
   * Hört einmalig auf eine Antwort und liefert den erkannten Text — `null`
   * bei Fehler oder Abbruch. `onHoeren` wird beim Start aufgerufen, damit die
   * UI den Hör-Zustand zeigen kann. `onFehler` sagt bei `null`, warum —
   * vorher sprang der Knopf ohne jede Meldung zurück (Nutzertest 17.10.2026).
   */
  erkennen?: (options: ErkennungsOptionen) => Promise<string | null>;
  /** Erkennt eine Aufnahmedatei (16 kHz WAV) — nur auf dem Gerät. Alle Varianten. */
  erkenneDatei?: (options: { uri: string; language: string; hinweise?: string[] }) => Promise<string[] | null>;
  /** Nur Gerät: ist die Sprache offline da? */
  bereitschaft?: (language: string) => Promise<Bereitschaft>;
  /** Nur Android: Offline-Sprache nachladen. `true`, wenn sie danach bereit ist oder geladen wird. */
  ladeSprache?: (language: string) => Promise<boolean>;
};

// ------------------------------------------------------- Auswahl der Variante

/** Für den Vergleich: klein, ohne Satzzeichen, ohne Leerzeichen-Unterschiede. */
export function vergleichsForm(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,!?;:¿¡"“”„'’()…–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function abstand(a: string, b: string): number {
  const zeile = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let vorher = zeile[0];
    zeile[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const merk = zeile[j];
      zeile[j] = Math.min(zeile[j] + 1, zeile[j - 1] + 1, vorher + (a[i - 1] === b[j - 1] ? 0 : 1));
      vorher = merk;
    }
  }
  return zeile[b.length];
}

/** Die Variante, die einem der Hinweise am nächsten ist (ohne Hinweise: die erste). */
export function besteVariante(varianten: readonly string[], hinweise?: readonly string[]): string | null {
  const liste = varianten.map((v) => v.trim()).filter(Boolean);
  if (!liste.length) return null;
  if (!hinweise?.length) return liste[0];
  let beste = liste[0];
  let besterWert = Infinity;
  for (const variante of liste) {
    const v = vergleichsForm(variante).replace(/ /g, '');
    for (const hinweis of hinweise) {
      const h = vergleichsForm(hinweis).replace(/ /g, '');
      const wert = abstand(v, h) / Math.max(1, h.length);
      if (wert < besterWert) {
        besterWert = wert;
        beste = variante;
      }
    }
  }
  return beste;
}

// ------------------------------------------------------------------ Browser

interface FensterSpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

function erkennerKonstruktor(): (new () => FensterSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => FensterSpeechRecognition)
    | undefined;
  return ctor ?? null;
}

function browserNaht(Ctor: new () => FensterSpeechRecognition): ErkennungsNaht {
  return {
    verfuegbar: true,
    art: 'browser',
    erkennen({ language, onHoeren, onFehler, hinweise }) {
      return new Promise((resolve) => {
        const erkenner = new Ctor();
        erkenner.lang = language;
        erkenner.interimResults = false;
        erkenner.maxAlternatives = 5;
        erkenner.continuous = false;

        let beendet = false;
        const fertig = (text: string | null, grund: ErkennungsFehler = 'nichts') => {
          if (beendet) return;
          beendet = true;
          onHoeren?.(false);
          if (!text) onFehler?.(grund);
          resolve(text);
          try {
            erkenner.abort();
          } catch {
            // Ein bereits gestoppter Erkenner darf beim Abbruch nicht stören.
          }
        };

        erkenner.onresult = (event) => {
          const alternativen = event.results?.[0];
          const varianten: string[] = [];
          for (let i = 0; i < (alternativen?.length ?? 0); i++) varianten.push(alternativen![i].transcript ?? '');
          fertig(besteVariante(varianten, hinweise));
        };
        erkenner.onerror = (event) => fertig(null, erkennungsFehlerAus(event?.error));
        erkenner.onend = () => fertig(null);

        onHoeren?.(true);
        try {
          erkenner.start();
        } catch {
          fertig(null, 'nicht-erlaubt');
        }
      });
    },
  };
}

// ------------------------------------------------------------------- Gerät

type Modul = typeof import('expo-speech-recognition');

function geraeteModul(): Modul | null {
  try {
    const modul = require('expo-speech-recognition') as Modul;
    // Ein Build ohne das native Modul wirft hier oder liefert kein Objekt.
    return modul?.ExpoSpeechRecognitionModule ? modul : null;
  } catch {
    return null;
  }
}

/** Ist ein Gebietsschema in der Liste? „th-TH“ passt auch zu „th_TH“ und „th“. */
export function enthaeltSprache(liste: readonly string[] | undefined, locale: string): boolean {
  if (!liste?.length) return false;
  const ziel = locale.toLowerCase().replace('_', '-');
  const basis = ziel.split('-')[0];
  return liste.some((eintrag) => {
    const e = eintrag.toLowerCase().replace('_', '-');
    return e === ziel || e === basis || e.split('-')[0] === basis;
  });
}

/** Kurze Antworten (ein, zwei Wörter) brauchen beim Erkenner andere Einstellungen. */
function istKurz(hinweise?: string[]): boolean {
  const ziel = hinweise?.[0] ?? '';
  return ziel.length > 0 && (ziel.trim().split(/\s+/).length <= 2 && ziel.length <= 16);
}

function geraeteNaht(modul: Modul): ErkennungsNaht {
  const { ExpoSpeechRecognitionModule: erkenner, AudioEncodingAndroid } = modul;

  const bereitschaft = async (language: string): Promise<Bereitschaft> => {
    try {
      const { locales, installedLocales } = await erkenner.getSupportedLocales({});
      if (enthaeltSprache(installedLocales, language)) return 'bereit';
      if (Platform.OS === 'android' && enthaeltSprache(locales, language)) return 'laden-moeglich';
      return 'nicht-verfuegbar';
    } catch {
      return 'nicht-verfuegbar';
    }
  };

  /** Ein Durchlauf: Ereignisse sammeln bis „end“, dann alle Varianten liefern. */
  const lauf = (
    optionen: Parameters<Modul['ExpoSpeechRecognitionModule']['start']>[0],
    rueckmeldung: { onHoeren?: (hoert: boolean) => void; onFehler?: (grund: ErkennungsFehler) => void }
  ): Promise<string[] | null> =>
    new Promise((resolve) => {
      const varianten: string[] = [];
      let fehler: ErkennungsFehler | null = null;
      let fertig = false;
      const abos = [
        erkenner.addListener('result', (event) => {
          if (!event.isFinal) return;
          for (const ergebnis of event.results) if (ergebnis.transcript) varianten.push(ergebnis.transcript);
        }),
        erkenner.addListener('error', (event) => {
          fehler = erkennungsFehlerAus(event.error);
        }),
        erkenner.addListener('end', () => ende()),
      ];
      const uhr = setTimeout(() => {
        try {
          erkenner.abort();
        } catch {}
        ende();
      }, 30_000);
      function ende() {
        if (fertig) return;
        fertig = true;
        clearTimeout(uhr);
        for (const abo of abos) abo.remove();
        rueckmeldung.onHoeren?.(false);
        if (!varianten.length) {
          rueckmeldung.onFehler?.(fehler ?? 'nichts');
          resolve(null);
        } else resolve(varianten);
      }
      try {
        rueckmeldung.onHoeren?.(true);
        erkenner.start(optionen);
      } catch {
        fehler = 'nicht-erlaubt';
        ende();
      }
    });

  const vorbereiten = async (
    language: string,
    onFehler?: (grund: ErkennungsFehler) => void
  ): Promise<boolean> => {
    const erlaubnis = await erkenner.requestPermissionsAsync().catch(() => null);
    if (!erlaubnis?.granted) {
      onFehler?.('nicht-erlaubt');
      return false;
    }
    if ((await bereitschaft(language)) !== 'bereit') {
      onFehler?.('sprache-fehlt');
      return false;
    }
    return true;
  };

  const gemeinsam = (language: string, hinweise?: string[]) => ({
    lang: language,
    interimResults: false,
    maxAlternatives: 5,
    continuous: false,
    requiresOnDeviceRecognition: true,
    addsPunctuation: false,
    ...(hinweise?.length ? { contextualStrings: hinweise.slice(0, 5) } : {}),
    // Einzelwörter: so empfiehlt es expo-speech-recognition (sonst oft kein Ergebnis).
    ...(istKurz(hinweise)
      ? { iosTaskHint: 'confirmation' as const, androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'web_search' as const } }
      : {}),
  });

  return {
    verfuegbar: true,
    art: 'geraet',
    bereitschaft,
    async ladeSprache(language) {
      if (Platform.OS !== 'android') return false;
      try {
        const antwort = await erkenner.androidTriggerOfflineModelDownload({ locale: language });
        return antwort.status === 'download_success' || antwort.status === 'download_scheduled' || antwort.status === 'opened_dialog';
      } catch {
        return false;
      }
    },
    async erkennen({ language, onHoeren, onFehler, hinweise }) {
      if (!(await vorbereiten(language, onFehler))) return null;
      const varianten = await lauf(gemeinsam(language, hinweise), { onHoeren, onFehler });
      return varianten ? besteVariante(varianten, hinweise) : null;
    },
    async erkenneDatei({ uri, language, hinweise }) {
      // iOS verlangt die Spracherkennungs-Erlaubnis auch für Dateien.
      const erlaubnis = await erkenner.requestPermissionsAsync().catch(() => null);
      if (!erlaubnis?.granted) return null;
      if ((await bereitschaft(language)) !== 'bereit') return null;
      return lauf(
        {
          ...gemeinsam(language, hinweise),
          audioSource: {
            uri,
            audioChannels: 1,
            audioEncoding: AudioEncodingAndroid.ENCODING_PCM_16BIT,
            sampleRate: 16_000,
          },
        },
        {}
      );
    },
  };
}

let ersatz: ErkennungsNaht | null = null;

/** Tests: eigene Naht statt Browser/Gerät (`null` = wieder echt). */
export function setzeSpracherkennung(naht: ErkennungsNaht | null): void {
  ersatz = naht;
}

export function spracherkennung(): ErkennungsNaht {
  if (ersatz) return ersatz;
  if (Platform.OS !== 'web') {
    const modul = geraeteModul();
    return modul ? geraeteNaht(modul) : { verfuegbar: false };
  }
  const Ctor = erkennerKonstruktor();
  return Ctor ? browserNaht(Ctor) : { verfuegbar: false };
}
