import catalog from '../content/catalog.json';
import type { ContentCatalog } from '@/lib/content/types';
import { romanSyllableProblem, toneOfRoman } from '@/lib/content/thai-romanization';

import { isTeachableNumber, NUMBER_GROUPS, NUMBER_SOURCES, numberWord, priceText, thaiDigits } from './numbers';

// Gegenproben gegen den ECHTEN Katalog (Dialoge und vorhandene Vokabeln),
// wie der Umschrift-Wächtertest.
jest.unmock('../content/catalog.json');

const ALL = [...Array.from({ length: 101 }, (_, value) => value), 1000];
const nfc = (text: string) => text.normalize('NFC');

describe('Kapitel 0: Zahlen aus geprüften Quellen', () => {
  it('nennt für jede Lernsprache Quelle und Abrufdatum', () => {
    for (const source of Object.values(NUMBER_SOURCES)) {
      expect(source.url).toMatch(/^https:\/\/[a-z]{2}\.wikipedia\.org\//);
      expect(source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('Thai folgt den Beispielen der Quelle „Thai numerals“ (et für die Eins, yi für die Zwanzig)', () => {
    const expected: Record<number, string> = {
      0: 'ศูนย์', 1: 'หนึ่ง', 2: 'สอง', 5: 'ห้า', 9: 'เก้า', 10: 'สิบ', 11: 'สิบเอ็ด', 12: 'สิบสอง',
      20: 'ยี่สิบ', 21: 'ยี่สิบเอ็ด', 22: 'ยี่สิบสอง', 30: 'สามสิบ', 31: 'สามสิบเอ็ด', 32: 'สามสิบสอง',
      100: 'หนึ่งร้อย', 1000: 'หนึ่งพัน',
    };
    for (const [value, text] of Object.entries(expected)) expect(numberWord('th', Number(value)).text).toBe(text);
    expect(thaiDigits(50)).toBe('๕๐');
  });

  it('jede Thai-Silbe folgt der Umschrift-Konvention des Katalogs', () => {
    const problems = ALL.flatMap((value) => (numberWord('th', value).roman ?? '').split('-')
      .map((syllable) => [value, syllable, romanSyllableProblem(syllable)] as const)
      .filter(([, , problem]) => problem));
    expect(problems).toEqual([]);
    expect(numberWord('th', 11).roman?.split('-').map(toneOfRoman)).toEqual(['low', 'low']);
  });

  it('stimmt mit den Zahlwörtern überein, die der Katalog schon hat', () => {
    const vocabulary = new Map((catalog as ContentCatalog).entries
      .filter((entry) => entry.kind === 'vocabulary')
      .map((entry) => entry.document as unknown as { language: string; term: string; romanization: string })
      .filter((doc) => doc.language === 'th')
      .map((doc) => [doc.term, nfc(doc.romanization)]));
    const compared = ALL.map((value) => numberWord('th', value)).filter((word) => vocabulary.has(word.text));
    expect(compared.length).toBeGreaterThan(0);
    for (const word of compared) expect(word.roman).toBe(vocabulary.get(word.text));
  });

  it('Preise lauten wie in den A1-Marktdialogen', () => {
    const turns = (catalog as ContentCatalog).entries
      .filter((entry) => entry.kind === 'situations')
      .flatMap((entry) => (entry.document as unknown as { scriptTurns: { targetText?: string; thai: string; roman?: string }[] }).scriptTurns)
      .map((turn) => `${turn.targetText ?? turn.thai} ${nfc(turn.roman ?? '')}`)
      .join('\n');
    for (const value of [10, 50, 90, 100]) {
      const price = priceText('th', value);
      expect(turns).toContain(price.text);
      expect(turns).toContain(price.roman!);
    }
    expect(turns).toContain(priceText('en', 2).text); // „two pounds“
    expect(turns).toContain(priceText('es', 4).text); // „cuatro euros“
    expect(turns).toContain(priceText('de', 4).text); // „vier Euro“
    expect(turns).toContain(priceText('de', 10).text); // „zehn Euro“
  });

  it('setzt Englisch, Spanisch und Deutsch nach den Regeln der Quellen zusammen', () => {
    expect([21, 40, 99, 100].map((value) => numberWord('en', value).text))
      .toEqual(['twenty-one', 'forty', 'ninety-nine', 'one hundred']);
    expect([16, 21, 22, 26, 31, 100, 1000].map((value) => numberWord('es', value).text))
      .toEqual(['dieciséis', 'veintiuno', 'veintidós', 'veintiséis', 'treinta y uno', 'cien', 'mil']);
    expect([16, 17, 21, 30, 60, 70, 99].map((value) => numberWord('de', value).text))
      .toEqual(['sechzehn', 'siebzehn', 'einundzwanzig', 'dreißig', 'sechzig', 'siebzig', 'neunundneunzig']);
  });

  it('kürzt Spanisch uno vor „euro“ und zählt Deutsch „ein Euro“', () => {
    expect([1, 21, 31].map((value) => priceText('es', value).text)).toEqual(['un euro', 'veintiún euros', 'treinta y un euros']);
    expect(priceText('de', 1).text).toBe('ein Euro');
    expect(priceText('en', 1).text).toBe('one pound');
    expect(priceText('th', 50).label).toBe('50 ฿');
  });

  it('lehrt nur 0–100 und 1000 und deckt damit alle Gruppen ab', () => {
    for (const group of NUMBER_GROUPS) expect(group.values.every(isTeachableNumber)).toBe(true);
    expect(() => numberWord('de', 101)).toThrow(RangeError);
  });
});
