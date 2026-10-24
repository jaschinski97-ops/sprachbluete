import type { VocabEntry } from '@/data/vocab-types';

import { UI_LANGUAGES } from '../i18n/types';

import {
  abgedeckteIds, DIALOGE_VORSCHLAG, planeWortDialoge, pruefeZielwoerter, stufenAbdeckung, zielwortImText,
} from './dialog-words';
import { createSituationClient, userPrompt } from './generator';
import { isValidSituation, type ConversationSituation } from './types';

function wort(id: string, extra: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id, term: id, language: 'en', romanization: id, german: `Bedeutung ${id}`, partOfSpeech: 'noun',
    register: 'neutral', isConcrete: false, sourceVerified: false, syllables: [], ...extra,
  };
}

/** 100 englische Anfängerwörter, w0 am häufigsten; dazu 10 Profi-Wörter. */
const WORTSCHATZ: VocabEntry[] = [
  ...Array.from({ length: 100 }, (_, index) => wort(`w${index}`, { generatedAt: index })),
  ...Array.from({ length: 10 }, (_, index) => wort(`p${index}`, { generatedAt: index, learningStage: 'pro' })),
  wort('th1', { language: 'th', generatedAt: 0 }),
];

function dialog(id: string, level: ConversationSituation['level'], vocabIds?: string[], text = 'Hello'): ConversationSituation {
  return {
    id, level, topic: 'greeting', direction: 'de_to_en', title: id, setting: '',
    scriptTurns: [{ speaker: 'learner', targetText: text, thai: text, roman: '', german: '' }],
    corrections: [{ issue: 'x', explanation: 'y' }], generatedAt: 1, modelUsed: 'test',
    ...(vocabIds ? { vocabIds } : {}),
  };
}

describe('planeWortDialoge — erst die Wörter, dann der Dialog', () => {
  it('gibt jedem Dialog die häufigsten noch nicht abgedeckten Wörter der Stufe', () => {
    const specs = planeWortDialoge({ language: 'en', stage: 'beginner', anzahl: 3, vocabulary: WORTSCHATZ, situations: [] });
    expect(specs).toHaveLength(3);
    expect(specs[0].targetWords!.map((w) => w.id)).toEqual(Array.from({ length: 20 }, (_, i) => `w${i}`));
    expect(specs[1].targetWords![0].id).toBe('w20');
    expect(specs[2].targetWords![19].id).toBe('w59');
    // Keine fremde Stufe, keine fremde Sprache.
    expect(specs.flatMap((s) => s.targetWords!).every((w) => w.id.startsWith('w'))).toBe(true);
    // Der erste Dialog hat nichts zu wiederholen, spätere greifen Abgedecktes auf.
    expect(specs[0].reviewWords).toEqual([]);
    const schonDa = new Set(specs[0].targetWords!.map((w) => w.id));
    expect(specs[1].reviewWords!.length).toBeGreaterThan(0);
    expect(specs[1].reviewWords!.every((w) => schonDa.has(w.id))).toBe(true);
  });

  it('überspringt Wörter, die schon Ziel eines Dialogs sind, und zählt nur Wortschatz-Dialoge', () => {
    const bestand = [
      dialog('greeting-A1-de_to_en-001', 'A1', ['w0', 'w1', 'w5']),
      dialog('market-A1-de_to_en-001', 'A1'), // älterer Dialog ohne Zielwörter
    ];
    const specs = planeWortDialoge({ language: 'en', stage: 'beginner', anzahl: 2, vocabulary: WORTSCHATZ, situations: bestand });
    expect(specs).toHaveLength(1);
    const ids = specs[0].targetWords!.map((w) => w.id);
    expect(ids.slice(0, 4)).toEqual(['w2', 'w3', 'w4', 'w6']);
    expect(ids).not.toContain('w0');
    // Die ID ist neu: Variante 001 ist für dieses Thema schon belegt.
    expect(bestand.map((s) => s.id)).not.toContain(specs[0].id);
  });

  it('nachlegen: eine höhere Anzahl nimmt die nächsten Wörter, ein Neustart plant nichts doppelt', () => {
    const erste = planeWortDialoge({ language: 'en', stage: 'beginner', anzahl: 2, vocabulary: WORTSCHATZ, situations: [] });
    const erzeugt = erste.map((spec) => dialog(spec.id, spec.level, spec.targetWords!.map((w) => w.id)));
    expect(planeWortDialoge({ language: 'en', stage: 'beginner', anzahl: 2, vocabulary: WORTSCHATZ, situations: erzeugt })).toEqual([]);
    const mehr = planeWortDialoge({ language: 'en', stage: 'beginner', anzahl: 3, vocabulary: WORTSCHATZ, situations: erzeugt });
    expect(mehr).toHaveLength(1);
    expect(mehr[0].targetWords![0].id).toBe('w40');
  });

  it('teilt die Anzahl auf Einstieg und Aufbau und verteilt die Themen reihum', () => {
    const specs = planeWortDialoge({ language: 'en', stage: 'beginner', anzahl: 5, vocabulary: WORTSCHATZ, situations: [] });
    expect(specs.map((s) => s.level)).toEqual(['A1', 'A1', 'A1', 'A2', 'A2']);
    expect(new Set(specs.map((s) => s.topic)).size).toBe(5);
    expect(new Set(specs.map((s) => s.id)).size).toBe(5);
    expect(specs.every((s) => s.direction === 'de_to_en')).toBe(true);
  });

  it('hört auf, wenn alle Wörter der Stufe abgedeckt sind', () => {
    const specs = planeWortDialoge({ language: 'en', stage: 'pro', anzahl: 10, vocabulary: WORTSCHATZ, situations: [] });
    expect(specs).toHaveLength(1);
    expect(specs[0].targetWords).toHaveLength(10);
    expect(['C1', 'C2']).toContain(specs[0].level);
  });

  it('ist deterministisch', () => {
    const plan = () => planeWortDialoge({ language: 'en', stage: 'beginner', anzahl: 4, vocabulary: WORTSCHATZ, situations: [] })
      .map((s) => [s.id, s.targetWords!.map((w) => w.id), s.reviewWords!.map((w) => w.id)]);
    expect(plan()).toEqual(plan());
  });
});

