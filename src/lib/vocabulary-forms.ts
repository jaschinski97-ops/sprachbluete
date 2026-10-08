import type { VocabEntry } from '@/data/vocab-types';

/** Only stored inflections and conservative English noun plurals. No stemming:
 * stripping arbitrary suffixes also links unrelated words. */
export function vocabularyForms(entry: VocabEntry): string[] {
  const forms = [entry.term.toLocaleLowerCase()];
  if (entry.partOfSpeech !== 'noun') return forms;
  const plural = entry.germanNoun?.plural ?? entry.spanishNoun?.plural;
  if (plural && plural !== '—' && !/[;,/()]/.test(plural)) {
    forms.push(plural.toLocaleLowerCase().replace(/^(die|los|las)\s+/, ''));
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

/** A dictionary gloss cannot disambiguate these pronouns in a sentence. The
 * complete translated line remains available instead of a misleading link. */
export function contextualWord(word: string, before: string, pool: VocabEntry[]): VocabEntry | undefined {
  const candidates = pool.filter(entry => vocabularyForms(entry).includes(word));
  if (candidates.some(entry => entry.language === 'de') && word === 'sie') return undefined;
  if (/\b(?:can|could|will|would|to)\s+(?:i\s+|you\s+|we\s+|they\s+)?$/i.test(before)) {
    return candidates.find(entry => entry.partOfSpeech === 'verb');
  }
  const meanings = new Set(candidates.map(entry => entry.german));
  return meanings.size > 1 ? undefined : candidates[0];
}
