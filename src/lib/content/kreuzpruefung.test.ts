import type { VocabEntry } from '@/data/vocab-types';

import { baueVocabBatchPruefPrompt, gegenStueck, parseUrteil, parseUrteile, pruefeVocabKreuzBatch } from './kreuzpruefung';

const vocab = {
  id: 'ki-th-abc12345',
  language: 'th',
  concept: 'ki-th-abc12345',
  term: 'ตลาดน้ำ',
  romanization: 'ta-laat-nam',
  german: 'Schwimmender Markt',
  partOfSpeech: 'noun',
  register: 'neutral',
  isConcrete: true,
  sourceVerified: false,
  verificationNote: 'KI-Erzeugung',
  syllables: [
    { roman: 'ta-la-at', tone: 'low' },
    { roman: 'nam', tone: 'high' },
  ],
  exampleTerm: 'ผมไปตลาดน้ำ',
  exampleRoman: 'phǒm bpai ta-laat-nam',
  exampleGerman: 'Ich gehe zum Schwimmenden Markt.',
} as unknown as VocabEntry;

const client = (urteil: string) => ({
  provider: 'gemini' as const,
  model: 'test',
  complete: async () => ({ text: urteil, model: 'test' }),
});

const keyImmer = () => () => true;

describe('Prüferwahl ohne automatische Anbieterwechsel', () => {
  it('verwendet ohne alte Auswahl den Erzeuger selbst', () => {
    expect(gegenStueck('gemini', () => true)).toEqual({ anbieter: 'gemini', selbstpruefung: true });
  });
  it('prüft bei unterschiedlicher expliziter Auswahl automatisch kreuzweise', () => {
    expect(gegenStueck('gemini', () => true, 'chatgpt')).toEqual({ anbieter: 'chatgpt', selbstpruefung: false });
    expect(gegenStueck('chatgpt', () => true, 'gemini')).toEqual({ anbieter: 'gemini', selbstpruefung: false });
  });
  it('wechselt bei fehlendem Prüfer-Schlüssel niemals still den Anbieter', () => {
    expect(() => gegenStueck('gemini', p => p === 'gemini', 'chatgpt')).toThrow(/Schlüssel/);
  });
});

describe('parseUrteil', ()=> {
  it('liest bestehen/mangel samt Gründen, auch mit Code-Zaun', () => {
    expect(parseUrteil('```json\n{"urteil":"bestehen","gruende":[]}\n```')).toEqual({
      bestanden: true, gruende: [],
    });
    const mangel = parseUrteil('{"urteil":"mangel","gruende":["Ton falsch"]}');
    expect(mangel.bestanden).toBe(false);
    expect(mangel.gruende).toEqual(['Ton falsch']);
  });

  it('wirft bei kaputter Antwort', () => {
    expect(() => parseUrteil('kein json')).toThrow();
  });
});

describe('baueVocabBatchPruefPrompt — Stufe optional', () => {
  it('nennt mit Stufe die übliche Stufen-Passung', () => {
    const prompt = baueVocabBatchPruefPrompt([vocab], 'A1');
    expect(prompt).toContain('5. Stufe A1');
  });

  it('prüft ohne Stufe die Passung (Häufigkeit) statt einer Niveaustufe', () => {
    // Nutzerwunsch 15.09.: die Wortschatz-Ziele laufen ohne CEFR-Stufen —
    // der Prüfer darf dann keine Stufe behaupten, die es nicht gibt.
    const prompt = baueVocabBatchPruefPrompt([vocab], undefined);
    expect(prompt).toContain('hochfrequenter Alltagsbegriff');
    expect(prompt).not.toContain('Stufe undefined');
  });
});

