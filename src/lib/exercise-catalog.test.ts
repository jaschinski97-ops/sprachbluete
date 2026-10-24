import { zieleFuerBruecke } from '@/lib/languages/goals';
import { FOREIGN_BRIDGES, PAIRS, SUPPORTED_TARGETS } from '@/lib/languages/types';

import {
  groupsForDirection,
  modeKey,
  modesForDirection,
  type Group,
  type Mode,
} from './exercise-catalog';

/**
 * Der Kategorien-Gleichstand (Lern-Reiter-Ausbau, Nutzerwunsch 13.09.2026):
 * Jedes Lernziel zeigt dieselben fünf Kategorien in derselben Reihenfolge —
 * Wortschatz · Hören · Lesen & Schreiben · Sprechen · Grammatik — und
 * KEINE Kategorie bleibt leer. Vorher gruppierte jede Richtung einzeln,
 * Deutsch hatte kein Lesen und Thai/Englisch/Spanisch keine Grammatik;
 * genau diese Lücken pinnt dieser Test jetzt als verboten.
 */

const GROUP_ORDER = [
  'skill.wortschatz',
  'skill.hoeren',
  'skill.lesenSchreiben',
  'skill.sprechen',
  'skill.grammatik',
] as const;

function labelsOf(groups: Group[]): string[] {
  return groups.map((group) => group.label);
}

function modesOf(groups: Group[]): Mode[] {
  return groups.flatMap((group) => group.modes);
}

describe('Kategorien-Gleichstand der vier Lernziele (Brücke Deutsch)', () => {
  const ziele = zieleFuerBruecke('de');

  it('sind genau die vier Bestandsziele', () => {
    expect(ziele.map((ziel) => ziel.direction)).toEqual([
      'de_to_th',
      'de_to_en',
      'de_to_es',
    ]);
  });

  for (const ziel of ziele) {
    describe(ziel.direction, () => {
      const groups = groupsForDirection(ziel.direction);

      it('zeigt genau die fünf Kategorien in fester Reihenfolge', () => {
        expect(labelsOf(groups)).toEqual([...GROUP_ORDER]);
      });

      it('hat in jeder Kategorie mindestens eine Übung', () => {
        for (const group of groups) {
          expect(group.modes.length).toBeGreaterThanOrEqual(1);
        }
      });

      it('hat Schreiben innerhalb von Lesen & Schreiben, nicht als eigene Gruppe', () => {
        const gruppe = groups.find((group) => group.label === 'skill.lesenSchreiben')!;
        if (ziel.direction === 'th_to_de') {
          // Freies Schreiben bleibt de-geankert — nur hier mit dabei.
          expect(gruppe.modes).toContain('writing');
        }
        expect(labelsOf(groups).filter((label) => label === 'skill.schreiben')).toEqual([]);
      });

      it('fragt Karteikarten als Wortschatz ab', () => {
        const gruppe = groups.find((group) => group.label === 'skill.wortschatz')!;
        expect(gruppe.modes).toEqual(['cards', 'wortliste']);
      });

      it('hat immer Hören (Satz verstehen, Diktat)', () => {
        const gruppe = groups.find((group) => group.label === 'skill.hoeren')!;
        expect(gruppe.modes).toContain('sentenceListening');
        expect(gruppe.modes).toContain('dictation');
      });

      it('hat immer Sprechen (Shadowing, Satz wiederholen)', () => {
        const gruppe = groups.find((group) => group.label === 'skill.sprechen')!;
        expect(gruppe.modes).toContain('shadowing');
        expect(gruppe.modes).toContain('sentenceRepeat');
      });

      it('trägt die neue Übungs-Ausstattung', () => {
        const modes = modesOf(groups);
        if (ziel.direction === 'de_to_th') expect(modes).toContain('polite');
        if (ziel.direction === 'de_to_en') expect(modes).toContain('irregularPast');
        if (ziel.direction === 'de_to_es') expect(modes).toContain('serEstar');
        if (ziel.direction === 'th_to_de') expect(modes).toContain('deutschLesen');
      });
    });
  }
});

describe('Kategorien-Gleichstand über allen Paaren und Brücken', () => {
  const richtungen: string[] = [
    ...PAIRS.map((pair) => `${pair.source}_to_${pair.target}`),
    ...FOREIGN_BRIDGES.slice(0, 4).flatMap((bridge) =>
      SUPPORTED_TARGETS.map((target) => `${bridge}_to_${target}`)
    ),
  ];

  it('gibt genug Richtungen zum Probieren', () => {
    expect(richtungen.length).toBeGreaterThanOrEqual(24);
  });

  for (const direction of richtungen) {
    it(`${direction}: fünf Kategorien, keine leer`, () => {
      const groups = groupsForDirection(direction as never);
      expect(labelsOf(groups)).toEqual([...GROUP_ORDER]);
      for (const group of groups) {
        expect(group.modes.length).toBeGreaterThanOrEqual(1);
      }
    });
  }
});

describe('Die Übungsliste ist vollständig gruppiert und beschriftet', () => {
  for (const direction of ['de_to_th', 'de_to_es', 'th_to_de', 'en_to_es'] as const) {
    it(`${direction}: jeder Modus steckt in genau einer Gruppe und hat einen Schlüssel`, () => {
      const groups = groupsForDirection(direction);
      const modes = modesOf(groups);
      expect(new Set(modes).size).toBe(modes.length);
      expect(new Set(modes)).toEqual(new Set(modesForDirection(direction)));
      for (const mode of modes) {
        expect(typeof modeKey(mode)).toBe('string');
      }
    });
  }
});