describe('stufenAbdeckung — die Anzeige unter der Anzahl', () => {
  it('rechnet die gewählte Anzahl in abgedeckte Wörter um', () => {
    const abdeckung = stufenAbdeckung({ language: 'en', stage: 'beginner', anzahl: 3, vocabulary: WORTSCHATZ, situations: [] });
    expect(abdeckung).toMatchObject({ gesamt: 100, abgedeckt: 0, dialoge: 0, neueDialoge: 3, dialogeNachLauf: 3, abgedecktNachLauf: 60, uebrig: 40 });
  });

  it('zählt den Bestand mit und deckelt bei der Wortzahl der Stufe', () => {
    const bestand = [dialog('greeting-A1-de_to_en-005', 'A1', ['w0', 'w1']), dialog('market-A1-de_to_en-001', 'A1')];
    const abdeckung = stufenAbdeckung({ language: 'en', stage: 'beginner', anzahl: DIALOGE_VORSCHLAG.beginner, vocabulary: WORTSCHATZ, situations: bestand });
    expect(abdeckung).toMatchObject({ abgedeckt: 2, dialoge: 1, aeltere: 1, neueDialoge: 5, abgedecktNachLauf: 100, uebrig: 0 });
  });

  it('kennt die abgedeckten Wörter je Sprache', () => {
    expect([...abgedeckteIds([dialog('a', 'A1', ['w3'])], 'en')]).toEqual(['w3']);
    expect(abgedeckteIds([dialog('a', 'A1', ['w3'])], 'th').size).toBe(0);
  });
});

