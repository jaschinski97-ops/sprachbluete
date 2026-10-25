import { VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';

import { MemoryBlobStore } from '../blobs/memory';
import { DataStore, MemoryDataStore } from '../storage';
import type { ToneWort } from '../content/tone-gate';

import { runClipBatch, TON_NOTSTOPP_STICHPROBE } from './batch';
import { REGISTER_PROBE_MIN } from '../content/tone-gate';
import { bytesToBase64, pcmToWav } from './bytes';
import { AUDIO_BLOB_CONFIG, AudioBlobStore, AudioClipSpec, GeneratedClip } from './types';
import { ClipGenerationClient } from './generator';

/**
 * Automatische Tonprüfung im Clip-Lauf: WAV-Klipse werden direkt nach der
 * Erzeugung gemessen, und ein Clip, dessen Kontur dem verifizierten Sollton
 * klar widerspricht, wird gar nicht erst abgelegt. Hier steht der Gegenbeweis
 * in beide Richtungen — mit künstlichen Tönen, deren Verlauf wir kennen.
 */

const T0 = Date.UTC(2026, 8, 7);

function sineWavBase64(fromHz: number, toHz: number, ms = 400, sampleRate = 24000): string {
  const samples = Math.round((sampleRate * ms) / 1000);
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const frequency = fromHz + (toHz - fromHz) * (i / samples);
    const value = Math.round(0.5 * 32767 * Math.sin(2 * Math.PI * frequency * t));
    view.setInt16(i * 2, value, true);
  }
  return bytesToBase64(pcmToWav(pcm, { sampleRate, channels: 1, bitsPerSample: 16 }));
}

/**
 * Tonkurve aus Abschnitten [vonHz, bisHz, Anteil] mit stetiger Phase —
 * realistische Tonformen: steigend mit Senke vor dem Anstieg, fallend eben
 * und dann spät und steil (seit f0-syllables-6 verlangt das Gate genau das).
 */
function konturWavBase64(abschnitte: [number, number, number][], ms = 400, sampleRate = 24000): string {
  const samples = Math.round((sampleRate * ms) / 1000);
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer);
  let phase = 0;
  let i = 0;
  for (const [von, bis, anteil] of abschnitte) {
    const n = Math.round(samples * anteil);
    for (let k = 0; k < n && i < samples; k++, i++) {
      phase += (2 * Math.PI * (von + (bis - von) * (k / n))) / sampleRate;
      view.setInt16(i * 2, Math.round(0.5 * 32767 * Math.sin(phase)), true);
    }
  }
  return bytesToBase64(pcmToWav(pcm, { sampleRate, channels: 1, bitsPerSample: 16 }));
}
const STEIGEND: [number, number, number][] = [[200, 160, 0.4], [160, 280, 0.6]];
const FALLEND: [number, number, number][] = [[220, 240, 0.5], [240, 130, 0.5]];

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

function freshBlobs(): AudioBlobStore {
  return new MemoryBlobStore(AUDIO_BLOB_CONFIG);
}

function staticClient(base64: string): ClipGenerationClient {
  return {
    async generate(): Promise<GeneratedClip> {
      return {
        base64,
        format: 'wav',
        model: 'test-tts',
        voice: 'Testa',
        provider: 'gemini',
        durationMs: 400,
      };
    },
  };
}

function mp3Client(base64: string): ClipGenerationClient {
  return {
    async generate(): Promise<GeneratedClip> {
      return {
        base64,
        format: 'mp3',
        model: 'test-tts',
        voice: 'Testa',
        provider: 'chatgpt',
        durationMs: 400,
      };
    },
  };
}

function specOf(term: string, id: string): AudioClipSpec {
  const word = VOCABULARY_TH.find((entry) => entry.term === term);
  if (!word?.sourceVerified) throw new Error('Testwort nicht verifiziert: ' + term);
  return { id, language: 'th', text: word.term, kind: 'vocab', sourceId: word.id };
}

