import {
  isLanguageAvailable,
  STIMMEN_ZEITLIMIT_MS,
  playPronunciation,
  PronunciationBackend,
  registerAudioAssetResolver,
  registerPronunciationClipLookup,
  setPronunciationBackend,
  stopPronunciation,
} from './audio';
import { createAudioPlayer } from 'expo-audio';

/**
 * Der echte Player-Lebenszyklus des Default-Backends.
 *
 * `expo-audio` wird gemockt, weil es ein natives Modul ist — geprüft wird die
 * Ressourcen-Disziplin in `defaultBackend.playAsset`: ein Fehler beim Erzeugen
 * oder Starten darf keinen Player als "aktiv" hinterlassen, und ein
 * Fehlerzustand während der Wiedergabe muss ihn freigeben, weil
 * `didJustFinish` ihn nie erreichen wird.
 */
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
}));

type StatusCallback = (status: { didJustFinish?: boolean; error?: string | null }) => void;

function fakePlayer() {
  let listener: StatusCallback | null = null;
  const player = {
    addListener: jest.fn((_event: string, callback: StatusCallback) => {
      listener = callback;
      return { remove: jest.fn() };
    }),
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
  };
  return {
    player,
    emit: (status: { didJustFinish?: boolean; error?: string | null }) => listener!(status),
  };
}

type Call = { kind: string; args: unknown[] };

function recordingBackend(): { backend: PronunciationBackend; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    backend: {
      async playAsset(uri) {
        calls.push({ kind: 'playAsset', args: [uri] });
      },
      async speak(text, locale, rate) {
        calls.push({ kind: 'speak', args: [text, locale, rate] });
      },
      async stop() {
        calls.push({ kind: 'stop', args: [] });
      },
      async availableLocales() {
        calls.push({ kind: 'availableLocales', args: [] });
        return ['th-TH', 'de-DE'];
      },
    },
  };
}

describe('playPronunciation', () => {
  let calls: Call[];

  beforeEach(() => {
    const recorder = recordingBackend();
    calls = recorder.calls;
    setPronunciationBackend(recorder.backend);
    registerAudioAssetResolver(() => null);
  });

  afterEach(() => {
    setPronunciationBackend(null);
    registerAudioAssetResolver(() => null);
  });

  it('spricht Thai mit th-TH', async () => {
    expect(await playPronunciation({ text: 'ไก่', language: 'th' })).toBe('tts');
    expect(calls.find((c) => c.kind === 'speak')?.args[1]).toBe('th-TH');
  });

  it('spricht Deutsch mit de-DE', async () => {
    expect(await playPronunciation({ text: 'das Huhn', language: 'de' })).toBe('tts');
    expect(calls.find((c) => c.kind === 'speak')?.args[1]).toBe('de-DE');
  });

  it('spricht Thai langsamer als Deutsch, damit die Toene hoerbar bleiben', async () => {
    await playPronunciation({ text: 'ไก่', language: 'th' });
    await playPronunciation({ text: 'das Huhn', language: 'de' });
    const rates = calls.filter((c) => c.kind === 'speak').map((c) => c.args[2] as number);
    expect(rates[0]).toBeLessThan(rates[1]);
  });

  it('bricht laufende Ausgabe ab, bevor neu gesprochen wird', async () => {
    await playPronunciation({ text: 'ไก่', language: 'th' });
    expect(calls.map((c) => c.kind)).toEqual(['stop', 'speak']);
  });

  it('nutzt TTS, solange kein Clip aufgeloest werden kann', async () => {
    registerAudioAssetResolver(() => null);
    expect(
      await playPronunciation({ text: 'ไก่', language: 'th', audioAssetId: 'gai-01' })
    ).toBe('tts');
    expect(calls.some((c) => c.kind === 'playAsset')).toBe(false);
  });

  it('nutzt fuer Nicht-Thai weiterhin einen direkten Asset-Aufloeser', async () => {
    // Das ist der spaetere Content-Schritt: nur der Aufloeser wird eingehaengt,
    // die aufrufenden Screens bleiben unveraendert.
    registerAudioAssetResolver((id) => `https://example.invalid/${id}.m4a`);

    expect(
      await playPronunciation({ text: 'chicken', language: 'en', audioAssetId: 'gai-01' })
    ).toBe('asset');
    expect(calls.find((c) => c.kind === 'playAsset')?.args[0]).toBe(
      'https://example.invalid/gai-01.m4a'
    );
    expect(calls.some((c) => c.kind === 'speak')).toBe(false);
  });

  it('faellt auf TTS zurueck, wenn der Aufloeser die ID nicht kennt', async () => {
    registerAudioAssetResolver((id) => (id === 'bekannt' ? 'file:///clip.m4a' : null));
    expect(
      await playPronunciation({ text: 'ไก่', language: 'th', audioAssetId: 'unbekannt' })
    ).toBe('tts');
  });

  it('macht bei leerem Text gar nichts', async () => {
    expect(await playPronunciation({ text: '   ', language: 'th' })).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });

  it('laesst einen Fehler beim Stoppen den Sprechvorgang nicht verhindern', async () => {
    setPronunciationBackend({
      async playAsset() {},
      async speak(text, locale) {
        calls.push({ kind: 'speak', args: [text, locale] });
      },
      async stop() {
        throw new Error('nichts lief');
      },
      async availableLocales() {
        return [];
      },
    });

    await expect(playPronunciation({ text: 'ไก่', language: 'th' })).resolves.toBe('tts');
    expect(calls.some((c) => c.kind === 'speak')).toBe(true);
  });

  it('ordnet einen Stopp hinter einen noch aufloesenden Clip, damit nichts spaeter startet', async () => {
    let resolveUri!: (uri: string) => void;
    let markResolverStarted!: () => void;
    const resolverStarted = new Promise<void>((resolve) => {
      markResolverStarted = resolve;
    });
    registerAudioAssetResolver(
      () => new Promise<string>((resolve) => {
        markResolverStarted();
        resolveUri = resolve;
      })
    );

    const play = playPronunciation({ text: 'chicken', language: 'en', audioAssetId: 'gai-01' });
    // Der erste Backend-Stopp laeuft vor dem asynchronen Aufloeser.
    await resolverStarted;
    const stop = stopPronunciation();
    resolveUri('file:///gai-01.m4a');

    await expect(play).resolves.toBe('asset');
    await expect(stop).resolves.toBeUndefined();
    expect(calls.map((call) => call.kind)).toEqual(['stop', 'playAsset', 'stop']);
  });
});

