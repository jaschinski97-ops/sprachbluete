// PHASE 16: `VOCABULARY` umfasst jetzt alle drei Sprachen. Was diese Datei
// zusichert, gilt dem Thai-Grundstock aus Phase 2 - deshalb hier
// ausdruecklich der. Unterhalb dieser Zeile hat sich nichts geaendert.
import { VOCABULARY_TH as VOCABULARY } from '@/test-fixtures/legacy-vocabulary';

import {
  playPronunciation,
  PronunciationBackend,
  registerAudioAssetResolver,
  registerPronunciationClipLookup,
  setPronunciationBackend,
} from '../audio';
import { MemoryBlobStore } from '../blobs/memory';
import { ConversationSituation } from '../conversation/types';
import { parseGeminiAudio } from '../providers/audio';
import {
  defaultChoiceFor,
  GENERATOR_GROUP_INFO,
  normalizeChoice,
  providersForGroup,
  setGeneratorProvider,
} from '../providers/settings';
import { PROVIDER_INFO } from '../providers/types';
import { clearAudioClips, countAudioClips, loadAudioClips, sumAudioClipBytes } from '../repository';
import { DataStore, MemoryDataStore } from '../storage';

import { runBatch } from '../generation/batch';
import { runClipBatch } from './batch';
import {
  base64ToBytes,
  bytesToBase64,
  parsePcmMimeType,
  pcmToWav,
  wavDurationMs,
} from './bytes';
import { createClipClient, ClipGenerationClient } from './generator';
import { clipIndex, invalidateClipIndex, resolveClipUri } from './lookup';
import {
  BYTES_PER_SECOND,
  CLIP_TEST_RUN,
  estimateClipBytes,
  estimateClipSeconds,
  formatBytes,
  planClips,
  planClipTestRun,
} from './plan';
import {
  AUDIO_BLOB_CONFIG,
  AudioBlobStore,
  AudioClip,
  clipIdFor,
  GeneratedClip,
  isValidAudioClip,
  normalizeClipText,
} from './types';

/**
 * Phase 11 — Hörclips.
 *
 * Die Kernaussage dieser Datei: Ein Clip wird bevorzugt abgespielt, wenn er
 * da ist, und **ohne** Clip läuft alles weiter wie vor Phase 11 (TTS). Dazu
 * der vierte Nutzer des Batch-Läufers, die zweiteilige Ablage und die
 * Anbieter-Naht — jeweils ohne Netz und ohne Schlüssel.
 */

const T0 = Date.UTC(2026, 8, 3);

/** 24 kHz, 16 Bit, mono: 2400 Abtastwerte = 100 ms Stille als PCM. */
function fakePcm(samples = 2400): Uint8Array {
  return new Uint8Array(samples * 2);
}

function fakeWavBase64(ms = 100): string {
  return bytesToBase64(pcmToWav(fakePcm(Math.round(24 * ms)), { sampleRate: 24000, channels: 1, bitsPerSample: 16 }));
}

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

function freshBlobs(): AudioBlobStore {
  return new MemoryBlobStore(AUDIO_BLOB_CONFIG);
}

function clientThatFailsOn(failing: string[] = []): ClipGenerationClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async generate(spec): Promise<GeneratedClip> {
      calls.push(spec.id);
      if (failing.includes(spec.id)) throw new Error(`Netzwerkfehler bei ${spec.id}`);
      return {
        base64: fakeWavBase64(),
        format: 'wav',
        model: 'test-tts',
        voice: 'Testa',
        provider: 'gemini',
        durationMs: 100,
      };
    },
  };
}

function situation(id: string, turns: string[]): ConversationSituation {
  return {
    id,
    level: 'A1',
    topic: 'market',
    direction: 'de_to_th',
    title: id,
    setting: 'Test',
    scriptTurns: turns.map((thai, index) => ({
      speaker: index % 2 === 0 ? 'partner' : 'learner',
      thai,
      roman: 'x',
      german: 'y',
    })),
    corrections: [{ issue: 'a', explanation: 'b' }],
    generatedAt: T0,
    modelUsed: 'm',
  };
}

