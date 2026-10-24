import { seededRandom } from './drills/random';
import { createCardState } from './fsrs/fsrs';
import type { FSRSCardState } from './fsrs/types';
import {
  NEW_WORD_SHARE,
  practiceAdjustment,
  selectPracticeWords,
  wordNeed,
} from './practice-selection';
import type { WordPractice } from './word-practice';

const T0 = Date.UTC(2026, 9, 22, 10);
const DAY = 24 * 60 * 60 * 1000;

type Item = { id: string };

/** Eine gelernte Karte: Stabilität klein = wacklig, groß = sitzt. */
function learned(id: string, stability: number, daysAgo = 10): FSRSCardState {
  return {
    ...createCardState(id, 'de_to_th', T0),
    state: 'review',
    difficulty: 5,
    stability,
    lastReview: T0 - daysAgo * DAY,
    reps: 3,
  };
}

function practiced(id: string, lastCorrect: boolean, streak: number, daysAgo = 0): WordPractice {
  return { vocabId: id, total: Math.max(1, streak), correct: lastCorrect ? streak : 0, streak, lastAt: T0 - daysAgo * DAY, lastCorrect };
}

function items(prefix: string, count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}` }));
}

function pick(
  candidates: Item[],
  cards: FSRSCardState[],
  options: { size?: number; seed?: number; practice?: WordPractice[]; limitNew?: boolean } = {}
): string[] {
  return selectPracticeWords(candidates, {
    idOf: (item) => item.id,
    cards: new Map(cards.map((card) => [card.vocabId, card])),
    practice: new Map((options.practice ?? []).map((entry) => [entry.vocabId, entry])),
    now: T0,
    size: options.size ?? 10,
    random: seededRandom(options.seed ?? 1),
    limitNew: options.limitNew,
  }).map((item) => item.id);
}

describe('Auswahl freier Übungen', () => {
  it('nimmt gelernte, wacklige Wörter zuerst und nur wenige neue', () => {
    // Der Fall aus der Prüfung vom 22.10.2026: viele nie gelernte Wörter vorn
    // im Wortschatz, die gelernten wackligen weiter hinten.
    const neu = items('neu', 100);
    const wacklig = items('wacklig', 30);
    const cards = wacklig.map((item) => learned(item.id, 0.5));
    for (const seed of [1, 2, 3, 4, 5]) {
      const chosen = pick([...neu, ...wacklig], cards, { seed });
      expect(chosen).toHaveLength(10);
      expect(chosen.filter((id) => id.startsWith('neu'))).toHaveLength(Math.round(10 * NEW_WORD_SHARE));
      expect(chosen.filter((id) => id.startsWith('wacklig'))).toHaveLength(8);
    }
  });

  it('füllt mit gut Sitzendem auf, bevor weitere neue Wörter kommen', () => {
    const neu = items('neu', 100);
    const wacklig = items('wacklig', 3);
    const sitzt = items('sitzt', 40);
    const cards = [
      ...wacklig.map((item) => learned(item.id, 0.5)),
      ...sitzt.map((item) => learned(item.id, 5000, 1)),
    ];
    const chosen = pick([...neu, ...wacklig, ...sitzt], cards);
    expect(chosen.filter((id) => id.startsWith('wacklig'))).toHaveLength(3);
    expect(chosen.filter((id) => id.startsWith('neu'))).toHaveLength(2);
    expect(chosen.filter((id) => id.startsWith('sitzt'))).toHaveLength(5);
  });

  it('gibt ohne Gelerntes eine Runde aus den häufigsten neuen Wörtern', () => {
    const neu = items('neu', 100);
    const chosen = pick(neu, []);
    expect(chosen).toHaveLength(10);
    // Fenster = dreifache Rundengröße der Häufigkeitsreihenfolge.
    for (const id of chosen) expect(Number(id.slice(3))).toBeLessThan(30);
  });

  it('holt erst dann mehr neue Wörter, wenn sonst nichts mehr da ist', () => {
    const neu = items('neu', 100);
    const wacklig = items('wacklig', 2);
    const chosen = pick([...neu, ...wacklig], wacklig.map((item) => learned(item.id, 0.5)));
    expect(chosen.filter((id) => id.startsWith('wacklig'))).toHaveLength(2);
    expect(chosen.filter((id) => id.startsWith('neu'))).toHaveLength(8);
  });

  it('stellt Wörter zurück, die in Übungen mehrmals in Folge richtig waren', () => {
    const wacklig = items('wacklig', 20);
    const cards = wacklig.map((item) => learned(item.id, 0.5));
    // Die ersten zehn heute dreimal richtig — die anderen zehn reichen für die Runde.
    const practice = wacklig.slice(0, 10).map((item) => practiced(item.id, true, 3));
    for (const seed of [1, 2, 3]) {
      const chosen = pick(wacklig, cards, { seed, size: 8, practice });
      for (const id of chosen) expect(Number(id.slice(7))).toBeGreaterThanOrEqual(10);
    }
  });

  it('holt ein sicheres Wort nach vorn, wenn es in einer Übung falsch war', () => {
    const sitzt = items('sitzt', 40);
    const cards = sitzt.map((item) => learned(item.id, 5000, 1));
    const practice = [practiced('sitzt39', false, 0)];
    expect(wordNeed(cards[39], practice[0], T0).group).toBe('wacklig');
    for (const seed of [1, 2, 3, 4]) {
      expect(pick(sitzt, cards, { seed, practice })).toContain('sitzt39');
    }
  });

  it('wechselt auch bei neuen Wörtern durch, statt dieselben zu wiederholen', () => {
    // Vorher zog jede Hörübung ohne Kartenfortschritt dieselben ~30 Wörter.
    const neu = items('neu', 100);
    const practice = neu.slice(0, 30).map((item) => practiced(item.id, true, 1));
    const chosen = pick(neu, [], { practice });
    for (const id of chosen) expect(Number(id.slice(3))).toBeGreaterThanOrEqual(30);
  });

  it('pausiert gerade richtig Beantwortetes und holt es am nächsten Tag zurück', () => {
    const wacklig = items('wacklig', 3);
    const cards = wacklig.map((item) => learned(item.id, 0.5));
    const heute = [practiced('wacklig0', true, 1)];
    expect(wordNeed(cards[0], heute[0], T0).group).toBe('sitzt');
    // Ein Tag später ist die Pause vorbei — das Wort ist wieder wacklig.
    const gestern = [practiced('wacklig0', true, 1, 1)];
    expect(wordNeed(cards[0], gestern[0], T0).group).toBe('wacklig');
    expect(pick([...items('neu', 50), ...wacklig], cards, { practice: gestern })).toContain('wacklig0');
  });

  it('lässt Übungsantworten mit der Zeit verblassen', () => {
    expect(practiceAdjustment(practiced('a', true, 3), T0)).toBeCloseTo(1.3);
    expect(practiceAdjustment(practiced('a', true, 3, 3), T0)).toBeCloseTo(0.15);
    expect(practiceAdjustment(practiced('a', false, 0, 30), T0)).toBeGreaterThan(-0.001);
    expect(practiceAdjustment(undefined, T0)).toBe(0);
  });

  it('kennt bei fester Wortliste keine Neu-Grenze', () => {
    // Kapitel: Dort sind die neuen Dialogwörter der eigentliche Stoff.
    const neu = items('neu', 12);
    const wacklig = items('wacklig', 3);
    const chosen = pick([...neu, ...wacklig], wacklig.map((item) => learned(item.id, 0.5)), {
      limitNew: false,
    });
    expect(chosen.filter((id) => id.startsWith('neu')).length).toBeGreaterThan(2);
  });

  it('liefert keine Dopplungen und bleibt bei kleinem Bestand vollständig', () => {
    const neu = items('neu', 3);
    const wacklig = items('wacklig', 2);
    const chosen = pick([...neu, ...wacklig], wacklig.map((item) => learned(item.id, 0.5)));
    expect(new Set(chosen).size).toBe(chosen.length);
    expect(chosen).toHaveLength(5);
  });

  it('ist mit derselben Aussaat reproduzierbar', () => {
    const neu = items('neu', 50);
    const wacklig = items('wacklig', 20);
    const cards = wacklig.map((item) => learned(item.id, 0.5));
    expect(pick([...neu, ...wacklig], cards, { seed: 7 })).toEqual(pick([...neu, ...wacklig], cards, { seed: 7 }));
  });
});

describe('knownFromPractice (mitwachsende Satzübungen, 24.10.2026)', () => {
  it('ein Wort nur im Übungsgedächtnis zählt als gelernt statt als neu', () => {
    const richtig = practiced('a', true, 2, 1);
    const falsch = practiced('b', false, 0, 1);
    expect(wordNeed(undefined, richtig, T0).group).toBe('neu');
    expect(wordNeed(undefined, richtig, T0, true).group).toBe('sitzt');
    expect(wordNeed(undefined, falsch, T0, true).group).toBe('wacklig');
    expect(wordNeed(undefined, undefined, T0, true).group).toBe('neu');
  });

  it('wacklige Übungswörter kommen vor neuen, auch weit hinten im Wortschatz', () => {
    const candidates = items('w', 200);
    const practice = new Map(['w150', 'w160', 'w170'].map((id) => [id, practiced(id, false, 0, 1)]));
    const chosen = selectPracticeWords(candidates, {
      idOf: (item) => item.id, cards: new Map(), practice, now: T0, size: 8, random: seededRandom(1), knownFromPractice: true,
    }).map((item) => item.id);
    expect(chosen).toEqual(expect.arrayContaining(['w150', 'w160', 'w170']));
  });
});
