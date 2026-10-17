/**
 * Spracherkennung als austauschbare Naht (Schritt 3, Lern-Reiter-Ausbau).
 *
 * WARUM EINE NAHT UND KEIN FESTES MODUL: „Sag es auf …“ prüft Gesprochenes,
 * WENN das Gerät es kann — sonst bewertet die lernende Person selbst nach
 * der Musterlösung. Auf Web bietet der Browser die SpeechRecognition-API
 * (Chrome: ja, offline nicht überall); unter Expo Native ist kein
 * Erkennungsmodul installiert — dort ist die Naht ehrlich geschlossen
 * (`verfuegbar: false`), und der Runner zeigt den Selbstbewertungsweg.
 *
 * Die Erkennung sendet an den Browseranbieter — sie läuft deshalb bewusst
 * nur auf Zuruf (Knopfdruck) und überträgt nur die eine Antwort. Die Runner
 * sagen das neben dem Knopf (`production.recognitionPrivacy`).
 */

import type { TranslationKey } from '@/lib/i18n/keys';

/** Warum nichts erkannt wurde — die Runner zeigen dazu einen Satz. */
export type ErkennungsFehler = 'nicht-erlaubt' | 'kein-netz' | 'nichts';

export const ERKENNUNGS_FEHLER_KEYS: Record<ErkennungsFehler, TranslationKey> = {
  'nicht-erlaubt': 'production.recognitionDenied',
  'kein-netz': 'production.recognitionOffline',
  nichts: 'production.recognitionNothing',
};

/** Die Fehlercodes der Web Speech API, auf die drei Fälle der Oberfläche verteilt. */
export function erkennungsFehlerAus(code: string | undefined): ErkennungsFehler {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return 'nicht-erlaubt';
  if (code === 'network') return 'kein-netz';
  return 'nichts';
}

export type ErkennungsNaht = {
  verfuegbar: boolean;
  /**
   * Hört einmalig auf eine Antwort und liefert den erkannten Text — `null`
   * bei Fehler oder Abbruch. `onHören` wird beim Start aufgerufen, damit die
   * UI den Hör-Zustand zeigen kann. `onFehler` sagt bei `null`, warum —
   * vorher sprang der Knopf ohne jede Meldung zurück (Nutzertest 17.10.2026).
   */
  erkennen?: (options: {
    language: string;
    onHoeren?: (hoert: boolean) => void;
    onFehler?: (grund: ErkennungsFehler) => void;
  }) => Promise<string | null>;
};

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

export function spracherkennung(): ErkennungsNaht {
  const Ctor = erkennerKonstruktor();
  if (!Ctor) return { verfuegbar: false };
  return {
    verfuegbar: true,
    erkennen({ language, onHoeren, onFehler }) {
      return new Promise((resolve) => {
        const erkenner = new Ctor();
        erkenner.lang = language;
        erkenner.interimResults = false;
        erkenner.maxAlternatives = 1;
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
          const text = alternativen?.[0]?.transcript ?? null;
          fertig(text ? text.trim() : null);
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
