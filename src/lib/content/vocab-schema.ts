import { learningLanguage, passtZurSchrift } from '../languages/definitions';
import { isLanguageCode, LANGUAGE_CODES } from '../languages/types';
import { isSharedConcept } from '../concepts';
import { UI_LANGUAGES } from '../i18n/types';
import { pruefeThaiWortToene } from '../thai/tone-check';
import { isMeasureWord } from '@/data/chinese-measure-words';
import type { VocabEntry } from '@/data/vocab-types';

/**
 * Vokabel-Schema und regelbasierte Basisprüfung (Phase 2, Schritt 4/5).
 *
 * WAS HIER PASSIERT: KI-erzeugter Wortschatz läuft als neue Katalog-Art
 * `vocabulary` über Stage UND catalog.json — derselbe Weg wie Clips und
 * Situationen. Die Prüfung ist zweistufig:
 *
 *   • `isValidVocabEntry` — der harte Vertrag (Schema, Pflichtfelder,
 *     Schrift der Zielsprache). Wer hier fällt, wird nicht gespeichert.
 *   • `pruefeVocabDoc` — die regelbasierte Prüfung des Laufs (Schrift,
 *     Pflichtfelder, Länge, Kennzeichnung). Grün und `sourceVerified`
 *     heißt „geprüft"; grün ohne Quellprüfung bleibt ehrlich „ungeprüft".
 *
 * DUPLIKATE (Schritt 6): `vocabSchluessel` normalisiert einen Begriff je
 * Sprache (Thai: NFC ohne Zwischenraum; Latein: Kleinbuchstaben, ohne
 * Satzzeichen, deutscher Artikel gestrichen) — gleiche Schlüssel sind
 * Duplikate, egal wie sie geschrieben wurden.
 */

/** Alle Lernsprachen (seit dem Sprach-Umbau steht Deutsch selbst in der Liste). */
const DATASPRACHEN = LANGUAGE_CODES;

const PARTS: readonly string[] = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'numeral',
  'particle', 'interjection', 'preposition', 'conjunction',
];

/**
 * Ab hier (24.10.2026, 00:00 UTC) tragen neu erzeugte KI-Wörter eine
 * gemeinsame Begriffskennung (`c:…`) und den Beispielsatz in allen
 * App-Sprachen. Ältere `ki-`-Wörter im Katalog (bis 04.10.) bleiben gültig,
 * sonst schlüge jede Veröffentlichung am Altbestand fehl.
 */
export const NEUES_WORTFORMAT_AB = Date.UTC(2026, 9, 24);

/** Muss dieser Eintrag Begriff und Satzübersetzungen tragen? */
export function brauchtNeuesWortformat(doc: { id?: unknown; generatedAt?: unknown }): boolean {
  return typeof doc.id === 'string' && doc.id.startsWith('ki-')
    && typeof doc.generatedAt === 'number' && doc.generatedAt >= NEUES_WORTFORMAT_AB;
}

/** Welche App-Sprachen der Satzübersetzung fehlen oder leer sind. */
export function fehlendeSatzuebersetzungen(doc: { exampleTranslations?: unknown }): string[] {
  const texte = doc.exampleTranslations;
  if (!texte || typeof texte !== 'object' || Array.isArray(texte)) return [...UI_LANGUAGES];
  const map = texte as Record<string, unknown>;
  return UI_LANGUAGES.filter((code) => typeof map[code] !== 'string' || !(map[code] as string).trim());
}

export function istThaiSchrift(text: string): boolean {
  return /[\u0E01-\u0E5B]/.test(text);
}

