import type { Tone } from '@/constants/tones';
import { KALIBRIER_WOERTER } from '@/data/tone-calibration-words';

import {
  kalibrierBericht, type KalibrierMessung, type KalibrierStatus, STIMM_REFERENZ_FORMAT, stimmBericht, stimmReferenz, type StimmLauf,
} from './tone-calibration';

// Testdaten: Konturform je Ton (Halbtöne zur Clip-Referenz) und Lage der
// Clip-Referenz über/unter dem Stimm-Median.
const FORM: Record<Tone, number[]> = {
  mid: [0.3, 0.2, 0, 0, -0.2, -0.4],
  low: [0.5, 0.2, 0, -0.2, -0.5, -0.8],
  falling: [0, 1.5, 2, 1, -2, -4],
  high: [-0.5, -0.3, 0, 0.3, 0.8, 1.2],
  rising: [-1, -1.5, -1.2, 0, 2, 4],
};
const LAGE: Record<Tone, number> = { mid: 0, low: -3, falling: 2, high: 3, rising: 0 };

function messung(wortId: string, ton: Tone, status: KalibrierStatus, basisHz: number): KalibrierMessung {
  const referenzHz = basisHz * 2 ** (LAGE[ton] / 12);
  return {
    wortId, status, referenzHz, pts: FORM[ton],
    spanHz: FORM[ton].map((p) => referenzHz * 2 ** (p / 12)),
  };
}

function lauf(stimme: string, statusFuer: (ton: Tone, silben: number) => KalibrierStatus, basisHz = 200): StimmLauf {
  return {
    stimme, model: 'gemini-3.8-flash-tts', instructionsId: 'th-ton-gemini-1',
    messungen: KALIBRIER_WOERTER.map((wort) => messung(wort.id, wort.toene[0], statusFuer(wort.toene[0], wort.toene.length), basisHz)),
  };
}

// Gute Stimme: einsilbig mittel/tief ungeprüft (wie in echt), sonst bestanden.
const gut = lauf('Kore', (ton, silben) => (silben === 1 && (ton === 'mid' || ton === 'low') ? 'unchecked' : 'passed'));
// Schwache Stimme: fallend und steigend werden verworfen.
const schwach = lauf('Puck', (ton) => (ton === 'falling' || ton === 'rising' ? 'failed' : 'passed'), 120);

describe('Kalibrierbericht je Stimme', () => {
  it('zählt bestanden/verworfen/ungeprüft je Ton (Einsilber) und für Mehrsilber', () => {
    const bericht = stimmBericht(gut);
    expect(bericht.gesamt.n).toBe(KALIBRIER_WOERTER.length);
    const einsilberMit = (ton: Tone) => KALIBRIER_WOERTER.filter((w) => w.toene.length === 1 && w.toene[0] === ton).length;
    expect(bericht.jeTon.mid).toEqual({ n: einsilberMit('mid'), bestanden: 0, verworfen: 0, ungeprueft: einsilberMit('mid'), fehlt: 0 });
    expect(bericht.jeTon.falling.bestanden).toBe(einsilberMit('falling'));
    expect(bericht.mehrsilber.n).toBe(KALIBRIER_WOERTER.filter((w) => w.toene.length > 1).length);
    expect(bericht.mehrsilber.bestanden).toBe(bericht.mehrsilber.n);
    expect(bericht.geeignet).toBe(true);
    expect(bericht.hinweise).toEqual([]);
  });

  it('misst Stimmlage und Trennschärfe', () => {
    const bericht = stimmBericht(gut);
    expect(bericht.stimmlage!.medianHz).toBeGreaterThan(190);
    expect(bericht.stimmlage!.medianHz).toBeLessThan(215);
    expect(bericht.stimmlage!.p10Hz).toBeLessThan(bericht.stimmlage!.medianHz);
    expect(bericht.stimmlage!.p90Hz).toBeGreaterThan(bericht.stimmlage!.medianHz);
    expect(bericht.stimmlage!.spannweiteHalbtoene).toBeGreaterThan(3);
    // Tief liegt in den Testdaten 3 Halbtöne unter mittel, fallend hat den Bauch.
    expect(bericht.trennung.tiefUnterMittel).toBe(1);
    expect(bericht.trennung.fallendGegenMittel).toBe(1);
  });

  it('wertet fehlende Clips als „fehlt“ und warnt ab 20 %', () => {
    const halb: StimmLauf = { ...gut, messungen: gut.messungen.slice(0, 20) };
    const bericht = stimmBericht(halb);
    expect(bericht.gesamt.fehlt).toBe(KALIBRIER_WOERTER.length - 20);
    expect(bericht.geeignet).toBe(false);
    expect(bericht.hinweise.join(' ')).toMatch(/fehlen/);
  });

  it('meldet eine Stimme, die fallend/steigend verwirft, als ungeeignet', () => {
    const bericht = stimmBericht(schwach);
    expect(bericht.gesamt.verworfen).toBeGreaterThan(0);
    expect(bericht.geeignet).toBe(false);
    expect(bericht.hinweise.join(' ')).toMatch(/Schwach bei: falling, rising/);
    expect(bericht.punkte).toBeLessThan(stimmBericht(gut).punkte);
  });
});

