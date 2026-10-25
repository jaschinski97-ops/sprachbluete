import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { restorePlaybackAudioMode } from '@/lib/audio-mode';
import {
  captureDurationMs,
  int16PcmToMono,
  joinPcmChunks,
  type CapturedPcm,
  type MicrophoneCaptureController,
  type MicrophoneCaptureError,
  type MicrophoneCaptureOptions,
  type MicrophoneCaptureStatus,
} from '@/lib/speaking/microphone-capture';

// Gewünschte Abtastrate; maßgeblich ist später die tatsächlich gelieferte (`buffer.sampleRate`).
const REQUESTED_SAMPLE_RATE = 16_000;

// Sichtbarer Teil des Zustands (löst Neuzeichnen aus); alles Übrige liegt in Refs.
type CaptureView = {
  status: MicrophoneCaptureStatus;
  elapsedMs: number;
  lastCapture: CapturedPcm | null;
  error: MicrophoneCaptureError | null;
};

const INITIAL_VIEW: CaptureView = {
  status: 'idle',
  elapsedMs: 0,
  lastCapture: null,
  error: null,
};

// Packt einen Fehler beim nativen Start in den gemeinsamen Fehlertyp (`start-failed`).
function nativeStartError(error: unknown): MicrophoneCaptureError {
  return {
    code: 'start-failed',
    message:
      error instanceof Error
        ? `Das Mikrofon konnte nicht gestartet werden: ${error.message}`
        : 'Das Mikrofon konnte nicht gestartet werden.',
  };
}

/**
 * Native Aufnahme (Android/iOS) ueber den PCM-Stream aus expo-audio 57.
 *
 * `AudioRecorder` schreibt nur codierte Dateien und `useAudioSampleListener`
 * tastet einen Player ab. Fuer die lokale F0-Messung ist deshalb AudioStream
 * der direkte Weg: mono, Int16 und die tatsaechlich gelieferte Abtastrate.
 */
