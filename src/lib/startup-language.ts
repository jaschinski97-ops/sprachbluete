import { defaultGoalDirection } from './languages/goals';
import { targetLanguageOf, type ForeignBridge, type Lang, type LanguageCode } from './languages/types';
import type { UiLanguage } from './i18n/types';
import { loadProfile } from './profile';
import type { DataStore } from './storage';

/**
 * Die Lernsprache, die das Ladetor beim Start lädt (Katalog je Lernsprache):
 * die Sprache des Ziels, mit dem die Übersicht öffnet — gemerkter Lernstand,
 * sonst Profil-Sprache, nie die App-Sprache selbst (`defaultGoalDirection`).
 * Die Gesprächssprache lädt erst der Gesprächs-Reiter.
 */
export async function startupLanguage(ui: UiLanguage, store?: DataStore): Promise<LanguageCode> {
  const profile = await loadProfile(store);
  return targetLanguageOf(defaultGoalDirection(ui as Lang | ForeignBridge, profile));
}
