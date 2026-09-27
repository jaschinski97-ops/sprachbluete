// PHASE 16: `VOCABULARY` umfasst jetzt alle drei Sprachen. Was diese Datei
// zusichert, gilt dem Thai-Grundstock aus Phase 2 - deshalb hier
// ausdruecklich der. Unterhalb dieser Zeile hat sich nichts geaendert.
import { FIXTURE_GERMAN } from '@/test-fixtures/fixture-catalog';
import { VOCABULARY_TH as VOCABULARY, VocabEntry } from '@/test-fixtures/legacy-vocabulary';

import { cardKey, Direction } from '../fsrs/types';
import { loadAllCardStates, loadCardState, seedVocabulary } from '../repository';
import { loadReviewLog } from '../review-log';
import { DataStore, MemoryDataStore } from '../storage';

import { compareWriting, editDistance, stripProtected, typoTolerance } from './compare';
import { buildWritingPrompt, germanTargets, typeableGerman, writingCandidates } from './prompt';
import { ratingForVerdict, WRITING_RATING } from './rating';
import { buildWritingSession, submitWriting, summarizeWriting } from './session';

/**
 * Phase 14 — freies Schreiben und die erste FSRS-Anbindung einer Übung.
 *
 * Zwei Aussagen tragen diese Datei:
 *
 * 1. **Was Lernziel ist, wird nicht wegtoleriert** (Pflicht 3). Großschreibung,
 *    Umlaute, ß, Artikel und Tonzeichen gelten nie als Tippfehler — jeder
 *    dieser Fälle steht einzeln im Test, gegen echte Einträge des Grundstocks.
 * 2. **Die FSRS-Abbildung ist entschieden, nicht geraten** (Pflicht 4). Sie
 *    schreibt in dieselbe Karte wie die Karteikarte, vergibt nie „Leicht" und
 *    wertet einen Tippfehler als „Schwer".
 */

/** Der deutsche Test-Eintrag, dessen Thai-Auftrag `thai` ist (Richtung th_to_de). */
function deutsch(thai: string): VocabEntry {
  const entry = FIXTURE_GERMAN.find((candidate) => candidate.translations?.th === thai);
  if (!entry) throw new Error(`Kein deutscher Test-Eintrag zu ${thai}`);
  return entry;
}

const de = (thai: string): VocabEntry => VOCABULARY.find((entry) => entry.term === thai)!;

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  await seedVocabulary(store);
  return store;
}

function verdictFor(given: string, targets: string[], language: 'de' | 'th' = 'de') {
  return compareWriting(given, { language, targets });
}

// ---------------------------------------------------------------------------