beforeEach(() => invalidateClipIndex());

// ---------------------------------------------------------------------------

describe('Clip-IDs', () => {
  it('sind stabil, sprachgebunden und hängen nur vom normalisierten Text ab', () => {
    expect(clipIdFor('th', 'ผม ไม่ กิน หมู')).toBe(clipIdFor('th', '  ผม  ไม่ กิน หมู '));
    expect(clipIdFor('th', 'ไก่')).toMatch(/^th-[0-9a-f]{16}$/);
    expect(clipIdFor('th', 'ไก่')).not.toBe(clipIdFor('de', 'ไก่'));
    expect(clipIdFor('th', 'มา')).not.toBe(clipIdFor('th', 'ม้า'));
  });

  it('normalisieren Leerraum — Satzzeichen ändern die Aussprache', () => {
    expect(normalizeClipText(' a   b\n c ')).toBe('a b c');
    expect(clipIdFor('th', 'ไป')).not.toBe(clipIdFor('th', 'ไป?'));
  });

  it('ignorieren bei Thai Leerzeichen zwischen Wörtern, bei Deutsch nicht', () => {
    // Der Grundstock schreibt „สวัสดี ครับ" (Leerzeichen als Lernhilfe), ein
    // Dialog aus Phase 4 „สวัสดีครับ" (so schreibt Thai). Beides ist derselbe
    // Satz und soll denselben Clip treffen - im Web-Build nachgestellt: ohne
    // diese Regel spielte der Dialogzug TTS, obwohl der Clip da war.
    expect(clipIdFor('th', 'สวัสดี ครับ')).toBe(clipIdFor('th', 'สวัสดีครับ'));
    expect(clipIdFor('de', 'das Haus')).not.toBe(clipIdFor('de', 'dasHaus'));
  });

  it('kollidieren im ganzen Grundstock nicht', () => {
    const ids = new Set<string>();
    for (const entry of VOCABULARY) {
      ids.add(clipIdFor('th', entry.term));
      ids.add(clipIdFor('th', entry.exampleTerm!));
    }
    const unique = new Set(VOCABULARY.flatMap((e) => [normalizeClipText(e.term), normalizeClipText(e.exampleTerm!)]));
    expect(ids.size).toBe(unique.size);
  });
});

describe('Bauplan', () => {
  it('führt Wörter vor Beispielsätzen vor Gesprächszügen', () => {
    // Zuege, die keinem Beispielsatz gleichen - "สวัสดีครับ" waere der
    // Beispielsatz von สวัสดี und wuerde (richtig) dedupliziert.
    const specs = planClips({
      vocabulary: VOCABULARY.slice(0, 3),
      situations: [situation('s1', ['ไปไหนครับ', 'ไปตลาดครับ'])],
    });
    expect(specs.map((s) => s.kind)).toEqual(['vocab', 'vocab', 'vocab', 'example', 'example', 'example', 'turn', 'turn']);
    expect(specs[6].sourceId).toBe('s1#1');
  });

  it('dedupliziert gleichen Text — der erste Treffer gewinnt', () => {
    const entry = VOCABULARY[0];
    const specs = planClips({
      vocabulary: [entry],
      situations: [situation('s1', [entry.term, entry.term + ' ', 'อื่น'])],
    });
    // Das Wort steht als Vokabel im Plan, nicht noch einmal als Zug.
    expect(specs.filter((s) => s.text === normalizeClipText(entry.term))).toHaveLength(1);
    expect(specs.find((s) => s.text === normalizeClipText(entry.term))!.kind).toBe('vocab');
    expect(specs.filter((s) => s.kind === 'turn')).toHaveLength(1);
  });

  it('Probelauf: fünf Vokabeln samt Beispielsatz', () => {
    const specs = planClipTestRun();
    expect(specs).toHaveLength(CLIP_TEST_RUN * 2);
    expect(specs.filter((s) => s.kind === 'vocab')).toHaveLength(CLIP_TEST_RUN);
  });

  it('erlaubt Züge ohne Vokabeln', () => {
    const specs = planClips({ includeWords: false, includeExamples: false, situations: [situation('s', ['ก', 'ข'])] });
    expect(specs.map((s) => s.kind)).toEqual(['turn', 'turn']);
  });
});

