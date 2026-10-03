import type { ProviderId } from '@/lib/providers/types';
import type { GeneratorGroupId } from '@/lib/providers/settings';

export type RunEstimate = { count: number; usd: number | null; basis: string;
  delivery?: import('@/lib/content/delivery-preview').DeliveryPreview };
/** Standard synchronous API prices, retrieved 2026-09-05. Never assume batch discounts. */
export function estimateRunCost(group: GeneratorGroupId, provider: ProviderId, model: string,
  specs: { text?: string }[]): RunEstimate {
  const count = specs.length;
  if (provider === 'local-qwen' || provider === 'local-gemma') return {count,usd:0,basis:'Lokale Textgenerierung ohne API-Gebühr; benötigt Zeit und Strom.'};
  const source = 'ai.google.dev/gemini-api/docs/pricing, 05.09.2026';
  if (!count) return { count, usd: 0, basis: 'Alle Einträge vorhanden; keine Anbieteraufrufe.' };
  if (provider === 'gemini' && group === 'audio' && model === 'gemini-3.1-flash-tts-preview') {
    // Duration is an estimate, not a cap: padding + text at roughly 10 chars/s.
    const seconds = specs.reduce((sum, spec) => sum + 1.5 + (spec.text?.length ?? 0) / 10, 0);
    const tokens = specs.reduce((sum, spec) => sum + 100 + (spec.text?.length ?? 0), 0);
    return { count, usd: (tokens + seconds * 25 * 20) / 1e6,
      basis: `1 USD/Mio. Eingabetokens + 20 USD/Mio. Audiotokens (25/s). Geschätzte Dauer ${Math.ceil(seconds)} s und ${tokens} Eingabetokens; keine Kostenobergrenze. ${source}.` };
  }
  if (provider === 'gemini' && group === 'images' && model === 'gemini-3.1-flash-image') {
    return { count, usd: count * (1120 * 60 + 1000 * 0.5 + 2000 * 3) / 1e6,
      basis: `Annahme je Bild: 1K-Ausgabe (1120 Tokens zu 60 USD/Mio.), 1000 Eingabe- und 2000 Text-/Thinking-Tokens zu 0,50/3 USD/Mio. Andere Ausgabegrößen und Thinking ändern die Kosten. ${source}.` };
  }
  return { count, usd: null, basis: 'Für diesen frei gewählten Anbieter/Modellnamen ist kein aktueller Tarif hinterlegt. Eigene Gesamtschätzung in USD eintragen; sie ist keine Kostenobergrenze.' };
}