describe('Prüfprompt — Spanisch-Betonung über das stressed-Feld (17.09.)', () => {
  // Lauf 2 lehnte >1100 es-Wörter ab, weil der Prüfer einen Betonungs-
  // Apostroph IN der Umschrift verlangte ('be-nir' → 'be-''nir') — die
  // Betonung steht aber korrekt in syllables[].stressed (kein bestandener
  // Eintrag trägt einen Apostroph). Der Prompt muss das eindeutig sagen.
  const esVocab = {
    id: 'ki-es-abc12345',
    language: 'es',
    concept: 'ki-es-abc12345',
    term: 'venir',
    romanization: 'be-nir',
    german: 'kommen',
    syllables: [
      { text: 'be', stressed: false },
      { text: 'nir', stressed: true },
    ],
    exampleTerm: 'Vengo mañana.',
    exampleGerman: 'Ich komme morgen.',
  } as unknown as VocabEntry;

  it('prüft die stressed-Silbe und verlangt KEINE Umschrift-Markierung', () => {
    const prompt = baueVocabBatchPruefPrompt([esVocab]);
    expect(prompt).toContain('"stressed"');
    expect(prompt).toContain('nicht erforderlich');
    expect(prompt).not.toContain('Betonungssilbe');
  });

  it('Punkt 1 verlangt nur EINE korrekte Hauptbedeutung', () => {
    expect(baueVocabBatchPruefPrompt([esVocab])).toContain('EINE korrekte Hauptbedeutung');
  });
});

describe('parseUrteile — Paket-Urteile', () => {
  it('liest die Batch-Form je index und ergänzt Fehlende als Mangel', () => {
    const roh = JSON.stringify({
      urteile: [
        { index: 1, urteil: 'bestehen', gruende: [] },
        { index: 0, urteil: 'mangel', gruende: ['Ton falsch'] },
      ],
    });
    const urteile = parseUrteile(roh, 3);
    expect(urteile[0].bestanden).toBe(false);
    expect(urteile[1].bestanden).toBe(true);
    // Index 2 fehlt in der Antwort — fail-closed, nicht erraten.
    expect(urteile[2].bestanden).toBe(false);
    expect(urteile[2].gruende[0]).toMatch(/Kein Urteil/);
  });

  it('versteht die Einzelform als Paket von eins', () => {
    const urteile = parseUrteil.length >= 0 ? parseUrteile('{"urteil":"bestehen","gruende":[]}', 1) : [];
    expect(urteile).toHaveLength(1);
    expect(urteile[0].bestanden).toBe(true);
  });
});