describe('Speicherbedarf (Pflicht 3)', () => {
  it('rechnet Gemini als 24 kHz × 16 Bit mono — 48 000 Byte je Sekunde', () => {
    expect(BYTES_PER_SECOND.gemini).toBe(48000);
    const specs = planClipTestRun();
    const seconds = estimateClipSeconds(specs);
    expect(seconds).toBeGreaterThan(0);
    expect(estimateClipBytes(specs, 'gemini')).toBe(Math.round(seconds * 48000));
  });

  it('macht ChatGPT-mp3 deutlich kleiner als Gemini-WAV', () => {
    const specs = planClips({});
    expect(estimateClipBytes(specs, 'chatgpt')!).toBeLessThan(estimateClipBytes(specs, 'gemini')! / 5);
  });

  it('formatiert lesbar', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(48000)).toBe('47 KB');
    expect(formatBytes(48000 * 60)).toBe('2.7 MB');
  });
});

// ---------------------------------------------------------------------------

describe('Base64 und WAV', () => {
  it('kodiert und dekodiert verlustfrei, auch mit Füllzeichen', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 100, 4801]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 11) & 255);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
    expect(bytesToBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu');
    expect(bytesToBase64(new Uint8Array([77, 97]))).toBe('TWE=');
    expect(bytesToBase64(new Uint8Array([77]))).toBe('TQ==');
  });

  it('liest Geminis PCM-Typ und setzt Vorgaben ein, wo Angaben fehlen', () => {
    expect(parsePcmMimeType('audio/L16;codec=pcm;rate=24000')).toEqual({ sampleRate: 24000, channels: 1, bitsPerSample: 16 });
    expect(parsePcmMimeType('audio/L16;rate=16000;channels=2')).toEqual({ sampleRate: 16000, channels: 2, bitsPerSample: 16 });
    expect(parsePcmMimeType('audio/mpeg')).toBeNull();
    expect(parsePcmMimeType(undefined)).toBeNull();
  });

  it('schreibt einen korrekten 44-Byte-RIFF-Kopf', () => {
    const wav = pcmToWav(fakePcm(2400), { sampleRate: 24000, channels: 1, bitsPerSample: 16 });
    const view = new DataView(wav.buffer);
    const ascii = (o: number, n: number) => String.fromCharCode(...wav.slice(o, o + n));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(28, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(4800);
    expect(wav.length).toBe(44 + 4800);
    expect(wavDurationMs(wav)).toBe(100);
  });
});

describe('Gemini-Audioantwort', () => {
  it('verpackt rohes PCM in WAV und nennt Modell und Stimme', () => {
    const pcm = fakePcm(2400);
    const response = parseGeminiAudio(
      {
        modelVersion: 'gemini-2.5-flash-preview-tts-001',
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: bytesToBase64(pcm) } }] } }],
      },
      'gemini-2.5-flash-preview-tts',
      'Kore'
    );
    expect(response.format).toBe('wav');
    expect(response.sampleRate).toBe(24000);
    expect(response.model).toBe('gemini-2.5-flash-preview-tts-001');
    expect(response.voice).toBe('Kore');
    expect(wavDurationMs(base64ToBytes(response.base64))).toBe(100);
  });

  it('reicht fertiges mp3 unverändert durch', () => {
    const response = parseGeminiAudio(
      { candidates: [{ content: { parts: [{ inline_data: { mime_type: 'audio/mpeg', data: 'QUJD'.repeat(40) } }] } }] },
      'm',
      'v'
    );
    expect(response.format).toBe('mp3');
    expect(response.base64).toBe('QUJD'.repeat(40));
  });

  it('nennt bei fehlendem Audio finishReason und gelieferte Teile', () => {
    expect(() =>
      parseGeminiAudio({ candidates: [{ finishReason: 'OTHER', content: { parts: [{ text: 'nur Text' }] } }] }, 'm', 'v')
    ).toThrow(/OTHER.*text/s);
    expect(() => parseGeminiAudio({ promptFeedback: {} }, 'm', 'v')).toThrow(/promptFeedback/);
  });

  it('lehnt einen unbekannten Audiotyp ab, statt ihn zu raten', () => {
    expect(() =>
      parseGeminiAudio({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/ogg', data: 'QUJD'.repeat(40) } }] } }] }, 'm', 'v')
    ).toThrow(/Unbekannter Audio-Typ/);
  });
});