describe('Empfehlung', () => {
  const jetzt = new Date('2026-10-24T12:00:00Z');

  it('empfiehlt die beste geeignete Stimme', () => {
    const bericht = kalibrierBericht([schwach, gut], { jetzt, toneGateVersion: 'f0-syllables-5' });
    expect(bericht.stimmen.map((s) => s.stimme)).toEqual(['Kore', 'Puck']);
    expect(bericht.empfehlung.stimme).toBe('Kore');
    expect(bericht.empfehlung.text).toMatch(/^Empfehlung für den großen Lauf: Kore — \d+\/60 bestanden, 0 verworfen/);
    expect(bericht.erstelltAm).toBe('2026-10-24T12:00:00.000Z');
    expect(bericht.toneGateVersion).toBe('f0-syllables-5');
  });

  it('bei Gleichstand entscheidet die Trennschärfe', () => {
    const verwischt: StimmLauf = {
      ...gut, stimme: 'Leda',
      // Tief endet hier höher als mittel: gleiche Gate-Zahlen, schlechtere Trennung.
      messungen: gut.messungen.map((m) => {
        const wort = KALIBRIER_WOERTER.find((w) => w.id === m.wortId)!;
        return wort.toene[0] === 'low' ? { ...m, referenzHz: 230 } : m;
      }),
    };
    expect(kalibrierBericht([verwischt, gut], { jetzt }).empfehlung.stimme).toBe('Kore');
  });

  it('empfiehlt keine Stimme, wenn alle zu viel verwerfen', () => {
    const bericht = kalibrierBericht([schwach], { jetzt });
    expect(bericht.empfehlung.stimme).toBeNull();
    expect(bericht.empfehlung.text).toMatch(/Keine Stimme ist für den großen Lauf geeignet \(beste: Puck/);
    expect(kalibrierBericht([], { jetzt }).empfehlung).toEqual({ stimme: null, text: 'Noch keine Kalibrierclips vorhanden.' });
  });

  it('sagt dazu, wenn nur eine Stimme gemessen wurde', () => {
    expect(kalibrierBericht([gut], { jetzt }).empfehlung.text).toMatch(/Nur diese Stimme wurde gemessen\.$/);
  });
});

describe('Stimm-Referenz', () => {
  it('legt Median, Spannweite und Lage je Ton relativ zum Stimm-Median ab', () => {
    const referenz = stimmReferenz(gut, { jetzt: new Date('2026-10-24T12:00:00Z'), toneGateVersion: 'f0-syllables-5' })!;
    expect(referenz.format).toBe(STIMM_REFERENZ_FORMAT);
    expect(referenz).toMatchObject({
      provider: 'gemini', model: 'gemini-3.8-flash-tts', voice: 'Kore', instructionsId: 'th-ton-gemini-1',
      satzVersion: 'th-kalibrierung-1', toneGateVersion: 'f0-syllables-5', gemessenAm: '2026-10-24T12:00:00.000Z',
      clips: KALIBRIER_WOERTER.length,
    });
    for (const ton of ['mid', 'low', 'falling', 'high', 'rising'] as Tone[]) {
      expect(referenz.toene[ton]!.kontur).toHaveLength(6);
      expect(referenz.toene[ton]!.n).toBe(KALIBRIER_WOERTER.filter((w) => w.toene.length === 1 && w.toene[0] === ton).length);
    }
    expect(referenz.toene.low!.mittel).toBeLessThan(referenz.toene.mid!.mittel);
    expect(referenz.toene.falling!.anfang - referenz.toene.falling!.ende).toBeGreaterThan(3);
    expect(referenz.toene.rising!.ende - referenz.toene.rising!.anfang).toBeGreaterThan(3);
  });

  it('lässt verworfene Clips aus der Lage je Ton heraus', () => {
    const referenz = stimmReferenz(schwach)!;
    expect(referenz.toene.falling).toBeNull();
    expect(referenz.toene.rising).toBeNull();
    expect(referenz.toene.mid!.n).toBeGreaterThan(0);
  });

  it('gibt ohne Messungen keine Referenz', () => {
    expect(stimmReferenz({ stimme: 'Kore', messungen: [] })).toBeNull();
  });
});
