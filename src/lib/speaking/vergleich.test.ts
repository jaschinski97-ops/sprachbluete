import type { F0Frame } from './analysis';
import { auf16k, AUFNAHME_RATE, normalisiere, wavAus } from './eigene-aufnahme';
import { besteVariante, enthaeltSprache, vergleichsForm } from './recognition';
import { angleichen, fuelleLuecken, spannweite, vergleiche } from './vergleich';
import { dekodiereKurve, kodiereKurve, kurveAusFrames, romanSilben, silbenSpannenAus, type Kurve } from './vorbild-kurve';
import { setzeKurvenQuelle, vorbildKurve } from './vorbild-kurven';
import { pruefeWoerter, satzWoerter } from './woerter-pruefen';

/** Messfenster alle 10 ms; `hz(i)` = 0 heißt stimmlos. */
function fenster(anzahl: number, hz: (i: number) => number): F0Frame[] {
  return Array.from({ length: anzahl }, (_, i) => ({ t: i * 0.01, start: i * 80, rms: 0.1, f0: hz(i) }));
}

/** Eine Satzmelodie: steigt, fällt, mit einer Pause in der Mitte. */
const melodie: Kurve = [
  ...Array.from({ length: 30 }, (_, i) => -3 + i * 0.2),
  null, null, null,
  ...Array.from({ length: 30 }, (_, i) => 3 - i * 0.25),
];

describe('Melodiekurve (vorbild-kurve)', () => {
  it('beschneidet stimmlose Ränder, misst relativ zum Median und fasst 20-ms-Fächer zusammen', () => {
    const frames = fenster(100, (i) => (i < 10 || i >= 90 ? 0 : 200));
    const kurve = kurveAusFrames(frames)!;
    expect(kurve.length).toBe(40);
    expect(kurve.every((w) => w === 0)).toBe(true);
  });

  it('liefert null bei zu wenig Stimme', () => {
    expect(kurveAusFrames(fenster(50, (i) => (i < 6 ? 200 : 0)))).toBeNull();
  });

  it('kodiert verlustfrei in halben Halbtönen und kappt bei ±12', () => {
    const kurve: Kurve = [0, 0.5, -3, null, 12, -12, 7.5];
    expect(dekodiereKurve(kodiereKurve(kurve))).toEqual(kurve);
    expect(dekodiereKurve(kodiereKurve([20, -20]))).toEqual([12, -12]);
    expect(() => dekodiereKurve('!')).toThrow();
  });

  it('rechnet Silbenfenster in Kurvenstellen ab Kurvenanfang um', () => {
    const frames = fenster(60, (i) => (i < 10 ? 0 : 200));
    const segmente = [frames.slice(10, 30), frames.slice(30, 60)];
    expect(silbenSpannenAus(segmente, frames)).toEqual([[0, 9], [10, 24]]);
  });

  it('zerlegt Umschrift wie die Tonprüfung in Silben', () => {
    expect(romanSilben('châi khráp, nîi bâan-phǒm.')).toEqual(['châi', 'khráp', 'nîi', 'bâan', 'phǒm']);
  });
});

