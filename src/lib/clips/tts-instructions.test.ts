import { createGeminiAudioClient, createOpenAiAudioClient, createOpenAiHelperAudioClient, geminiSpeechBody } from '../providers/audio';

import { createClipClient } from './generator';
import {
  supportsGeminiSpeechStyle, supportsTtsInstructions, THAI_GEMINI_TTS_INSTRUCTIONS_ID, THAI_TTS_INSTRUCTIONS_ID, ttsInstructionsFor,
} from './tts-instructions';

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

describe('Sprechanweisung für Gemini (speech_metadata.style)', () => {
  const MODELL = 'gemini-3.8-flash-tts';

  it('hat eine eigene, kurze Thai-Fassung mit eigener Kennung', () => {
    const wort = ttsInstructionsFor({ language: 'th', kind: 'vocab' }, 'gemini')!;
    const satz = ttsInstructionsFor({ language: 'th', kind: 'example' }, 'gemini')!;
    expect(wort.id).toBe(THAI_GEMINI_TTS_INSTRUCTIONS_ID);
    expect(satz.id).toBe(THAI_GEMINI_TTS_INSTRUCTIONS_ID);
    expect(wort.text).toMatch(/isolated Thai word/);
    expect(wort.text).toMatch(/mid stays level/);
    expect(satz.text).toMatch(/sentence melody flat/);
    // Doku: kurze Stilangaben, kein Geschlecht/Alter/Name im Stil.
    expect(wort.text.length).toBeLessThan(400);
    expect(satz.text.length).toBeLessThan(400);
    expect(`${wort.text} ${satz.text}`).not.toMatch(/\b(female|male|woman|man|young|old|Kore)\b/i);
    expect(ttsInstructionsFor({ language: 'es', kind: 'vocab' }, 'gemini')).toBeNull();
    // Der Helper-Weg (OpenAI) behält die OpenAI-Fassung.
    expect(ttsInstructionsFor({ language: 'th', kind: 'vocab' }, 'chatgpt-helper')!.id).toBe(THAI_TTS_INSTRUCTIONS_ID);
  });

  it('kennt das Stilfeld erst ab Gemini 3.8 TTS', () => {
    expect(supportsGeminiSpeechStyle('gemini-3.8-flash-tts')).toBe(true);
    expect(supportsGeminiSpeechStyle('gemini-3.8-flash-lite-tts')).toBe(true);
    expect(supportsGeminiSpeechStyle(' Gemini-4-flash-tts ')).toBe(true);
    expect(supportsGeminiSpeechStyle('gemini-3.1-flash-tts-preview')).toBe(false);
    expect(supportsGeminiSpeechStyle('gemini-2.5-flash-preview-tts')).toBe(false);
    expect(supportsGeminiSpeechStyle('gemini-4-argon')).toBe(false);
  });

  it('spricht nur den Text: die Anweisung steht im eigenen Feld, nie im Text', () => {
    const instructions = ttsInstructionsFor({ language: 'th', kind: 'vocab' }, 'gemini')!;
    const { body, instructionsId } = geminiSpeechBody(MODELL, 'Kore', { text: 'ม้า', language: 'th', instructions });
    const contents = body.contents as { role: string; parts: Record<string, unknown>[] }[];
    expect(contents).toHaveLength(1);
    expect(contents[0].parts).toEqual([{ text: 'ม้า', speech_metadata: { style: instructions.text } }]);
    // Nirgends sonst ein Textfeld, das gesprochen werden könnte.
    const alleTexte = JSON.stringify(body).match(/"text":"[^"]*"/g);
    expect(alleTexte).toEqual(['"text":"ม้า"']);
    expect(body).not.toHaveProperty('systemInstruction');
    expect(body.generationConfig).toEqual({
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    });
    expect(instructionsId).toBe(THAI_GEMINI_TTS_INSTRUCTIONS_ID);
  });

  it('lässt das Stilfeld bei älteren Modellen weg', () => {
    const instructions = ttsInstructionsFor({ language: 'th', kind: 'vocab' }, 'gemini')!;
    const { body, instructionsId } = geminiSpeechBody('gemini-2.5-flash-preview-tts', 'Kore', { text: 'มา', language: 'th', instructions });
    expect((body.contents as { parts: unknown[] }[])[0].parts).toEqual([{ text: 'มา' }]);
    expect(instructionsId).toBeUndefined();
  });

  describe('bis ins Clip-Dokument', () => {
    const originalFetch = global.fetch;
    let bodies: Record<string, unknown>[];
    beforeEach(() => {
      bodies = [];
      const pcm = Buffer.alloc(4800).toString('base64');
      global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
        bodies.push(JSON.parse(String(init?.body)));
        const payload = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] };
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => payload, text: async () => JSON.stringify(payload) };
      }) as unknown as typeof fetch;
    });
    afterEach(() => { global.fetch = originalFetch; });

    it('vermerkt th-ton-gemini-1 am Thai-Clip, nichts bei Englisch', async () => {
      const client = createClipClient(createGeminiAudioClient('key', MODELL, 'Kore'));
      const thai = await client.generate({ id: 'th-1', language: 'th', text: 'หมา', kind: 'vocab', sourceId: 'w1' });
      const englisch = await client.generate({ id: 'en-1', language: 'en', text: 'dog', kind: 'vocab', sourceId: 'w2' });
      const teile = bodies.map((body) => (body.contents as { parts: Record<string, unknown>[] }[])[0].parts[0]);
      expect(teile[0].text).toBe('หมา');
      expect(String((teile[0].speech_metadata as { style: string }).style)).toMatch(/isolated Thai word/);
      expect(teile[1]).toEqual({ text: 'dog' });
      expect(thai.instructionsId).toBe(THAI_GEMINI_TTS_INSTRUCTIONS_ID);
      expect(thai.provider).toBe('gemini');
      expect(englisch.instructionsId).toBeUndefined();
    });
  });
});
