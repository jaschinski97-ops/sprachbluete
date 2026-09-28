import { ADVANCED_LESSONS } from './advanced-lessons';
import { LANGUAGE_CODES } from '@/lib/languages/types';

test('jede Lernsprache hat eine vollständige erste B1-Übung ohne erfundene Bewertung freier Texte', () => {
  expect(Object.keys(ADVANCED_LESSONS).sort()).toEqual([...LANGUAGE_CODES].sort());
  const ids = new Set<string>();
  for (const language of LANGUAGE_CODES) {
    const lesson = ADVANCED_LESSONS[language];
    expect(lesson.language).toBe(language);
    expect(ids.has(lesson.id)).toBe(false);
    ids.add(lesson.id);
    expect(lesson.paragraphs).toHaveLength(3);
    expect(lesson.paragraphs.every((paragraph) => paragraph.length >= 110)).toBe(true);
    expect(lesson.questions).toHaveLength(3);
    expect(lesson.questions.every((question) =>
      question.options.length === 3 &&
      question.options.every(Boolean) &&
      question.options[question.correctIndex] &&
      question.explanation.length >= 12
    )).toBe(true);
    expect(lesson.writingPrompt).toBeTruthy();
    expect(lesson.speakingPrompt).toBeTruthy();
    expect(lesson.modelAnswer).toBeTruthy();
  }
});
