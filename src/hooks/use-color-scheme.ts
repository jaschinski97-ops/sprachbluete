import { useColorScheme as useGeraeteSchema, type ColorSchemeName } from 'react-native';

import { useErscheinung } from '@/lib/appearance';

/**
 * Hell/Dunkel auf dem Handy: zuerst die Wahl aus den Einstellungen (Tag,
 * Nacht), sonst das Gerät (23.10.2026). `lib/appearance` setzt die Wahl
 * zusätzlich über `Appearance.setColorScheme`, damit Systemelemente
 * mitziehen; dieser Hook liefert sie auch, bevor das Gerät sie meldet.
 */
export function useColorScheme(): ColorSchemeName {
  const geraet = useGeraeteSchema();
  const wahl = useErscheinung();
  return wahl === 'system' ? geraet : wahl;
}