describe('Zielformen aus dem Grundstock', () => {
  it('schneidet Erläuterungen in Klammern weg', () => {
    // „ich (männlicher Sprecher)" ist eine Lesehilfe. Wer sie mittippen
    // müsste, übte Abschreiben statt Produzieren.
    expect(typeableGerman('ich (männlicher Sprecher)')).toBe('ich');
    expect(typeableGerman('Höflichkeitspartikel (weibliche Sprecherin)')).toBe(
      'Höflichkeitspartikel'
    );
    expect(typeableGerman('das Haus')).toBe('das Haus');
  });

  it('lässt bei mehreren Bedeutungen jede gelten', () => {
    const entry = VOCABULARY.find((candidate) => candidate.german.includes(','))!;
    const targets = germanTargets(entry);
    expect(targets.length).toBeGreaterThan(1);
    for (const target of targets) {
      expect(verdictFor(target, targets).correct).toBe(true);
    }
  });

  it('hat in beiden Richtungen genug Material', () => {
    expect(writingCandidates('th_to_de').length).toBeGreaterThanOrEqual(80);
    expect(writingCandidates('de_to_th').length).toBe(VOCABULARY.length);
  });

  it('fragt in jeder Richtung die andere Seite ab', () => {
    const haus = de('บ้าน');
    const nachDeutsch = buildWritingPrompt(deutsch('บ้าน'), 'th_to_de');
    expect(nachDeutsch.shown).toBe('บ้าน');
    expect(nachDeutsch.language).toBe('de');
    expect(nachDeutsch.targets).toContain('das Haus');

    const nachThai = buildWritingPrompt(haus, 'de_to_th');
    expect(nachThai.shown).toBe('das Haus');
    expect(nachThai.language).toBe('th');
    expect(nachThai.targets).toEqual(['บ้าน']);
  });

  it('lässt ein Synonym mit demselben Ankerwort gelten (simple/easy)', () => {
    const basis = { ...de('บ้าน'), language: 'en', romanization: undefined } as unknown as VocabEntry;
    const simple = { ...basis, id: 't-simple', term: 'simple', translations: { de: 'einfach' } } as VocabEntry;
    const easy = { ...basis, id: 't-easy', term: 'easy', translations: { de: 'einfach' } } as VocabEntry;
    const anders = { ...basis, id: 't-hard', term: 'hard', translations: { de: 'schwer' } } as VocabEntry;
    const prompt = buildWritingPrompt(simple, 'de_to_en', [simple, easy, anders]);
    expect(prompt.targets).toEqual(['simple', 'easy']);
    expect(compareWriting('easy', { language: 'en', targets: prompt.targets }).correct).toBe(true);
    expect(buildWritingPrompt(simple, 'de_to_en').targets).toEqual(['simple']);
  });

  it('verrät in keiner Richtung die Lösung als Hilfszeile', () => {
    const nachDeutsch = buildWritingPrompt(deutsch('บ้าน'), 'th_to_de');
    expect(nachDeutsch.shownHint).toBeNull();
    const nachThai = buildWritingPrompt(de('บ้าน'), 'de_to_th');
    // Die Umschrift wäre bei dieser Richtung die halbe Lösung - deshalb gar
    // keine Hilfszeile, solange das Stichwort eindeutig ist.
    expect(nachThai.shownHint ?? '').not.toContain(de('บ้าน').romanization);
    expect(nachThai.shownHint).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('Pflicht 3 — was Lernziel ist, gilt nie als Tippfehler', () => {
  it('lässt Kleinschreibung eines Substantivs nicht durchgehen', () => {
    const verdict = verdictFor('das haus', ['das Haus']);
    expect(verdict.correct).toBe(false);
    expect(verdict.typo).toBe(false);
    expect(verdict.mistake).toBe('case');
    expect(verdict.message?.key).toBe('writing.mistakeCase');
  });

  it('lässt einen fehlenden Umlaut nicht durchgehen — schon ist nicht schön', () => {
    const verdict = verdictFor('schon', ['schön']);
    expect(verdict.correct).toBe(false);
    expect(verdict.mistake).toBe('umlaut');
    // Der Abstand ist 1 - ohne den Schutz waere das ein tolerierter Tippfehler.
    expect(editDistance('schon', 'schön')).toBe(1);
  });

  it('prüft das an allen Umlaut-Einträgen des Grundstocks', () => {
    const withUmlaut = VOCABULARY.filter((entry) => /[äöüß]/.test(germanTargets(entry)[0] ?? ''));
    expect(withUmlaut.length).toBeGreaterThanOrEqual(8);
    for (const entry of withUmlaut) {
      const target = germanTargets(entry)[0];
      const flattened = target.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
      if (flattened === target) continue;
      const verdict = verdictFor(flattened, germanTargets(entry));
      expect(verdict.correct).toBe(false);
      expect(['umlaut', 'eszett']).toContain(verdict.mistake);
    }
  });

  it('unterscheidet ß von ss', () => {
    const verdict = verdictFor('gross', ['groß']);
    expect(verdict.correct).toBe(false);
    expect(verdict.mistake).toBe('eszett');
  });

  it('lässt einen fehlenden Artikel nicht durchgehen', () => {
    const verdict = verdictFor('Haus', ['das Haus']);
    expect(verdict.correct).toBe(false);
    expect(verdict.mistake).toBe('article-missing');
    expect(verdict.message?.key?.startsWith('writing.mistakeArticle')).toBe(true);
  });

  it('lässt einen falschen Artikel nicht durchgehen', () => {
    const verdict = verdictFor('der Haus', ['das Haus']);
    expect(verdict.correct).toBe(false);
    expect(verdict.mistake).toBe('article-wrong');
    expect(verdict.article).toBe('das');
  });

  it('lässt ein fehlendes Tonzeichen im Thai nicht durchgehen', () => {
    // ไก (ohne Zeichen) ist nicht ไก่ mit einem Tippfehler, sondern ein
    // anderes Wort.
    const verdict = verdictFor('ไก', ['ไก่'], 'th');
    expect(verdict.correct).toBe(false);
    expect(verdict.mistake).toBe('tone-mark');
  });

  it('lässt ein falsches Tonzeichen im Thai nicht durchgehen', () => {
    const verdict = verdictFor('ไก้', ['ไก่'], 'th');
    expect(verdict.correct).toBe(false);
    expect(verdict.mistake).toBe('tone-mark');
  });

  it('prüft das an allen Thai-Einträgen mit Tonzeichen', () => {
    const withMark = VOCABULARY.filter((entry) => /[่-๋]/.test(entry.term));
    expect(withMark.length).toBeGreaterThanOrEqual(25);
    for (const entry of withMark) {
      const stripped = entry.term.replace(/[่-๋]/g, '');
      const verdict = verdictFor(stripped, [entry.term], 'th');
      expect(verdict.correct).toBe(false);
      expect(verdict.mistake).toBe('tone-mark');
    }
  });

  it('toleriert im Thai überhaupt keinen Tippfehler', () => {
    // Jedes Zeichen einer thailändischen Silbe trägt; ein ausgetauschter
    // Konsonant ergibt ein anderes Wort.
    expect(typoTolerance('บ้าน', 'th')).toBe(0);
    expect(verdictFor('บ้าม', ['บ้าน'], 'th').correct).toBe(false);
  });
});

describe('Tippfehler-Toleranz, wo sie kein Lernziel berührt', () => {
  it('lässt einen Buchstabendreher in einem langen Wort durchgehen', () => {
    const verdict = verdictFor('das Huas', ['das Haus']);
    expect(verdict.correct).toBe(true);
    expect(verdict.typo).toBe(true);
    expect(verdict.exact).toBe(false);
  });

  it('zählt eine Vertauschung als einen Schritt, nicht als zwei', () => {
    expect(editDistance('Huas', 'Haus')).toBe(1);
    expect(editDistance('Haus', 'Haus')).toBe(0);
    expect(editDistance('Maus', 'Haus')).toBe(1);
  });

  it('toleriert bei kurzen Wörtern nichts', () => {
    // Bei „gut" ist ein Zeichen Unterschied fast immer ein anderes Wort.
    expect(typoTolerance('gut', 'de')).toBe(0);
    expect(typoTolerance('Höflich', 'de')).toBe(1);
    expect(verdictFor('gud', ['gut']).correct).toBe(false);
  });

  it('macht Leerraum unerheblich', () => {
    expect(verdictFor('  das   Haus ', ['das Haus']).exact).toBe(true);
  });

  it('nimmt bei mehreren Zielformen die beste', () => {
    const verdict = verdictFor('ja', ['ja', 'richtig']);
    expect(verdict.exact).toBe(true);
    expect(verdict.matched).toBe('ja');
  });

  it('meldet eine leere Eingabe als solche, statt sie zu bewerten', () => {
    const verdict = verdictFor('   ', ['das Haus']);
    expect(verdict.correct).toBe(false);
    expect(verdict.message?.key).toBe('writing.msgEmpty');
  });
});

describe('Der Schutz greift genau an den geschützten Stellen', () => {
  it('nimmt beim Deutschen Groß- und Kleinschreibung sowie Diakritika weg', () => {
    expect(stripProtected('Das HÄUS', 'de')).toBe('das haus');
    expect(stripProtected('groß', 'de')).toBe('gross');
  });

  it('nimmt beim Thai nur die Tonzeichen weg', () => {
    expect(stripProtected('ไก่', 'th')).toBe('ไก');
    expect(stripProtected('บ้าน', 'th')).toBe('บาน');
  });
});

// ---------------------------------------------------------------------------

describe('Pflicht 4 — die FSRS-Abbildung', () => {
  it('vergibt Gut für genau richtig, Schwer für einen Tippfehler, Nochmal für falsch', () => {
    expect(ratingForVerdict(verdictFor('das Haus', ['das Haus']))).toBe(WRITING_RATING.exact);
    expect(ratingForVerdict(verdictFor('das Huas', ['das Haus']))).toBe(WRITING_RATING.typo);
    expect(ratingForVerdict(verdictFor('das Auto', ['das Haus']))).toBe(WRITING_RATING.wrong);
  });

  it('vergibt NIE Leicht', () => {
    // „Leicht" ist eine Aussage über Mühe, und die misst eine getippte
    // Antwort nicht. Lieber eine Stufe ungenutzt lassen als sie falsch
    // vergeben.
    const alle = [
      verdictFor('das Haus', ['das Haus']),
      verdictFor('das Huas', ['das Haus']),
      verdictFor('das haus', ['das Haus']),
      verdictFor('Haus', ['das Haus']),
      verdictFor('', ['das Haus']),
      verdictFor('ไก่', ['ไก่'], 'th'),
    ];
    for (const verdict of alle) expect(ratingForVerdict(verdict)).not.toBe(4);
  });

  it('wertet einen Lernzielfehler wie jeden anderen Fehler — die Feinheit steht in der Rückmeldung', () => {
    expect(ratingForVerdict(verdictFor('das haus', ['das Haus']))).toBe(WRITING_RATING.wrong);
    expect(ratingForVerdict(verdictFor('das Auto', ['das Haus']))).toBe(WRITING_RATING.wrong);
    // Unterschieden wird trotzdem - nur eben in der Meldung, nicht im Plan.
    expect(verdictFor('das haus', ['das Haus']).mistake).toBe('case');
    expect(verdictFor('das Auto', ['das Haus']).mistake).toBe('different');
  });
});

describe('Die Anbindung schreibt in dieselbe Karte wie die Karteikarte', () => {
  const T0 = Date.UTC(2026, 8, 3);

  it('legt keinen zweiten Kartenschlüssel an', async () => {
    // AE-16: eine Erinnerungsspur je Item. Ein eigener Schlüssel für die
    // Schreibübung wäre ein zweiter Zeitplan für dieselbe Tatsache.
    const store = await freshStore();
    const entry = deutsch('บ้าน');
    const prompt = buildWritingPrompt(entry, 'th_to_de');

    const vorher = await loadAllCardStates(store);
    await submitWriting(prompt, 'das Haus', { store, now: T0 });
    const nachher = await loadAllCardStates(store);

    expect(nachher.length).toBe(vorher.length + 1);
    const karte = await loadCardState(entry.id, 'th_to_de', store);
    expect(karte).not.toBeNull();
    expect(karte!.reps).toBe(1);
    // Genau der Schluessel der Karteikarte, kein dritter Bestandteil.
    expect(await store.get('cards', cardKey(entry.id, 'th_to_de'))).not.toBeNull();
    expect(await store.get('cards', `${cardKey(entry.id, 'th_to_de')}:writing`)).toBeNull();
  });

  it('lässt die Gegenrichtung unberührt', async () => {
    const store = await freshStore();
    const entry = de('บ้าน');
    await submitWriting(buildWritingPrompt(entry, 'th_to_de'), 'das Haus', { store, now: T0 });
    expect((await loadCardState(entry.id, 'de_to_th', store))?.reps ?? 0).toBe(0);
  });

  it('bewegt die Karte je nach Ergebnis unterschiedlich weit', async () => {
    const store = await freshStore();
    const entry = deutsch('บ้าน');
    const prompt = buildWritingPrompt(entry, 'th_to_de');

    await submitWriting(prompt, 'das Haus', { store, now: T0 });
    const nachGut = await loadCardState(entry.id, 'th_to_de', store);

    const store2 = await freshStore();
    await submitWriting(prompt, 'das Huas', { store: store2, now: T0 });
    const nachSchwer = await loadCardState(entry.id, 'th_to_de', store2);

    // „Gut" muss weiter tragen als „Schwer" - sonst waere die Toleranz eine
    // stille Gleichsetzung von sicher und unsicher.
    expect(nachGut!.stability!).toBeGreaterThan(nachSchwer!.stability!);
    expect(nachGut!.due).toBeGreaterThan(nachSchwer!.due);
  });

  it('zählt als Wiederholung, nicht als Übung', async () => {
    // Weil rateCard das Tagesprotokoll fortschreibt. Doppelt zu zaehlen -
    // einmal als Wiederholung, einmal als Uebung - wuerde die Zahlen
    // aufblaehen.
    const store = await freshStore();
    await submitWriting(buildWritingPrompt(deutsch('บ้าน'), 'th_to_de'), 'das Haus', {
      store,
      now: T0,
    });
    const log = await loadReviewLog(store);
    expect(log).toHaveLength(1);
    expect(log[0].total).toBe(1);
    expect(log[0].drills ?? 0).toBe(0);
  });

  it('gibt die bewertete Karte zurück, damit die Rückmeldung sie zeigen kann', async () => {
    const store = await freshStore();
    const result = await submitWriting(buildWritingPrompt(deutsch('บ้าน'), 'th_to_de'), 'das Haus', {
      store,
      now: T0,
    });
    expect(result.rating).toBe(WRITING_RATING.exact);
    expect(result.card.reps).toBe(1);
    expect(result.verdict.exact).toBe(true);
  });
});

describe('Eine Runde', () => {
  const T0 = Date.UTC(2026, 8, 3);

  it('stellt in beiden Richtungen eine Runde zusammen', async () => {
    for (const direction of ['de_to_th', 'th_to_de'] as Direction[]) {
      const store = await freshStore();
      const session = await buildWritingSession({ direction, store, now: T0, seed: 1 });
      expect(session.prompts).toHaveLength(10);
      expect(session.direction).toBe(direction);
      expect(session.available).toBeGreaterThanOrEqual(80);
      for (const prompt of session.prompts) {
        expect(prompt.targets.length).toBeGreaterThan(0);
        expect(prompt.language).toBe(direction === 'th_to_de' ? 'de' : 'th');
      }
    }
  });

  it('zieht keine Vokabel doppelt', async () => {
    const store = await freshStore();
    const session = await buildWritingSession({ direction: 'th_to_de', store, now: T0, seed: 7 });
    expect(new Set(session.prompts.map((prompt) => prompt.vocabId)).size).toBe(
      session.prompts.length
    );
  });

  it('fragt nach den Karteikarten nur Wörter aus demselben 20er-Paket ab', async () => {
    const store = await freshStore();
    const pack = VOCABULARY.slice(0, 20);
    const session = await buildWritingSession({
      direction: 'de_to_th', store, now: T0, seed: 7, entries: pack, size: 20,
    });
    expect(session.prompts).toHaveLength(20);
    expect(new Set(session.prompts.map((prompt) => prompt.vocabId))).toEqual(
      new Set(pack.map((entry) => entry.id))
    );
  });

  it('zählt richtige und fehlerfreie Antworten getrennt', () => {
    const prompt = buildWritingPrompt(deutsch('บ้าน'), 'th_to_de');
    const machen = (given: string) => ({
      prompt,
      given,
      verdict: verdictFor(given, prompt.targets),
      rating: WRITING_RATING.exact,
      card: {} as never,
    });
    const score = summarizeWriting([machen('das Haus'), machen('das Huas'), machen('das Auto')]);
    expect(score).toEqual({ correct: 2, exact: 1, total: 3 });
  });

  it('läuft ohne Schlüssel und ohne Netz', () => {
    // Pflicht 2: Der Abgleich ist reine Rechnung gegen den Grundstock.
    const verdict = verdictFor('das Haus', ['das Haus']);
    expect(verdict.exact).toBe(true);
  });
});

describe('Pflicht 2 — offline-first ist im Code verankert, nicht nur behauptet', () => {
  // Eine Zusicherung ueber Verhalten koennte man mit einem Mock erschleichen.
  // Diese hier liest den Quelltext: Wenn jemand spaeter einen Anbieter, einen
  // Schluessel oder ein fetch in den Schreibpfad zieht, faellt der Test um -
  // und zwar bevor die App ohne Internet unbrauchbar wird.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const dir = __dirname;
  const quellen = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));

  it('umfasst alle Module des Schreibpfads', () => {
    expect(quellen.sort()).toEqual(['compare.ts', 'index.ts', 'prompt.ts', 'rating.ts', 'session.ts']);
  });

  it('enthält weder fetch noch Anbieter noch Schlüssel', () => {
    for (const name of quellen) {
      const quelltext = fs.readFileSync(path.join(dir, name), 'utf8');
      const codeOhneKommentare = quelltext
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect({ name, treffer: /fetch\s*\(/.test(codeOhneKommentare) }).toEqual({ name, treffer: false });
      expect({ name, treffer: /providers\//.test(codeOhneKommentare) }).toEqual({ name, treffer: false });
      expect({ name, treffer: /api-key/.test(codeOhneKommentare) }).toEqual({ name, treffer: false });
    }
  });
});