/** Zwei getrennt gesprochene Silben auf DERSELBEN Höhe — keine Registertrennung. */
function gleichLauteZweiSilbenWavBase64(sampleRate = 24000): string {
  const ton = (ms: number) => {
    const n = Math.round((sampleRate * ms) / 1000);
    let phase = 0;
    return Int16Array.from({ length: n }, () => {
      phase += (2 * Math.PI * 200) / sampleRate;
      return Math.round(0.5 * 32767 * Math.sin(phase));
    });
  };
  const stille = new Int16Array(Math.round(sampleRate * 0.15));
  const teile = [ton(300), stille, ton(300)];
  const gesamt = teile.reduce((summe, teil) => summe + teil.length, 0);
  const pcm = new Uint8Array(gesamt * 2);
  const view = new DataView(pcm.buffer);
  let offset = 0;
  for (const teil of teile) {
    for (const wert of teil) {
      view.setInt16(offset, wert, true);
      offset += 2;
    }
  }
  return bytesToBase64(pcmToWav(pcm, { sampleRate, channels: 1, bitsPerSample: 16 }));
}

/**
 * Zwei getrennt gesprochene Silben als WAV: fallend, kurze Pause, steigend —
 * oder umgekehrt. Der Ton-Check des Laufs muss sie dem übergebenen Bestand
 * nach silbenweise zuordnen können (Thai-Massenlauf, 18.09.).
 */
function zweiSilbenWavBase64(fallendZuerst: boolean, sampleRate = 24000): string {
  const sweep = (von: number, bis: number, ms: number) => {
    const n = Math.round((sampleRate * ms) / 1000);
    let phase = 0;
    return Int16Array.from({ length: n }, (_, i) => {
      phase += (2 * Math.PI * (von + (bis - von) * (i / n))) / sampleRate;
      return Math.round(0.5 * 32767 * Math.sin(phase));
    });
  };
  const stille = (ms: number) => new Int16Array(Math.round((sampleRate * ms) / 1000));
  const erster = fallendZuerst ? sweep(240, 120, 300) : sweep(120, 260, 300);
  const zweiter = fallendZuerst ? sweep(120, 260, 300) : sweep(240, 120, 300);
  const pcm = new Uint8Array(erster.length * 2 + stille(150).length * 2 + zweiter.length * 2);
  const view = new DataView(pcm.buffer);
  let offset = 0;
  for (const teil of [erster, stille(150), zweiter]) {
    for (const wert of teil) {
      view.setInt16(offset, wert, true);
      offset += 2;
    }
  }
  return bytesToBase64(pcmToWav(pcm, { sampleRate, channels: 1, bitsPerSample: 16 }));
}

