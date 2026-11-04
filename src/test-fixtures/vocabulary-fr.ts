/**
 * NUR TESTDATEN: ein kleiner französischer Wortsatz (04.11.2026), damit die
 * Tests auch die fünfte Lernsprache durchfahren — Karten, Bilder, Clips und
 * die Genus-Übung „un oder une?“. Die Begriffe (`concept`) sind dieselben wie
 * im Thai-/Spanisch-Grundstock, damit Bildmotive und Brücken greifen.
 *
 * Nicht ausgeliefert: Der echte französische Wortschatz kommt wie bei den
 * anderen Sprachen über den Katalog.
 */
import type { VocabEntry } from '@/data/vocab-types';

const VERMERK = 'Testdaten (Claude), nicht ausgeliefert.';

type Nomen = { gender: 'm' | 'f'; article: 'le' | 'la' | 'l’'; plural: string };

function wort(
  id: string,
  concept: string,
  term: string,
  ipa: string,
  silben: string[],
  german: string,
  partOfSpeech: VocabEntry['partOfSpeech'],
  extra: { frenchNoun?: Nomen; isConcrete?: boolean; en?: string } = {}
): VocabEntry {
  return {
    id: `fr_${id}`,
    language: 'fr',
    concept,
    term,
    romanization: ipa,
    syllables: silben.map((roman) => ({ roman })),
    german,
    ...(extra.en ? { translations: { en: extra.en } } : {}),
    ...(extra.frenchNoun ? { frenchNoun: extra.frenchNoun } : {}),
    partOfSpeech,
    register: 'neutral',
    isConcrete: extra.isConcrete ?? false,
    sourceVerified: false,
    verificationNote: VERMERK,
  };
}

const nomen = (gender: 'm' | 'f', article: 'le' | 'la' | 'l’', plural: string): Nomen => ({ gender, article, plural });

export const VOCABULARY_FR: VocabEntry[] = [
  wort('bonjour', 'sawatdii', 'bonjour', 'bɔ̃ʒuʁ', ['bon', 'jour'], 'Guten Tag', 'interjection', { en: 'hello' }),
  wort('un', 'nueng', 'un', 'œ̃', ['un'], 'eins', 'numeral', { en: 'one' }),
  wort('deux', 'soong', 'deux', 'dø', ['deux'], 'zwei', 'numeral', { en: 'two' }),
  wort('trois', 'saam', 'trois', 'tʁwa', ['trois'], 'drei', 'numeral', { en: 'three' }),
  wort('manger', 'kin', 'manger', 'mɑ̃ʒe', ['man', 'ger'], 'essen', 'verb', { en: 'to eat' }),
  wort('aller', 'bpai', 'aller', 'ale', ['al', 'ler'], 'gehen', 'verb', { en: 'to go' }),
  wort('eau', 'nam', 'eau', 'o', ['eau'], 'das Wasser', 'noun', { frenchNoun: nomen('f', 'l’', 'eaux'), isConcrete: true, en: 'water' }),
  wort('riz', 'khaao', 'riz', 'ʁi', ['riz'], 'der Reis', 'noun', { frenchNoun: nomen('m', 'le', '—'), isConcrete: true, en: 'rice' }),
  wort('maison', 'baan', 'maison', 'mɛzɔ̃', ['mai', 'son'], 'das Haus', 'noun', { frenchNoun: nomen('f', 'la', 'maisons'), isConcrete: true, en: 'house' }),
  wort('voiture', 'rot', 'voiture', 'vwatyʁ', ['voi', 'ture'], 'das Auto', 'noun', { frenchNoun: nomen('f', 'la', 'voitures'), isConcrete: true, en: 'car' }),
  wort('marche', 'talaat', 'marché', 'maʁʃe', ['mar', 'ché'], 'der Markt', 'noun', { frenchNoun: nomen('m', 'le', 'marchés'), isConcrete: true, en: 'market' }),
  wort('ecole', 'rongrian', 'école', 'ekɔl', ['é', 'cole'], 'die Schule', 'noun', { frenchNoun: nomen('f', 'l’', 'écoles'), isConcrete: true, en: 'school' }),
  wort('ami', 'phuean', 'ami', 'ami', ['a', 'mi'], 'der Freund', 'noun', { frenchNoun: nomen('m', 'l’', 'amis'), isConcrete: true, en: 'friend' }),
  wort('chat', 'maew', 'chat', 'ʃa', ['chat'], 'die Katze', 'noun', { frenchNoun: nomen('m', 'le', 'chats'), isConcrete: true, en: 'cat' }),
  wort('chien', 'maa_dog', 'chien', 'ʃjɛ̃', ['chien'], 'der Hund', 'noun', { frenchNoun: nomen('m', 'le', 'chiens'), isConcrete: true, en: 'dog' }),
  wort('cafe', 'kaafae', 'café', 'kafe', ['ca', 'fé'], 'der Kaffee', 'noun', { frenchNoun: nomen('m', 'le', 'cafés'), isConcrete: true, en: 'coffee' }),
  wort('livre', 'nangsue', 'livre', 'livʁ', ['livre'], 'das Buch', 'noun', { frenchNoun: nomen('m', 'le', 'livres'), isConcrete: true, en: 'book' }),
];
