import { createOpenAiAudioClient, createOpenAiHelperAudioClient } from '../providers/audio';

import { createClipClient } from './generator';
import { supportsTtsInstructions, THAI_TTS_INSTRUCTIONS_ID, ttsInstructionsFor } from './tts-instructions';

describe('Sprechanweisung für Thai-Clips', () => {
  it('gibt nur Thai eine Anweisung, Wörtern in Zitierform, Sätzen mit flacher Satzmelodie', () => {
    expect(ttsInstructionsFor({ language: 'en', kind: 'vocab' })).toBeNull();
    expect(ttsInstructionsFor({ language: 'de', kind: 'example' })).toBeNull();
    const wort = ttsInstructionsFor({ language: 'th', kind: 'vocab' })!;
    const satz = ttsInstructionsFor({ language: 'th', kind: 'example' })!;
    expect(wort.id).toBe(THAI_TTS_INSTRUCTIONS_ID);
    expect(wort.text).toMatch(/citation form/);
    expect(wort.text).toMatch(/mid tones stay level/);
    expect(satz.text).toMatch(/sentence melody flat/);
    // Der Helper nimmt höchstens 1000 Zeichen an.
    expect(wort.text.length).toBeLessThan(1000);
    expect(satz.text.length).toBeLessThan(1000);
  });

  it('kennt das Feld nur bei der gpt-4o-…-tts-Familie', () => {
    expect(supportsTtsInstructions('gpt-4o-mini-tts-2025-12-15')).toBe(true);
    expect(supportsTtsInstructions('tts-1')).toBe(false);
    expect(supportsTtsInstructions('tts-1-hd')).toBe(false);
  });
});

describe('Weitergabe bis ins Clip-Dokument', () => {
  const originalFetch = global.fetch;
  let bodies: Record<string, unknown>[];
  beforeEach(() => {
    bodies = [];
    global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
      bodies.push(JSON.parse(String(init?.body)));
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'audio/mpeg' },
        arrayBuffer: async () => new Uint8Array(400).buffer,
        text: async () => '',
      };
    }) as unknown as typeof fetch;
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('schickt die Anweisung an OpenAI und vermerkt ihre Kennung am Clip', async () => {
    const clip = await createClipClient(createOpenAiAudioClient('sk-test', 'gpt-4o-mini-tts-2025-12-15', 'coral'))
      .generate({ id: 'th-1', language: 'th', text: 'มา', kind: 'vocab', sourceId: 'w1' });
    expect(bodies[0].instructions).toMatch(/citation form/);
    expect(clip.instructionsId).toBe(THAI_TTS_INSTRUCTIONS_ID);
  });

  it('lässt sie bei tts-1 und bei anderen Sprachen weg', async () => {
    const alt = await createClipClient(createOpenAiAudioClient('sk-test', 'tts-1', 'coral'))
      .generate({ id: 'th-2', language: 'th', text: 'มา', kind: 'vocab', sourceId: 'w1' });
    const englisch = await createClipClient(createOpenAiAudioClient('sk-test', 'gpt-4o-mini-tts-2025-12-15', 'coral'))
      .generate({ id: 'en-1', language: 'en', text: 'come', kind: 'vocab', sourceId: 'w2' });
    expect(bodies.map((body) => body.instructions)).toEqual([undefined, undefined]);
    expect(alt.instructionsId).toBeUndefined();
    expect(englisch.instructionsId).toBeUndefined();
  });

  it('reicht sie auch über den Studio-Helper weiter', async () => {
    const clip = await createClipClient(createOpenAiHelperAudioClient('gpt-4o-mini-tts-2025-12-15', 'onyx'))
      .generate({ id: 'th-3', language: 'th', text: 'ผมมาจากเยอรมนีครับ', kind: 'example', sourceId: 'w3' });
    expect(bodies[0].instructions).toMatch(/sentence melody flat/);
    expect(clip.instructionsId).toBe(THAI_TTS_INSTRUCTIONS_ID);
  });
});
