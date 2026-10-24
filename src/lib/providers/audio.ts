import {
  base64ToBytes,
  bytesToBase64,
  parsePcmMimeType,
  pcmToWav,
  wavDurationMs,
} from '../clips/bytes';

import { supportsGeminiSpeechStyle, supportsTtsInstructions } from '../clips/tts-instructions';
import { describeHttpError, fieldNamesOf, postForBytes, postJson } from './http';
import { AudioClient, AudioRequest, AudioResponse, ProviderId, unsupported } from './types';

/**
 * Die Sprachausgabe-Anbieter hinter einer Schnittstelle (Phase 11).
 *
 * ZWEI ANBIETER, NICHT VIER, UND KEIN FÜNFTER (AE-28 sinngemäß): Claude hat
 * kein TTS-Modell, Stability keines. Bleiben ChatGPT und Gemini — und beide
 * können es laut ihrer Doku auf Thai. Anders als bei den Bildern gibt es hier
 * keinen Bestandsanbieter, den es zu bewahren gälte, und der Weg von Gemini
 * ist aus dem Browser gemessen offen. Ein Spezialanbieter (etwa ElevenLabs)
 * wäre ein *neuer* fünfter Anbieter, und genau das schließt Phase 10 aus.
 *
 * GEMESSEN, NICHT ANGENOMMEN (AE-31):
 * - `POST …/gemini-2.5-flash-preview-tts:generateContent` mit
 *   `responseModalities: ["AUDIO"]` kommt aus dem Browser durch (400, lesbar),
 *   ebenso der neue Endpunkt `/v1beta/interactions` aus der aktuellen Doku.
 * - `POST api.openai.com/v1/audio/speech` (AE-27, 2026-09-03): mit
 *   `Bearer ungueltig` ein lesbares 401, mit `Bearer sk-…` „Failed to
 *   fetch" — der Weg galt im Web als unbrauchbar. Nachmessung 2026-09-08:
 *   Preflight und POST mit gueltigem Schluessel kommen mit CORS-Headern
 *   durch (Einzelheiten beim webWarning-Kommentar in types.ts) —
 *   Sprachausgabe ist auch aus dem Web-Build gemessen offen.
 *
 * WAS SICH NICHT MESSEN LIESS: die Antwortform beider Anbieter (B-6) und —
 * entscheidend für Thai — ob die **Töne** stimmen. Das Messwerkzeug dafür
 * steht in `scripts/tone-contour.html`; womit es gemessen wurde und wo die
 * Grenze liegt, in AE-31.
 */

// ---------------------------------------------------------------------------
// Gemini (Google)
// ---------------------------------------------------------------------------

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Liest die Audioantwort von `generateContent` aus.
 *
 * Die Doku nennt „PCM, 24 kHz, 16 Bit" und zeigt in Python, wie daraus ein
 * WAV wird (`wave.open` mit channels=1, rate=24000, sample_width=2). Der
 * `mimeType` in `inlineData` — erwartet `audio/L16;codec=pcm;rate=24000` —
 * ist nicht dokumentiert; deshalb wird er **gelesen**, nicht vorausgesetzt,
 * und ein fertiges Format (wav/mp3) würde unverändert durchgereicht.
 */
export function parseGeminiAudio(payload: unknown, model: string, voice: string): AudioResponse {
  const data = payload as Record<string, unknown> | null;
  const candidates = data?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(
      `Antwort enthielt keine "candidates" (gelieferte Felder: ${fieldNamesOf(payload)}).`
    );
  }
  const first = candidates[0] as Record<string, unknown>;
  const content = first.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? (content!.parts as Record<string, unknown>[]) : [];

  for (const part of parts) {
    const inline = (part.inlineData ?? part.inline_data) as Record<string, unknown> | undefined;
    const raw = inline?.data;
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const mimeType = String(inline?.mimeType ?? inline?.mime_type ?? '');
    const usedModel = typeof data?.modelVersion === 'string' ? data.modelVersion : model;

    const pcm = parsePcmMimeType(mimeType);
    if (pcm) {
      const wav = pcmToWav(base64ToBytes(raw.trim()), pcm);
      return {
        base64: bytesToBase64(wav),
        format: 'wav',
        model: usedModel,
        voice,
        sampleRate: pcm.sampleRate,
      };
    }
    if (/audio\/(x-)?wav/i.test(mimeType)) {
      return { base64: raw.trim(), format: 'wav', model: usedModel, voice };
    }
    if (/audio\/mpeg|audio\/mp3/i.test(mimeType)) {
      return { base64: raw.trim(), format: 'mp3', model: usedModel, voice };
    }
    throw new Error(`Unbekannter Audio-Typ "${mimeType}" in der Antwort.`);
  }

  throw new Error(
    `Antwort enthielt kein Audio (finishReason: ${String(first.finishReason)}; ` +
      `Teile: ${parts.map((part) => Object.keys(part).join('+')).join(', ') || 'keine'}).`
  );
}

/**
 * Der Anfragekörper für `generateContent` — getrennt, damit ein Test genau
 * prüfen kann, was gesprochen wird und was nicht.
 *
 * Gemini 3.8 TTS liest `text` wörtlich vor. Die Sprechanweisung steht
 * deshalb NIE im Text, sondern in `speech_metadata.style` desselben Teils
 * (Doku: „attach speech_metadata … to each part“). Ältere Modelle bekommen
 * sie gar nicht; dort bleibt es beim reinen Text.
 */