describe('Automatische Tonprüfung im Clip-Lauf', () => {
  it('legt einen Clip, der dem Sollton klar widerspricht, nicht ab', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    // ไม่ ist verifiziert fallend; ein ebener Ton widerspricht dem klar.
    const spec = specOf('ไม่', 'test-flat-falling');

    const result = await runClipBatch({
      specs: [spec],
      client: staticClient(sineWavBase64(200, 200)),
      store,
      blobStore: blobs,
      now: () => T0,
    });

    expect(result.failed).toBe(1);
    expect(result.tone?.failed).toBe(1);
    expect(result.errors[0]?.message).toContain('Ton-Check fehlgeschlagen');
    expect(await store.get('audio', spec.id)).toBeNull();
    expect(await blobs.has(`${spec.id}.wav`)).toBe(false);
  });

  it('nimmt einen Clip mit passender Kontur an und zählt ihn', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    // หมา ist verifiziert steigend; Senke und klarer Anstieg passen.
    const spec = specOf('หมา', 'test-rising');

    const result = await runClipBatch({
      specs: [spec],
      client: staticClient(konturWavBase64(STEIGEND)),
      store,
      blobStore: blobs,
      now: () => T0,
    });

    expect(result.ok).toBe(1);
    expect(result.tone?.passed).toBe(1);
    expect(await store.get('audio', spec.id)).not.toBeNull();
  });

  it('lässt nicht-prüfbare Clips ungeprüft zu — Fremdsprache bleibt speicherbar', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const spec: AudioClipSpec = {
      id: 'test-en-water',
      language: 'en',
      text: 'water',
      kind: 'vocab',
      sourceId: 'en-water',
    };

    const result = await runClipBatch({
      specs: [spec],
      client: staticClient(sineWavBase64(200, 200)),
      store,
      blobStore: blobs,
      now: () => T0,
    });

    expect(result.ok).toBe(1);
    expect(result.tone?.other).toBe(1);
    expect(await store.get('audio', spec.id)).not.toBeNull();
  });

  it('prüft mehrsilbige KI-Wörter silbenweise gegen den übergebenen Bestand', async () => {
    const wort: ToneWort = {
      id: 'ki-th-zweisilber',
      term: 'สองคำ',
      syllables: [{ tone: 'falling' }, { tone: 'rising' }],
      verificationNote: 'KI-Kreuzprüfung bestanden (Test)',
    };
    const spec: AudioClipSpec = { id: 'test-zweisilber', language: 'th', text: wort.term, kind: 'vocab', sourceId: wort.id };

    const store = await freshStore();
    const blobs = freshBlobs();
    const passt = await runClipBatch({
      specs: [spec],
      client: staticClient(zweiSilbenWavBase64(true)),
      store,
      blobStore: blobs,
      toneWortschatz: [wort],
      now: () => T0,
    });
    expect(passt.ok).toBe(1);
    expect(passt.tone?.passed).toBe(1);
    expect(await store.get('audio', spec.id)).not.toBeNull();

    const store2 = await freshStore();
    const blobs2 = freshBlobs();
    const widerspricht = await runClipBatch({
      specs: [spec],
      client: staticClient(zweiSilbenWavBase64(false)),
      store: store2,
      blobStore: blobs2,
      toneWortschatz: [wort],
      now: () => T0,
    });
    expect(widerspricht.failed).toBe(1);
    expect(widerspricht.tone?.failed).toBe(1);
    expect(await store2.get('audio', spec.id)).toBeNull();
  });

  it('stoppt den Lauf selbst, wenn die Stimme die Thai-Töne massenhaft verfehlt (Notstopp)', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    // 12× dasselbe fehlerhafte Muster: ไม่ (fallend) steigend gesprochen.
    // Nach der 10. verworfenen Messung muss der Lauf abbrechen statt die
    // restlichen Clips weiter zu bezahlen.
    const spec = specOf('ไม่', 'test-notstopp');
    let aufrufe = 0;
    const client: ClipGenerationClient = {
      async generate() {
        aufrufe += 1;
        return { base64: sineWavBase64(120, 240), format: 'wav', model: 'test-tts', voice: 'Testa', provider: 'gemini', durationMs: 400 };
      },
    };

    const result = await runClipBatch({
      specs: Array.from({ length: 12 }, (_, i) => ({ ...spec, id: `${spec.id}-${i}` })),
      client,
      store,
      blobStore: blobs,
      now: () => T0,
    });

    expect(result.failed).toBe(TON_NOTSTOPP_STICHPROBE);
    expect(aufrufe).toBe(TON_NOTSTOPP_STICHPROBE);
    expect(result.cancelled).toBe(true);
    expect(result.errors.some((error) => error.id === 'ton-notstopp')).toBe(true);
    expect(result.errors.find((error) => error.id === 'ton-notstopp')?.message).toContain('Stimme');
  });

  it('stoppt eine bewährte Stimme nicht — durchgefallene Clips bleiben trotzdem draußen', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const spec = specOf('ไม่', 'test-bewaehrt');
    let aufrufe = 0;
    const client: ClipGenerationClient = {
      async generate() {
        aufrufe += 1;
        return { base64: sineWavBase64(120, 240), format: 'wav', model: 'test-tts', voice: 'Testa', provider: 'gemini', durationMs: 400 };
      },
    };

    const result = await runClipBatch({
      specs: Array.from({ length: 12 }, (_, i) => ({ ...spec, id: `${spec.id}-${i}` })),
      client,
      store,
      blobStore: blobs,
      now: () => T0,
      bewaehrteStimme: true,
    });

    expect(aufrufe).toBe(12);
    expect(result.failed).toBe(12);
    expect(result.errors.some((error) => error.id === 'ton-notstopp')).toBe(false);
    expect(await store.get('audio', `${spec.id}-0`)).toBeNull();
  });

  it('greift nicht unter der Fehlgrenze — brauchbare Stimmen laufen durch', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    // Zehn unterschiedliche fallende/steigende Einsilber, JE korrekt gespielt:
    // null Verwürfe in der Stichprobe dürfen den Lauf niemals anhalten.
    const woerter = VOCABULARY_TH
      .filter((entry) => entry.sourceVerified && entry.syllables.length === 1)
      .filter((entry) => entry.syllables[0].tone === 'falling' || entry.syllables[0].tone === 'rising')
      .slice(0, TON_NOTSTOPP_STICHPROBE);
    const specs = woerter.map((wort) => ({
      id: 'test-notstopp-gut-' + wort.id,
      language: 'th' as const,
      text: wort.term,
      kind: 'vocab' as const,
      sourceId: wort.id,
    }));

    const result = await runClipBatch({
      specs,
      client: {
        async generate(spec) {
          const wort = woerter.find((eintrag) => eintrag.id === spec.sourceId);
          if (!wort) throw new Error('unbekannte Spec: ' + spec.id);
          const sweep = wort.syllables[0].tone === 'falling'
            ? konturWavBase64(FALLEND) // fallend korrekt
            : konturWavBase64(STEIGEND); // steigend korrekt
          return { base64: sweep, format: 'wav', model: 'test-tts', voice: 'Testa', provider: 'gemini', durationMs: 400 };
        },
      },
      store,
      blobStore: blobs,
      now: () => T0,
    });

    // Alle zehn Stichproben bestanden — der Lauf darf niemals anhalten.
    expect(result.cancelled).toBe(false);
    expect(result.errors.some((error) => error.id === 'ton-notstopp')).toBe(false);
    expect(result.failed).toBe(0);
    expect(result.tone?.passed).toBe(specs.length);
    expect(result.processed).toBe(specs.length);
  });

  it('misst mp3 über den Web-AudioContext und lehnt widersprechende Clips ab', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    // Der Test kann kein echtes mp3 dekodieren — er prüft die Verdrahtung:
    // ein gemockter AudioContext liefert das "dekodierte" PCM, und die
    // Prüfung (mono-Mixdown, Abtastrate aus dem Puffer, Ablehnung) läuft.
    const decoded = { sampleRate: 24000, numberOfChannels: 2, length: 9600, getChannelData: (channel: number) => channelData[channel] };
    const channelData = [
      new Float32Array(9600).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 200 * (i / 24000))),
      new Float32Array(9600).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 200 * (i / 24000))),
    ];
    const decodeCalls: number[] = [];
    (globalThis as { AudioContext?: unknown }).AudioContext = class {
      decodeAudioData(data: ArrayBuffer) {
        decodeCalls.push(data.byteLength);
        return Promise.resolve(decoded);
      }
      close() {
        return Promise.resolve();
      }
    };

    try {
      // ไม่ ist verifiziert fallend; ein ebener Ton widerspricht dem klar.
      const spec = specOf('ไม่', 'test-mp3-flat-falling');
      const result = await runClipBatch({
        specs: [spec],
        client: mp3Client('aGVsbG8='), // beliebige Bytes — dekodiert wird gemockt
        store,
        blobStore: blobs,
        now: () => T0,
      });

      expect(decodeCalls.length).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.tone?.failed).toBe(1);
      expect(result.errors[0]?.message).toContain('Ton-Check fehlgeschlagen');
      expect(await store.get('audio', spec.id)).toBeNull();
    } finally {
      delete (globalThis as { AudioContext?: unknown }).AudioContext;
    }
  });

  it('stoppt den Lauf, wenn die Stimme die Tonlagen über den Lauf hinweg nicht trennt', async () => {
    // Einsilber mit mittel/tief/hoch sind EINZELN nicht prüfbar (64 % des
    // Wortschatzes). Über viele Clips hinweg verrät sich eine Stimme, die die
    // Register gar nicht markiert, trotzdem: hier liegen tiefe und hohe
    // Silbe auf derselben Höhe. Kein einzelner Clip wird dafür verworfen —
    // der LAUF hält an, bevor er tausende taube Clips bezahlt.
    const wort: ToneWort = {
      id: 'ki-th-registerwort',
      term: 'ทดสอบ',
      syllables: [{ tone: 'low' }, { tone: 'high' }],
      verificationNote: 'KI-Kreuzprüfung bestanden (Test)',
    };
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs: AudioClipSpec[] = Array.from({ length: REGISTER_PROBE_MIN + 5 }, (_, nr) => ({
      id: `test-register-${nr}`, language: 'th', text: wort.term, kind: 'vocab', sourceId: wort.id,
    }));

    const result = await runClipBatch({
      specs,
      client: staticClient(gleichLauteZweiSilbenWavBase64()),
      store,
      blobStore: blobs,
      toneWortschatz: [wort],
      now: () => T0,
    });

    expect(result.errors.some((fehler) => fehler.id === 'ton-registerprobe')).toBe(true);
    expect(result.tone?.register?.genug).toBe(true);
    expect(Math.abs(result.tone?.register?.abstand ?? 9)).toBeLessThan(1);
    // Kein Clip wurde deswegen verworfen — nur der Lauf hält an.
    expect(result.tone?.failed).toBe(0);
    expect(result.cancelled).toBe(true);
    expect(result.ok).toBeLessThan(specs.length);
  });
});
