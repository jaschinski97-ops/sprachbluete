/**
 * NUR TESTDATEN: ein kleiner italienischer Wortsatz (07.11.2026), damit die
 * Tests auch die siebte Lernsprache durchfahren — Karten, Bilder, Clips und
 * die Artikel-Übung „un, uno, una?“ (mit „lo/uno“ und „l’/un’“). Die Begriffe
 * (`concept`) sind dieselben wie im französischen Testsatz.
 *
 * Nicht ausgeliefert: Der echte Wortschatz kommt über den Katalog.
 */
import type { VocabEntry } from '@/data/vocab-types';

const VERMERK = 'Testdaten (Claude), nicht ausgeliefert.';

type Nomen = NonNullable<VocabEntry['italianNoun']>;

function wort(
  id: string,
  concept: string,
  term: string,
  ipa: string,
  silben: string[],
  german: string,
  partOfSpeech: VocabEntry['partOfSpeech'],
  extra: { italianNoun?: Nomen; isConcrete?: boolean; en?: string } = {}
): VocabEntry {
  return {
    id: `it_${id}`,
    language: 'it',
    concept,
    term,
    romanization: ipa,
    syllables: silben.map((roman) => ({ roman })),
    german,
    ...(extra.en ? { translations: { en: extra.en } } : {}),
    ...(extra.italianNoun ? { italianNoun: extra.italianNoun } : {}),
    partOfSpeech,
    register: 'neutral',
    isConcrete: extra.isConcrete ?? false,
    sourceVerified: false,
    verificationNote: VERMERK,
  };
}

const nomen = (gender: 'm' | 'f', article: Nomen['article'], plural: string): Nomen => ({ gender, article, plural });

export const VOCABULARY_IT: VocabEntry[] = [
  wort('ciao', 'sawatdii', 'ciao', 'ˈtʃa.o', ['cia', 'o'], 'Hallo', 'interjection', { en: 'hello' }),
  wort('uno', 'nueng', 'uno', 'ˈuno', ['u', 'no'], 'eins', 'numeral', { en: 'one' }),
  wort('due', 'soong', 'due', 'ˈdue', ['du', 'e'], 'zwei', 'numeral', { en: 'two' }),
  wort('mangiare', 'kin', 'mangiare', 'manˈdʒaːre', ['man', 'gia', 're'], 'essen', 'verb', { en: 'to eat' }),
  wort('andare', 'bpai', 'andare', 'anˈdaːre', ['an', 'da', 're'], 'gehen', 'verb', { en: 'to go' }),
  wort('acqua', 'nam', 'acqua', 'ˈakkwa', ['ac', 'qua'], 'das Wasser', 'noun', { italianNoun: nomen('f', 'l’', 'acque'), isConcrete: true, en: 'water' }),
  wort('riso', 'khaao', 'riso', 'ˈriːzo', ['ri', 'so'], 'der Reis', 'noun', { italianNoun: nomen('m', 'il', '—'), isConcrete: true, en: 'rice' }),
  wort('casa', 'baan', 'casa', 'ˈkaːsa', ['ca', 'sa'], 'das Haus', 'noun', { italianNoun: nomen('f', 'la', 'case'), isConcrete: true, en: 'house' }),
  wort('macchina', 'rot', 'macchina', 'ˈmakkina', ['mac', 'chi', 'na'], 'das Auto', 'noun', { italianNoun: nomen('f', 'la', 'macchine'), isConcrete: true, en: 'car' }),
  wort('mercato', 'talaat', 'mercato', 'merˈkaːto', ['mer', 'ca', 'to'], 'der Markt', 'noun', { italianNoun: nomen('m', 'il', 'mercati'), isConcrete: true, en: 'market' }),
  wort('scuola', 'rongrian', 'scuola', 'ˈskwɔːla', ['scuo', 'la'], 'die Schule', 'noun', { italianNoun: nomen('f', 'la', 'scuole'), isConcrete: true, en: 'school' }),
  wort('amico', 'phuean', 'amico', 'aˈmiːko', ['a', 'mi', 'co'], 'der Freund', 'noun', { italianNoun: nomen('m', 'l’', 'amici'), isConcrete: true, en: 'friend' }),
  wort('gatto', 'maew', 'gatto', 'ˈɡatto', ['gat', 'to'], 'die Katze', 'noun', { italianNoun: nomen('m', 'il', 'gatti'), isConcrete: true, en: 'cat' }),
  wort('zucchero', 'naamtaan', 'zucchero', 'ˈtsukkero', ['zuc', 'che', 'ro'], 'der Zucker', 'noun', { italianNoun: nomen('m', 'lo', '—'), isConcrete: true, en: 'sugar' }),
  wort('libro', 'nangsue', 'libro', 'ˈliːbro', ['li', 'bro'], 'das Buch', 'noun', { italianNoun: nomen('m', 'il', 'libri'), isConcrete: true, en: 'book' }),
];
