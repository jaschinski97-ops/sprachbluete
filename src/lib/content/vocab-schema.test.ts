import type { VocabEntry } from '@/data/vocab-types';
import { UI_LANGUAGES } from '@/lib/i18n/types';
import {
  brauchtNeuesWortformat,
  fehlendeSatzuebersetzungen,
  isValidVocabEntry,
  NEUES_WORTFORMAT_AB,
  pruefeVocabDoc,
} from './vocab-schema';

const satz = Object.fromEntries(UI_LANGUAGES.map((code) => [code, code === 'en' ? 'I eat an apple.' : `Satz (${code})`]));

/** Ein neues KI-Wort im Format seit 24.10.2026. */
const neuesWort = (extra: Partial<VocabEntry> = {}): VocabEntry => ({
  id: 'ki-en-1234abcd',
  generatedAt: NEUES_WORTFORMAT_AB + 1,
  language: 'en',
  concept: 'c:apple',
  term: 'apple',
  romanization: '/ˈæp.əl/',
  german: 'Apfel',
  partOfSpeech: 'noun',
  register: 'neutral',
  isConcrete: true,
  syllables: [{ roman: '/ˈæp.əl/' }] as unknown as VocabEntry['syllables'],
  exampleTerm: 'I eat an apple.',
  exampleRoman: 'ai iːt ən ˈæp.əl',
  exampleGerman: 'Satz (de)',
  exampleTranslations: satz,
  sourceVerified: false,
  verificationNote: 'KI-Erzeugung (Test)',
  ...extra,
});

test('a new KI word with concept and all 20 sentence translations passes', () => {
  const wort = neuesWort();
  expect(brauchtNeuesWortformat(wort)).toBe(true);
  expect(isValidVocabEntry(wort)).toBe(true);
  expect(pruefeVocabDoc(wort)).toEqual({ ok: true, fehler: [] });
});

test('a new KI word without a shared concept is rejected', () => {
  for (const concept of [undefined, 'ki-en-1234abcd', 'apple', 'c:Apple', 'c:']) {
    const wort = neuesWort({ concept });
    expect(isValidVocabEntry(wort)).toBe(false);
    expect(pruefeVocabDoc(wort).fehler.join(' ')).toContain('Begriffskennung');
  }
});

test('an example sentence needs all 20 app languages, the learning language verbatim', () => {
  const { ko: _ko, ...ohneKo } = satz;
  const fehlend = neuesWort({ exampleTranslations: ohneKo });
  expect(fehlendeSatzuebersetzungen(fehlend)).toEqual(['ko']);
  expect(isValidVocabEntry(fehlend)).toBe(false);
  expect(pruefeVocabDoc(fehlend).fehler.join(' ')).toContain('ko');

  expect(isValidVocabEntry(neuesWort({ exampleTranslations: undefined }))).toBe(false);
  expect(fehlendeSatzuebersetzungen({})).toHaveLength(20);

  const abweichend = neuesWort({ exampleTranslations: { ...satz, en: 'Something else.' } });
  expect(isValidVocabEntry(abweichend)).toBe(false);
  expect(pruefeVocabDoc(abweichend).fehler.join(' ')).toContain('Lernsprache');

  // Ohne Beispielsatz braucht es keine Satzübersetzungen.
  const ohneBeispiel = neuesWort({ exampleTerm: undefined, exampleRoman: undefined, exampleGerman: undefined, exampleTranslations: undefined });
  expect(isValidVocabEntry(ohneBeispiel)).toBe(true);
  expect(pruefeVocabDoc(ohneBeispiel).ok).toBe(true);
});

test('sentence translations only accept app languages with text', () => {
  expect(isValidVocabEntry(neuesWort({ exampleTranslations: { ...satz, xx: 'Unbekannt' } as never }))).toBe(false);
  expect(isValidVocabEntry(neuesWort({ exampleTranslations: { ...satz, fr: '  ' } }))).toBe(false);
  expect(isValidVocabEntry(neuesWort({ exampleTranslations: [] as never }))).toBe(false);
});

test('older KI words and fixed entries keep their old form', () => {
  const alt = neuesWort({ generatedAt: NEUES_WORTFORMAT_AB - 1, concept: 'ki-en-1234abcd', exampleTranslations: undefined });
  expect(brauchtNeuesWortformat(alt)).toBe(false);
  expect(isValidVocabEntry(alt)).toBe(true);
  expect(pruefeVocabDoc(alt).ok).toBe(true);

  const fest = neuesWort({ id: 'th-house', concept: 'th-house', exampleTranslations: undefined });
  expect(brauchtNeuesWortformat(fest)).toBe(false);
  expect(isValidVocabEntry(fest)).toBe(true);
});

/** Ein Thai-Wort im Altformat (ohne Satzübersetzungen) für die Ton-Prüfung. */
const thaiWort = (extra: Partial<VocabEntry> = {}): VocabEntry => ({
  id: 'th-sabaai', language: 'th', term: 'สบาย', romanization: 'sà-baai', german: 'bequem',
  partOfSpeech: 'adjective', register: 'neutral', isConcrete: false,
  syllables: [{ roman: 'sà', tone: 'low' }, { roman: 'baai', tone: 'mid' }],
  exampleTerm: 'สบายดีไหม', exampleRoman: 'sà-baai dii mái', exampleGerman: 'Geht es dir gut?',
  sourceVerified: false, verificationNote: 'Test', ...extra,
});

test('Thai tones: script and romanization must agree (Ton-Engine)', () => {
  expect(pruefeVocabDoc(thaiWort())).toEqual({ ok: true, fehler: [] });

  const falsch = pruefeVocabDoc(thaiWort({ romanization: 'sá-baai', syllables: [{ roman: 'sá', tone: 'high' }, { roman: 'baai', tone: 'mid' }] }));
  expect(falsch.ok).toBe(false);
  expect(falsch.fehler.join(' ')).toContain('Schrift ergibt tief, Umschrift hoch');

  const feld = pruefeVocabDoc(thaiWort({ syllables: [{ roman: 'sà', tone: 'high' }, { roman: 'baai', tone: 'mid' }] }));
  expect(feld.fehler.join(' ')).toContain('Ton-Feld hoch, die Umschrift aber tief');

  const satz = pruefeVocabDoc(thaiWort({ exampleRoman: 'sà-baai dìi mái' }));
  expect(satz.fehler.join(' ')).toContain('Beispielsatz');
});

test('Thai tones: uncertain readings are hints, not errors', () => {
  const lehnwort = pruefeVocabDoc(thaiWort({
    term: 'กีตาร์', romanization: 'gii-dtâa', exampleTerm: undefined, exampleRoman: undefined, exampleGerman: undefined,
    syllables: [{ roman: 'gii', tone: 'mid' }, { roman: 'dtâa', tone: 'falling' }],
  }));
  expect(lehnwort.ok).toBe(true);
  expect(lehnwort.hinweise?.join(' ')).toContain('Lehnwort');
  // ไหม als Stichwort im Satz: Projektregel „mái“, „mǎi“ nur als Hinweis.
  const mai = pruefeVocabDoc(thaiWort({ exampleRoman: 'sà-baai dii mǎi' }));
  expect(mai.ok).toBe(true);
  expect(mai.hinweise?.join(' ')).toContain('ไหม');
});
