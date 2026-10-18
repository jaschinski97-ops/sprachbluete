import { stageForLevel, STAGE_LEVELS } from './learning-stages';
import { planSituations } from './conversation/plan';
describe('learning groups retain compatible content IDs',()=>{
  it('groups all six internal levels into three visible stages',()=>{
    expect(['A1','A2','B1','B2','C1','C2'].map(stageForLevel)).toEqual(['beginner','beginner','experienced','experienced','pro','pro']);
  });
  it('creates experienced and pro plans without changing the old default plan',()=>{
    // Themen gelten nur auf ihren Stufen: B1/B2 haben 23, C1/C2 20 Paare.
    for(const [stage,count] of [['experienced',23],['pro',20]] as const){
      const specs=planSituations({levels:STAGE_LEVELS[stage],targetLanguage:'de',variantsPerCombo:1});
      expect(specs).toHaveLength(count);
      expect(specs.every(s=>stageForLevel(s.level)===stage && s.id.includes(s.level))).toBe(true);
    }
    expect(planSituations().every(s=>stageForLevel(s.level)==='beginner')).toBe(true);
  });
});
