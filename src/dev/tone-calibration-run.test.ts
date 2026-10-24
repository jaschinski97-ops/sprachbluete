import { KALIBRIER_WOERTER, type KalibrierWort } from '@/data/tone-calibration-words';
import { createClipClient, type ClipGenerationClient } from '@/lib/clips/generator';
import { THAI_GEMINI_TTS_INSTRUCTIONS_ID } from '@/lib/clips/tts-instructions';
import type { AudioClipSpec, GeneratedClip } from '@/lib/clips/types';
import { stimmBericht } from '@/lib/content/tone-calibration';
import { createGeminiAudioClient } from '@/lib/providers/audio';

import { stimmZeilen } from './tone-calibration-card';
import { FRUEHER_ABBRUCH, fahreKalibrierung, type KalibrierAblage } from './tone-calibration-run';

function ablageMitProtokoll() {
  const starts: { voice: string; model: string; instructionsId?: string }[] = [];
  const clips: { voice: string; wordId: string; clip: GeneratedClip }[] = [];
  const ablage: KalibrierAblage = {
    async start(voice, model, instructionsId) { starts.push({ voice, model, instructionsId }); },
    async clip(voice, wort: KalibrierWort, clip) { clips.push({ voice, wordId: wort.id, clip }); },
  };
  return { ablage, starts, clips };
}

const fakeClip = (voice: string): GeneratedClip => ({ base64: 'x'.repeat(200), format: 'wav', model: 'm', voice, provider: 'gemini' });

