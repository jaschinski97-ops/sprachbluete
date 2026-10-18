import type { LanguageCode } from '@/lib/languages/types';

/**
 * Das lateinische ABC der drei lateinisch geschriebenen Lernsprachen mit den
 * Buchstabennamen — für Kapitel 0 „Grundlagen“ (18.10.2026). Besonders für
 * Lernende mit Thai-Oberfläche ist das der eigentliche Einstieg: Sie kennen
 * die Buchstaben nicht, und beim Buchstabieren („Wie schreibt man das?“)
 * hören sie die NAMEN, nicht die Laute.
 *
 * QUELLEN, über die MediaWiki-API als Rohtext abgerufen am 2026-10-18:
 *   en — en.wikipedia „English alphabet“, Tabelle „Letter names“ (Namen nach
 *        dem Oxford English Dictionary, IPA „Modern English“). Bei Z die
 *        britische Form „zed“ — der Marktdialog zahlt in Pfund; „zee“ steht
 *        als amerikanische Variante dabei.
 *   es — es.wikipedia „Ortografía del español“ (Artikel „Alfabeto español“),
 *        Tabelle „Letras“: der von der ASALE empfohlene Name je Buchstabe.
 *        IPA vereinfacht (ohne Senkungs-/Zahnzeichen, erste Variante).
 *   de — de.wikipedia „Deutsches Alphabet“, Abschnitt „Benennung der
 *        Buchstaben“ (IPA). Ausgeschriebene Namen nennt die Quelle nur für
 *        J (Jot), Y (Ypsilon), Z (Zet/Zett) und ß (Eszett); die übrigen
 *        stehen deshalb ohne ausgeschriebenen Namen, nur mit Lautschrift.
 */

export const ALPHABET_SOURCES: Record<LatinLanguage, { title: string; url: string; retrieved: string }> = {
  en: { title: 'English alphabet', url: 'https://en.wikipedia.org/wiki/English_alphabet', retrieved: '2026-10-18' },
  es: { title: 'Ortografía del español', url: 'https://es.wikipedia.org/wiki/Alfabeto_espa%C3%B1ol', retrieved: '2026-10-18' },
  de: { title: 'Deutsches Alphabet', url: 'https://de.wikipedia.org/wiki/Deutsches_Alphabet', retrieved: '2026-10-18' },
};

export type LatinLanguage = Exclude<LanguageCode, 'th'>;

export type LatinLetter = {
  upper: string;
  lower: string;
  /** Ausgeschriebener Name laut Quelle — `null`, wo die Quelle nur IPA nennt. */
  name: string | null;
  ipa: string;
  /** Was die Systemstimme liest. Englisch/Deutsch: der Buchstabe selbst
   * (Stimmen lesen Einzelbuchstaben mit ihrem Namen; „a“ als Wort klänge
   * falsch). Spanisch: der ASALE-Name, der sich lautgetreu liest. */
  spoken: string;
  /** Regionale Variante, wo die Quelle eine nennt. */
  variant?: string;
};

const letter = (upper: string, name: string | null, ipa: string, spoken: string, variant?: string): LatinLetter => ({
  upper,
  lower: upper === 'ẞ' ? 'ß' : upper.toLowerCase(),
  name,
  ipa,
  spoken,
  ...(variant ? { variant } : {}),
});

const en = (upper: string, name: string, ipa: string, variant?: string) => letter(upper, name, ipa, upper, variant);
const es = (upper: string, name: string, ipa: string) => letter(upper, name, ipa, name);
const de = (upper: string, ipa: string, name: string | null = null) => letter(upper, name, ipa, name ?? upper);

