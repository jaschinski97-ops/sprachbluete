import appConfig from '../../../app.json';

import {
  captureDurationMs,
  DEFAULT_CAPTURE_DURATION_MS,
  int16PcmToMono,
  joinPcmChunks,
  MAX_CAPTURE_DURATION_MS,
  MIN_CAPTURE_DURATION_MS,
} from './microphone-capture';

describe('fluechtige Mikrofonaufnahme', () => {
  it('begrenzt die Aufnahmedauer, damit PCM nicht unbegrenzt waechst', () => {
    expect(captureDurationMs(undefined)).toBe(DEFAULT_CAPTURE_DURATION_MS);
    expect(captureDurationMs(Number.NaN)).toBe(DEFAULT_CAPTURE_DURATION_MS);
    expect(captureDurationMs(100)).toBe(MIN_CAPTURE_DURATION_MS);
    expect(captureDurationMs(4_000)).toBe(4_000);
    expect(captureDurationMs(60_000)).toBe(MAX_CAPTURE_DURATION_MS);
  });

  it('setzt PCM-Stuecke in fester Laenge zusammen und schneidet Ueberhang ab', () => {
    const joined = joinPcmChunks(
      [new Float32Array([0.1, 0.2]), new Float32Array([0.3, 0.4])],
      3
    );
    expect(Array.from(joined)).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.3),
    ]);
  });

  it('dekodiert little-endian Int16 und mittelt tatsaechlich gelieferte Kanaele', () => {
    const data = new ArrayBuffer(8);
    const view = new DataView(data);
    view.setInt16(0, 16_384, true);
    view.setInt16(2, -16_384, true);
    view.setInt16(4, 32_767, true);
    view.setInt16(6, 32_767, true);

    expect(Array.from(int16PcmToMono(data, 2))).toEqual([0, 32_767 / 32_768]);
  });

  it('kehrt Phase 8 gezielt nur fuer Aufnahme um und laesst Hintergrundaufnahme aus', () => {
    const plugin = appConfig.expo.plugins.find(
      (candidate) => Array.isArray(candidate) && candidate[0] === 'expo-audio'
    );
    if (!Array.isArray(plugin)) throw new Error('expo-audio-Plugin fehlt.');
    const options = plugin[1] as Record<string, unknown>;

    expect(options.recordAudioAndroid).toBe(true);
    expect(options.microphonePermission).toMatch(/only for the speaking exercises/);
    expect(options.microphonePermission).toMatch(/stays on this device/);
    expect(options.enableBackgroundRecording).toBe(false);
    expect(options.enableBackgroundPlayback).toBe(false);
  });

  it('erklaert die Mikrofonfreigabe in den Lernsprachen, ohne App-Namen', () => {
    const plugin = appConfig.expo.plugins.find(
      (candidate) => Array.isArray(candidate) && candidate[0] === 'expo-audio'
    );
    if (!Array.isArray(plugin)) throw new Error('expo-audio-Plugin fehlt.');
    const base = (plugin[1] as Record<string, unknown>).microphonePermission;
    const locales = appConfig.expo.locales as Record<string, { ios: { NSMicrophoneUsageDescription: string } }>;

    expect(Object.keys(locales).sort()).toEqual(['de', 'en', 'es', 'th']);
    expect(locales.en.ios.NSMicrophoneUsageDescription).toBe(base);
    expect(locales.de.ios.NSMicrophoneUsageDescription).toMatch(/bleibt auf diesem Gerät/);
    for (const text of [base, ...Object.values(locales).map((locale) => locale.ios.NSMicrophoneUsageDescription)]) {
      expect(text).not.toMatch(/Lernbegleiter/);
      // InfoPlist.strings schreibt den Text ohne Escaping in Anführungszeichen.
      expect(text).not.toMatch(/"/);
    }
  });
});
