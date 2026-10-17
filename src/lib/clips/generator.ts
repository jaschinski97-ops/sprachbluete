import { clipDurationMs, createAudioClient } from '../providers/audio';
import { AudioClient, ProviderId } from '../providers/types';

import { ttsInstructionsFor } from './tts-instructions';
import { AudioClipSpec, GeneratedClip } from './types';

/**
 * Verbindet einen Clip-Auftrag mit einem beliebigen Sprachausgabe-Anbieter —
 * dieselbe dünne Naht wie bei Dialogen, Prüfungsaufgaben und Bildern (AE-28).
 * Ein Fehler des Anbieters ist ein Fehlschlag im Lauf, kein halber Clip im
 * Bestand.
 */

export type ClipGenerationClient = {
  generate(spec: AudioClipSpec): Promise<GeneratedClip>;
};

export function createClipClient(audio: AudioClient): ClipGenerationClient {
  return {
    async generate(spec) {
      const instructions = ttsInstructionsFor(spec);
      const response = await audio.synthesize({
        text: spec.text,
        language: spec.language,
        ...(instructions ? { instructions } : {}),
      });
      if (!response.base64 || response.base64.length < 100) {
        throw new Error('Anbieter lieferte keine Audiodaten.');
      }
      return {
        base64: response.base64,
        format: response.format,
        model: response.model,
        voice: response.voice,
        provider: audio.provider,
        durationMs: clipDurationMs(response),
        ...(response.instructionsId ? { instructionsId: response.instructionsId } : {}),
      };
    },
  };
}

export function createClipGenerationClient(
  provider: ProviderId,
  apiKey: string,
  model: string,
  voice: string
): ClipGenerationClient {
  return createClipClient(createAudioClient(provider, apiKey, model, voice));
}
