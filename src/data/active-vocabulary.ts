import type { VocabEntry } from './vocab-types';
import type { Lang } from '@/lib/languages/types';
import { catalogIndex, catalogRevision, currentCatalog, isLanguageLoaded } from '@/lib/content/catalog-state';
import { isDeliverableEntry } from '@/lib/content/audio-policy';

/** Zeichen, die nur echte IPA trägt — nicht „Tas-se“ oder „GOO-ten“. */
const DEUTSCHE_IPA = /[ˈˌːɐəʁɪʊɛɔçʃŋʏøœɡʒ]/;

/**
 * Der Erzeuger liefert IPA mal mit, mal ohne Schrägstriche (`/kɑːd/` neben
 * `kɑːd`). Einheitlich mit Strichen, damit jede Anzeige gleich aussieht.
 */
export function mitIpaStrichen(word: VocabEntry): VocabEntry {
  // Deutsch trägt seine Lautschrift im Feld `romanization`, teils in [ ]:
  // dieselbe /…/-Schreibweise wie Englisch. 497 Einträge haben statt IPA eine
  // Pseudo-Umschrift („Tas-se“, „dahs DOOSH-gehl“) — die wird nicht gezeigt,
  // eine falsche Lesehilfe ist schlechter als keine (Prüfung 04.10.2026).
  if (String(word.language) === 'de' && word.romanization && word.romanization !== word.term) {
    const kern = word.romanization.trim().replace(/^[[/]+|[\]/]+$/g, '');
    const romanization = DEUTSCHE_IPA.test(kern) ? `/${kern}/` : word.term;
    if (romanization !== word.romanization) word = { ...word, romanization };
  }
  if (!word.ipa) return word;
  const kern = word.ipa.trim().replace(/^\/+|\/+$/g, '');
  const ipa = `/${kern}/`;
  return ipa === word.ipa ? word : { ...word, ipa };
}

/**
 * DER Wortschatz der App: die auslieferbaren Vokabel-Einträge des Katalogs
 * (`src/content/catalog.json`), erzeugt und geprüft im Entwicklerstudio.
 *
 * SPRACH-UMBAU 23.09.2026: Der alte, fest eingebaute Grundstock
 * (`data/vocabulary*.ts`, Brücken-Pools, abgeleiteter Deutsch-Pool) ist aus
 * der App entfernt — es gibt nur noch diesen einen Datenweg. Lernen,
 * Studio-Zähler und Erzeugungspläne lesen alle hier.
 */
export function activeVocabulary(): VocabEntry[] {
  return [...activePool()];
}

// Je Katalogstand einmal gebaut: Vorher lief jeder Aufruf über alle Einträge.
let pool: { revision: number; words: VocabEntry[] } | null = null;
function activePool(): VocabEntry[] {
  const revision = catalogRevision();
  if (pool?.revision === revision) return pool.words;
  const generated = currentCatalog().entries
    .filter(entry => entry.kind === 'vocabulary' && isDeliverableEntry(entry))
    .map(entry => mitIpaStrichen(entry.document as VocabEntry));
  pool = { revision, words: [...new Map(generated.map(word => [word.id, word])).values()] };
  return pool.words;
}

const gewarnt = new Set<Lang>();

/**
 * Der Wortschatz EINER Lernsprache. Im App-Build nur, wenn ihre Sprachdatei
 * geladen ist (Ladetor, Sprachwechsel, `ensureLanguages`) — sonst ist die
 * Liste leer, und das meldet die Warnung einmal je Sprache.
 */
export function activeVocabularyFor(language: Lang): VocabEntry[] {
  if (!isLanguageLoaded(language) && !gewarnt.has(language)) {
    gewarnt.add(language);
    console.warn(`[catalog] Wortschatz ${language} angefragt, aber nicht geladen.`);
  }
  return activePool().filter(word => String(word.language) === language);
}

/**
 * Die IDs des auslieferbaren Wortschatzes einer Lernsprache — für ALLE
 * Sprachen, auch ungeladene: Im App-Build aus dem Index im Bundle, sonst aus
 * dem Katalog. Anzahlen und lesende Zusammenfassungen brauchen nicht mehr.
 */
export function vocabularyIdsFor(language: Lang): readonly string[] {
  const index = catalogIndex();
  if (index) return index.languages[language]?.vocabulary ?? [];
  return activePool().filter(word => String(word.language) === language).map(word => word.id);
}

export function vocabularyCountFor(language: Lang): number {
  return vocabularyIdsFor(language).length;
}

/**
 * Die IDs des aktiven Bestands aller Sprachen — alles andere im lokalen
 * Speicher ist Altlast. Im App-Build aus dem Index, damit die Datenpflege
 * keine Wörter ungeladener Sprachen für Altlast hält.
 */
export function activeVocabularyIds(): Set<string> {
  const index = catalogIndex();
  if (index) return new Set(Object.values(index.languages).flatMap(entry => entry?.vocabulary ?? []));
  return new Set(activePool().map(word => word.id));
}
