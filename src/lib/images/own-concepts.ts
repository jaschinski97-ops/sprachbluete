import { normalizeConcept } from '../concepts';
import { DataStore, getStore } from '../storage';

/**
 * Begriffe mit eigenem Bild je Lernsprache (Studio-Option, 24.10.2026).
 *
 * Standard ist ein Bild je Begriff für alle Sprachen. Für kulturabhängige
 * Begriffe (Geld, typisches Essen) trägt der Admin sie hier je Sprache ein;
 * der nächste Bildlauf dieser Sprache plant dann ein eigenes Bild, das in
 * dieser Sprache vor dem gemeinsamen gewinnt. Liegt in `meta`, nur im Studio.
 */

const SCHLUESSEL = 'image-own-concepts';

export type OwnImageConcepts = Partial<Record<string, string[]>>;

/** „Geld, c:food; Bank (money)“ → `['c:money', 'c:food', 'c:bank_money']`, ohne Doppelte. */
export function parseOwnConcepts(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[,;\n]+/)) {
    const concept = normalizeConcept(part);
    if (concept) seen.add(concept);
  }
  return [...seen];
}

export async function loadOwnImageConcepts(store?: DataStore): Promise<OwnImageConcepts> {
  const db = store ?? (await getStore());
  const stored = await db.get<OwnImageConcepts>('meta', SCHLUESSEL);
  if (!stored || typeof stored !== 'object') return {};
  const result: OwnImageConcepts = {};
  for (const [language, list] of Object.entries(stored)) {
    if (Array.isArray(list)) result[language] = parseOwnConcepts(list.join(','));
  }
  return result;
}

export async function saveOwnImageConcepts(
  language: string,
  concepts: string[],
  store?: DataStore
): Promise<OwnImageConcepts> {
  const db = store ?? (await getStore());
  const next = { ...(await loadOwnImageConcepts(db)), [language]: parseOwnConcepts(concepts.join(',')) };
  await db.put('meta', SCHLUESSEL, next);
  return next;
}