export const LATIN_ALPHABETS: Record<LatinLanguage, readonly LatinLetter[]> = {
  en: [
    en('A', 'a', '/eɪ/'), en('B', 'bee', '/biː/'), en('C', 'cee', '/siː/'), en('D', 'dee', '/diː/'),
    en('E', 'e', '/iː/'), en('F', 'ef', '/ɛf/'), en('G', 'gee', '/dʒiː/'), en('H', 'aitch', '/eɪtʃ/'),
    en('I', 'i', '/aɪ/'), en('J', 'jay', '/dʒeɪ/'), en('K', 'kay', '/keɪ/'), en('L', 'el', '/ɛl/'),
    en('M', 'em', '/ɛm/'), en('N', 'en', '/ɛn/'), en('O', 'o', '/oʊ/'), en('P', 'pee', '/piː/'),
    en('Q', 'cue', '/kjuː/'), en('R', 'ar', '/ɑːr/'), en('S', 'ess', '/ɛs/'), en('T', 'tee', '/tiː/'),
    en('U', 'u', '/juː/'), en('V', 'vee', '/viː/'), en('W', 'double-u', '/ˈdʌbəl.juː/'), en('X', 'ex', '/ɛks/'),
    en('Y', 'wy', '/waɪ/'), en('Z', 'zed', '/zɛd/', 'zee /ziː/'),
  ],
  es: [
    es('A', 'a', '/a/'), es('B', 'be', '/be/'), es('C', 'ce', '/θe/'), es('D', 'de', '/de/'),
    es('E', 'e', '/e/'), es('F', 'efe', '/ˈefe/'), es('G', 'ge', '/xe/'), es('H', 'hache', '/ˈatʃe/'),
    es('I', 'i', '/i/'), es('J', 'jota', '/ˈxota/'), es('K', 'ka', '/ka/'), es('L', 'ele', '/ˈele/'),
    es('M', 'eme', '/ˈeme/'), es('N', 'ene', '/ˈene/'), es('Ñ', 'eñe', '/ˈeɲe/'), es('O', 'o', '/o/'),
    es('P', 'pe', '/pe/'), es('Q', 'cu', '/ku/'), es('R', 'erre', '/ˈere/'), es('S', 'ese', '/ˈese/'),
    es('T', 'te', '/te/'), es('U', 'u', '/u/'), es('V', 'uve', '/ˈuβe/'), es('W', 'uve doble', '/ˈuβe ˈðoβle/'),
    es('X', 'equis', '/ˈekis/'), es('Y', 'ye', '/ʝe/'), es('Z', 'zeta', '/ˈθeta/'),
  ],
  de: [
    de('A', '/aː/'), de('B', '/beː/'), de('C', '/t͡seː/'), de('D', '/deː/'), de('E', '/eː/'), de('F', '/ɛf/'),
    de('G', '/geː/'), de('H', '/haː/'), de('I', '/iː/'), de('J', '/jɔt/', 'Jot'), de('K', '/kaː/'), de('L', '/ɛl/'),
    de('M', '/ɛm/'), de('N', '/ɛn/'), de('O', '/oː/'), de('P', '/peː/'), de('Q', '/kuː/'), de('R', '/ɛʁ/'),
    de('S', '/ɛs/'), de('T', '/teː/'), de('U', '/uː/'), de('V', '/faʊ/'), de('W', '/veː/'), de('X', '/ɪks/'),
    de('Y', '/ˈʏpsilɔn/', 'Ypsilon'), de('Z', '/t͡sɛt/', 'Zett'),
    de('Ä', '/ɛː/'), de('Ö', '/øː/'), de('Ü', '/yː/'), de('ẞ', '/ɛsˈt͡sɛt/', 'Eszett'),
  ],
};

export function isLatinLanguage(language: LanguageCode): language is LatinLanguage {
  return language in LATIN_ALPHABETS;
}

function letterOf(language: LatinLanguage, character: string): LatinLetter | undefined {
  const lower = character.toLowerCase();
  return LATIN_ALPHABETS[language].find((item) => item.lower === lower);
}

/** Lässt sich das Wort mit den Buchstaben dieses ABC buchstabieren (ohne Akzente, Leerzeichen, Bindestriche)? */
export function isSpellable(language: LatinLanguage, word: string): boolean {
  return word.length > 0 && [...word].every((character) => letterOf(language, character) !== undefined);
}

/** Das Wort als Folge von Buchstaben — die Grundlage des Buchstabierens. */
export function spellOut(language: LatinLanguage, word: string): LatinLetter[] {
  return [...word].map((character) => {
    const found = letterOf(language, character);
    if (!found) throw new RangeError(`„${character}“ gehört nicht zum ABC (${language})`);
    return found;
  });
}