describe('zielwortImText — kommt das Zielwort im Dialog vor?', () => {
  it('findet Thai als Teilzeichenfolge, auch über Leerzeichen hinweg', () => {
    expect(zielwortImText(wort('a', { language: 'th', term: 'กาแฟ' }), 'ผมชอบ กาแฟ ครับ')).toBe(true);
    expect(zielwortImText(wort('a', { language: 'th', term: 'น้ำ' }), 'ผมชอบกาแฟ')).toBe(false);
  });

  it('erkennt gebeugte Formen in lateinischen Sprachen', () => {
    expect(zielwortImText(wort('a', { language: 'de', term: 'gehen', partOfSpeech: 'verb' }), 'Ich gehe nach Hause.')).toBe(true);
    expect(zielwortImText(wort('a', { language: 'de', term: 'das Haus', partOfSpeech: 'noun', germanNoun: { article: 'das', plural: 'Häuser' } }), 'Zwei Häuser!')).toBe(true);
    expect(zielwortImText(wort('a', { language: 'es', term: 'hablar', partOfSpeech: 'verb' }), '¿Hablas español?')).toBe(true);
    expect(zielwortImText(wort('a', { language: 'en', term: 'to buy', partOfSpeech: 'verb', englishVerb: { past: 'bought', participle: 'bought', irregular: true } }), 'I bought bread.')).toBe(true);
    expect(zielwortImText(wort('a', { language: 'en', term: 'good morning', partOfSpeech: 'interjection' }), 'Good morning, Tom!')).toBe(true);
    expect(zielwortImText(wort('a', { language: 'en', term: 'apple' }), 'I like pears.')).toBe(false);
  });

  it('meldet fehlende Zielwörter statt den Dialog zu verwerfen', () => {
    const ziel = [wort('hello', { term: 'hello' }), wort('bye', { term: 'bye' })];
    expect(pruefeZielwoerter(dialog('x', 'A1', undefined, 'Hello Tom'), ziel)).toEqual({ gefunden: ['hello'], fehlend: [ziel[1]] });
  });
});

describe('Generator mit Zielwörtern', () => {
  const spec = planeWortDialoge({ language: 'en', stage: 'beginner', anzahl: 2, vocabulary: WORTSCHATZ, situations: [] })[1];

  it('verlangt die Zielwörter im Auftrag und nennt die Wiederholwörter', () => {
    const prompt = userPrompt(spec);
    expect(prompt).toContain('Zielwörter');
    expect(prompt).toContain('w20 (Bedeutung w20)');
    expect(prompt).toContain('w39 (Bedeutung w39)');
    expect(prompt).toContain(`${spec.reviewWords![0].term} (`);
  });

  it('speichert nur die Zielwörter, die wirklich im Dialog stehen', async () => {
    const text = 'w20 w21 and w22';
    const translation = { title: 't', setting: 's', turns: [text, text], corrections: [{ issue: 'i', explanation: 'e' }] };
    const antwort = JSON.stringify({
      title: 'T', setting: 'S', corrections: [{ issue: 'i', explanation: 'e' }],
      scriptTurns: [
        { speaker: 'partner', targetText: text, thai: 'x', roman: 'x', german: 'x' },
        { speaker: 'learner', targetText: 'ok', thai: 'x', roman: 'x', german: 'x' },
      ],
      translations: Object.fromEntries(UI_LANGUAGES.map((code) => [code, translation])),
    });
    const client = createSituationClient({ complete: async () => ({ text: antwort, model: 'fake' }) } as never);
    const situation = await client.generate(spec);
    expect(situation.vocabIds).toEqual(['w20', 'w21', 'w22']);
    expect(isValidSituation(situation)).toBe(true);
  });
});

describe('isValidSituation mit Zielwörtern', () => {
  it('nimmt eindeutige ID-Listen an und lehnt kaputte ab', () => {
    expect(isValidSituation(dialog('a', 'A1', ['w1', 'w2']))).toBe(true);
    expect(isValidSituation({ ...dialog('a', 'A1'), vocabIds: ['w1', 'w1'] })).toBe(false);
    expect(isValidSituation({ ...dialog('a', 'A1'), vocabIds: [''] })).toBe(false);
    expect(isValidSituation({ ...dialog('a', 'A1'), vocabIds: 'w1' })).toBe(false);
  });
});
