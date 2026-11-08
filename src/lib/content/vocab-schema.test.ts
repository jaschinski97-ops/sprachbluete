import type { VocabEntry } from '@/data/vocab-types';
import { UI_LANGUAGES } from '@/lib/i18n/types';
import {
  brauchtNeuesWortformat,
  fehlendeSatzuebersetzungen,
  isValidVocabEntry,
  NEUES_WORTFORMAT_AB,
  pruefeVocabDoc,
  vocabSchluessel,
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

test('an example sentence needs all app languages, the learning language verbatim', () => {
  const { pt: _pt, ...ohnePt } = satz;
  const fehlend = neuesWort({ exampleTranslations: ohnePt });
  expect(fehlendeSatzuebersetzungen(fehlend)).toEqual(['pt']);
  expect(isValidVocabEntry(fehlend)).toBe(false);
  expect(pruefeVocabDoc(fehlend).fehler.join(' ')).toContain('pt');

  expect(isValidVocabEntry(neuesWort({ exampleTranslations: undefined }))).toBe(false);
  expect(fehlendeSatzuebersetzungen({})).toHaveLength(UI_LANGUAGES.length);

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

/** Ein französisches Nomen (04.11.2026): Genus über `frenchNoun`. */
const franzWort = (extra: Partial<VocabEntry> = {}): VocabEntry => neuesWort({
  id: 'ki-fr-water',
  language: 'fr',
  concept: 'c:water',
  term: 'eau',
  romanization: '/o/',
  syllables: [{ roman: '/o/' }] as unknown as VocabEntry['syllables'],
  exampleTerm: 'Je bois de l’eau.',
  exampleRoman: 'Je bois de l’eau.',
  exampleTranslations: { ...satz, fr: 'Je bois de l’eau.' },
  frenchNoun: { gender: 'f', article: 'l’', plural: 'eaux' },
  ...extra,
});

test('French nouns need genus; plural-only words carry the article in the word', () => {
  expect(pruefeVocabDoc(franzWort())).toEqual({ ok: true, fehler: [] });
  expect(pruefeVocabDoc(franzWort({ frenchNoun: undefined })).fehler).toContain('Französisches Substantiv ohne Genus/Artikel.');
  expect(pruefeVocabDoc(franzWort({ term: 'les gens', frenchNoun: undefined })).ok).toBe(true);
  // Nur Nomen: Verben und Wendungen kommen ohne Genus aus.
  expect(pruefeVocabDoc(franzWort({ term: 'à la maison', partOfSpeech: 'adverb', frenchNoun: undefined })).ok).toBe(true);
});

test('French article must match genus and the first letter', () => {
  const fehler = (term: string, frenchNoun: VocabEntry['frenchNoun']) => pruefeVocabDoc(franzWort({ term, frenchNoun })).fehler;
  expect(fehler('maison', { gender: 'm', article: 'la', plural: 'maisons' }).join(' ')).toContain('„la“ bei männlichem');
  expect(fehler('chat', { gender: 'f', article: 'le', plural: 'chats' }).join(' ')).toContain('„le“ bei weiblichem');
  expect(fehler('chat', { gender: 'm', article: 'l’', plural: 'chats' }).join(' ')).toContain('vor Konsonant');
  expect(fehler('école', { gender: 'f', article: 'la', plural: 'écoles' }).join(' ')).toContain('vor Vokal');
  // h aspiré („la hanche“) und stummes h („l’heure“) sind beide richtig.
  expect(fehler('hanche', { gender: 'f', article: 'la', plural: 'hanches' })).toEqual([]);
  expect(fehler('heure', { gender: 'f', article: 'l’', plural: 'heures' })).toEqual([]);
});

test('French genus field must have the right shape', () => {
  expect(isValidVocabEntry(franzWort())).toBe(true);
  expect(isValidVocabEntry(franzWort({ frenchNoun: { gender: 'n', article: 'le', plural: 'x' } as never }))).toBe(false);
  expect(isValidVocabEntry(franzWort({ frenchNoun: { gender: 'm', article: 'les', plural: 'x' } as never }))).toBe(false);
  expect(isValidVocabEntry(franzWort({ frenchNoun: 'm' as never }))).toBe(false);
});

/** Portugiesische und italienische Nomen (07.11.2026): Genus über `portugueseNoun` / `italianNoun`. */
const portWort = (extra: Partial<VocabEntry> = {}): VocabEntry => neuesWort({
  id: 'ki-pt-water',
  language: 'pt',
  concept: 'c:water',
  term: 'água',
  romanization: 'ˈaɡwa',
  syllables: [{ roman: 'á' }, { roman: 'gua' }] as unknown as VocabEntry['syllables'],
  exampleTerm: 'Eu bebo água.',
  exampleRoman: 'Eu bebo água.',
  exampleTranslations: { ...satz, pt: 'Eu bebo água.' },
  portugueseNoun: { gender: 'f', article: 'a', plural: 'águas' },
  ...extra,
});

const italWort = (extra: Partial<VocabEntry> = {}): VocabEntry => neuesWort({
  id: 'ki-it-water',
  language: 'it',
  concept: 'c:water',
  term: 'acqua',
  romanization: 'ˈakkwa',
  syllables: [{ roman: 'ac' }, { roman: 'qua' }] as unknown as VocabEntry['syllables'],
  exampleTerm: 'Bevo acqua.',
  exampleRoman: 'Bevo acqua.',
  // Italienisch ist seit 07.11.2026 auch App-Sprache: die it-Zeile ist der Satz selbst.
  exampleTranslations: { ...satz, it: 'Bevo acqua.' },
  italianNoun: { gender: 'f', article: 'l’', plural: 'acque' },
  ...extra,
});

test('Portuguese nouns need genus, and o/a must match it', () => {
  expect(pruefeVocabDoc(portWort())).toEqual({ ok: true, fehler: [] });
  expect(pruefeVocabDoc(portWort({ portugueseNoun: undefined })).fehler).toContain('Portugiesisches Substantiv ohne Genus/Artikel.');
  expect(pruefeVocabDoc(portWort({ term: 'os óculos', portugueseNoun: undefined })).ok).toBe(true);
  expect(pruefeVocabDoc(portWort({ portugueseNoun: { gender: 'f', article: 'o', plural: 'águas' } })).ok).toBe(false);
  expect(isValidVocabEntry(portWort({ portugueseNoun: { gender: 'f', article: 'la', plural: 'x' } as never }))).toBe(false);
});

test('Italian article follows genus and the first letters (il/lo/la/l’)', () => {
  const fehler = (term: string, italianNoun: VocabEntry['italianNoun']) => pruefeVocabDoc(italWort({ term, italianNoun })).fehler;
  expect(pruefeVocabDoc(italWort())).toEqual({ ok: true, fehler: [] });
  expect(fehler('libro', { gender: 'm', article: 'il', plural: 'libri' })).toEqual([]);
  expect(fehler('studente', { gender: 'm', article: 'lo', plural: 'studenti' })).toEqual([]);
  expect(fehler('zaino', { gender: 'm', article: 'lo', plural: 'zaini' })).toEqual([]);
  expect(fehler('albero', { gender: 'm', article: 'l’', plural: 'alberi' })).toEqual([]);
  // i + Vokal ist kein Vokalanlaut: „lo iodio“.
  expect(fehler('iodio', { gender: 'm', article: 'lo', plural: '—' })).toEqual([]);
  expect(fehler('studente', { gender: 'm', article: 'il', plural: 'studenti' }).join(' ')).toContain('„lo“ statt „il“');
  expect(fehler('libro', { gender: 'm', article: 'lo', plural: 'libri' }).join(' ')).toContain('„il“ statt „lo“');
  expect(fehler('casa', { gender: 'm', article: 'la', plural: 'case' }).join(' ')).toContain('bei männlichem');
  expect(fehler('amica', { gender: 'f', article: 'la', plural: 'amiche' }).join(' ')).toContain('vor Vokal');
  expect(fehler('libro', { gender: 'm', article: 'l’', plural: 'libri' }).join(' ')).toContain('vor Konsonant');
  expect(pruefeVocabDoc(italWort({ term: 'gli occhiali', italianNoun: undefined })).ok).toBe(true);
  expect(isValidVocabEntry(italWort({ italianNoun: { gender: 'm', article: 'le', plural: 'x' } as never }))).toBe(false);
});

const chinWort = (extra: Partial<VocabEntry> = {}): VocabEntry => neuesWort({
  id: 'ki-zh-book',
  language: 'zh',
  concept: 'c:book',
  term: '书',
  romanization: 'shū',
  syllables: [{ roman: 'shū' }] as unknown as VocabEntry['syllables'],
  exampleTerm: '我有一本书。',
  exampleRoman: 'Wǒ yǒu yì běn shū.',
  exampleTranslations: { ...satz },
  chineseNoun: { measureWord: '本' },
  ...extra,
});

test('Chinese words need characters, pinyin with tone marks and a known measure word', () => {
  // Die zh-Satzübersetzung ist die App-Sprache Chinesisch und muss dem Beispielsatz gleichen.
  const ok = chinWort({ exampleTranslations: { ...satz, zh: '我有一本书。' } });
  expect(pruefeVocabDoc(ok)).toEqual({ ok: true, fehler: [] });
  expect(pruefeVocabDoc(chinWort({ term: 'shu', exampleTranslations: { ...satz, zh: '我有一本书。' } })).fehler.join(' ')).toContain('ohne Schriftzeichen');
  expect(pruefeVocabDoc({ ...ok, romanization: 'shu1' }).fehler.join(' ')).toContain('Tonziffern');
  expect(pruefeVocabDoc({ ...ok, romanization: '' }).fehler).toContain('Chinesisches Wort ohne Pinyin.');
  expect(pruefeVocabDoc({ ...ok, romanization: "xīngqī'èr" }).ok).toBe(true);
  expect(pruefeVocabDoc({ ...ok, chineseNoun: { measureWord: '书' } }).fehler.join(' ')).toContain('Unbekanntes Zählwort');
  expect(isValidVocabEntry({ ...ok, chineseNoun: { measureWord: 3 } as never })).toBe(false);
  // Leerzeichen machen in eigener Schrift kein neues Wort.
  expect(vocabSchluessel('你 好', 'zh')).toBe(vocabSchluessel('你好', 'zh'));
});
