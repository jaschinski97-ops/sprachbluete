import { isDeAnchored, isPairDirection } from '../languages/types';

import { lesbareLaufkennung, situationSprachenFuerBruecke, situationId, SITUATION_SPRACHEN, Situationssprache } from './types';

/**
 * Der Gesprächs-Reiter listet SPRACHEN (14.09.): Die Zuordnung Sprache →
 * Richtungs-Menge ist die Schiene des ganzen Reiters — steht sie schief,
 * landen die Dialoge unter der falschen Sprache. Darum festgenagelt.
 */
describe('SITUATION_SPRACHEN — die Sprachliste des Gesprächs-Reiters', () => {
  it('zeigt dieselben Sprachen wie die Lernziele der Oberfläche', () => {
    // Deutsch nie auf deutscher Oberfläche (Nutzerentscheidung 19.09.).
    expect(situationSprachenFuerBruecke('de').map(e => e.sprache)).toEqual(['th', 'en', 'es']);
    // Thai-Oberfläche: Thai ausgeblendet wie Deutsch auf deutscher (08.10.2026).
    expect(situationSprachenFuerBruecke('th').map(e => e.sprache)).toEqual(['de', 'en', 'es']);
    // Englische Oberfläche: Englisch lernt man dort nicht.
    expect(situationSprachenFuerBruecke('en').map(e => e.sprache)).toEqual(['de', 'th', 'es']);
    expect(situationSprachenFuerBruecke('ar')).toEqual(SITUATION_SPRACHEN);
  });
  it('ordnet jeder Sprache die Menge zu, in der SIE die Dialogseite ist', () => {
    const mapping = new Map(SITUATION_SPRACHEN.map((eintrag) => [eintrag.sprache, eintrag.direction]));
    expect(mapping.get('de')).toBe('th_to_de'); // die deutschsprachigen Dialoge
    expect(mapping.get('th')).toBe('de_to_th'); // die thailändischen Dialoge
    expect(mapping.get('en')).toBe('de_to_en');
    expect(mapping.get('es')).toBe('de_to_es');
  });

  it('führt Deutsch als ERSTE Sprache (Nutzerwunsch 14.09.)', () => {
    expect(SITUATION_SPRACHEN[0].sprache).toBe('de');
  });

  it('deckt die vier Einträge je genau einmal ab, alle Richtungen sind echt', () => {
    const sprachen = SITUATION_SPRACHEN.map((eintrag) => eintrag.sprache);
    expect(new Set(sprachen).size).toBe(sprachen.length);
    expect([...sprachen].sort()).toEqual(['de', 'en', 'es', 'th']);
    for (const { direction } of SITUATION_SPRACHEN) {
      expect(isPairDirection(direction)).toBe(true);
      expect(isDeAnchored(direction)).toBe(true);
    }
  });

  it('baut dieselben IDs wie der Bauplan — Reiter und Lauf bleiben kompatibel', () => {
    // Die Mengen des Reiters sind genau die Richtungen des Generators; der
    // ID-Schlüssel muss unverändert bleiben, sonst findet der Exists-Check
    // laufende Situationen nicht wieder.
    expect(situationId('market', 'A1', 'th_to_de', 7)).toBe('market-A1-th_to_de-007');
  });
});

describe('lesbareLaufkennung — Studio-Anzeige ohne GER-Kürzel (18.10.2026)', () => {
  it('nennt Thema, Stufe und Teil statt A1–C2', () => {
    expect(lesbareLaufkennung(situationId('market', 'B1', 'de_to_th', 3))).toBe('Markt & Einkaufen · Fortgeschritten Einstieg · de_to_th · Variante 3');
    expect(lesbareLaufkennung(situationId('society', 'C2', 'th_to_de', 12))).toBe('Nachrichten & Gesellschaft · Profi Aufbau · th_to_de · Variante 12');
    expect(lesbareLaufkennung(situationId('greeting', 'A2', 'de_to_es', 1))).not.toMatch(/\b[ABC][12]\b/);
  });
  it('lässt andere Kennungen unverändert', () => {
    expect(lesbareLaufkennung('th-37a2e8e7e48050be')).toBe('th-37a2e8e7e48050be');
    expect(lesbareLaufkennung('unbekannt-B1-de_to_th-001')).toBe('unbekannt-B1-de_to_th-001');
  });
});

// Typprobe: Deutsch ist als Gesprächssprache vertreten, obwohl LanguageCode
// im Stoff-Registry nur th/en/es kennt.
const probe: Situationssprache = 'de';
void probe;
