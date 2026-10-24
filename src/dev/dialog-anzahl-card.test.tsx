import type { VocabEntry } from '@/data/vocab-types';
import { stufenAbdeckung } from '@/lib/conversation/dialog-words';
import { translate } from '@/lib/i18n';

import { abdeckungsText, dialogAnzahlSchluessel } from './dialog-anzahl-card';

const WOERTER: VocabEntry[] = Array.from({ length: 812 }, (_, index) => ({
  id: `w${index}`, term: `w${index}`, language: 'th', romanization: '', german: '', partOfSpeech: 'noun',
  register: 'neutral', isConcrete: false, sourceVerified: false, syllables: [], generatedAt: index,
}));

test('die Anzeige nennt, wie viele Wörter die gewählte Anzahl abdeckt und was übrig bleibt', () => {
  const abdeckung = stufenAbdeckung({ language: 'th', stage: 'beginner', anzahl: 20, vocabulary: WOERTER, situations: [] });
  const [abgedeckt, bestand] = abdeckungsText((key, params) => translate('de', key, params), abdeckung);
  expect(abgedeckt).toBe('20 Dialoge decken die häufigsten 400 von 812 Wörtern dieser Stufe ab, die übrigen 412 kommen über Karten und Sätze.');
  expect(bestand).toBe('Vorhanden: 0 aus dem Wortschatz, 0 ältere ohne Zielwörter · nächster Lauf: 20 neu');
  const einer = abdeckungsText((key, params) => translate('de', key, params),
    stufenAbdeckung({ language: 'th', stage: 'beginner', anzahl: 1, vocabulary: WOERTER, situations: [] }))[0];
  expect(einer.startsWith('1 Dialog deckt die häufigsten 20 von 812')).toBe(true);
});

test('die Anzahl liegt je Lernsprache und Stufe', () => {
  expect(dialogAnzahlSchluessel('th', 'pro')).toBe('dialog-anzahl:th:pro');
  expect(dialogAnzahlSchluessel('es', 'beginner')).not.toBe(dialogAnzahlSchluessel('th', 'beginner'));
});

test('eine Stufe ohne Wörter sagt das klar statt „0 von 0“', () => {
  const leer = stufenAbdeckung({ language: 'th', stage: 'pro', anzahl: 10, vocabulary: WOERTER, situations: [] });
  expect(abdeckungsText((key, params) => translate('de', key, params), leer))
    .toEqual(['Für diese Stufe gibt es noch keine Wörter. Erzeuge zuerst den Wortschatz.']);
});
