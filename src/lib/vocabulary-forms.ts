import type { VocabEntry } from '@/data/vocab-types';

/** Only stored inflections and conservative English noun plurals. No stemming:
 * stripping arbitrary suffixes also links unrelated words. */
export function vocabularyForms(entry: VocabEntry): string[] {
  const forms = [entry.term.toLocaleLowerCase()];
  if (entry.partOfSpeech !== 'noun') return forms;
  const plural = entry.germanNoun?.plural ?? entry.spanishNoun?.plural ?? entry.frenchNoun?.plural
    ?? entry.portugueseNoun?.plural ?? entry.italianNoun?.plural;
  if (plural && plural !== '—' && !/[;,/()]/.test(plural)) {
    forms.push(plural.toLocaleLowerCase().replace(/^(die|los|las|les|os|as|i|gli|le)\s+/, ''));
  }
  if (entry.language === 'en' && /^[a-z]+$/i.test(entry.term)) {
    const term = forms[0];
    const irregular: Record<string, string> = { child: 'children', man: 'men', woman: 'women', person: 'people', foot: 'feet', tooth: 'teeth', mouse: 'mice' };
    const unchanged = new Set(['fish', 'sheep', 'deer', 'money', 'rice', 'water', 'milk', 'bread', 'information']);
    if (irregular[term]) forms.push(irregular[term]);
    else if (!unchanged.has(term)) forms.push(/[^aeiou]y$/.test(term) ? term.slice(0, -1) + 'ies' : /(?:s|x|z|ch|sh)$/.test(term) ? term + 'es' : term + 's');
  }
  return [...new Set(forms)];
}

const formIndexCache = new WeakMap<readonly VocabEntry[], Map<string, VocabEntry[]>>();

/** Every entry per form, in pool order — built once per pool instead of
 * scanning the whole pool for each word of a text. */
export function entriesWithForm(word: string, pool: readonly VocabEntry[]): VocabEntry[] {
  let index = formIndexCache.get(pool);
  if (!index) {
    index = new Map();
    for (const entry of pool) {
      for (const form of vocabularyForms(entry)) {
        const list = index.get(form);
        if (list) list.push(entry);
        else index.set(form, [entry]);
      }
    }
    formIndexCache.set(pool, index);
  }
  return index.get(word) ?? [];
}

/** A dictionary gloss cannot disambiguate these pronouns in a sentence. The
 * complete translated line remains available instead of a misleading link. */
export function contextualWord(word: string, before: string, pool: readonly VocabEntry[]): VocabEntry | undefined {
  const candidates = entriesWithForm(word, pool);
  if (candidates.some(entry => entry.language === 'de') && word === 'sie') return undefined;
  if (/\b(?:can|could|will|would|to)\s+(?:i\s+|you\s+|we\s+|they\s+)?$/i.test(before)) {
    return candidates.find(entry => entry.partOfSpeech === 'verb');
  }
  const meanings = new Set(candidates.map(entry => entry.german));
  return meanings.size > 1 ? undefined : candidates[0];
}
