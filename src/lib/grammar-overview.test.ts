import catalog from '../content/catalog.json';
import type { ContentCatalog } from './content/types';
import { RULE_THEME_CODES } from '@/data/grammar-themes';
import { THEME_CODES } from './grammar-overview';

// Gegen den echten Katalog: Jede Grammatikregel eines Dialogs hat ein Thema
// (`data/grammar-themes.ts`, von Hand zugeordnet am 08.11.2026). Kommen neue
// Dialoge dazu, meldet dieser Test ihre Regeln — sonst stünden sie in der
// Übersicht unter „Weitere Regeln“.
jest.unmock('../content/catalog.json');

const situations = (catalog as ContentCatalog).entries
  .filter((entry) => entry.kind === 'situations')
  .map((entry) => entry.document as unknown as { id: string; corrections: { issue: string }[] });

const imKatalog = situations.length > 0 ? test : test.skip;

imKatalog('jede Regel der Dialoge hat ein Thema', () => {
  const fehlend = situations
    .filter((situation) => (RULE_THEME_CODES[situation.id] ?? '').length !== situation.corrections.length)
    .map((situation) => `${situation.id}: ${situation.corrections.length} Regeln, ${(RULE_THEME_CODES[situation.id] ?? '').length} Themen`);
  expect(fehlend).toEqual([]);
});

imKatalog('die Zuordnung kennt nur Dialoge, die es gibt', () => {
  const ids = new Set(situations.map((situation) => situation.id));
  expect(Object.keys(RULE_THEME_CODES).filter((id) => !ids.has(id))).toEqual([]);
});

test('jeder Buchstabe steht für ein Thema', () => {
  const unbekannt = Object.entries(RULE_THEME_CODES)
    .filter(([, codes]) => [...codes].some((code) => !(code in THEME_CODES)))
    .map(([id]) => id);
  expect(unbekannt).toEqual([]);
});