export function geminiSpeechBody(model: string, voice: string, request: AudioRequest): {
  body: Record<string, unknown>;
  instructionsId?: string;
} {
  const style = request.instructions && supportsGeminiSpeechStyle(model) ? request.instructions : undefined;
  return {
    body: {
      contents: [{
        role: 'user',
        parts: [{ text: request.text, ...(style ? { speech_metadata: { style: style.text } } : {}) }],
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    },
    ...(style ? { instructionsId: style.id } : {}),
  };
}

export function createGeminiAudioClient(apiKey: string, model: string, voice: string): AudioClient {
  return {
    provider: 'gemini',
    model,
    voice,
    async synthesize(request: AudioRequest): Promise<AudioResponse> {
      const { body, instructionsId } = geminiSpeechBody(model, voice, request);
      const payload = await postJson({
        url: `${GEMINI_BASE}/${encodeURIComponent(model.trim())}:generateContent`,
        headers: { 'x-goog-api-key': apiKey },
        body,
      });
      return { ...parseGeminiAudio(payload, model, voice), ...(instructionsId ? { instructionsId } : {}) };
    },
  };
}

// ---------------------------------------------------------------------------
// ChatGPT (OpenAI)
// ---------------------------------------------------------------------------

export const OPENAI_SPEECH_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

export function createOpenAiAudioClient(apiKey: string, model: string, voice: string): AudioClient {
  return {
    provider: 'chatgpt',
    model,
    voice,
    async synthesize(request: AudioRequest): Promise<AudioResponse> {
      // `instructions` nur für Modelle, die das Feld kennen (gpt-4o-…-tts).
      const instructions = request.instructions && supportsTtsInstructions(model) ? request.instructions : undefined;
      const { bytes, contentType } = await postForBytes({
        url: OPENAI_SPEECH_ENDPOINT,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          input: request.text,
          voice,
          // mp3 statt pcm: OpenAI verdichtet selbst, das spart gegenueber
          // Gemini-PCM etwa den Faktor zehn (AE-30).
          response_format: 'mp3',
          ...(instructions ? { instructions: instructions.text } : {}),
        },
      });
      if (contentType && !/audio\/mpeg|audio\/mp3|octet-stream/i.test(contentType)) {
        throw new Error(`Unerwarteter Inhaltstyp "${contentType}" statt Audio.`);
      }
      if (bytes.byteLength < 100) {
        throw new Error(`Antwort zu klein für eine Audiodatei (${bytes.byteLength} Byte).`);
      }
      return {
        base64: bytesToBase64(new Uint8Array(bytes)), format: 'mp3', model, voice,
        ...(instructions ? { instructionsId: instructions.id } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// ChatGPT über den lokalen Helper des Studios (Roadmap v2, Phase 2)
// ---------------------------------------------------------------------------

/** Basis des lokalen Inhaltsstudios — derselbe Ort wie `dev/content-client`. */
export const HELPER_BASE = 'http://127.0.0.1:8082';

/**
 * Der TTS-Durchgang des Helpers (Vertrag in `scripts/content/studio.cjs`,
 * dort mit node:test geprüft): POST mit JSON `{text, voice?, model?,
 * purpose?}`, Antwort sind die **rohen MP3-Bytes**. Der Schlüssel kommt
 * serverseitig aus der Umgebung (`OPENAI_API_KEY`) — hier wird keiner
 * geschickt, und ein im Gerät gespeicherter wird nie angefasst.
 */
export const OPENAI_HELPER_TTS_ENDPOINT = `${HELPER_BASE}/api/openai/tts`;

export function createOpenAiHelperAudioClient(model: string, voice: string): AudioClient {
  return {
    provider: 'chatgpt-helper',
    model,
    voice,
    async synthesize(request: AudioRequest): Promise<AudioResponse> {
      const instructions = request.instructions && supportsTtsInstructions(model) ? request.instructions : undefined;
      const { bytes, contentType } = await postForBytes({
        url: OPENAI_HELPER_TTS_ENDPOINT,
        headers: {},
        // `purpose` ist beim Helper ein freier kurzer Text und landet im
        // Lauf-Protokoll — die Sprache ist der Zweck, den wir kennen.
        body: {
          text: request.text, voice, model, purpose: request.language,
          ...(instructions ? { instructions: instructions.text } : {}),
        },
      });
      if (contentType && !/audio\/mpeg|audio\/mp3|octet-stream/i.test(contentType)) {
        throw new Error(`Unerwarteter Inhaltstyp "${contentType}" statt Audio.`);
      }
      if (bytes.byteLength < 100) {
        throw new Error(`Antwort zu klein für eine Audiodatei (${bytes.byteLength} Byte).`);
      }
      return {
        base64: bytesToBase64(new Uint8Array(bytes)), format: 'mp3', model, voice,
        ...(instructions ? { instructionsId: instructions.id } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------

export function createAudioClient(
  provider: ProviderId,
  apiKey: string,
  model: string,
  voice: string
): AudioClient {
  switch (provider) {
    case 'gemini':
      return createGeminiAudioClient(apiKey, model, voice);
    case 'chatgpt':
      return createOpenAiAudioClient(apiKey, model, voice);
    // Der Helper braucht den Schlüssel nicht — er bringt seinen eigenen
    // serverseitig mit. Der Parameter bleibt ungenutzt.
    case 'chatgpt-helper':
      return createOpenAiHelperAudioClient(model, voice);
    default:
      throw unsupported(provider, 'audio');
  }
}

/** Dauer eines Clips, soweit aus den Daten ablesbar. */
export function clipDurationMs(response: AudioResponse): number | undefined {
  if (response.format !== 'wav') return undefined;
  return wavDurationMs(base64ToBytes(response.base64)) ?? undefined;
}

export { describeHttpError };
