import { Platform } from 'react-native';

import type { CapturedPcm } from './microphone-capture';

/**
 * Die eigene Aufnahme als Datei (28.10.2026, Shadowing-Vergleich).
 *
 * EINE Datei für zwei Zwecke: zum Anhören („Ich“, „Im Wechsel“) und für die
 * Worterkennung auf dem Gerät. Deshalb genau das Format, das
 * expo-speech-recognition für Dateien verlangt: 16 kHz, 16 Bit, mono, WAV.
 * Die Datei liegt nur im Cache dieses Geräts und wird beim nächsten Satz
 * überschrieben; sie geht an keinen Anbieter.
 */

export const AUFNAHME_RATE = 16_000;

/** Auf 16 kHz bringen: Blockmittel als einfacher Tiefpass, dann linear. */
export function auf16k(samples: Float32Array, rate: number): Float32Array {
  if (rate === AUFNAHME_RATE) return Float32Array.from(samples);
  const faktor = rate / AUFNAHME_RATE;
  const laenge = Math.max(0, Math.floor(samples.length / faktor));
  const aus = new Float32Array(laenge);
  const halb = faktor > 1 ? faktor / 2 : 0;
  for (let i = 0; i < laenge; i++) {
    const mitte = i * faktor;
    if (halb > 0) {
      const von = Math.max(0, Math.floor(mitte - halb));
      const bis = Math.min(samples.length - 1, Math.ceil(mitte + halb));
      let s = 0;
      for (let k = von; k <= bis; k++) s += samples[k];
      aus[i] = s / (bis - von + 1);
    } else {
      const k = Math.floor(mitte);
      const anteil = mitte - k;
      aus[i] = samples[k] * (1 - anteil) + (samples[k + 1] ?? samples[k]) * anteil;
    }
  }
  return aus;
}

/** Mono-PCM (−1 … +1) → WAV-Bytes, 16 Bit. */
export function wavAus(samples: Float32Array, rate: number = AUFNAHME_RATE): Uint8Array {
  const daten = samples.length * 2;
  const bytes = new Uint8Array(44 + daten);
  const sicht = new DataView(bytes.buffer);
  const text = (stelle: number, wert: string) => {
    for (let i = 0; i < wert.length; i++) bytes[stelle + i] = wert.charCodeAt(i);
  };
  text(0, 'RIFF');
  sicht.setUint32(4, 36 + daten, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  sicht.setUint32(16, 16, true);
  sicht.setUint16(20, 1, true); // PCM
  sicht.setUint16(22, 1, true); // mono
  sicht.setUint32(24, rate, true);
  sicht.setUint32(28, rate * 2, true);
  sicht.setUint16(32, 2, true);
  sicht.setUint16(34, 16, true);
  text(36, 'data');
  sicht.setUint32(40, daten, true);
  for (let i = 0; i < samples.length; i++) {
    const wert = Math.max(-1, Math.min(1, samples[i]));
    sicht.setInt16(44 + i * 2, wert < 0 ? wert * 0x8000 : wert * 0x7fff, true);
  }
  return bytes;
}

/** Hebt leise Aufnahmen an (Spitze auf ~90 %), damit man sich gut hört. */
export function normalisiere(samples: Float32Array): Float32Array {
  let spitze = 0;
  for (const wert of samples) spitze = Math.max(spitze, Math.abs(wert));
  if (spitze < 1e-4 || spitze > 0.9) return samples;
  const faktor = Math.min(8, 0.9 / spitze);
  return samples.map((wert) => wert * faktor);
}

export type GespeicherteAufnahme = { uri: string; dauerMs: number; freigeben(): void };

let zaehler = 0;

/** Schreibt die Aufnahme als WAV in den Cache (nativ) bzw. als Blob-URL (Web). */
export function speichereAufnahme(aufnahme: CapturedPcm): GespeicherteAufnahme {
  const pcm = normalisiere(auf16k(aufnahme.samples, aufnahme.sampleRate));
  const bytes = wavAus(pcm);
  const dauerMs = Math.round((pcm.length / AUFNAHME_RATE) * 1000);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/wav' }));
    return { uri: url, dauerMs, freigeben: () => URL.revokeObjectURL(url) };
  }
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  // Neuer Name je Aufnahme: ein Player könnte eine gleichnamige Datei puffern.
  zaehler = (zaehler + 1) % 1000;
  const datei = new File(Paths.cache, `eigene-aufnahme-${zaehler}.wav`);
  datei.create({ overwrite: true });
  datei.write(bytes);
  return {
    uri: datei.uri,
    dauerMs,
    freigeben: () => {
      try {
        if (datei.exists) datei.delete();
      } catch {
        // Cache räumt das System notfalls selbst.
      }
    },
  };
}
