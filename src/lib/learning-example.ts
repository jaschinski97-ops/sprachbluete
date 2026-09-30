import type { VocabEntry } from '@/data/vocab-types';
import { bundledDocuments } from './content/bundled';
import { spokenText, situationTranslation, type ConversationSituation } from './conversation/types';
import type { UiLanguage } from './i18n';
import { poolWoerterDerSzene } from './reading-texts';
import { targetLanguageOf } from './languages/types';

export type LearningExample = { text: string; roman: string; meaning: string };

/** Reuse supplied complete dialogue translations, never translate word by word. */
export function learningExample(entry: VocabEntry, anchor: UiLanguage, scene?: ConversationSituation): LearningExample | undefined {
  const scenes = scene ? [scene] : bundledDocuments('situations');
  for (const situation of scenes) {
    if (targetLanguageOf(situation.direction) !== entry.language || (anchor !== 'de' && !situation.translations?.[anchor])) continue;
    const translation = situationTranslation(situation, anchor);
    for (let index = 0; index < situation.scriptTurns.length; index++) {
      const turn = situation.scriptTurns[index];
      if (!translation.turns[index] || !poolWoerterDerSzene({ ...situation, scriptTurns: [turn] }, [entry], entry.language !== 'th').length) continue;
      return { text: spokenText(situation, turn), roman: turn.roman, meaning: translation.turns[index] };
    }
  }
  if (anchor === 'de' && entry.exampleTerm && entry.exampleGerman) {
    return { text: entry.exampleTerm, roman: entry.exampleRoman ?? '', meaning: entry.exampleGerman };
  }
  return undefined;
}
