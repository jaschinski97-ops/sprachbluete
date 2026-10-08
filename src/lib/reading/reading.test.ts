import { TONE_KEYS, TONES } from '@/constants/tones';
// PHASE 16: `VOCABULARY` umfasst jetzt alle drei Sprachen. Was diese Datei
// zusichert, gilt dem Thai-Grundstock aus Phase 2 - deshalb hier
// ausdruecklich der. Unterhalb dieser Zeile hat sich nichts geaendert.
import { VOCABULARY_TH as VOCABULARY, VocabEntry } from '@/test-fixtures/legacy-vocabulary';
import {
  CONSONANT_BY_SYMBOL,
  HO_NAM_FOLLOWERS,
  O_NAM_WORDS,
  THAI_CONSONANTS,
  THAI_SCRIPT_SOURCE,
  TONE_MARK_KEYS,
  TONE_RULES,
  VOWEL_PATTERNS,
} from '@/data/thai-script';

import {
  buildToneQuestion,
  buildToneRuleQuestion,
  canBuildToneRuleQuestion,
} from '../drills/questions';
import { directionForDrill, DRILL_META } from '../drills/types';

import { analyzeSyllable, syllableShape, toneFrom } from './syllable';

/**
 * Phase 13 — die Schriftregeln und ihre Gegenprobe.
 *
 * Der Kern dieser Datei ist der Abgleich mit dem Grundstock: Fuer jeden
 * einsilbigen, quellengeprueften Eintrag ist der richtige Ton seit Phase 2
 * bekannt. Die Herleitung muss ihn treffen — oder sich ausdruecklich fuer
 * nicht zustaendig erklaeren. Was sie **nicht** darf, ist einen falschen Ton
 * behaupten: Das waere schlimmer als keine Uebung, weil Lernende die falsche
 * Regel mitlernen wuerden.
 */

const monosyllabic = VOCABULARY.filter((entry) => entry.syllables?.length === 1);

function shortLabel(entry: VocabEntry): string {
  return `${entry.term} (${entry.romanization}, ${entry.german})`;
}

