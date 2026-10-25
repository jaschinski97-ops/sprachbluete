import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  captureDurationMs,
  joinPcmChunks,
  type CapturedPcm,
  type MicrophoneCaptureController,
  type MicrophoneCaptureError,
  type MicrophoneCaptureOptions,
  type MicrophoneCaptureStatus,
} from '@/lib/speaking/microphone-capture';

// Gewünschte Abtastrate; maßgeblich ist später die tatsächlich gelieferte (`context.sampleRate`).
const REQUESTED_SAMPLE_RATE = 16_000;
const WORKLET_NAME = 'thai-speaker-pcm-capture';
// Quelltext des AudioWorklet-Prozessors; wird zur Laufzeit über eine Blob-URL geladen (keine eigene Datei nötig).
// Er mischt alle Eingangskanäle zu Mono und reicht jeden Puffer per `postMessage` an den Hauptthread weiter.
const WORKLET_SOURCE = `
class ThaiSpeakerPcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0 || channels[0].length === 0) return true;
    const mono = new Float32Array(channels[0].length);
    for (let channel = 0; channel < channels.length; channel++) {
      const input = channels[channel];
      for (let frame = 0; frame < mono.length; frame++) mono[frame] += input[frame] / channels.length;
    }
    this.port.postMessage(mono.buffer, [mono.buffer]);
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', ThaiSpeakerPcmCapture);
`;

// Sichtbarer Teil des Zustands (löst Neuzeichnen aus); alles Übrige liegt in Refs.
type CaptureView = {
  status: MicrophoneCaptureStatus;
  elapsedMs: number;
  lastCapture: CapturedPcm | null;
  error: MicrophoneCaptureError | null;
};

// Alle Web-Audio-Objekte einer laufenden Aufnahme; sie müssen beim Beenden vollständig freigegeben werden.
type WebAudioResources = {
  context: AudioContext;
  mediaStream: MediaStream;
  source: MediaStreamAudioSourceNode;
  captureNode: AudioWorkletNode | ScriptProcessorNode;
  silentGain: GainNode;
};

const INITIAL_VIEW: CaptureView = {
  status: 'idle',
  elapsedMs: 0,
  lastCapture: null,
  error: null,
};

// Der Konstruktor heißt in älteren Safari-Versionen `webkitAudioContext`; ohne Web Audio (z. B. Server) `null`.
function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const candidate = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return candidate ?? null;
}

// Übersetzt einen Fehler von `getUserMedia` & Co.: verweigerte Freigabe → `permission-denied`, sonst `start-failed`.
function webStartError(error: unknown): MicrophoneCaptureError {
  const name =
    typeof DOMException !== 'undefined' && error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      code: 'permission-denied',
      message: 'Ohne Mikrofonfreigabe kann keine Tonkontur aufgenommen werden.',
    };
  }
  return {
    code: 'start-failed',
    message:
      error instanceof Error
        ? `Das Mikrofon konnte nicht gestartet werden: ${error.message}`
        : 'Das Mikrofon konnte nicht gestartet werden.',
  };
}

function createAudioContext(AudioContextClass: typeof AudioContext): AudioContext {
  try {
    return new AudioContextClass({ sampleRate: REQUESTED_SAMPLE_RATE });
  } catch {
    // Safari-Versionen, die die Option nicht akzeptieren, liefern ihre echte
    // Hardware-Rate ueber context.sampleRate; die Auswertung benutzt genau die.
    return new AudioContextClass();
  }
}

// Bevorzugter Aufnahmeweg: Der Prozessor läuft im Audio-Thread und liefert Mono-Puffer samt Abtastrate an `onSamples`.
async function createWorkletNode(
  context: AudioContext,
  onSamples: (samples: Float32Array, sampleRate: number) => void
): Promise<AudioWorkletNode> {
  const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }

  const node = new AudioWorkletNode(context, WORKLET_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  node.port.onmessage = (event: MessageEvent<ArrayBuffer | Float32Array>) => {
    const samples =
      event.data instanceof Float32Array ? event.data : new Float32Array(event.data);
    onSamples(samples, context.sampleRate);
  };
  return node;
}

function createScriptProcessorNode(
  context: AudioContext,
  onSamples: (samples: Float32Array, sampleRate: number) => void
): ScriptProcessorNode {
  // Veraltet, aber als lokaler Fallback fuer Browser ohne AudioWorklet noch
  // sinnvoll. Ein Eingangskanal laesst Web Audio vorab nach Mono mischen.
  const node = context.createScriptProcessor(2_048, 1, 1);
  node.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    onSamples(input.slice(), event.inputBuffer.sampleRate);
  };
  return node;
}

/**
 * Web-Aufnahme direkt aus getUserMedia/Web Audio.
 *
 * expo-audio 57 exportiert `useAudioStream` zwar fuer Web, seine konkrete
 * `AudioStream.web`-Implementierung liefert aber nur `stream: null`. Dieser
 * getrennte Pfad greift deshalb lokal auf PCM zu, ohne MediaRecorder-Datei,
 * Upload, Schluessel oder persistente Ablage.
 */
