import { Pressable, View } from 'react-native';
import { ThemedText } from './themed-text';
import { useLocale } from '@/lib/i18n';
import { LEARNING_STAGES, STAGE_KEYS, type LearningStage } from '@/lib/learning-stages';
export function LearningStagePicker({value, onChange, disabled = false}: {
  value: LearningStage; onChange: (value: LearningStage) => void; disabled?: boolean;
}) {
  const { t } = useLocale();
  return <View role="radiogroup" accessibilityLabel={t('level.choose')} style={{flexDirection:'row', flexWrap:'wrap', gap:12}}>
    {LEARNING_STAGES.map(stage => <Pressable key={stage} accessibilityRole="radio" aria-checked={stage === value} accessibilityState={{selected:stage === value, disabled}}
      disabled={disabled} onPress={() => onChange(stage)} style={{padding:12, borderWidth:stage === value ? 2 : 1, borderRadius:12}}>
      <ThemedText>{t(STAGE_KEYS[stage])}</ThemedText>
    </Pressable>)}
  </View>;
}