describe('Die Datengrundlage stammt aus der Quelle', () => {
  it('nennt Quelle und Abrufdatum', () => {
    expect(THAI_SCRIPT_SOURCE.url).toContain('wikipedia.org');
    expect(THAI_SCRIPT_SOURCE.retrieved).toBe('2026-09-03');
  });

  it('fuehrt alle 44 Konsonanten mit der erwarteten Klassenverteilung', () => {
    // 9 mittel, 11 hoch, 24 tief - die Zahlen sind die Kontrolle dafuer, dass
    // beim Parsen keine Zeile verlorenging oder doppelt ankam.
    expect(THAI_CONSONANTS).toHaveLength(44);
    const byClass = { mid: 0, high: 0, low: 0 };
    for (const consonant of THAI_CONSONANTS) byClass[consonant.consonantClass] += 1;
    expect(byClass).toEqual({ mid: 9, high: 11, low: 24 });
    expect(new Set(THAI_CONSONANTS.map((c) => c.symbol)).size).toBe(44);
  });

  it('gibt jedem Konsonanten einen Schlusslaut oder sagt ausdruecklich, dass es keinen gibt', () => {
    for (const consonant of THAI_CONSONANTS) {
      if (consonant.finalKind === null) {
        expect(consonant.finalIpa).toBeNull();
      } else {
        expect(['sonorant', 'plosive']).toContain(consonant.finalKind);
        expect(consonant.finalIpa).toBeTruthy();
      }
    }
  });

  it('kennzeichnet die eine Stelle, an der die Quelle mehrdeutig ist', () => {
    // ล traegt in der Quelle „/n/ or /w/". Kennzeichnen statt entscheiden -
    // dasselbe Vorgehen wie bei ร้าน und นอน in Phase 2.
    const uncertain = THAI_CONSONANTS.filter((consonant) => consonant.uncertainNote);
    expect(uncertain.map((consonant) => consonant.symbol)).toEqual(['ล']);
    expect(uncertain[0].uncertainNote).toContain('/n/ or /w/');
  });

  it('haelt die Tonregeltabelle vollstaendig, inklusive der Luecken', () => {
    expect(TONE_MARK_KEYS).toHaveLength(4);
    for (const shape of ['live', 'dead-short', 'dead-long'] as const) {
      for (const klass of ['low', 'mid', 'high'] as const) {
        expect(TONE_KEYS).toContain(TONE_RULES.unmarked[shape][klass]);
      }
    }
    // Die Quelle ausdruecklich: „Mai tri and mai chattawa are only used with
    // mid-class consonants." Also gehoeren die Luecken zur Regel dazu.
    expect(TONE_RULES.marked['๊'].low).toBeNull();
    expect(TONE_RULES.marked['๊'].high).toBeNull();
    expect(TONE_RULES.marked['๊'].mid).toBe('high');
    expect(TONE_RULES.marked['๋'].low).toBeNull();
    expect(TONE_RULES.marked['๋'].mid).toBe('rising');
  });

  it('nennt fuer ห นำ genau die acht Folgekonsonanten der Quelle', () => {
    expect([...HO_NAM_FOLLOWERS].sort()).toEqual(['ง', 'ญ', 'น', 'ม', 'ย', 'ร', 'ล', 'ว'].sort());
    // Alle acht sind Tiefklasse - genau deshalb braucht es die Regel.
    for (const symbol of HO_NAM_FOLLOWERS) {
      expect(CONSONANT_BY_SYMBOL[symbol].consonantClass).toBe('low');
    }
  });

  it('fuehrt อ นำ als Wortliste, nicht als Regel', () => {
    // „In four words only" - eine Regel wuerde mehr behaupten als die Quelle.
    expect(O_NAM_WORDS).toHaveLength(4);
    expect(O_NAM_WORDS).toContain('อยาก');
  });

  it('sortiert die Vokalmuster so, dass laengere vor ihren Anfaengen stehen', () => {
    // Sonst verschluckt „เ◌" (langes /eː/) den Anfang von „เ◌ีย◌".
    VOWEL_PATTERNS.forEach((pattern, index) => {
      const laterConflict = VOWEL_PATTERNS.slice(index + 1).find(
        (other) =>
          other.prefix === pattern.prefix &&
          other.infix.length > pattern.infix.length &&
          other.infix.startsWith(pattern.infix)
      );
      expect(laterConflict && `${pattern.display} vor ${laterConflict.display}`).toBeFalsy();
    });
  });
});

describe('Silbenart aus Vokallaenge und Schlusslaut', () => {
  const plosive = { written: 'ก', consonant: CONSONANT_BY_SYMBOL['ก'], kind: 'plosive' as const };
  const sonorant = { written: 'น', consonant: CONSONANT_BY_SYMBOL['น'], kind: 'sonorant' as const };

  it('folgt dem Wortlaut der Quelle', () => {
    expect(syllableShape('long', null, false)).toBe('live');
    expect(syllableShape('short', sonorant, false)).toBe('live');
    expect(syllableShape('long', sonorant, false)).toBe('live');
    expect(syllableShape('short', null, false)).toBe('dead-short');
    expect(syllableShape('short', plosive, false)).toBe('dead-short');
    expect(syllableShape('long', plosive, false)).toBe('dead-long');
  });

  it('zaehlt einen Halbvokal am Musterende als klingenden Schluss', () => {
    // เ◌า, ไ◌ und ◌ำ sind kurz, enden aber auf /w/, /j/ bzw. /m/ - laut
    // Quelle „vowel plus sonorant", also lebend. Ohne diese Unterscheidung
    // waere ไป (bpai) eine tote Silbe und bekaeme den falschen Ton.
    expect(syllableShape('short', null, true)).toBe('live');
  });
});

