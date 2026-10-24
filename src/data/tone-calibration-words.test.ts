import { TONE_KEYS, type Tone } from '@/constants/tones';

import { KALIBRIER_WOERTER, kalibrierToneWoerter } from './tone-calibration-words';

// Tonregeln (Haas 1964) als zweite, unabhängige Rechnung für die Einsilber.
const MITTEL = 'กจฎฏดตบปอ';
const HOCH = 'ขฃฉฐถผฝศษสห';
const SONORANT_NACH_HO = 'งญนมยรลว';
const VORANGESTELLT = /^[เแโใไ]+/;

function klasse(term: string): 'mittel' | 'hoch' | 'tief' {
  const rest = term.replace(VORANGESTELLT, '');
  const [erster, zweiter] = rest;
  if (erster === 'ห' && zweiter && SONORANT_NACH_HO.includes(zweiter)) return 'hoch';
  if (MITTEL.includes(erster)) return 'mittel';
  if (HOCH.includes(erster)) return 'hoch';
  return 'tief';
}

function zeichen(term: string): 'ek' | 'tho' | 'tri' | 'chattawa' | null {
  if (term.includes('่')) return 'ek';
  if (term.includes('้')) return 'tho';
  if (term.includes('๊')) return 'tri';
  if (term.includes('๋')) return 'chattawa';
  return null;
}

function regelTon(term: string, lebend: boolean, vokal: 'kurz' | 'lang'): Tone {
  const k = klasse(term);
  const z = zeichen(term);
  if (k === 'mittel') {
    if (z === 'ek') return 'low';
    if (z === 'tho') return 'falling';
    if (z === 'tri') return 'high';
    if (z === 'chattawa') return 'rising';
    return lebend ? 'mid' : 'low';
  }
  if (k === 'hoch') {
    if (z === 'ek') return 'low';
    if (z === 'tho') return 'falling';
    return lebend ? 'rising' : 'low';
  }
  if (z === 'ek') return 'falling';
  if (z === 'tho') return 'high';
  if (lebend) return 'mid';
  return vokal === 'kurz' ? 'high' : 'falling';
}

/** Tonfolge aus den Paiboon-Tonzeichen der Umschrift. */
function romanToene(roman: string): Tone[] {
  return roman.split('-').map((silbe) => {
    const nfd = silbe.normalize('NFD');
    if (nfd.includes('̀')) return 'low';
    if (nfd.includes('̂')) return 'falling';
    if (nfd.includes('́')) return 'high';
    if (nfd.includes('̌')) return 'rising';
    return 'mid';
  });
}

const einsilber = KALIBRIER_WOERTER.filter((wort) => wort.toene.length === 1);

describe('Thai-Kalibriersatz', () => {
  it('hat 40–60 Wörter mit eindeutigen Kennungen und Schreibungen', () => {
    expect(KALIBRIER_WOERTER.length).toBeGreaterThanOrEqual(40);
    expect(KALIBRIER_WOERTER.length).toBeLessThanOrEqual(60);
    expect(new Set(KALIBRIER_WOERTER.map((wort) => wort.id)).size).toBe(KALIBRIER_WOERTER.length);
    expect(new Set(KALIBRIER_WOERTER.map((wort) => wort.term)).size).toBe(KALIBRIER_WOERTER.length);
    for (const wort of KALIBRIER_WOERTER) expect(wort.id).toMatch(/^kal-[a-z]+(-[a-z]+)+$/);
  });

  it('deckt jeden Ton mit mindestens 6 Einsilbern ab', () => {
    for (const ton of TONE_KEYS) {
      expect(einsilber.filter((wort) => wort.toene[0] === ton).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('enthält lebende und tote, kurze und lange Silben', () => {
    const lebendKurz = einsilber.filter((w) => w.silbe?.lebend && w.silbe.vokal === 'kurz');
    const lebendLang = einsilber.filter((w) => w.silbe?.lebend && w.silbe.vokal === 'lang');
    const totKurz = einsilber.filter((w) => w.silbe && !w.silbe.lebend && w.silbe.vokal === 'kurz');
    const totLang = einsilber.filter((w) => w.silbe && !w.silbe.lebend && w.silbe.vokal === 'lang');
    for (const gruppe of [lebendKurz, lebendLang, totKurz, totLang]) expect(gruppe.length).toBeGreaterThanOrEqual(3);
    // Tote Silben tragen nie mittleren oder steigenden Ton.
    for (const wort of [...totKurz, ...totLang]) expect(['low', 'falling', 'high']).toContain(wort.toene[0]);
  });

  it('jeder Einsilber trägt Silbenangaben; tote Silben enden auf Verschluss oder kurzem -a', () => {
    for (const wort of einsilber) {
      expect(wort.silbe).toBeDefined();
      // Der Anlaut allein (ใจ) ist kein Auslaut.
      const rest = wort.term.replace(VORANGESTELLT, '');
      const totEndung = /ะ$/.test(rest) || (rest.length > 1 && /[กขคฆจชซดตถทธบปพภศษสฎฏ]$/.test(rest));
      expect({ term: wort.term, tot: totEndung }).toEqual({ term: wort.term, tot: !wort.silbe!.lebend });
    }
  });

  it('Einsilber: eingetragener Ton = Ton aus den Regeln der Schrift', () => {
    for (const wort of einsilber) {
      expect({ term: wort.term, ton: regelTon(wort.term, wort.silbe!.lebend, wort.silbe!.vokal) })
        .toEqual({ term: wort.term, ton: wort.toene[0] });
    }
  });

  it('Umschrift und Tonfolge passen zueinander (auch bei Mehrsilbern)', () => {
    for (const wort of KALIBRIER_WOERTER) {
      expect({ term: wort.term, toene: romanToene(wort.roman) }).toEqual({ term: wort.term, toene: wort.toene });
    }
    expect(KALIBRIER_WOERTER.filter((wort) => wort.toene.length >= 2).length).toBeGreaterThanOrEqual(8);
    expect(KALIBRIER_WOERTER.some((wort) => wort.toene.length === 3)).toBe(true);
  });

  it('enthält die verlangten Minimalpaare', () => {
    const gruppe = (name: string) => KALIBRIER_WOERTER.filter((w) => w.gruppe === name).map((w) => w.term).sort();
    expect(gruppe('gai-khai')).toEqual(['ไก่', 'ไข่'].sort());
    expect(gruppe('glai')).toEqual(['ใกล้', 'ไกล'].sort());
    expect(gruppe('maa')).toEqual(['ม้า', 'มา', 'หมา'].sort());
    expect(gruppe('mai')).toEqual(['ไม่', 'ใหม่', 'ไม้', 'ไหม'].sort());
    // Minimalgruppen (außer ไก่/ไข่) unterscheiden sich wirklich im Ton.
    for (const name of ['glai', 'maa', 'mai', 'khaao', 'sua', 'bpaa']) {
      const toene = KALIBRIER_WOERTER.filter((w) => w.gruppe === name).map((w) => w.toene[0]);
      expect(new Set(toene).size).toBe(toene.length);
    }
  });

  it('liefert dem Ton-Gate geprüfte Silbentöne', () => {
    const woerter = kalibrierToneWoerter();
    expect(woerter).toHaveLength(KALIBRIER_WOERTER.length);
    expect(woerter.every((wort) => wort.sourceVerified && wort.syllables?.every((s) => s.tone))).toBe(true);
  });
});