export function useMicrophoneCapture(
  options: MicrophoneCaptureOptions = {}
): MicrophoneCaptureController {
  const maxDurationMs = captureDurationMs(options.maxDurationMs);
  const allowPlayback = options.allowPlayback === true;
  const [view, setView] = useState<CaptureView>(INITIAL_VIEW);
  // Refs statt State, weil Audio-Callbacks und Timer den aktuellen Wert sofort brauchen:
  // - statusRef: synchroner Spiegel von `view.status` (State hinkt einen Render hinterher),
  // - generationRef: wird bei Abbruch/Unmount erhöht und entwertet noch laufende asynchrone Fortsetzungen,
  // - acceptingRef: Schranke für `onBuffer`, nur während der Aufnahme werden Daten angenommen.
  const mountedRef = useRef(true);
  const statusRef = useRef<MicrophoneCaptureStatus>('idle');
  const generationRef = useRef(0);
  const acceptingRef = useRef(false);
  const chunksRef = useRef<Float32Array[]>([]);
  const lengthRef = useRef(0);
  const sampleRateRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressRef = useRef(0);
  const failureRef = useRef<MicrophoneCaptureError | null>(null);
  // Immer die neueste `finish`-Funktion, damit `onBuffer` und der Timer nicht an einer alten Closure hängen.
  const finishRef = useRef<(reachedLimit: boolean) => Promise<CapturedPcm | null>>(
    async () => null
  );
  // Läuft schon ein Beenden, bekommen weitere Aufrufer dasselbe Promise (Stopp ist idempotent).
  const finishPromiseRef = useRef<Promise<CapturedPcm | null> | null>(null);
  // Hat ein Start die iOS-Audiositzung auf Aufnahme gestellt? Dann muss jeder
  // Stopp sie zurück auf Wiedergabe bringen (lib/audio-mode.ts).
  const sessionTouchedRef = useRef(false);

  // Zustand nur setzen, solange die Komponente eingehängt ist (verspätete Callbacks nach dem Unmount).
  const updateView = useCallback((change: Partial<CaptureView>) => {
    if (mountedRef.current) setView((current) => ({ ...current, ...change }));
  }, []);

  // Wird vom Stream für jeden gelieferten Puffer aufgerufen: sammelt Mono-Samples bis zur Zeitgrenze,
  // meldet den Fortschritt höchstens alle 100 ms und beendet die Aufnahme selbst, wenn das Limit erreicht ist.
  const onBuffer = useCallback(
    (buffer: AudioStreamBuffer) => {
      if (!acceptingRef.current || buffer.sampleRate <= 0) return;

      // Die erste gelieferte Rate gilt für die ganze Aufnahme; ändert sie sich, ist die Messung unbrauchbar.
      if (sampleRateRef.current === null) {
        sampleRateRef.current = buffer.sampleRate;
      } else if (Math.abs(sampleRateRef.current - buffer.sampleRate) > 0.5) {
        failureRef.current = {
          code: 'capture-failed',
          message: 'Die Abtastrate hat sich während der Aufnahme geändert.',
        };
        acceptingRef.current = false;
        void finishRef.current(false);
        return;
      }

      // Auf die erlaubte Länge kappen, damit auch ein zu großer letzter Puffer das Limit nicht überschreitet.
      const mono = int16PcmToMono(buffer.data, buffer.channels);
      const limit = Math.floor((buffer.sampleRate * maxDurationMs) / 1_000);
      const remaining = Math.max(0, limit - lengthRef.current);
      const kept = mono.length <= remaining ? mono : mono.slice(0, remaining);
      if (kept.length > 0) {
        chunksRef.current.push(kept);
        lengthRef.current += kept.length;
      }

      const now = Date.now();
      if (now - lastProgressRef.current >= 100) {
        lastProgressRef.current = now;
        updateView({ elapsedMs: Math.round((lengthRef.current / buffer.sampleRate) * 1_000) });
      }

      if (lengthRef.current >= limit) {
        acceptingRef.current = false;
        void finishRef.current(true);
      }
    },
    [maxDurationMs, updateView]
  );

  // Int16 ist auf Android breiter verfuegbar als Float32; 16 kHz reicht fuer
  // den dokumentierten F0-Suchraum von 70--400 Hz bei weitem aus.
  const { stream } = useAudioStream({
    sampleRate: REQUESTED_SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer,
  });

  /**
   * Stoppt den Stream und stellt danach die Wiedergabe-Sitzung wieder her —
   * auch wenn `stop()` wirft. Fehler von `stop()` gehen an den Aufrufer.
   */
  const stopStream = useCallback(() => {
    try {
      stream.stop();
    } finally {
      if (sessionTouchedRef.current) {
        sessionTouchedRef.current = false;
        void restorePlaybackAudioMode();
      }
    }
  }, [stream]);

  // Sammelpuffer und Messwerte der laufenden Aufnahme leeren.
  const resetBuffers = useCallback(() => {
    chunksRef.current = [];
    lengthRef.current = 0;
    sampleRateRef.current = null;
    lastProgressRef.current = 0;
    failureRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Beendet die Aufnahme (manueller Stopp, Zeit- oder Speichergrenze, Fehler) und liefert die Samples oder `null`.
  // Die Puffer werden vorab in lokale Variablen übernommen und geleert; spätere Schritte prüfen `generation`,
  // damit ein inzwischen abgebrochener oder neu gestarteter Durchlauf nichts mehr überschreibt.
  const finish = useCallback(
    (reachedLimit: boolean): Promise<CapturedPcm | null> => {
      if (finishPromiseRef.current) return finishPromiseRef.current;
      if (statusRef.current !== 'recording') return Promise.resolve(null);

      statusRef.current = 'stopping';
      acceptingRef.current = false;
      clearTimer();
      updateView({ status: 'stopping' });

      const generation = generationRef.current;
      const failure = failureRef.current;
      const sampleRate = sampleRateRef.current;
      const length = lengthRef.current;
      const chunks = chunksRef.current;
      resetBuffers();

      const promise = Promise.resolve().then(() => {
        try {
          stopStream();
        } catch (error) {
          if (generation !== generationRef.current) return null;
          statusRef.current = 'idle';
          updateView({
            status: 'idle',
            error: {
              code: 'capture-failed',
              message:
                error instanceof Error
                  ? `Die Aufnahme konnte nicht beendet werden: ${error.message}`
                  : 'Die Aufnahme konnte nicht beendet werden.',
            },
          });
          return null;
        }

        if (generation !== generationRef.current || !mountedRef.current) return null;
        statusRef.current = 'idle';

        if (failure) {
          updateView({ status: 'idle', elapsedMs: 0, error: failure });
          return null;
        }
        if (!sampleRate || length === 0) {
          updateView({
            status: 'idle',
            elapsedMs: 0,
            error: {
              code: 'empty',
              message: 'Es wurde kein auswertbares Mikrofonsignal aufgenommen.',
            },
          });
          return null;
        }

        const capture: CapturedPcm = {
          samples: joinPcmChunks(chunks, length),
          sampleRate,
          durationMs: Math.round((length / sampleRate) * 1_000),
          reachedLimit,
        };
        updateView({
          status: 'idle',
          elapsedMs: capture.durationMs,
          lastCapture: capture,
          error: null,
        });
        return capture;
      });

      finishPromiseRef.current = promise;
      void promise.finally(() => {
        if (finishPromiseRef.current === promise) finishPromiseRef.current = null;
      });
      return promise;
    },
    [clearTimer, resetBuffers, stopStream, updateView]
  );
  finishRef.current = finish;

  // Harter Abbruch: Entwertet laufende Starts/Stopps über die Generation, stoppt den Stream und verwirft alles.
  const cancel = useCallback(() => {
    generationRef.current += 1;
    finishPromiseRef.current = null;
    acceptingRef.current = false;
    clearTimer();
    try {
      stopStream();
    } catch {
      // Ein nie gestarteter oder bereits freigegebener Stream braucht nichts mehr.
    }
    resetBuffers();
    statusRef.current = 'idle';
    updateView({
      status: 'idle',
      elapsedMs: 0,
      lastCapture: null,
      error: null,
    });
  }, [clearTimer, resetBuffers, stopStream, updateView]);

  // Startet die Aufnahme: erst Berechtigung (beim Tastendruck), dann der PCM-Stream. Nach jedem `await` wird
  // geprüft, ob inzwischen abgebrochen oder ausgehängt wurde; dann wird sauber aufgeräumt und `false` geliefert.
  const start = useCallback(async (): Promise<boolean> => {
    if (statusRef.current !== 'idle') return false;

    const generation = ++generationRef.current;
    statusRef.current = 'requesting-permission';
    resetBuffers();
    updateView({
      status: 'requesting-permission',
      elapsedMs: 0,
      lastCapture: null,
      error: null,
    });

    let permission;
    try {
      // Bewusst hier und nicht beim Mounten: Der Buttondruck ist der Ort der Nutzung.
      permission = await requestRecordingPermissionsAsync();
    } catch (error) {
      if (generation !== generationRef.current || !mountedRef.current) return false;
      statusRef.current = 'idle';
      updateView({ status: 'idle', error: nativeStartError(error) });
      return false;
    }

    if (generation !== generationRef.current || !mountedRef.current) return false;
    if (!permission.granted) {
      statusRef.current = 'idle';
      updateView({
        status: 'idle',
        error: {
          code: 'permission-denied',
          message: 'Ohne Mikrofonfreigabe kann keine Tonkontur aufgenommen werden.',
        },
      });
      return false;
    }

    try {
      acceptingRef.current = true;
      sessionTouchedRef.current = true;
      await stream.start();
      // SDK 57 AudioStream.start setzt unter iOS selbst .record. Erst danach
      // auf playAndRecord umstellen; sonst bleibt Shadowing stumm.
      if (allowPlayback && generation === generationRef.current && mountedRef.current) {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
    } catch (error) {
      acceptingRef.current = false;
      try { stopStream(); } catch { /* Auch einen teilweise gestarteten Stream freigeben. */ }
      if (generation !== generationRef.current || !mountedRef.current) return false;
      statusRef.current = 'idle';
      updateView({ status: 'idle', error: nativeStartError(error) });
      return false;
    }

    if (generation !== generationRef.current || !mountedRef.current) {
      acceptingRef.current = false;
      try {
        stopStream();
      } catch {
        // Die Komponente wurde waehrend des nativen Starts abgebaut.
      }
      return false;
    }

    statusRef.current = 'recording';
    updateView({ status: 'recording' });
    // Zeitgrenze als Sicherung, falls die Puffer kein Limit auslösen (z. B. weil keine Daten kommen).
    timerRef.current = setTimeout(() => {
      acceptingRef.current = false;
      void finishRef.current(true);
    }, maxDurationMs);
    return true;
  }, [allowPlayback, maxDurationMs, resetBuffers, stopStream, stream, updateView]);

  const stop = useCallback(() => finish(false), [finish]);

  const clear = useCallback(() => {
    updateView({ lastCapture: null, error: null });
  }, [updateView]);

  // Beim Aushängen laufende Aufnahme beenden und Ressourcen freigeben.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      acceptingRef.current = false;
      clearTimer();
      try {
        stopStream();
      } catch {
        // Der SharedObject-Hook gibt den Stream ebenfalls frei.
      }
      resetBuffers();
    };
  }, [clearTimer, resetBuffers, stopStream]);

  return useMemo(
    () => ({
      status: view.status,
      isRecording: view.status === 'recording',
      elapsedMs: view.elapsedMs,
      lastCapture: view.lastCapture,
      error: view.error,
      start,
      stop,
      cancel,
      clear,
    }),
    [cancel, clear, start, stop, view]
  );
}
