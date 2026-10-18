import type { VocabEntry } from '@/data/vocab-types';
import { activeVocabulary } from '@/data/active-vocabulary';
import { catalogRevision } from '@/lib/content/catalog-state';

import { bridgeText } from './languages/bridge';
import type { UiLanguage } from './i18n/types';

/**
 * Mehrdeutige Vorderseiten (Testlauf 04.10.2026): „gehen" steht vor *ir* UND
 * *caminar*, „ไม่" vor *nein* UND *nicht*. Wer nur die Bedeutung sieht, kann
 * nicht wissen, welches Wort gesucht ist — die Karte gibt dann den Anfang
 * des gesuchten Worts als Hinweis. Die Schreibübung nimmt ohnehin jedes
 * passende Synonym an (`writing/prompt.ts`).
 */

/** Die Bedeutung, die auf der Vorderseite steht. */
export function promptText(entry: VocabEntry, anchor: UiLanguage): string {
  return anchor === 'de' ? entry.german : bridgeText(entry, anchor).text;
}

const key = (text: string) => text.trim().toLowerCase();
const cache = new WeakMap<VocabEntry[], Map<string, Map<string, VocabEntry[]>>>();

// Der aktive Bestand wird je Katalogstand nur einmal gebaut — sonst liefe
// pro Karte ein Durchgang über den ganzen Katalog.
let pooled: { revision: number; pool: VocabEntry[] } | null = null;
function defaultPool(): VocabEntry[] {
  const revision = catalogRevision();
  if (pooled?.revision !== revision) pooled = { revision, pool: activeVocabulary() };
  return pooled.pool;
}

/** Andere Wörter derselben Lernsprache mit derselben Vorderseite. */
export function ambiguousPartners(
  entry: VocabEntry,
  anchor: UiLanguage,
  pool: VocabEntry[] = defaultPool()
): VocabEntry[] {
  let byAnchor = cache.get(pool);
  if (!byAnchor) cache.set(pool, (byAnchor = new Map()));
  const index = `${entry.language}:${anchor}`;
  let groups = byAnchor.get(index);
  if (!groups) {
    groups = new Map();
    for (const other of pool) {
      if (other.language !== entry.language) continue;
      const k = key(promptText(other, anchor));
      if (!k) continue;
      groups.set(k, [...(groups.get(k) ?? []), other]);
    }
    byAnchor.set(index, groups);
  }
  return (groups.get(key(promptText(entry, anchor))) ?? []).filter((other) => other.id !== entry.id && other.term !== entry.term);
}

/**
 * Der Hinweis auf das gesuchte Wort: der kürzeste Wortanfang, der es von den
 * anderen passenden Wörtern unterscheidet — höchstens die halbe Länge, damit
 * die Karte nicht die Lösung zeigt. Reicht das nicht (pez/pescado), kommt die
 * Länge dazu: „pe… (3)“. Thai beginnt mit zwei Zeichen (führende Vokale wie เ).
 */
export function wordStart(entry: VocabEntry, partners: VocabEntry[] = []): string {
  const chars = [...entry.term.trim()];
  const minimum = entry.language === 'th' ? 2 : 1;
  const maximum = Math.max(minimum, Math.floor(chars.length / 2));
  const others = partners.map((other) => [...other.term.trim()].join('').toLowerCase());
  let length = minimum;
  const prefix = (n: number) => chars.slice(0, n).join('');
  while (length < maximum && others.some((other) => other.startsWith(prefix(length).toLowerCase()))) length++;
  const eindeutig = !others.some((other) => other.startsWith(prefix(length).toLowerCase()));
  return eindeutig ? `${prefix(length)}…` : `${prefix(length)}… (${chars.length})`;
}