/** Pinyin-Buchstaben: Grundbuchstaben, ü und die Tonzeichen. */
const PINYIN = /^[a-zü\u0101\u00e1\u01ce\u00e0\u0113\u00e9\u011b\u00e8\u012b\u00ed\u01d0\u00ec\u014d\u00f3\u01d2\u00f2\u016b\u00fa\u01d4\u00f9\u01d6\u01d8\u01da\u01dc' -]+$/;

/**
 * Pinyin eines chinesischen Wortes: Pflicht, mit Tonzeichen statt Ziffern
 * (nǐ hǎo, nicht ni3 hao3) und ohne fremde Zeichen.
 */
export function pruefePinyin(roman: string | undefined): string[] {
  const text = (roman ?? '').normalize('NFC').trim();
  if (!text) return ['Chinesisches Wort ohne Pinyin.'];
  if (/\d/.test(text)) return [`Pinyin mit Tonziffern statt Tonzeichen: „${text}“.`];
  if (!PINYIN.test(text.toLowerCase().replace(/[’]/g, "'"))) return [`Pinyin enthält fremde Zeichen: „${text}“.`];
  return [];
}

/** Normalisierter Duplikat-Schlüssel eines Begriffs (je Sprache). */
export function vocabSchluessel(term: string, language: string): string {
  let basis = term.normalize('NFC').trim();
  if (language === 'th' || language === 'zh') {
    // Eigene Schriften ohne Wortabstand: Leerzeichen machen kein neues Wort.
    basis = basis.replace(/\s+/g, '');
  } else {
    basis = basis.toLowerCase().replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();
    if (language === 'de') {
      // Artikel gehört zum Wort, macht es aber nicht einzigartig.
      basis = basis.replace(/^(der|die|das|ein|eine)\s+/i, '');
    }
  }
  return `${language}:${basis}`;
}

function validSyllable(value: unknown, language: string): boolean {
  if ((language === 'de' || language === 'en') && typeof value === 'string') return value.length > 0;
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  // Alias nur für bereits erzeugte Daten; neue Prompts verlangen roman.
  const roman = s.roman ?? s.syllable ?? s.text;
  if (typeof roman !== 'string' || !roman.trim()) return false;
  if (s.stressed !== undefined && typeof s.stressed !== 'boolean') return false;
  if (language === 'es' && s.roman !== undefined && typeof s.stressed !== 'boolean') return false;
  return s.tone === undefined || ['mid', 'low', 'falling', 'high', 'rising'].includes(String(s.tone));
}

export function isValidVocabEntry(value: unknown): value is VocabEntry {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  if (typeof d.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(d.id)) return false;
  // 'de' ist zulässig: der abgeleitete de-Pool trägt language 'de'.
  if (typeof d.language !== 'string' || !(DATASPRACHEN as readonly string[]).includes(d.language)) return false;
  if (typeof d.term !== 'string' || !d.term.trim()) return false;
  if (d.learningStage !== undefined && !['beginner', 'experienced', 'pro'].includes(String(d.learningStage))) return false;
  if (typeof d.german !== 'string' || !d.german.trim()) return false;
  if (typeof d.romanization !== 'string' || !d.romanization.trim()) return false;
  if (typeof d.partOfSpeech !== 'string' || !PARTS.includes(d.partOfSpeech)) return false;
  if (typeof d.register !== 'string' || !['neutral', 'formal', 'informal'].includes(d.register)) return false;
  if (typeof d.isConcrete !== 'boolean') return false;
  if (typeof d.sourceVerified !== 'boolean') return false;
  if (!Array.isArray(d.syllables) || d.syllables.some(s => !validSyllable(s, String(d.language)))) return false;
  if (!d.sourceVerified && typeof d.verificationNote !== 'string') {
    // Nicht quellengeprüfte Einträge MÜSSEN sagen, woher sie kommen.
    return false;
  }
  if (d.concept !== undefined && typeof d.concept !== 'string') return false;
  if (d.generatedAt !== undefined && (typeof d.generatedAt !== 'number' || !Number.isFinite(d.generatedAt))) return false;
  if (d.translations !== undefined && (!d.translations || typeof d.translations !== 'object' || Array.isArray(d.translations) || Object.values(d.translations).some(text => typeof text !== 'string' || !text.trim()))) return false;
  // Beispiel: ganz oder gar nicht.
  const beispiel = [d.exampleTerm, d.exampleRoman, d.exampleGerman].filter((f) => f !== undefined);
  if (beispiel.length > 0 && beispiel.some((f) => typeof f !== 'string' || !f.trim())) return false;
  if (d.exampleTranslations !== undefined) {
    const texte = d.exampleTranslations;
    if (!texte || typeof texte !== 'object' || Array.isArray(texte)) return false;
    const uiSprachen: readonly string[] = UI_LANGUAGES;
    if (Object.entries(texte).some(([code, text]) => !uiSprachen.includes(code) || typeof text !== 'string' || !text.trim())) return false;
  }
  // Neue KI-Wörter (24.10.2026): gemeinsamer Begriff Pflicht; ein Beispiel
  // nur mit dem Satz in allen App-Sprachen, die Lernsprache wortgleich.
  if (brauchtNeuesWortformat(d)) {
    if (!isSharedConcept(d.concept as string | undefined)) return false;
    if (d.exampleTerm !== undefined) {
      if (fehlendeSatzuebersetzungen(d).length > 0) return false;
      const eigene = (d.exampleTranslations as Record<string, string>)[String(d.language)];
      if (eigene !== undefined && eigene !== d.exampleTerm) return false;
    }
  }
  // Sprach-Extras, wenn vorhanden, müssen die richtigen Formen haben.
  const sprache = String(d.language);
  if (sprache === 'de' && d.germanNoun !== undefined) {
    const n = d.germanNoun as Record<string, unknown>;
    if (typeof n !== 'object' || !['der', 'die', 'das'].includes(String(n.article))) return false;
    if (typeof n.plural !== 'string') return false;
  }
  if (sprache === 'de' && d.germanVerb !== undefined && typeof d.germanVerb !== 'object') return false;
  if (sprache === 'es' && d.spanishNoun !== undefined && typeof d.spanishNoun !== 'object') return false;
  if (sprache === 'fr' && d.frenchNoun !== undefined) {
    const n = d.frenchNoun as Record<string, unknown>;
    if (typeof n !== 'object' || n === null || !['m', 'f'].includes(String(n.gender))) return false;
    if (!['le', 'la', 'l’'].includes(String(n.article)) || typeof n.plural !== 'string') return false;
  }
  if (sprache === 'pt' && d.portugueseNoun !== undefined) {
    const n = d.portugueseNoun as Record<string, unknown>;
    if (typeof n !== 'object' || n === null || !['m', 'f'].includes(String(n.gender))) return false;
    if (!['o', 'a'].includes(String(n.article)) || typeof n.plural !== 'string') return false;
  }
  if (sprache === 'it' && d.italianNoun !== undefined) {
    const n = d.italianNoun as Record<string, unknown>;
    if (typeof n !== 'object' || n === null || !['m', 'f'].includes(String(n.gender))) return false;
    if (!['il', 'lo', 'la', 'l’'].includes(String(n.article)) || typeof n.plural !== 'string') return false;
  }
  if (sprache === 'zh' && d.chineseNoun !== undefined) {
    const n = d.chineseNoun as Record<string, unknown>;
    if (typeof n !== 'object' || n === null || typeof n.measureWord !== 'string') return false;
    if (n.alternatives !== undefined && (!Array.isArray(n.alternatives) || n.alternatives.some((a) => typeof a !== 'string'))) return false;
  }
  if (sprache === 'es' && d.spanishVerb !== undefined) {
    const v = d.spanishVerb as Record<string, unknown>;
    if (typeof v !== 'object' || !['ar', 'er', 'ir'].includes(String(v.conjugation))) return false;
    if (typeof v.irregular !== 'boolean') return false;
  }
  if (sprache === 'en' && d.englishVerb !== undefined && typeof d.englishVerb !== 'object') return false;
  return true;
}

/**
 * `hinweise` (seit 24.10.2026, nur wenn vorhanden): Unsicherheiten der
 * Thai-Ton-Prüfung — kein Fehler, aber vor dem Audio-Lauf ansehen.
 */
export type VocabPruefung = { ok: boolean; fehler: string[]; hinweise?: string[] };

/**
 * Italienischer Artikel (07.11.2026): „il“ und „lo“ gehören zu m, „la“ zu f;
 * vor Vokal steht „l’“ (aber „lo/la“ vor i + Vokal: „lo iodio“, „la iena“).
 * „lo“ vor s + Konsonant, z, gn, ps, pn, x, y — dort ist „il“ ein Fehler.
 * Vor h und w entscheidet das Wort („l’hotel“, „il whisky“), beides erlaubt.
 */
function italienischerArtikel(term: string, nomen: NonNullable<VocabEntry['italianNoun']>): string[] {
  const fehler: string[] = [];
  const wort = term.normalize('NFC').toLowerCase();
  const vokal = /^[aeiouàèéìòù]/.test(wort) && !/^i[aeiouàèéìòù]/.test(wort);
  const offen = /^[hw]/.test(wort);
  const loPflicht = /^(?:s[^aeiouàèéìòù]|z|gn|ps|pn|x|y|i[aeiouàèéìòù])/.test(wort);
  const { gender, article } = nomen;
  if ((article === 'il' || article === 'lo') && gender !== 'm') fehler.push(`Italienischer Artikel „${article}“ bei weiblichem Genus.`);
  if (article === 'la' && gender !== 'f') fehler.push('Italienischer Artikel „la“ bei männlichem Genus.');
  if (article === 'l’' && !vokal && !offen) fehler.push('Italienischer Artikel „l’“ vor Konsonant.');
  if (article !== 'l’' && vokal) fehler.push('Italienischer Artikel vor Vokal muss „l’“ sein.');
  if (article === 'il' && loPflicht) fehler.push('Italienischer Artikel „lo“ statt „il“ (vor s+Konsonant, z, gn, ps, x, y).');
  if (article === 'lo' && !loPflicht && !offen) fehler.push('Italienischer Artikel „il“ statt „lo“.');
  return fehler;
}

/**
 * Französischer Artikel (04.11.2026): „le“ gehört zu m, „la“ zu f; vor Vokal
 * steht „l’“. Bei h und y entscheidet das Wort (h aspiré: „la hanche“, aber
 * „l’heure“), deshalb ist dort beides erlaubt.
 */
function franzoesischerArtikel(term: string, nomen: NonNullable<VocabEntry['frenchNoun']>): string[] {
  const fehler: string[] = [];
  const anfang = term.normalize('NFC').toLowerCase().charAt(0);
  const vokal = /[aeiouàâäéèêëîïôöùûüœæ]/.test(anfang);
  const offen = anfang === 'h' || anfang === 'y';
  if (nomen.article === 'le' && nomen.gender !== 'm') fehler.push('Französischer Artikel „le“ bei weiblichem Genus.');
  if (nomen.article === 'la' && nomen.gender !== 'f') fehler.push('Französischer Artikel „la“ bei männlichem Genus.');
  if (nomen.article === 'l’' && !vokal && !offen) fehler.push('Französischer Artikel „l’“ vor Konsonant.');
  if (nomen.article !== 'l’' && vokal) fehler.push('Französischer Artikel vor Vokal muss „l’“ sein.');
  return fehler;
}

/** Regelbasierte Prüfung eines Dokuments — die Basis unter der KI-Kreuzprüfung. */
export function pruefeVocabDoc(doc: VocabEntry): VocabPruefung {
  const fehler: string[] = [];
  // Als string: der de-Pool trägt zur Laufzeit language 'de', der Typ kennt
  // es (noch) nicht — die Regelprüfung darf das nicht verschweigen.
  const language: string = doc.language;

  if (!Array.isArray(doc.syllables) || doc.syllables.some(s => !validSyllable(s, language))) {
    fehler.push('Silben benötigen roman (Altbestand: syllable/text), gültigen Ton bzw. stressed als Boolean.');
  }

  // Schrift passt zur Sprache.
  if (isLanguageCode(language) && !passtZurSchrift(language, doc.term)) {
    const schrift = learningLanguage(language).script;
    fehler.push(schrift === 'thai'
      ? 'Thai-Begriff ohne thailändische Schrift (oder mit Schriftzeichen).'
      : schrift === 'han'
        ? 'Chinesischer Begriff ohne Schriftzeichen (oder mit Thai-Schrift).'
        : 'Begriff in lateinischer Schrift enthält Thai-Schrift oder Schriftzeichen.');
  }

  // Längen in vernünftigen Grenzen.
  if (doc.term.length > 80) fehler.push('Begriff ungewöhnlich lang (> 80 Zeichen).');
  if (doc.german.length > 120) fehler.push('Deutsche Bedeutung ungewöhnlich lang (> 120 Zeichen).');
  if (doc.exampleTerm && doc.exampleTerm.length > 200) fehler.push('Beispielsatz ungewöhnlich lang.');

  // Begriff und Satzübersetzungen (neue KI-Wörter seit 24.10.2026).
  if (brauchtNeuesWortformat(doc)) {
    if (!isSharedConcept(doc.concept)) {
      fehler.push('Begriffskennung fehlt oder ist ungültig (Format c:englisch_snake_case).');
    }
    if (doc.exampleTerm) {
      const fehlend = fehlendeSatzuebersetzungen(doc);
      if (fehlend.length > 0) fehler.push(`Satzübersetzungen fehlen für: ${fehlend.join(', ')}.`);
      const eigene = doc.exampleTranslations?.[language as keyof NonNullable<VocabEntry['exampleTranslations']>];
      if (eigene !== undefined && eigene !== doc.exampleTerm) {
        fehler.push('Satzübersetzung der Lernsprache weicht vom Beispielsatz ab.');
      }
    }
  }

  // Sprachliche Pflicht-Merkmale je Stufe der App-Übungen:
  const hinweise: string[] = [];
  if (language === 'th') {
    if (!doc.syllables || doc.syllables.length === 0) fehler.push('Thai ohne Silbenauszeichnung (Ton kann nicht geprüft/gezeigt werden).');
    else if (doc.syllables.some((s) => !s.tone)) fehler.push('Thai-Silben ohne Ton.');
    // Ton-Engine (24.10.2026): Schrift gegen Umschrift, Silben und Beispielsatz.
    const toene = pruefeThaiWortToene(doc);
    fehler.push(...toene.fehler);
    hinweise.push(...toene.hinweise);
  }
  if (language === 'es' && doc.partOfSpeech === 'noun' && !doc.spanishNoun) {
    fehler.push('Spanisches Substantiv ohne Genus/Artikel.');
  }
  if (language === 'fr' && doc.partOfSpeech === 'noun') {
    // Nur-Mehrzahl-Wörter tragen den Artikel im Wort („les gens“) und haben kein Genus-Feld.
    if (!doc.frenchNoun) {
      if (!/^les\s/.test(doc.term)) fehler.push('Französisches Substantiv ohne Genus/Artikel.');
    } else {
      fehler.push(...franzoesischerArtikel(doc.term, doc.frenchNoun));
    }
  }
  if (language === 'pt' && doc.partOfSpeech === 'noun') {
    // Nur-Mehrzahl-Wörter tragen den Artikel im Wort („os óculos“).
    if (!doc.portugueseNoun) {
      if (!/^(?:os|as)\s/.test(doc.term)) fehler.push('Portugiesisches Substantiv ohne Genus/Artikel.');
    } else {
      const { gender, article } = doc.portugueseNoun;
      if ((article === 'o') !== (gender === 'm')) fehler.push(`Portugiesischer Artikel „${article}“ passt nicht zum Genus.`);
    }
  }
  if (language === 'it' && doc.partOfSpeech === 'noun') {
    if (!doc.italianNoun) {
      if (!/^(?:i|gli|le)\s/.test(doc.term)) fehler.push('Italienisches Substantiv ohne Genus/Artikel.');
    } else {
      fehler.push(...italienischerArtikel(doc.term, doc.italianNoun));
    }
  }
  if (language === 'zh') {
    fehler.push(...pruefePinyin(doc.romanization));
    if (doc.chineseNoun) {
      const { measureWord, alternatives = [] } = doc.chineseNoun;
      for (const wort of [measureWord, ...alternatives]) {
        if (!isMeasureWord(wort)) fehler.push(`Unbekanntes Zählwort „${wort}“ (Liste in data/chinese-measure-words.ts).`);
      }
    }
  }
  if (language === 'de' && doc.partOfSpeech === 'noun' && !doc.germanNoun) {
    fehler.push('Deutsches Substantiv ohne Artikel/Plural.');
  }
  if (language === 'en' && !doc.ipa && !doc.romanization) {
    fehler.push('Englischer Begriff ohne Lautschrift.');
  }
  if (language === 'de' && istThaiSchrift(doc.german)) fehler.push('Deutsche Bedeutung enthält Thai-Schrift.');

  // Kennzeichnung: KI-Wörter sind nie quellengeprüft.
  if (!doc.sourceVerified && !doc.verificationNote) {
    fehler.push('Ohne Quellprüfung fehlt der Kennzeichnungs-Hinweis.');
  }
  if (doc.sourceVerified && !doc.source) {
    fehler.push('Quellengeprüft ohne Quellenangabe.');
  }

  return { ok: fehler.length === 0, fehler, ...(hinweise.length ? { hinweise } : {}) };
}