export function useMicrophoneCapture(
  options: MicrophoneCaptureOptions = {}
): MicrophoneCaptureController {
  const maxDurationMs = captureDurationMs(options.maxDurationMs);
  const [view, setView] = useState<CaptureView>(INITIAL_VIEW);
  // Refs statt State, weil Audio-Callbacks und Timer den aktuellen Wert sofort brauchen:
  // - statusRef: synchroner Spiegel von `view.status` (State hinkt einen Render hinterher),
  // - generationRef: wird bei Abbruch/Unmount erhöht und entwertet noch laufende asynchrone Fortsetzungen,
  // - acceptingRef: Schranke für `acceptSamples`, nur während der Aufnahme werden Daten angenommen.
  const mountedRef = useRef(true);
  const statusRef = useRef<MicrophoneCaptureStatus>('idle');
  const generationRef = useRef(0);
  const acceptingRef = useRef(false);
  const resourcesRef = useRef<WebAudioResources | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const lengthRef = useRef(0);
  const sampleRateRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressRef = useRef(0);
  const failureRef = useRef<MicrophoneCaptureError | null>(null);
  // Immer die neueste `finish`-Funktion, damit Audio-Callback und Timer nicht an einer alten Closure hängen.
  const finishRef = useRef<(reachedLimit: boolean) => Promise<CapturedPcm | null>>(
    async () => null
  );
  // Läuft schon ein Beenden, bekommen weitere Aufrufer dasselbe Promise (Stopp ist idempotent).
  const finishPromiseRef = useRef<Promise<CapturedPcm | null> | null>(null);

  // Zustand nur setzen, solange die Komponente eingehängt ist (verspätete Callbacks nach dem Unmount).
  const updateView = useCallback((change: Partial<CaptureView>) => {
    if (mountedRef.current) setView((current) => ({ ...current, ...change }));
  }, []);

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

  // Gibt Mikrofon und Audio-Graph frei (mehrfach aufrufbar; ohne laufende Aufnahme passiert nichts).
  const releaseResources = useCallback(async () => {
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    if (!resources) return;

    // Tracks zuerst stoppen: Das beendet den System-Mikrofonindikator auch
    // dann sofort, wenn context.close() spaeter ablehnt.
    try {
      resources.mediaStream.getTracks().forEach((track) => track.stop());
    } catch {
      // Der Stream kann vom Browser bereits beendet worden sein.
    }
    if ('port' in resources.captureNode) {
      resources.captureNode.port.onmessage = null;
    } else {
      resources.captureNode.onaudioprocess = null;
    }
    for (const node of [resources.source, resources.captureNode, resources.silentGain]) {
      try {
        node.disconnect();
      } catch {
        // Disconnect ist idempotent gemeint; manche Browser werfen trotzdem.
      }
    }
    await resources.context.close().catch(() => {});
  }, []);

  // Nimmt jeden Puffer aus Worklet bzw. ScriptProcessor entgegen: sammelt bis zur Zeitgrenze, meldet den Fortschritt
  // höchstens alle 100 ms und beendet die Aufnahme selbst, sobald das Limit erreicht ist.
  const acceptSamples = useCallback(
    (samples: Float32Array, sampleRate: number) => {
      if (!acceptingRef.current || sampleRate <= 0) return;
      // Die erste gelieferte Rate gilt für die ganze Aufnahme; ändert sie sich, ist die Messung unbrauchbar.
      if (sampleRateRef.current === null) {
        sampleRateRef.current = sampleRate;
      } else if (Math.abs(sampleRateRef.current - sampleRate) > 0.5) {
        failureRef.current = {
          code: 'capture-failed',
          message: 'Die Abtastrate hat sich während der Aufnahme geändert.',
        };
        acceptingRef.current = false;
        void finishRef.current(false);
        return;
      }

      // Auf die erlaubte Länge kappen, damit auch ein zu großer letzter Puffer das Limit nicht überschreitet.
      const limit = Math.floor((sampleRate * maxDurationMs) / 1_000);
      const remaining = Math.max(0, limit - lengthRef.current);
      const kept = samples.length <= remaining ? samples : samples.slice(0, remaining);
      if (kept.length > 0) {
        // Worklet- und ScriptProcessor-Puffer duerfen nach dem Callback wieder
        // verwendet werden. Eine eigene Kopie haelt die Aufnahme deterministisch.
        chunksRef.current.push(kept.slice());
        lengthRef.current += kept.length;
      }

      const now = Date.now();
      if (now - lastProgressRef.current >= 100) {
        lastProgressRef.current = now;
        updateView({ elapsedMs: Math.round((lengthRef.current / sampleRate) * 1_000) });
      }

      if (lengthRef.current >= limit) {
        acceptingRef.current = false;
        void finishRef.current(true);
      }
    },
    [maxDurationMs, updateView]
  );

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

      const promise = (async () => {
        await releaseResources();

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
      })();

      finishPromiseRef.current = promise;
      void promise.finally(() => {
        if (finishPromiseRef.current === promise) finishPromiseRef.current = null;
      });
      return promise;
    },
    [clearTimer, releaseResources, resetBuffers, updateView]
  );
  finishRef.current = finish;

  // Harter Abbruch: Entwertet laufende Starts/Stopps über die Generation, gibt das Mikrofon frei und verwirft alles.
  const cancel = useCallback(() => {
    generationRef.current += 1;
    finishPromiseRef.current = null;
    acceptingRef.current = false;
    clearTimer();
    void releaseResources();
    resetBuffers();
    statusRef.current = 'idle';
    updateView({
      status: 'idle',
      elapsedMs: 0,
      lastCapture: null,
      error: null,
    });
  }, [clearTimer, releaseResources, resetBuffers, updateView]);

  // Startet die Aufnahme: erst Berechtigung (beim Tastendruck), dann Audio-Graph aufbauen. Nach jedem `await` wird
  // geprüft, ob inzwischen abgebrochen oder ausgehängt wurde; dann wird sauber aufgeräumt und `false` geliefert.
  const start = useCallback(async (): Promise<boolean> => {
    if (statusRef.current !== 'idle') return false;

    const AudioContextClass = audioContextConstructor();
    if (
      !AudioContextClass ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      updateView({
        status: 'idle',
        elapsedMs: 0,
        lastCapture: null,
        error: {
          code: 'unsupported',
          message: 'Dieser Browser stellt keine lokale Mikrofonaufnahme bereit.',
        },
      });
      return false;
    }

    const generation = ++generationRef.current;
    statusRef.current = 'requesting-permission';
    resetBuffers();
    updateView({
      status: 'requesting-permission',
      elapsedMs: 0,
      lastCapture: null,
      error: null,
    });

    const context = createAudioContext(AudioContextClass);
    let mediaStream: MediaStream | null = null;
    try {
      // Context und Berechtigungsdialog entstehen beide aus dem ausdruecklichen
      // Start-Klick. Es gibt keinen Permission-Check beim Mounten.
      await context.resume();
      // Echo-Unterdrückung, Rauschfilter und automatische Pegelung bleiben aus, damit die Tonhöhenmessung
      // das unbearbeitete Signal bekommt.
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (generation !== generationRef.current || !mountedRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        await context.close().catch(() => {});
        return false;
      }

      // Aufnahmeknoten wählen: AudioWorklet, bei Fehler oder Fehlen der veraltete ScriptProcessor als Rückfall.
      const source = context.createMediaStreamSource(mediaStream);
      let captureNode: AudioWorkletNode | ScriptProcessorNode;
      if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        try {
          captureNode = await createWorkletNode(context, acceptSamples);
        } catch {
          captureNode = createScriptProcessorNode(context, acceptSamples);
        }
      } else if (typeof context.createScriptProcessor === 'function') {
        captureNode = createScriptProcessorNode(context, acceptSamples);
      } else {
        throw new Error('Weder AudioWorklet noch ScriptProcessor ist verfuegbar.');
      }

      // Der Knoten hängt über einen stummen Gain (0) am Ausgang: Der Graph wird verarbeitet, ohne dass das
      // Mikrofonsignal über die Lautsprecher zu hören ist.
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      source.connect(captureNode);
      captureNode.connect(silentGain);
      silentGain.connect(context.destination);
      resourcesRef.current = { context, mediaStream, source, captureNode, silentGain };
    } catch (error) {
      mediaStream?.getTracks().forEach((track) => track.stop());
      await context.close().catch(() => {});
      if (generation !== generationRef.current || !mountedRef.current) return false;
      statusRef.current = 'idle';
      updateView({ status: 'idle', error: webStartError(error) });
      return false;
    }

    if (generation !== generationRef.current || !mountedRef.current) {
      await releaseResources();
      return false;
    }

    acceptingRef.current = true;
    statusRef.current = 'recording';
    updateView({ status: 'recording' });
    // Zeitgrenze als Sicherung, falls die Puffer kein Limit auslösen (z. B. weil keine Daten kommen).
    timerRef.current = setTimeout(() => {
      acceptingRef.current = false;
      void finishRef.current(true);
    }, maxDurationMs);
    return true;
  }, [acceptSamples, maxDurationMs, releaseResources, resetBuffers, updateView]);

  const stop = useCallback(() => finish(false), [finish]);

  const clear = useCallback(() => {
    updateView({ lastCapture: null, error: null });
  }, [updateView]);

  // Beim Aushängen laufende Aufnahme beenden und das Mikrofon freigeben.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      acceptingRef.current = false;
      clearTimer();
      void releaseResources();
      resetBuffers();
    };
  }, [clearTimer, releaseResources, resetBuffers]);

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
