import { activeVocabulary } from '../../data/active-vocabulary';
import type { VocabEntry } from '../../data/vocab-types';
import { planClips } from '../clips/plan';
import { AudioClipSpec, clipIdFor, normalizeClipText } from '../clips/types';
import type { ConversationSituation } from '../conversation/types';
import type { LanguageCode } from '../languages/types';

/** All text that a delivered screen can play, including German. */
export function planDeliveryAudio(
  situations: ConversationSituation[] = [],
  language?: LanguageCode,
  vocabulary: VocabEntry[] = activeVocabulary()
): AudioClipSpec[] {
  const entries = language ? vocabulary.filter((entry) => entry.language === language) : vocabulary;
  const plan = planClips({ vocabulary: entries, situations });
  const add = (text: string, sourceId: string, kind: AudioClipSpec['kind']) => {
    text = normalizeClipText(text);
    if (text) plan.push({ id: clipIdFor('de', text), language: 'de', text, sourceId, kind });
  };
  for (const entry of entries) add(entry.german, entry.id, 'vocab');
  return [...new Map(plan.map((spec) => [spec.id, spec])).values()];
}
