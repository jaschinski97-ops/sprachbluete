/**
 * NUR TESTDATEN: ein kleiner portugiesischer Wortsatz (07.11.2026, Brasilien),
 * damit die Tests auch die sechste Lernsprache durchfahren — Karten, Bilder,
 * Clips und die Genus-Übung „um oder uma?“. Die Begriffe (`concept`) sind
 * dieselben wie im französischen Testsatz, damit Bildmotive und Brücken greifen.
 *
 * Nicht ausgeliefert: Der echte Wortschatz kommt über den Katalog.
 */
import type { VocabEntry } from '@/data/vocab-types';

const VERMERK = 'Testdaten (Claude), nicht ausgeliefert.';

type Nomen = NonNullable<VocabEntry['portugueseNoun']>;

function wort(
  id: string,
  concept: string,
  term: string,
  ipa: string,
  silben: string[],
  german: string,
  partOfSpeech: VocabEntry['partOfSpeech'],
  extra: { portugueseNoun?: Nomen; isConcrete?: boolean; en?: string } = {}
): VocabEntry {
  return {
    id: `pt_${id}`,
    language: 'pt',
    concept,
    term,
    romanization: ipa,
    syllables: silben.map((roman) => ({ roman })),
    german,
    ...(extra.en ? { translations: { en: extra.en } } : {}),
    ...(extra.portugueseNoun ? { portugueseNoun: extra.portugueseNoun } : {}),
    partOfSpeech,
    register: 'neutral',
    isConcrete: extra.isConcrete ?? false,
    sourceVerified: false,
    verificationNote: VERMERK,
  };
}

const nomen = (gender: 'm' | 'f', article: 'o' | 'a', plural: string): Nomen => ({ gender, article, plural });

export const VOCABULARY_PT: VocabEntry[] = [
  wort('ola', 'sawatdii', 'olá', 'oˈla', ['o', 'lá'], 'Hallo', 'interjection', { en: 'hello' }),
  wort('um', 'nueng', 'um', 'ũ', ['um'], 'eins', 'numeral', { en: 'one' }),
  wort('dois', 'soong', 'dois', 'dojs', ['dois'], 'zwei', 'numeral', { en: 'two' }),
  wort('comer', 'kin', 'comer', 'koˈmeɾ', ['co', 'mer'], 'essen', 'verb', { en: 'to eat' }),
  wort('ir', 'bpai', 'ir', 'iɾ', ['ir'], 'gehen', 'verb', { en: 'to go' }),
  wort('agua', 'nam', 'água', 'ˈaɡwa', ['á', 'gua'], 'das Wasser', 'noun', { portugueseNoun: nomen('f', 'a', 'águas'), isConcrete: true, en: 'water' }),
  wort('arroz', 'khaao', 'arroz', 'aˈʁos', ['ar', 'roz'], 'der Reis', 'noun', { portugueseNoun: nomen('m', 'o', '—'), isConcrete: true, en: 'rice' }),
  wort('casa', 'baan', 'casa', 'ˈkaza', ['ca', 'sa'], 'das Haus', 'noun', { portugueseNoun: nomen('f', 'a', 'casas'), isConcrete: true, en: 'house' }),
  wort('carro', 'rot', 'carro', 'ˈkaʁu', ['car', 'ro'], 'das Auto', 'noun', { portugueseNoun: nomen('m', 'o', 'carros'), isConcrete: true, en: 'car' }),
  wort('mercado', 'talaat', 'mercado', 'meɾˈkadu', ['mer', 'ca', 'do'], 'der Markt', 'noun', { portugueseNoun: nomen('m', 'o', 'mercados'), isConcrete: true, en: 'market' }),
  wort('escola', 'rongrian', 'escola', 'isˈkɔla', ['es', 'co', 'la'], 'die Schule', 'noun', { portugueseNoun: nomen('f', 'a', 'escolas'), isConcrete: true, en: 'school' }),
  wort('gato', 'maew', 'gato', 'ˈɡatu', ['ga', 'to'], 'die Katze', 'noun', { portugueseNoun: nomen('m', 'o', 'gatos'), isConcrete: true, en: 'cat' }),
  wort('cachorro', 'maa_dog', 'cachorro', 'kaˈʃoʁu', ['ca', 'chor', 'ro'], 'der Hund', 'noun', { portugueseNoun: nomen('m', 'o', 'cachorros'), isConcrete: true, en: 'dog' }),
  wort('cafe', 'kaafae', 'café', 'kaˈfɛ', ['ca', 'fé'], 'der Kaffee', 'noun', { portugueseNoun: nomen('m', 'o', 'cafés'), isConcrete: true, en: 'coffee' }),
  wort('livro', 'nangsue', 'livro', 'ˈlivɾu', ['li', 'vro'], 'das Buch', 'noun', { portugueseNoun: nomen('m', 'o', 'livros'), isConcrete: true, en: 'book' }),
];