describe('Anbieter für Sprachausgabe', () => {
  it('sind ChatGPT, der Studio-Helper und Gemini — und sonst niemand', () => {
    // `chatgpt-helper` ist der lokale Durchgang des Studios, kein Cloud-Dienst —
    // derselbe OpenAI-Aufruf, serverseitig mit Umgebungsschlüssel.
    // NUTZERENTSCHEIDUNG 10.09.: Claude und Stability sind aus der Auswahl
    // gefallen; wer sie noch in einem gespeicherten Stand trägt, landet über
    // `normalizeChoice` beim Gruppen-Default (siehe providers.test.ts).
    expect(providersForGroup('audio').map((p) => p.id)).toEqual([
      'chatgpt',
      'chatgpt-helper',
      'gemini',
    ]);
  });

  it('startet mit Gemini, weil dessen Weg aus dem Browser gemessen offen ist', () => {
    expect(defaultChoiceFor('audio')).toEqual({
      provider: 'gemini',
      model: PROVIDER_INFO.gemini.modelPlaceholder.audio,
      voice: 'Kore',
    });
    expect(GENERATOR_GROUP_INFO.audio.needs).toBe('audio');
  });

  it('nimmt die Stimme als Freitext und setzt sie beim Anbieterwechsel neu', async () => {
    expect(normalizeChoice({ provider: 'gemini', model: 'x', voice: '  ' }, 'audio').voice).toBe('Kore');
    expect(normalizeChoice({ provider: 'chatgpt', model: 'x', voice: 'Fantasie' }, 'audio').voice).toBe('Fantasie');
    // Textgruppen tragen keine Stimme.
    expect(normalizeChoice({ provider: 'gemini', model: 'x', voice: 'Kore' }, 'situations')).not.toHaveProperty('voice');

    const store = await freshStore();
    const next = await setGeneratorProvider('audio', 'chatgpt', store);
    expect(next.audio).toEqual({ provider: 'chatgpt', model: 'gpt-4o-mini-tts-2025-12-15', voice: 'coral' });
  });
});

// ---------------------------------------------------------------------------

