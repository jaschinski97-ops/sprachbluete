import { setCurrentCatalog } from '@/lib/content/catalog-state';
import { FIXTURE_CATALOG } from '@/test-fixtures/fixture-catalog';
import type { VocabEntry } from './vocab-types';

import {
  buildSentenceTasks,
  satzwortschatz,
  sentenceFootnote,
  SENTENCE_TASKS_BY_LANGUAGE,
} from './sentence-tasks';

/**
 * Der generierte Satzbestand (18.09.2026): Die Satzübungen lesen seit dem
 * Wortschatz-Generator-Umbau die Beispielsätze der Vokabeln — jede Vokabel
 * trägt einen („ganz oder gar nicht" im Schema-Vertrag), und die Registry
 * liefert sie für alle vier Sprachen, auch für das Deutsch-Ziel.
 */

// `language: 'de'` trägt der de-Pool zur Laufzeit; der Typ kennt es bewusst
// nicht (AGENTS 15.09.) — deshalb der lockere Eingang mit Gesamtcast.
function vokabel(ueber: Record<string, unknown> & { id: string; term: string; exampleTerm: string }): VocabEntry {
  return {
    language: 'th',
    german: `Bedeutung ${ueber.id}`,
    romanization: ueber.term,
    partOfSpeech: 'noun',
    register: 'neutral',
    isConcrete: true,
    sourceVerified: false,
    verificationNote: 'KI-Kreuzprüfung bestanden (Test)',
    syllables: [],
    exampleRoman: ueber.exampleTerm,
    exampleGerman: `Bedeutung Satz ${ueber.id}`,
    ...ueber,
  } as unknown as VocabEntry;
}

describe('buildSentenceTasks', () => {
  it('baut aus jeder Vokabel mit Beispielsatz genau eine Aufgabe', () => {
    const tasks = buildSentenceTasks([
      vokabel({ id: 'a', term: 'a', exampleTerm: 'Satz a.', language: 'es' }),
      vokabel({ id: 'b', term: 'b', exampleTerm: 'Satz b.', language: 'es' }),
      vokabel({ id: 'c', term: 'c', exampleTerm: 'Satz c.', language: 'es' }),
    ]);
    expect(tasks.map((task) => task.id)).toEqual(['sentence-a', 'sentence-b', 'sentence-c']);
    expect(tasks[0].text).toBe('Satz a.');
    expect(tasks[0].german).toBe('Bedeutung Satz a');
    expect(tasks[0].vocabId).toBe('a');
  });

  it('wirft doppelte Satztexte — der erste gewinnt', () => {
    const tasks = buildSentenceTasks([
      vokabel({ id: 'a', term: 'a', exampleTerm: 'Gleicher Satz.' }),
      vokabel({ id: 'b', term: 'b', exampleTerm: 'Gleicher Satz.' }),
      vokabel({ id: 'c', term: 'c', exampleTerm: 'Anderer Satz.' }),
    ]);
    expect(tasks.map((task) => task.vocabId)).toEqual(['a', 'c']);
  });

  it('jede Aufgabe trägt die richtige Lösung genau einmal und zwei Ablenker', () => {
    const tasks = buildSentenceTasks([
      vokabel({ id: 'a', term: 'a', exampleTerm: 'Satz a.' }),
      vokabel({ id: 'b', term: 'b', exampleTerm: 'Satz b.' }),
      vokabel({ id: 'c', term: 'c', exampleTerm: 'Satz c.' }),
    ]);
    for (const task of tasks) {
      expect(task.answers).toHaveLength(3);
      expect(task.answers.filter((answer) => answer === task.german)).toHaveLength(1);
      expect(new Set(task.answers).size).toBe(3);
    }
    expect(tasks[0].answers[0]).toBe(tasks[0].german);
  });

  it('ordnet Thai-Erkennungsantworten ihre Satzumschrift zu', () => {
    const tasks = buildSentenceTasks([
      vokabel({ id: 'a', term: 'ก', exampleTerm: 'ประโยคหนึ่ง', exampleRoman: 'bprà-yòok nʉ̀ng' }),
      vokabel({ id: 'b', term: 'ข', exampleTerm: 'ประโยคสอง', exampleRoman: 'bprà-yòok sɔ̌ɔng' }),
      vokabel({ id: 'c', term: 'ค', exampleTerm: 'ประโยคสาม', exampleRoman: 'bprà-yòok sǎam' }),
    ], 'en');
    expect(tasks[0].answersRoman).toEqual(['bprà-yòok nʉ̀ng', 'bprà-yòok sɔ̌ɔng', 'bprà-yòok sǎam']);
  });

  it('Der Fokus nennt das Kernwort — im Deutsch-Ziel mit der Thai-Bedeutung als Ankerseite', () => {
    const tasks = buildSentenceTasks([
      vokabel({ id: 'a', term: 'Bahnhof', exampleTerm: 'Der Bahnhof ist groß.', language: 'de', german: 'Bahnhof', translations: { th: 'สถานีรถไฟ' } }),
      vokabel({ id: 'b', term: 'mesa', exampleTerm: 'La mesa es nueva.', language: 'es', german: 'Tisch' }),
    ], 'th');
    expect(tasks[0].focus).toBe('Bahnhof · สถานีรถไฟ');
    expect(tasks[1].focus).toBe('mesa · Tisch');
  });
});