describe('pruefeVocabKreuzBatch — Paketprüfung', () => {
  const zweit = { ...vocab, term: 'zweiter Begriff' } as unknown as VocabEntry;
  const batchClient = (urteile: unknown) => () => ({
    provider: 'gemini' as const,
    model: 'test',
    complete: async () => ({ text: JSON.stringify({ urteile }), model: 'test' }),
  });

  it('rettet ein mittig abgebrochenes Paket und füllt Fehlende fail-closed auf', () => {
    // Exakt der Lauf-Fehler vom 15.09.: „Unterminated string" in der PRÜF-
    // Antwort — die vollständigen Urteile müssen trotzdem verwertet werden.
    const roh =
      '{"urteile": [{"index": 0, "urteil": "bestehen", "gruende": []}, {"index": 1, "urteil": "mangel", "gruende": ["Ton falsch"]}, {"index": 2, "ur';
    const urteile = parseUrteile(roh, 3);
    expect(urteile[0].bestanden).toBe(true);
    expect(urteile[1].bestanden).toBe(false);
    // Das halbe dritte Urteil ist weg → fail-closed, nicht geraten.
    expect(urteile[2].gruende[0]).toMatch(/Kein Urteil/);
  });

  it('prüft ein Paket mit gemischten Urteilen in EINEM Aufruf', async () => {
    let aufrufe = 0;
    const resultate = await pruefeVocabKreuzBatch(
      [vocab, zweit], undefined, 'gemini', keyImmer(),
      () => {
        aufrufe += 1;
        return batchClient([
          { index: 0, urteil: 'bestehen', gruende: [] },
          { index: 1, urteil: 'mangel', gruende: ['Übersetzung schief'] },
        ])() as never;
      }, 'chatgpt'
    );
    expect(aufrufe).toBe(1);
    expect(resultate[0].geprueft).toBe(true);
    expect(resultate[1].geprueft).toBe(false);
    expect(resultate[1].gruende).toContain('Übersetzung schief');
  });

  it('Selbstprüfung: die zweite Runde läuft nur über die Bestandenen', async () => {
    let aufrufe = 0;
    const resultate = await pruefeVocabKreuzBatch(
      [vocab, zweit], undefined, 'gemini', (p) => p !== 'chatgpt',
      () => {
        aufrufe += 1;
        // Beide Runden bestehen beide Einträge — die zweite Runde geht über
        // das Paket der Bestandenen (hier: beide), also GENUG zwei Aufrufe.
        return batchClient([
          { index: 0, urteil: 'bestehen', gruende: [] },
          { index: 1, urteil: 'bestehen', gruende: [] },
        ])() as never;
      }
    );
    expect(aufrufe).toBe(2);
    expect(resultate.every((r) => r.kreuz === false && r.geprueft === false)).toBe(true);
    expect(resultate.every((r) => r.urteile.length === 2)).toBe(true);
  });

  it('wiederholt das Paket einmal, wenn die erste Prüf-Antwort kaputt ist', async () => {
    let aufrufe = 0;
    const resultate = await pruefeVocabKreuzBatch(
      [vocab], undefined, 'gemini', keyImmer(),
      () => ({
        provider: 'gemini' as const,
        model: 'test',
        complete: async () => {
          aufrufe += 1;
          if (aufrufe === 1) {
            return { text: '{"urteile": [{"index": 0, "urteil": "bes', model: 'test' };
          }
          return { text: JSON.stringify({ urteile: [{ index: 0, urteil: 'bestehen', gruende: [] }] }), model: 'test' };
        },
      }) as never, 'chatgpt'
    );
    expect(aufrufe).toBe(2);
    expect(resultate[0].geprueft).toBe(true);
  });
});

describe('pruefeVocabKreuzBatch mit einem Eintrag — die Fallback-Regel', () => {
  it('echte Kreuzprüfung bestanden → geprüft', async () => {
    const [resultat] = await pruefeVocabKreuzBatch(
      [vocab], 'A1', 'gemini', keyImmer(),
      () => client('{"urteil":"bestehen","gruende":[]}') as never, 'chatgpt'
    );
    expect(resultat.geprueft).toBe(true);
    expect(resultat.kreuz).toBe(true);
  });

  it('Kreuzprüfung mangel → nicht geprüft mit Gründen', async () => {
    const [resultat] = await pruefeVocabKreuzBatch(
      [vocab], 'A1', 'gemini', keyImmer(),
      () => client('{"urteil":"mangel","gruende":["Übersetzung schief"]}') as never
    );
    expect(resultat.geprueft).toBe(false);
    expect(resultat.gruende).toContain('Übersetzung schief');
  });

  it('Selbstprüfung braucht zwei bestandene Durchläufe und bleibt „einfach geprüft"', async () => {
    let aufrufe = 0;
    const [resultat] = await pruefeVocabKreuzBatch(
      [vocab], 'A1', 'gemini', (p) => p !== 'chatgpt',
      () => {
        aufrufe += 1;
        return client('{"urteil":"bestehen","gruende":[]}') as never;
      }
    );
    expect(aufrufe).toBe(2);
    expect(resultat.kreuz).toBe(false);
    expect(resultat.geprueft).toBe(false); // „einfach geprüft" ≠ kreuzgeprüft
    expect(resultat.urteile.length).toBe(2);
  });

  it('Selbstprüfung: erster Durchlauf mangel genügt zur Ablehnung', async () => {
    const [resultat] = await pruefeVocabKreuzBatch(
      [vocab], 'A1', 'gemini', (p) => p !== 'chatgpt',
      () => client('{"urteil":"mangel","gruende":["Feld fehlt"]}') as never
    );
    expect(resultat.geprueft).toBe(false);
    expect(resultat.urteile.length).toBe(1);
  });
});