describe('Vergleich mit dem Vorbild', () => {
  it('füllt Lücken linear und gleicht gleiche Kurven ohne Umweg an', () => {
    expect(fuelleLuecken([null, 1, null, 3, null])).toEqual([1, 1, 2, 3, 3]);
    const a = [0, 1, 2, 3];
    expect(angleichen(a, a)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
  });

  it('dieselbe Melodie ist „sehr nah“ mit passendem Tempo', () => {
    const e = vergleiche(melodie, melodie);
    expect(e.status).toBe('ok');
    if (e.status !== 'ok') return;
    expect(e.melodie.urteil).toBe('sehr-nah');
    expect(e.tempo.urteil).toBe('passt');
    expect(e.stelle).toBeNull();
    expect(e.ichAngeglichen).toHaveLength(melodie.length);
  });

  it('langsamer gesprochen bleibt die Melodie nah, das Tempo heißt „langsamer“', () => {
    const langsam: Kurve = melodie.flatMap((w, i) => (i % 2 ? [w] : [w, w]));
    const e = vergleiche(melodie, langsam);
    expect(e.status === 'ok' && e.tempo.urteil).toBe('langsamer');
    expect(e.status === 'ok' && e.melodie.urteil).not.toBe('abweichend');
  });

  it('eine flache Aufnahme bekommt den Tipp „mehr Melodie“', () => {
    const flach: Kurve = melodie.map((w) => (w === null ? null : w * 0.2));
    const e = vergleiche(melodie, flach);
    expect(e.status === 'ok' && e.flach).toBe(true);
    expect(e.status === 'ok' && e.stelle?.tipp).toBe('mehr-melodie');
  });

  it('Thai: die auffällige Stelle landet auf der Silbe mit ihrem Sollton', () => {
    const vorbild: Kurve = [...Array(20).fill(0), ...Array.from({ length: 20 }, (_, i) => 4 - i * 0.5)];
    const ich: Kurve = [...Array(20).fill(0), ...Array(20).fill(0)];
    const e = vergleiche(vorbild, ich, { silben: [[0, 19], [20, 39]], toene: ['mid', 'falling'] });
    expect(e.status === 'ok' && e.stelle).toMatchObject({ silbe: 1, tipp: 'ton-falling' });
  });

  it('Satzende: fehlender Anstieg einer Frage wird erkannt', () => {
    const frage: Kurve = [...Array(40).fill(0), ...Array.from({ length: 12 }, (_, i) => i * 0.6)];
    const aussage: Kurve = [...Array(40).fill(0), ...Array.from({ length: 12 }, (_, i) => -i * 0.2)];
    const e = vergleiche(frage, aussage);
    expect(e.status === 'ok' && e.stelle?.tipp).toBe('frage-hoch');
  });

  it('zu kurze oder viel zu lange Aufnahmen gelten als unpassend', () => {
    expect(vergleiche(melodie, [1, 2, null])).toEqual({ status: 'unpassend', grund: 'zu-kurz' });
    const lang: Kurve = Array.from({ length: melodie.length * 4 }, () => 0);
    expect(vergleiche(melodie, lang)).toEqual({ status: 'unpassend', grund: 'laenge' });
  });

  it('Spannweite ignoriert stimmlose Stellen', () => {
    expect(spannweite([null, 0, 10, null, 5])).toBeGreaterThan(0);
    expect(spannweite([null, null])).toBe(0);
  });
});

describe('Eigene Aufnahme als WAV', () => {
  it('bringt 48 kHz auf 16 kHz bei gleicher Dauer', () => {
    const pcm = new Float32Array(48_000).fill(0.5);
    const aus = auf16k(pcm, 48_000);
    expect(aus.length).toBe(16_000);
    expect(aus[100]).toBeCloseTo(0.5);
  });

  it('schreibt einen gültigen 16-Bit-Mono-WAV-Kopf', () => {
    const bytes = wavAus(new Float32Array([0, 1, -1]));
    const sicht = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(sicht.getUint16(22, true)).toBe(1);
    expect(sicht.getUint32(24, true)).toBe(AUFNAHME_RATE);
    expect(sicht.getUint32(40, true)).toBe(6);
    expect(sicht.getInt16(46, true)).toBe(0x7fff);
    expect(sicht.getInt16(48, true)).toBe(-0x8000);
  });

  it('hebt leise Aufnahmen an, laute bleiben', () => {
    expect(Math.max(...normalisiere(new Float32Array([0.1, -0.05])))).toBeCloseTo(0.8);
    const laut = new Float32Array([0.95]);
    expect(normalisiere(laut)).toBe(laut);
  });
});

describe('Worterkennung: Auswahl und Wörter', () => {
  it('wählt die Variante, die dem erwarteten Satz am nächsten ist', () => {
    expect(besteVariante(['this a house', 'this is my house'], ['This is my house.'])).toBe('this is my house');
    expect(besteVariante(['erste', 'zweite'])).toBe('erste');
    expect(besteVariante(['  '])).toBeNull();
  });

  it('vergleicht ohne Satzzeichen und Großschreibung', () => {
    expect(vergleichsForm('¿Dónde está, Laura?')).toBe('dónde está laura');
  });

  it('erkennt Gebietsschemata unabhängig von Schreibweise', () => {
    expect(enthaeltSprache(['th_TH', 'en-US'], 'th-TH')).toBe(true);
    expect(enthaeltSprache(['de'], 'de-DE')).toBe(true);
    expect(enthaeltSprache(['en-US'], 'es-ES')).toBe(false);
    expect(enthaeltSprache(undefined, 'es-ES')).toBe(false);
  });

  it('markiert Wörter, die in keiner Variante vorkommen (Akzente egal)', () => {
    const befunde = pruefeWoerter('¿Dónde está la estación?', ['donde esta la estancia', 'donde está la'], 'es');
    expect(befunde).toEqual([
      { wort: 'Dónde', erkannt: true },
      { wort: 'está', erkannt: true },
      { wort: 'la', erkannt: true },
      { wort: 'estación', erkannt: false },
    ]);
  });

  it('Thai: Teilstring ohne Leerzeichen zählt als erkannt', () => {
    const woerter = satzWoerter('ใช่ครับ นี่บ้านผม', 'th');
    expect(woerter.join('')).toBe('ใช่ครับนี่บ้านผม');
    const befunde = pruefeWoerter('ใช่ครับ นี่บ้านผม', ['ใช่ครับนี่บ้าน'], 'th');
    expect(befunde.some((b) => b.erkannt)).toBe(true);
    expect(befunde.find((b) => b.wort.includes('ผม'))?.erkannt).toBe(false);
  });
});

describe('Vorbild-Kurven laden', () => {
  afterEach(() => setzeKurvenQuelle(null));

  it('liefert die Kurve eines Clips samt Silben, unbekannte Clips und kaputte Dateien als null', async () => {
    setzeKurvenQuelle({
      lies: async (sprache) =>
        sprache === 'th'
          ? JSON.stringify({ v: 1, schrittMs: 20, kurven: { 'th-1': ['abcd1234', 'yz.y', [[0, 1], [3, 4]]] } })
          : '{kaputt',
    });
    expect(await vorbildKurve('th', 'th-1')).toEqual({ kurve: [0, 0.5, null, 0], silben: [[0, 1], [3, 4]] });
    expect(await vorbildKurve('th', 'gibt-es-nicht')).toBeNull();
    expect(await vorbildKurve('es', 'es-1')).toBeNull();
  });
});