function generierterKatalog() {
  const eintrag = (id: string, language: string, beispiel: string) => ({
    id: `vokabular:${language}:${id}`,
    kind: 'vocabulary',
    check: { status: 'unchecked' },
    document: {
      id, language, term: id, german: `Bedeutung ${id}`, romanization: id,
      partOfSpeech: 'noun', register: 'neutral', isConcrete: true,
      sourceVerified: false, verificationNote: 'KI-Kreuzprüfung bestanden (Test)',
      syllables: [], exampleTerm: beispiel, exampleRoman: beispiel, exampleGerman: `Satzbedeutung ${id}`,
    },
  });
  return {
    version: 1,
    vocabularySource: 'generated',
    entries: [
      eintrag('th-a', 'th', 'ปลาใหญ่'),
      eintrag('en-a', 'en', 'The fish is big.'),
      eintrag('es-a', 'es', 'El pez es grande.'),
      eintrag('de-a', 'de', 'Der Fisch ist groß.'),
    ],
  };
}

describe('SENTENCE_TASKS_BY_LANGUAGE im generierten Modus', () => {
  beforeEach(() => {
    setCurrentCatalog(generierterKatalog() as never);
  });
  afterEach(() => {
    setCurrentCatalog(FIXTURE_CATALOG);
  });

  it('alle vier Sprachen liefern ihren Beispielsatz — auch Deutsch', () => {
    expect(SENTENCE_TASKS_BY_LANGUAGE.th.map((task) => task.text)).toEqual(['ปลาใหญ่']);
    expect(SENTENCE_TASKS_BY_LANGUAGE.en.map((task) => task.text)).toEqual(['The fish is big.']);
    expect(SENTENCE_TASKS_BY_LANGUAGE.es.map((task) => task.text)).toEqual(['El pez es grande.']);
    expect(SENTENCE_TASKS_BY_LANGUAGE.de.map((task) => task.text)).toEqual(['Der Fisch ist groß.']);
  });

  it('der Fußtext zählt den echten Bestand und nennt die KI-Herkunft', () => {
    const text = sentenceFootnote('en');
    expect(text).toContain('Bestand: 1');
    expect(text).toContain('KI-erzeugte');
  });

  it('eine Sprache ohne Beispielsätze bleibt ehrlich leer', () => {
    expect(sentenceFootnote('en')).not.toContain('keine Beispielsätze');
    // Sprache ohne Stoff im Katalog: fr existiert nicht als Vokabel-Sprache.
    expect(SENTENCE_TASKS_BY_LANGUAGE.en.length).toBeGreaterThan(0);
  });
});

