/**
 * Sprachübergreifende Begriffskennungen (24.10.2026).
 *
 * Ein Begriff ist eine Bedeutung, unabhängig von der Lernsprache: บ้าน, house,
 * casa und Haus sind `c:house`. Mehrdeutige Wörter tragen ihre Bedeutung mit
 * (`c:bank_money`, `c:bank_seat`). Bilder und ihre Prüfung hängen am Begriff,
 * damit eine neue Lernsprache vorhandene Bilder mitnutzt.
 */

export const CONCEPT_PREFIX = 'c:';

const CONCEPT_PATTERN = /^c:[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Ist das eine gemeinsame Begriffskennung (und keine alte Wort-ID)? */
export function isSharedConcept(value: string | undefined | null): value is string {
  return typeof value === 'string' && CONCEPT_PATTERN.test(value);
}

/**
 * Macht aus einer KI-Angabe („Bank (money)“, „to eat“, „c:Apple“) eine
 * Kennung `c:bank_money`, `c:eat`, `c:apple` — oder `null`, wenn nichts übrig bleibt.
 */
export function normalizeConcept(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const basis = raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/^c:/, '')
    .replace(/^(to|the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return basis ? `${CONCEPT_PREFIX}${basis}` : null;
}

/** Unter welchem Schlüssel Bilder zu einem Wort liegen: Begriff, sonst die Wort-ID. */
export function imageKeyOf(entry: { id: string; concept?: string }): string {
  return isSharedConcept(entry.concept) ? entry.concept : entry.id;
}