describe('Der Clip-Lauf — vierter Nutzer des Batch-Läufers', () => {
  it('legt Datei und Dokument ab, mit ehrlicher Kennzeichnung', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planClipTestRun();

    const result = await runClipBatch({ specs, client: clientThatFailsOn(), store, blobStore: blobs, now: () => T0 });

    expect(result.ok).toBe(specs.length);
    expect(await countAudioClips(store)).toBe(specs.length);
    const doc = (await store.get<AudioClip>('audio', specs[0].id))!;
    expect(doc.synthetic).toBe(true);
    expect(doc.format).toBe('wav');
    expect(doc.blobKey).toBe(`${specs[0].id}.wav`);
    expect(doc.byteSize).toBe(44 + 4800);
    expect(doc.durationMs).toBe(100);
    expect(doc.provider).toBe('gemini');
    expect(await blobs.has(doc.blobKey)).toBe(true);
    expect(await sumAudioClipBytes(store)).toBe(specs.length * (44 + 4800));
  });

  it('kann mehrere Clips GLEICHZEITIG erzeugen, wenn der Anbieter es hergibt (17.09.)', async () => {
    // OpenAI deckelt TTS auf 30 Aufrufe/Minute (gemessen, siehe
    // CLIP_CONCURRENCY) — der Clip-Lauf fährt deshalb wieder seriell. Der
    // Worker-Pool in runBatch bleibt für Anbieter ohne solches Limit; dieser
    // Test hält die Fähigkeit fest, unabhängig vom Produktivwert.
    let aktiv = 0;
    let hoechsteGleichzeit = 0;
    const specs = planClipTestRun().map((spec) => ({ id: spec.id }));
    const result = await runBatch({
      specs,
      task: {
        exists: async () => false,
        produce: async () => {
          aktiv += 1;
          hoechsteGleichzeit = Math.max(hoechsteGleichzeit, aktiv);
          await new Promise((resolve) => setTimeout(resolve, 40));
          aktiv -= 1;
        },
      },
      concurrency: 3,
    });

    expect(result.ok).toBe(specs.length);
    expect(result.failed).toBe(0);
    expect(hoechsteGleichzeit).toBeGreaterThan(1);
  });

  it('überlebt Fehler mitten im Lauf und überspringt beim zweiten Mal, was da ist', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planClipTestRun();
    const first = await runClipBatch({ specs, client: clientThatFailsOn([specs[1].id, specs[3].id]), store, blobStore: blobs, now: () => T0 });
    expect(first.ok).toBe(specs.length - 2);
    expect(first.failed).toBe(2);

    const second = clientThatFailsOn();
    const result = await runClipBatch({ specs, client: second, store, blobStore: blobs, now: () => T0 });
    expect(result.skipped).toBe(specs.length - 2);
    expect(second.calls).toEqual([specs[1].id, specs[3].id]);
  });

  it('erzeugt mit overwrite auch vorhandene Clips neu („Neu erzeugen“ im Prüfbericht)', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planClipTestRun().slice(0, 1);
    await runClipBatch({ specs, client: clientThatFailsOn(), store, blobStore: blobs, now: () => T0 });

    const ohne = clientThatFailsOn();
    expect((await runClipBatch({ specs, client: ohne, store, blobStore: blobs, now: () => T0 })).skipped).toBe(1);
    expect(ohne.calls).toEqual([]);

    const neu = clientThatFailsOn();
    const result = await runClipBatch({ specs, client: neu, store, blobStore: blobs, now: () => T0, overwrite: true });
    expect(neu.calls).toEqual([specs[0].id]);
    expect(result.skipped).toBe(0);
  });

  it('gilt als fehlend, wenn nur das Dokument, nicht die Datei da ist', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planClipTestRun().slice(0, 2);
    await runClipBatch({ specs, client: clientThatFailsOn(), store, blobStore: blobs, now: () => T0 });
    await blobs.remove(`${specs[0].id}.wav`);

    const again = clientThatFailsOn();
    await runClipBatch({ specs, client: again, store, blobStore: blobs, now: () => T0 });
    expect(again.calls).toEqual([specs[0].id]);
  });

  it('räumt beim Löschen Dateien und Dokumente gemeinsam ab', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planClipTestRun().slice(0, 3);
    await runClipBatch({ specs, client: clientThatFailsOn(), store, blobStore: blobs, now: () => T0 });
    await clearAudioClips(store, blobs);
    expect(await countAudioClips(store)).toBe(0);
    expect(await blobs.has(`${specs[0].id}.wav`)).toBe(false);
  });

  it('lässt ein Dokument aus einer älteren Fassung aus, ohne es zu löschen (AE-25)', async () => {
    const store = await freshStore();
    await store.put('audio', 'alt', { id: 'alt', text: 'x' });
    expect(isValidAudioClip({ id: 'alt', text: 'x' })).toBe(false);
    expect(await loadAudioClips(store)).toHaveLength(0);
    expect(await store.get('audio', 'alt')).not.toBeNull();
  });

  it('nimmt vom Anbieter nur brauchbare Daten an', async () => {
    const client = createClipClient({
      provider: 'gemini',
      model: 'm',
      voice: 'v',
      async synthesize() {
        return { base64: 'kurz', format: 'wav', model: 'm', voice: 'v' };
      },
    });
    await expect(client.generate(planClipTestRun()[0])).rejects.toThrow(/keine Audiodaten/);
  });
});

