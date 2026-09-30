import type { LanguageCode } from '../languages/types';
import { vergleicheProduktion, type ProduktionsErgebnis } from './compare';

/** Small, explicit equivalences for introductions. This is not a semantic scorer. */
export function dialogueVariants(target: string, language: LanguageCode): string[] {
  const variants = [target];
  if (language === 'de') {
    if (/\bich heiße\b/i.test(target)) variants.push(target.replace(/\bich heiße\b/i, 'Mein Name ist'));
    if (/\bmein name ist\b/i.test(target)) variants.push(target.replace(/\bmein name ist\b/i, 'Ich heiße'));
  }
  if (language === 'en' && /^yes,? i am\. my name is /i.test(target)) {
    variants.push(target.replace(/^yes,? i am\. /i, 'Yes, '));
  }
  return variants;
}

export function compareDialogue(input: string, target: string, language: LanguageCode): ProduktionsErgebnis {
  const results = dialogueVariants(target, language).map(value => vergleicheProduktion(input, value, language));
  return results.find(value => value.bewertung === 'exact') ?? results.find(value => value.bewertung === 'accent') ?? results[0];
}
