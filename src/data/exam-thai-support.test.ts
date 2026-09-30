import { BUILTIN_EXAM_MODULES } from './exam-modules';
import { examSupport } from './exam-thai-support';
import { isGradable } from '@/lib/exam/types';

test('Every shipped Thai-to-German exam has Thai instructions and feedback', () => {
  const modules = BUILTIN_EXAM_MODULES.filter(module => module.direction === 'th_to_de');
  expect(modules.length).toBeGreaterThan(0);
  for (const module of modules) {
    const support = [module.instruction, ...(isGradable(module) ? module.items.map(item => item.explanation)
      : [module.production.task, ...module.production.bullets, ...module.production.checklist])];
    for (const text of support) {
      expect(examSupport(text, 'th')).not.toBe(text);
      expect(examSupport(text, 'th')).toMatch(/[ก-๙]/);
      expect(examSupport(text, 'de')).toBe(text);
    }
  }
});
