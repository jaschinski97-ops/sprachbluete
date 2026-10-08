import type { VocabEntry } from './vocab-types';
import type { Lang } from '@/lib/languages/types';
import { currentCatalog } from '@/lib/content/catalog-state';
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
  const generated = currentCatalog().entries
    .filter(entry => entry.kind === 'vocabulary' && isDeliverableEntry(entry))
    .map(entry => mitIpaStrichen(entry.document as VocabEntry));
  return [...new Map(generated.map(word => [word.id, word])).values()];
}

export function activeVocabularyFor(language: Lang): VocabEntry[] {
  return activeVocabulary().filter(word => String(word.language) === language);
}

/** Die IDs des aktiven Bestands — alles andere im lokalen Speicher ist Altlast. */
export function activeVocabularyIds(): Set<string> {
  return new Set(activeVocabulary().map(word => word.id));
}
