import { stageForLevel, STAGE_LEVELS } from './learning-stages';
import { planSituations } from './conversation/plan';
describe('learning groups retain compatible content IDs',()=>{
  it('groups all six internal levels into three visible stages',()=>{
    expect(['A1','A2','B1','B2','C1','C2'].map(stageForLevel)).toEqual(['beginner','beginner','experienced','experienced','pro','pro']);
  });
  it('creates experienced and pro plans without changing the old default plan',()=>{
    for(const stage of ['experienced','pro'] as const){
      const specs=planSituations({levels:STAGE_LEVELS[stage],targetLanguage:'de',variantsPerCombo:1});
      expect(specs).toHaveLength(8);
      expect(specs.every(s=>stageForLevel(s.level)===stage && s.id.includes(s.level))).toBe(true);
    }
    expect(planSituations().every(s=>stageForLevel(s.level)==='beginner')).toBe(true);
  });
});
