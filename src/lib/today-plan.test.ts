import { NACHTEST_MINUTEN, STANDARD_SCHRITT_MINUTEN, stepMinutes, todayMinutes } from './today-plan';
import { ROUND_MINUTES } from './today-round';

describe('todayMinutes', () => {
  it('zählt die Heutige Runde nur, wenn etwas fällig ist', () => {
    expect(todayMinutes({ reviews: 0, recheck: false, step: null })).toBe(0);
    expect(todayMinutes({ reviews: 3, recheck: false, step: null })).toBe(ROUND_MINUTES);
  });

  it('rechnet Nachtest und Kapitelschritt dazu', () => {
    expect(todayMinutes({ reviews: 14, recheck: true, step: 'cards' }))
      .toBe(ROUND_MINUTES + NACHTEST_MINUTEN + stepMinutes('cards'));
  });

  it('nimmt für unbekannte Schritte den Standardwert', () => {
    expect(stepMinutes('zahlen')).toBe(STANDARD_SCHRITT_MINUTEN);
    expect(stepMinutes('kapitelCheck')).toBe(NACHTEST_MINUTEN);
  });
});
