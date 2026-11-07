import type { LanguageCode } from '@/lib/languages/types';

/**
 * Das lateinische ABC der lateinisch geschriebenen Lernsprachen mit den
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
 *   fr — fr.wikipedia „Alphabet du français“, Tabelle „Prononciation“ (Spalte
 *        „Nom“ und IPA), abgerufen am 2026-11-04. Nur die 26 Grundbuchstaben:
 *        Die Buchstaben mit Diakritikum und die Ligaturen sind laut Quelle
 *        „non comptées séparément dans l’alphabet“. Wörter mit Akzent lassen
 *        sich deshalb nicht buchstabieren (`isSpellable`) und fehlen in der
 *        Buchstabier-Übung.
 *   pt — pt.wikipedia „Alfabeto português“, Abschnitt „Nomes das letras e
 *        representações fonéticas“ (26 Buchstaben nach dem Acordo Ortográfico
 *        de 1990), abgerufen am 2026-11-07. Wo die Tabelle mehrere Namen
 *        nennt („ê / é“, „gê / guê“), steht der zuerst genannte als Name, der
 *        nächste als Variante (bei W aus fünf Formen „duplo vê“, weil die
 *        zweite nur eine Schreibvariante ist); eine Landeszuordnung gibt die
 *        Quelle nicht.
 *        Die Spalte „AFI“ der Quelle gibt den LAUT des Buchstabens, nicht die
 *        Aussprache des Namens — deshalb steht hier keine Lautschrift.
 *   it — it.wikipedia „Alfabeto italiano“ (Tabelle der 21 Buchstaben, Spalte
 *        „Nome“, und „Le lettere J (i lunga), K (cappa), W (vi/vu doppia o
 *        doppia vi/vu), X (ics) e Y (ipsilon o i greca) sono dette ‚lettere
 *        straniere‘“), abgerufen am 2026-11-07. Die fünf Fremdbuchstaben
 *        stehen an ihrer Stelle im ABC, sonst ließen sich Wörter wie „taxi“
 *        nicht buchstabieren. Lautschrift wie bei Portugiesisch: keine, die
 *        IPA-Spalte der Quelle gibt Laute, keine Namen.
 */

export const ALPHABET_SOURCES: Record<LatinLanguage, { title: string; url: string; retrieved: string }> = {
  en: { title: 'English alphabet', url: 'https://en.wikipedia.org/wiki/English_alphabet', retrieved: '2026-10-18' },
  es: { title: 'Ortografía del español', url: 'https://es.wikipedia.org/wiki/Alfabeto_espa%C3%B1ol', retrieved: '2026-10-18' },
  de: { title: 'Deutsches Alphabet', url: 'https://de.wikipedia.org/wiki/Deutsches_Alphabet', retrieved: '2026-10-18' },
  fr: { title: 'Alphabet du français', url: 'https://fr.wikipedia.org/wiki/Alphabet_du_fran%C3%A7ais', retrieved: '2026-11-04' },
  pt: { title: 'Alfabeto português', url: 'https://pt.wikipedia.org/wiki/Alfabeto_portugu%C3%AAs', retrieved: '2026-11-07' },
  it: { title: 'Alfabeto italiano', url: 'https://it.wikipedia.org/wiki/Alfabeto_italiano', retrieved: '2026-11-07' },
};

export type LatinLanguage = Exclude<LanguageCode, 'th' | 'zh'>;

export type LatinLetter = {
  upper: string;
  lower: string;
  /** Ausgeschriebener Name laut Quelle — `null`, wo die Quelle nur IPA nennt. */
  name: string | null;
  /** Lautschrift des Namens — `null`, wo die Quelle keine nennt (Portugiesisch, Italienisch). */
  ipa: string | null;
  /** Was die Systemstimme liest. Englisch/Deutsch: der Buchstabe selbst
   * (Stimmen lesen Einzelbuchstaben mit ihrem Namen; „a“ als Wort klänge
   * falsch). Spanisch: der ASALE-Name, der sich lautgetreu liest. */
  spoken: string;
  /** Regionale Variante, wo die Quelle eine nennt. */
  variant?: string;
};

const letter = (upper: string, name: string | null, ipa: string | null, spoken: string, variant?: string): LatinLetter => ({
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
/** Französisch: Die Systemstimme liest den Namen der Quelle („bé“, „ache“), wie bei Spanisch. */
const fr = (upper: string, name: string, ipa: string) => letter(upper, name, ipa, name);
/** Portugiesisch und Italienisch: Name der Quelle, ohne Lautschrift; die Stimme liest den Namen. */
const named = (upper: string, name: string, variant?: string) => letter(upper, name, null, name, variant);

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
  fr: [
    fr('A', 'a', '/ɑ/'), fr('B', 'bé', '/be/'), fr('C', 'cé', '/se/'), fr('D', 'dé', '/de/'),
    fr('E', 'e', '/ə/'), fr('F', 'effe', '/ɛf/'), fr('G', 'gé', '/ʒe/'), fr('H', 'ache', '/aʃ/'),
    fr('I', 'i', '/i/'), fr('J', 'ji', '/ʒi/'), fr('K', 'ka', '/kɑ/'), fr('L', 'elle', '/ɛl/'),
    fr('M', 'emme', '/ɛm/'), fr('N', 'enne', '/ɛn/'), fr('O', 'o', '/o/'), fr('P', 'pé', '/pe/'),
    fr('Q', 'ku', '/ky/'), fr('R', 'erre', '/ɛʁ/'), fr('S', 'esse', '/ɛs/'), fr('T', 'té', '/te/'),
    fr('U', 'u', '/y/'), fr('V', 'vé', '/ve/'), fr('W', 'double vé', '/dublə ve/'), fr('X', 'ics', '/iks/'),
    fr('Y', 'i grec', '/igʁɛk/'), fr('Z', 'zède', '/zɛd/'),
  ],
  pt: [
    named('A', 'á'), named('B', 'bê'), named('C', 'cê'), named('D', 'dê'), named('E', 'ê', 'é'),
    named('F', 'efe', 'éf'), named('G', 'gê', 'guê'), named('H', 'agá'), named('I', 'i'), named('J', 'jota'),
    named('K', 'cá', 'capa'), named('L', 'ele', 'él'), named('M', 'eme', 'ém'), named('N', 'ene', 'én'),
    named('O', 'ô', 'ó'), named('P', 'pê'), named('Q', 'quê'), named('R', 'erre', 'ér'), named('S', 'esse', 'és'),
    named('T', 'tê'), named('U', 'u'), named('V', 'vê'), named('W', 'dáblio', 'duplo vê'), named('X', 'xis'),
    named('Y', 'ípsilon', 'i grego'), named('Z', 'zê'),
  ],
  it: [
    named('A', 'a'), named('B', 'bi'), named('C', 'ci'), named('D', 'di'), named('E', 'e'), named('F', 'effe'),
    named('G', 'gi'), named('H', 'acca'), named('I', 'i'), named('J', 'i lunga'), named('K', 'cappa'),
    named('L', 'elle'), named('M', 'emme'), named('N', 'enne'), named('O', 'o'), named('P', 'pi'), named('Q', 'cu'),
    named('R', 'erre'), named('S', 'esse'), named('T', 'ti'), named('U', 'u'), named('V', 'vu', 'vi'),
    named('W', 'vu doppia', 'doppia vu'), named('X', 'ics'), named('Y', 'ipsilon', 'i greca'), named('Z', 'zeta'),
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