describe('Die Tonregel selbst', () => {
  it('gibt ohne Zeichen die Zeile der Silbenart zurueck', () => {
    expect(toneFrom('low', 'live', null)).toBe('mid');
    expect(toneFrom('high', 'live', null)).toBe('rising');
    expect(toneFrom('low', 'dead-short', null)).toBe('high');
    expect(toneFrom('low', 'dead-long', null)).toBe('falling');
    expect(toneFrom('mid', 'dead-short', null)).toBe('low');
  });

  it('laesst mit Zeichen die Silbenart ausser Acht', () => {
    for (const shape of ['live', 'dead-short', 'dead-long'] as const) {
      expect(toneFrom('low', shape, '่')).toBe('falling');
      expect(toneFrom('mid', shape, '้')).toBe('falling');
    }
  });

  it('meldet eine Kombination, die es nicht gibt', () => {
    expect(toneFrom('low', 'live', '๊')).toBeNull();
    expect(toneFrom('high', 'live', '๋')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('Gegenprobe gegen den Grundstock', () => {
  it('hat ueberhaupt genug Material', () => {
    expect(monosyllabic.length).toBeGreaterThanOrEqual(60);
  });

  it('leitet fuer KEINEN Eintrag einen falschen Ton her', () => {
    // Der wichtigste Test dieser Phase. Ein Fehlschlag ist hinnehmbar - die
    // Analyse sagt dann „nicht herleitbar". Ein FALSCHER Ton ist es nicht:
    // Lernende wuerden die falsche Regel mitlernen.
    const wrong: string[] = [];
    for (const entry of monosyllabic) {
      const result = analyzeSyllable(entry.term);
      if (!result.ok) continue;
      if (result.tone !== entry.syllables[0].tone) {
        wrong.push(
          `${shortLabel(entry)}: hergeleitet ${TONES[result.tone].label}, ` +
            `belegt ${TONES[entry.syllables[0].tone!].label}`
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it('leitet fuer alle 69 einsilbigen Eintraege den belegten Ton her', () => {
    // Die Regeln decken den ganzen Grundstock ab. Sollte hier spaeter ein
    // Eintrag durchfallen, nennt die Meldung ihn samt Grund - dann ist zu
    // entscheiden, ob eine Regel fehlt oder das Wort eine Ausnahme ist.
    const unresolved = monosyllabic
      .map((entry) => ({ entry, result: analyzeSyllable(entry.term) }))
      .filter(({ result }) => !result.ok)
      .map(({ entry, result }) => `${shortLabel(entry)}: ${(result as { reason: string }).reason}`);
    expect(unresolved).toEqual([]);
  });

  it('deckt dabei alle fuenf Toene ab', () => {
    const derived = new Set(
      monosyllabic
        .map((entry) => analyzeSyllable(entry.term))
        .filter((result) => result.ok)
        .map((result) => (result as { tone: string }).tone)
    );
    expect([...derived].sort()).toEqual([...TONE_KEYS].sort());
  });
});

describe('Die Faelle, an denen die Regel haengt', () => {
  const derive = (word: string) => {
    const result = analyzeSyllable(word);
    if (!result.ok) throw new Error(`${word}: ${result.reason}`);
    return result;
  };

  it('hebt ห นำ die Klasse an — หมา ist steigend, nicht mittel', () => {
    const analysis = derive('หมา');
    expect(analysis.initial.leading).toBe('ho-nam');
    expect(analysis.initial.consonantClass).toBe('high');
    expect(analysis.initial.soundFrom.symbol).toBe('ม');
    expect(analysis.tone).toBe('rising');
    // Ohne die Regel waere ม allein Tiefklasse und ergaebe „mittel".
    expect(toneFrom('low', 'live', null)).toBe('mid');
  });

  it('nimmt bei einer Verbindung die Klasse des ersten Buchstabens', () => {
    const analysis = derive('ปลา');
    expect(analysis.initial.cluster).toBe(true);
    expect(analysis.initial.classFrom.symbol).toBe('ป');
    expect(analysis.tone).toBe('mid');
  });

  it('unterscheidet ห นำ von einer gewoehnlichen Verbindung', () => {
    // หก ist ห + ก: ก steht nicht in der ห-นำ-Liste, ist also Schlusslaut.
    const hok = derive('หก');
    expect(hok.initial.leading).toBeNull();
    expect(hok.final?.written).toBe('ก');
    expect(hok.tone).toBe('low');
  });

  it('kennt อ นำ nur in den vier Woertern der Quelle', () => {
    const analysis = derive('อยาก');
    expect(analysis.initial.leading).toBe('o-nam');
    expect(analysis.initial.consonantClass).toBe('mid');
    expect(analysis.tone).toBe('low');
  });

  it('liest den impliziten Vokal und kennzeichnet ihn als mehrdeutig', () => {
    const analysis = derive('คน');
    expect(analysis.vowel.implicit).toBe(true);
    expect(analysis.tone).toBe('mid');
    expect(analysis.uncertain).toContain('/ɔː/');
  });

  it('trennt tote kurze von toten langen Silben', () => {
    // Beide Tiefklasse, beide ohne Zeichen - allein die Vokallaenge
    // entscheidet zwischen hoch und fallend.
    expect(derive('รัก').shape).toBe('dead-short');
    expect(derive('รัก').tone).toBe('high');
    expect(derive('มาก').shape).toBe('dead-long');
    expect(derive('มาก').tone).toBe('falling');
  });

  it('behandelt einen kurzen Vokal mit klingendem Schluss als lebend', () => {
    expect(derive('เย็น').shape).toBe('live');
    expect(derive('เย็น').tone).toBe('mid');
    expect(derive('เล็ก').shape).toBe('dead-short');
    expect(derive('เล็ก').tone).toBe('high');
  });

  it('laesst das Tonzeichen die Silbenart ueberstimmen', () => {
    // ค่ะ waere ohne Zeichen als tote kurze Silbe „hoch"; mai ek macht daraus
    // bei Tiefklasse „fallend".
    const analysis = derive('ค่ะ');
    expect(analysis.shape).toBe('dead-short');
    expect(analysis.toneMark).toBe('่');
    expect(analysis.tone).toBe('falling');
  });
});

describe('Was die Analyse ausdruecklich nicht kann', () => {
  it('weist mehrsilbige Woerter zurueck, statt eine Silbengrenze zu raten', () => {
    // AE-8 gilt unveraendert: Silbengrenzen sind nicht markiert. ผลไม้ ist der
    // Beleg aus Phase 3 - drei Silben, aber die mittlere teilt sich einen
    // Bindekonsonanten mit ihren Nachbarn.
    for (const entry of VOCABULARY.filter((candidate) => candidate.syllables.length > 1)) {
      const result = analyzeSyllable(entry.term);
      if (result.ok) {
        throw new Error(
          `${shortLabel(entry)} ist ${entry.syllables.length}-silbig, wurde aber als eine Silbe gelesen.`
        );
      }
      expect(result.reason).toBeTruthy();
    }
  });

  it('meldet leere und unbekannte Eingaben mit Grund', () => {
    expect(analyzeSyllable('   ')).toMatchObject({ ok: false });
    const latin = analyzeSyllable('abc');
    expect(latin.ok).toBe(false);
    expect((latin as { reason: string }).reason).toContain('gehoert nicht');
  });

  it('weist zwei Tonzeichen zurueck', () => {
    const result = analyzeSyllable('ก่้า');
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain('Tonzeichen');
  });
});

// ---------------------------------------------------------------------------

describe('Die Uebung „Ton herleiten"', () => {
  const buildable = VOCABULARY.filter(canBuildToneRuleQuestion);

  it('hat genug Material und deckt den ganzen einsilbigen Grundstock ab', () => {
    expect(buildable).toHaveLength(monosyllabic.length);
    expect(buildable.length).toBeGreaterThanOrEqual(60);
  });

  it('markiert bei jeder Aufgabe den quellengeprueften Ton als richtig', () => {
    // Der Punkt der Gegenprobe auf Aufgabenebene: Was die Uebung als richtig
    // wertet, ist der Ton aus Phase 2 - und die angezeigte Herleitung fuehrt
    // genau dorthin. Beides auseinanderlaufen zu lassen waere schlimmer als
    // gar keine Uebung.
    for (const entry of buildable) {
      const question = buildToneRuleQuestion(entry);
      expect(question.options[question.correctIndex].tone).toBe(entry.syllables[0].tone);
      const result = question.derivation?.[question.derivation.length - 1];
      expect(result?.label).toBe('Ergebnis');
      expect(result?.value).toBe(TONES[entry.syllables[0].tone!].label);
    }
  });

  it('zeigt die Schrift und verraet die Umschrift nicht', () => {
    // Die Umschrift traegt die Tonzeichen (à, á, â, ǎ) und waere die Antwort.
    const question = buildToneRuleQuestion(VOCABULARY.find((e) => e.term === 'หมา')!);
    expect(question.visible).toBe('หมา');
    expect(question.visibleRoman).toBeUndefined();
    expect(question.solution).toContain('mǎa');
    expect(question.visibleHint).toBeNull();
    expect(question.speak).toBeNull();
  });

  it('erklaert jeden Schritt der Herleitung, nicht nur das Ergebnis', () => {
    const question = buildToneRuleQuestion(VOCABULARY.find((e) => e.term === 'หมา')!);
    const labels = question.derivation!.map((step) => step.label);
    expect(labels).toEqual([
      'Anfangskonsonant',
      'Konsonantenklasse',
      'Vokal',
      'Schlusslaut',
      'Silbenart',
      'Tonzeichen',
      'Ergebnis',
    ]);
    for (const step of question.derivation!) expect(step.detail.length).toBeGreaterThan(10);
    expect(question.derivation![0].detail).toContain('ห นำ');
  });

  it('reicht eine benannte Unsicherheit bis in die Aufgabe durch', () => {
    const question = buildToneRuleQuestion(VOCABULARY.find((e) => e.term === 'คน')!);
    expect(question.uncertain).toContain('/ɔː/');
  });

  it('benutzt dieselbe feste Tonreihenfolge wie die Hoer-Uebung', () => {
    // Wer beide uebt, soll nicht zwei Ordnungen im Kopf behalten muessen.
    const entry = VOCABULARY.find((candidate) => candidate.term === 'ไก่')!;
    const byEar = buildToneQuestion(entry).options.map((option) => option.tone);
    const byRule = buildToneRuleQuestion(entry).options.map((option) => option.tone);
    expect(byRule).toEqual(byEar);
    expect(byRule).toEqual(TONE_KEYS);
  });

  it('faerbt die Antworten ueber die geprueften Tonfarben statt einer zweiten Darstellung', () => {
    // Pflicht 4: keine zweite Darstellung neben constants/tones.ts. Die
    // Option traegt nur den Ton; Farbe und Konturglyphe holt die Oberflaeche
    // daraus - inklusive der in Phase 9 kontrastgeprueften Fassungen.
    const question = buildToneRuleQuestion(VOCABULARY.find((e) => e.term === 'ไก่')!);
    for (const option of question.options) {
      expect(option.tone).toBeTruthy();
      expect(option.label).toBe(TONES[option.tone!].label);
    }
  });

  it('wirft, statt eine Aufgabe aus einem mehrsilbigen Wort zu bauen', () => {
    const multi = VOCABULARY.find((entry) => entry.syllables.length > 1)!;
    expect(canBuildToneRuleQuestion(multi)).toBe(false);
    expect(() => buildToneRuleQuestion(multi)).toThrow();
  });

  it('gehoert zur Richtung, die Thai lernt', () => {
    expect(directionForDrill('toneRule', 'th')).toBe('de_to_th');
    expect(DRILL_META.toneRule.label).toBe('Ton herleiten');
  });
});