describe('Kalibrierlauf', () => {
  it('erzeugt je Stimme den ganzen Satz, nur der Thai-Text wird gesprochen', async () => {
    const specs: AudioClipSpec[] = [];
    const { ablage, starts, clips } = ablageMitProtokoll();
    const fortschritt: string[] = [];
    const ergebnis = await fahreKalibrierung({
      voices: ['Kore', 'Charon'],
      model: 'gemini-3.8-flash-tts',
      makeClient: (voice): ClipGenerationClient => ({ async generate(spec) { specs.push(spec); return fakeClip(voice); } }),
      ablage,
      onProgress: ({ voice, fertig, gesamt }) => fortschritt.push(`${voice} ${fertig}/${gesamt}`),
    });
    expect(ergebnis).toEqual({ erzeugt: 2 * KALIBRIER_WOERTER.length, fehler: [], abgebrochen: [], vomNutzerAbgebrochen: false });
    expect(starts).toEqual([
      { voice: 'Kore', model: 'gemini-3.8-flash-tts', instructionsId: THAI_GEMINI_TTS_INSTRUCTIONS_ID },
      { voice: 'Charon', model: 'gemini-3.8-flash-tts', instructionsId: THAI_GEMINI_TTS_INSTRUCTIONS_ID },
    ]);
    expect(new Set(clips.filter((c) => c.voice === 'Kore').map((c) => c.wordId)).size).toBe(KALIBRIER_WOERTER.length);
    expect(specs.every((spec) => spec.language === 'th' && spec.kind === 'vocab')).toBe(true);
    expect(specs.map((spec) => spec.text).sort()).toEqual([...KALIBRIER_WOERTER, ...KALIBRIER_WOERTER].map((w) => w.term).sort());
    expect(fortschritt).toContain(`Charon ${KALIBRIER_WOERTER.length}/${KALIBRIER_WOERTER.length}`);
  });

  it('bricht eine Stimme ab, wenn die ersten Wörter alle scheitern, und macht mit der nächsten weiter', async () => {
    const { ablage, clips } = ablageMitProtokoll();
    const ergebnis = await fahreKalibrierung({
      voices: ['Kaputt', 'Kore'],
      model: 'gemini-3.8-flash-tts',
      parallel: 1,
      makeClient: (voice) => ({
        async generate() { if (voice === 'Kaputt') throw new Error('403 API key not valid'); return fakeClip(voice); },
      }),
      ablage,
    });
    expect(ergebnis.abgebrochen).toEqual(['Kaputt']);
    expect(ergebnis.fehler).toHaveLength(FRUEHER_ABBRUCH);
    expect(ergebnis.fehler[0]).toMatchObject({ voice: 'Kaputt', message: '403 API key not valid' });
    expect(clips.filter((c) => c.voice === 'Kore')).toHaveLength(KALIBRIER_WOERTER.length);
  });

  it('hört auf, wenn der Nutzer abbricht', async () => {
    const { ablage, clips } = ablageMitProtokoll();
    let abbruch = false;
    const ergebnis = await fahreKalibrierung({
      voices: ['Kore', 'Charon'], model: 'gemini-3.8-flash-tts', parallel: 1, ablage,
      makeClient: (voice) => ({ async generate() { if (clips.length >= 3) abbruch = true; return fakeClip(voice); } }),
      shouldCancel: () => abbruch,
    });
    expect(ergebnis.vomNutzerAbgebrochen).toBe(true);
    expect(clips.length).toBeLessThan(10);
    expect(clips.every((c) => c.voice === 'Kore')).toBe(true);
  });

  describe('mit dem echten Gemini-Client (fetch nachgestellt)', () => {
    const originalFetch = global.fetch;
    let bodies: { contents: { parts: Record<string, unknown>[] }[] }[];
    beforeEach(() => {
      bodies = [];
      const pcm = Buffer.alloc(4800).toString('base64');
      global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
        bodies.push(JSON.parse(String(init?.body)));
        const payload = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: pcm } }] } }] };
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => payload, text: async () => '' };
      }) as unknown as typeof fetch;
    });
    afterEach(() => { global.fetch = originalFetch; });

    it('schickt den Stil getrennt und legt die Kennung mit ab', async () => {
      const { ablage, clips } = ablageMitProtokoll();
      const woerter = KALIBRIER_WOERTER.slice(0, 3);
      await fahreKalibrierung({
        voices: ['Kore'], model: 'gemini-3.8-flash-tts', woerter, ablage,
        makeClient: (voice) => createClipClient(createGeminiAudioClient('key', 'gemini-3.8-flash-tts', voice)),
      });
      expect(bodies).toHaveLength(3);
      for (const body of bodies) {
        const [teil] = body.contents[0].parts;
        expect(woerter.map((w) => w.term)).toContain(teil.text);
        expect(Object.keys(teil).sort()).toEqual(['speech_metadata', 'text']);
        expect(String(teil.text)).not.toMatch(/[A-Za-z]/);
      }
      expect(clips.every((c) => c.clip.instructionsId === THAI_GEMINI_TTS_INSTRUCTIONS_ID && c.clip.format === 'wav')).toBe(true);
    });
  });
});

describe('Berichtszeilen der Studio-Karte', () => {
  it('nennt Gesamtzahlen, alle fünf Töne, Mehrsilber, Stimmlage und Hinweise', () => {
    const bericht = stimmBericht({
      stimme: 'Kore',
      messungen: KALIBRIER_WOERTER.map((w) => ({
        wortId: w.id, status: w.toene[0] === 'falling' ? 'failed' : 'passed',
        referenzHz: 200, pts: [0, 0, 0, 0, 0, 0], spanHz: [190, 200, 210],
      })),
    });
    const zeilen = stimmZeilen(bericht);
    expect(zeilen[0]).toMatch(/^\d+\/60 bestanden · \d+ verworfen · 0 ungeprüft$/);
    expect(zeilen.filter((z) => /^(mittel|tief|fallend|hoch|steigend): /.test(z))).toHaveLength(5);
    expect(zeilen.some((z) => z.startsWith('Mehrsilber: '))).toBe(true);
    expect(zeilen.some((z) => /^Stimmlage: Median 200 Hz/.test(z))).toBe(true);
    expect(zeilen.some((z) => z.startsWith('⚠ Schwach bei: falling'))).toBe(true);
  });
});