describe('stopPronunciation', () => {
  it('schluckt Fehler, damit die Oberflaeche nicht abstuerzt', async () => {
    setPronunciationBackend({
      async playAsset() {},
      async speak() {},
      async stop() {
        throw new Error('kaputt');
      },
      async availableLocales() {
        return [];
      },
    });
    await expect(stopPronunciation()).resolves.toBeUndefined();
    setPronunciationBackend(null);
  });
});

describe('isLanguageAvailable', () => {
  function withLocales(locales: string[] | Error) {
    setPronunciationBackend({
      async playAsset() {},
      async speak() {},
      async stop() {},
      async availableLocales() {
        if (locales instanceof Error) throw locales;
        return locales;
      },
    });
  }

  afterEach(() => setPronunciationBackend(null));

  it('findet eine vorhandene Stimme ueber das Sprachpraefix', async () => {
    withLocales(['th-TH', 'de-DE', 'en-US']);
    expect(await isLanguageAvailable('th')).toBe(true);
    expect(await isLanguageAvailable('de')).toBe(true);
  });

  it('meldet eine fehlende Sprache als false', async () => {
    withLocales(['de-DE', 'en-US']);
    expect(await isLanguageAvailable('th')).toBe(false);
  });

  it('sagt bei leerer Stimmenliste "weiss nicht" statt "nein"', async () => {
    // Manche Plattformen liefern gar keine Liste, obwohl die Sprachausgabe
    // laeuft. Daraus "keine Thai-Stimme" zu schliessen, wuerde die Ton-Uebung
    // auf Geraeten sperren, auf denen sie funktioniert.
    withLocales([]);
    expect(await isLanguageAvailable('th')).toBeNull();
  });

  it('sagt auch bei einem Fehler "weiss nicht"', async () => {
    withLocales(new Error('nicht unterstuetzt'));
    expect(await isLanguageAvailable('th')).toBeNull();
  });

  it('wartet nicht endlos auf eine Stimmenliste, die nie kommt (Browser ohne Stimme)', async () => {
    jest.useFakeTimers();
    try {
      setPronunciationBackend({
        async playAsset() {},
        async speak() {},
        async stop() {},
        availableLocales: () => new Promise<string[]>(() => {}),
      });
      const antwort = isLanguageAvailable('th');
      jest.advanceTimersByTime(STIMMEN_ZEITLIMIT_MS);
      expect(await antwort).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('defaultBackend.playAsset - Lebenszyklus', () => {
  const typedCreateAudioPlayer = createAudioPlayer as unknown as jest.Mock;

  beforeEach(() => {
    setPronunciationBackend(null);
    typedCreateAudioPlayer.mockReset();
    registerPronunciationClipLookup(() => ({ uri: 'file:///clip.m4a', id: 'clip-1' }));
  });

  afterEach(() => {
    registerPronunciationClipLookup(null);
    setPronunciationBackend(null);
  });

  it('gibt einen Fehler beim Player-Aufbau weiter, ohne etwas zu hinterlassen', async () => {
    typedCreateAudioPlayer.mockImplementation(() => {
      throw new Error('natives Modul weg');
    });

    await expect(playPronunciation({ text: 'Huhn', language: 'de' })).rejects.toThrow(
      'natives Modul weg'
    );
  });

  it('gibt einen halb angelegten Player frei, wenn play() wirft', async () => {
    const { player } = fakePlayer();
    player.play.mockImplementation(() => {
      throw new Error('play kaputt');
    });
    typedCreateAudioPlayer.mockReturnValue(player);

    await expect(playPronunciation({ text: 'Huhn', language: 'de' })).rejects.toThrow(
      'play kaputt'
    );
    // Der Player ist nicht als aktiv haengen geblieben.
    expect(player.pause).toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
  });

  it('gibt den Player frei, wenn der Status einen Fehler meldet', async () => {
    const { player, emit } = fakePlayer();
    typedCreateAudioPlayer.mockReturnValue(player);

    await expect(playPronunciation({ text: 'Huhn', language: 'de' })).resolves.toBe('asset');
    expect(player.remove).not.toHaveBeenCalled();

    // expo-audio (v57) meldet Wiedergabefehler als `error` am Status; das
    // Ende-Flag `didJustFinish` kommt in diesem Fall nie.
    emit({ didJustFinish: false, error: 'decode failed' });

    expect(player.pause).toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
  });

  it('gibt den Player nach normalem Ende weiter frei', async () => {
    const { player, emit } = fakePlayer();
    typedCreateAudioPlayer.mockReturnValue(player);

    await expect(playPronunciation({ text: 'Huhn', language: 'de' })).resolves.toBe('asset');
    emit({ didJustFinish: true, error: null });

    expect(player.remove).toHaveBeenCalled();
  });
});