// ---------------------------------------------------------------------------

describe('Der Auflöser: Clip bevorzugt, sonst TTS wie bisher', () => {
  type Call = { kind: string; args: unknown[] };
  let calls: Call[];

  function recordingBackend(): PronunciationBackend {
    return {
      async playAsset(uri) {
        calls.push({ kind: 'playAsset', args: [uri] });
      },
      async speak(text, locale, rate) {
        calls.push({ kind: 'speak', args: [text, locale, rate] });
      },
      async stop() {},
      async availableLocales() {
        return ['de-DE'];
      },
    };
  }

  beforeEach(() => {
    calls = [];
    setPronunciationBackend(recordingBackend());
    registerAudioAssetResolver(() => null);
    registerPronunciationClipLookup(null);
  });

  afterEach(() => {
    setPronunciationBackend(null);
    registerAudioAssetResolver(() => null);
    registerPronunciationClipLookup(null);
  });

  it('spielt den Clip, wenn einer abgelegt ist — gefunden über Text und Sprache, ohne ID', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planClipTestRun().slice(0, 2);
    await runClipBatch({ specs, client: clientThatFailsOn(), store, blobStore: blobs, now: () => T0 });
    registerPronunciationClipLookup((request) => resolveClipUri(request, store, blobs));

    // So ruft die Gespraech-Seite: nur Text und Sprache.
    const kind = await playPronunciation({ text: `  ${specs[0].text}  `, language: 'th' });

    expect(kind).toBe('asset');
    expect(calls.map((c) => c.kind)).toEqual(['playAsset']);
    expect(String(calls[0].args[0])).toMatch(/^data:audio\/wav;base64,/);
  });

  it('fällt ohne Clip weiterhin auf TTS zurück', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    registerPronunciationClipLookup((request) => resolveClipUri(request, store, blobs));

    expect(await playPronunciation({ text: 'ไม่มีคลิป', language: 'th' })).toBe('tts');
    expect(calls.map((c) => c.kind)).toEqual(['speak']);
    expect(calls[0].args[1]).toBe('th-TH');
  });

  it('fällt auch dann auf TTS zurück, wenn die Clip-Suche selbst scheitert', async () => {
    registerPronunciationClipLookup(async () => {
      throw new Error('Speicher kaputt');
    });
    expect(await playPronunciation({ text: 'ไก่', language: 'th' })).toBe('tts');
  });

  it('lässt bei Nicht-Thai einer ausdrücklichen Asset-ID den Vortritt vor der Textsuche', async () => {
    registerAudioAssetResolver(async (id) => (id === 'clip-1' ? 'file:///clip-1.m4a' : null));
    registerPronunciationClipLookup(() => 'data:audio/wav;base64,AAAA');

    expect(await playPronunciation({ text: 'chicken', language: 'en', audioAssetId: 'clip-1' })).toBe('asset');
    expect(calls[0].args[0]).toBe('file:///clip-1.m4a');
  });

  it('sieht neue Clips erst nach dem Verwerfen des Index — und der Lauf verwirft ihn', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planClipTestRun().slice(0, 1);
    expect((await clipIndex(store)).size).toBe(0);

    await runClipBatch({ specs, client: clientThatFailsOn(), store, blobStore: blobs, now: () => T0 });
    expect((await clipIndex(store)).size).toBe(1);

    await clearAudioClips(store, blobs);
    expect((await clipIndex(store)).size).toBe(0);
  });
});