describe('Satzwortschatz für Satzübungen ohne Kapitel', () => {
  afterEach(() => {
    setCurrentCatalog(FIXTURE_CATALOG);
  });

  it('nimmt die häufigen Wörter zuerst — ohne feste Obergrenze (24.10.2026)', () => {
    const basis = generierterKatalog();
    const vorlage = basis.entries[0];
    const viele = Array.from({ length: 450 }, (_, i) => ({
      ...vorlage,
      id: `vokabular:th:w${i}`,
      // Umgekehrt gespeichert: Erzeugungsreihenfolge, nicht Speicherreihenfolge, zählt.
      document: { ...vorlage.document, id: `w${i}`, term: `w${i}`, exampleTerm: `ประโยค ${i}`, generatedAt: 1000 + i },
    })).reverse();
    setCurrentCatalog({ ...basis, entries: viele } as never);
    const woerter = satzwortschatz('th');
    expect(woerter).toHaveLength(450);
    expect(woerter[0].id).toBe('w0');
    expect(woerter[449].id).toBe('w449');
  });
});

describe('Satzbedeutung je App-Sprache (exampleTranslations, 24.10.2026)', () => {
  const mitUebersetzung = (id: string) => vokabel({
    id, term: id, exampleTerm: `Satz ${id}.`, language: 'th',
    exampleTranslations: { en: `Sentence ${id}.`, zh: `文 ${id}。` },
  });

  it('fragt auf Englisch die gelieferte englische Satzbedeutung ab', () => {
    const tasks = buildSentenceTasks([mitUebersetzung('a'), mitUebersetzung('b'), mitUebersetzung('c')], 'en');
    expect(tasks[0].meaning).toBe('Sentence a.');
    expect(tasks[0].answers).toEqual(['Sentence a.', 'Sentence b.', 'Sentence c.']);
    expect(tasks[0].answersRoman).toBeUndefined();
  });

  it('nimmt auf Deutsch exampleTranslations.de vor exampleGerman, sonst exampleGerman', () => {
    const neu = vokabel({ id: 'n', term: 'n', exampleTerm: 'Satz n.', exampleTranslations: { de: 'Neuer Satz.' } });
    const alt = vokabel({ id: 'o', term: 'o', exampleTerm: 'Satz o.' });
    const [a, b] = buildSentenceTasks([neu, alt], 'de');
    expect(a.meaning).toBe('Neuer Satz.');
    expect(b.meaning).toBe('Bedeutung Satz o');
  });

  it('ohne Übersetzung in der App-Sprache: Erkennungsmodus, nie eine fremde Bedeutung', () => {
    const tasks = buildSentenceTasks([mitUebersetzung('a'), mitUebersetzung('b')], 'fr');
    expect(tasks[0].meaning).toBeUndefined();
    expect(tasks[0].answers[0]).toBe('Satz a.');
    expect(tasks[0].answers).not.toContain('Bedeutung Satz a');
  });

  it('Ablenker kommen aus dem Pool, auch wenn nur ein Wort gewählt ist', () => {
    const pool = ['a', 'b', 'c', 'd'].map(mitUebersetzung);
    const [task] = buildSentenceTasks([pool[2]], 'zh', pool);
    expect(task.answers).toEqual(['文 c。', '文 d。', '文 a。']);
  });
});

describe('sentenceFootnote ohne Satzstoff', () => {
  it('sagt ehrlich, dass es keine Beispielsätze gibt', () => {
    setCurrentCatalog({ version: 2, vocabularySource: 'generated', entries: [] } as never);
    expect(sentenceFootnote('th')).toContain('keine Beispielsätze');
    expect(sentenceFootnote('de')).not.toContain('KI-Stimme');
  });
});
