import { TONE_KEYS, type Tone } from '@/constants/tones';
import { isTeachableNumber, numberWord } from '@/data/numbers';
import { SATZ_FORM, THAI_TON_GOLD_SAETZE, THAI_TON_GOLD_WOERTER } from '@/test-fixtures/thai-tone-gold';
import { TON_AUSNAHMEN } from './tone-exceptions';
import { pruefeThaiTon, romanSilben, setzeTon, type TonStatus } from './tone-rules';

/**
 * Goldstandard (Quellen siehe `test-fixtures/thai-tone-gold.ts`): Die Engine
 * muss die belegten Töne bestätigen — und absichtlich verfälschte erkennen.
 */

const GOLD = new Map(THAI_TON_GOLD_WOERTER.map(([thai, roman]) => [thai, roman]));
const zaehle = (status: TonStatus[]) => ({
  ok: status.filter((s) => s === 'ok').length,
  widerspruch: status.filter((s) => s === 'widerspruch').length,
  unsicher: status.filter((s) => s === 'unsicher').length,
});
const mitAusnahme = (thai: string) => TON_AUSNAHMEN.some((a) => thai.includes(a.thai));

/** Ein Ton an Silbe `index` verschoben (Umschrift mit falschem Ton). */
function verfaelscht(roman: string, index: number): string {
  let n = 0;
  return roman.replace(/[\p{L}\p{M}]+/gu, (silbe) => {
    if (n++ !== index) return silbe;
    const ton = romanSilben(silbe)[0].ton as Tone;
    return setzeTon(silbe, TONE_KEYS[(TONE_KEYS.indexOf(ton) + 1) % TONE_KEYS.length]);
  });
}

describe('Goldstandard Wörter (Wiktionary)', () => {
  const befunde = THAI_TON_GOLD_WOERTER.map(([thai, roman]) => ({ thai, roman, befund: pruefeThaiTon(thai, roman) }));

  it('umfasst mindestens 300 Wörter', () => {
    expect(THAI_TON_GOLD_WOERTER.length).toBeGreaterThanOrEqual(300);
  });

  it('bestätigt die belegten Töne: kein Widerspruch, ≥ 99 % übereinstimmend', () => {
    const z = zaehle(befunde.map((b) => b.befund.status));
    expect(befunde.filter((b) => b.befund.status === 'widerspruch').map((b) => b.thai)).toEqual([]);
    expect(z.ok / befunde.length).toBeGreaterThanOrEqual(0.99);
    // Bekannt unsicher: Pali-Wort mit Bindesilbe ohne Klassenübertragung.
    expect(befunde.filter((b) => b.befund.status === 'unsicher').map((b) => b.thai)).toEqual(['ไปรษณีย์']);
  });

  it('auch ohne Ausnahmeliste trägt die Regel: ≥ 99 % der übrigen Wörter', () => {
    const regel = befunde.filter((b) => !mitAusnahme(b.thai));
    expect(regel.length).toBeGreaterThanOrEqual(450);
    expect(zaehle(regel.map((b) => b.befund.status)).ok / regel.length).toBeGreaterThanOrEqual(0.99);
  });

  it('erkennt verfälschte Töne (je Wort jede Silbe einmal verschoben)', () => {
    const status: TonStatus[] = [];
    for (const [thai, roman] of THAI_TON_GOLD_WOERTER) {
      romanSilben(roman).forEach((_, index) => status.push(pruefeThaiTon(thai, verfaelscht(roman, index)).status));
    }
    const z = zaehle(status);
    expect(status.length).toBeGreaterThan(800);
    // Keine falsche Silbe darf als „ok“ durchgehen, die allermeisten sind klare Widersprüche.
    expect(z.ok).toBeLessThanOrEqual(Math.ceil(status.length * 0.01));
    expect(z.widerspruch / status.length).toBeGreaterThanOrEqual(0.97);
  });
});

describe('Goldstandard Zahlen (data/numbers.ts, Wikipedia „Thai numerals“)', () => {
  const werte = Array.from({ length: 1001 }, (_, n) => n).filter(isTeachableNumber);
  it.each(werte)('%i', (wert) => {
    const zahl = numberWord('th', wert);
    expect(pruefeThaiTon(zahl.text, zahl.roman!).status).toBe('ok');
  });
});

describe('Goldstandard Sätze (aus belegten Wörtern)', () => {
  it('umfasst mindestens 50 Sätze aus belegten Wörtern', () => {
    expect(THAI_TON_GOLD_SAETZE.length).toBeGreaterThanOrEqual(50);
    const fehlend = THAI_TON_GOLD_SAETZE.flat().filter((wort) => !GOLD.has(wort));
    expect(fehlend).toEqual([]);
  });

  it.each(THAI_TON_GOLD_SAETZE.map((woerter) => [woerter.join(''), woerter]))('%s', (_, woerter) => {
    const thai = (woerter as string[]).join('');
    const roman = (woerter as string[]).map((wort) => SATZ_FORM[wort] ?? GOLD.get(wort)).join(' ');
    const befund = pruefeThaiTon(thai, roman, { kontext: 'satz' });
    expect([thai, roman, befund.status, befund.grund]).toEqual([thai, roman, 'ok', undefined]);
    // Und mit verfälschter letzter Silbe kein „ok“ mehr.
    const n = romanSilben(roman).length - 1;
    expect(pruefeThaiTon(thai, verfaelscht(roman, n), { kontext: 'satz' }).status).not.toBe('ok');
  });
});
