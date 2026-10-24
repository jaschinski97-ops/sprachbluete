import { DRILL_META, DrillId, drillsForDirection } from '@/lib/drills/types';
import type { FoundationMode } from '@/lib/foundations';
import type { SentenceMode } from '@/lib/speaking/sentence-session';
import type { TranslationKey } from '@/lib/i18n';
import { learningLanguage } from '@/lib/languages/definitions';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';

/**
 * Der Übungskatalog des Lern-Reiters (Lern-Reiter-Ausbau 13.09.2026).
 *
 * WAS JETZT ANDERS IST: Vorher gruppierte jede Richtung ihre Übungen selbst,
 * und Gruppen erschienen nur, wenn sie gefüllt waren — Deutsch hatte kein
 * Lesen, Thai/Englisch/Spanisch keine Grammatik, Englisch/Spanisch keine
 * Sprech-Übung. Jetzt gibt es ÜBERALL dieselben fünf Kategorien in
 * derselben Reihenfolge:
 *
 *   Wortschatz · Hören · Lesen & Schreiben · Sprechen · Grammatik
 *
 * Die Reihenfolge ist fest: Wer von Thai auf Spanisch wechselt, sucht
 * „Hören“ nicht an einer neuen Stelle. Und die Struktur ist TESTBAR: Der
 * Paritäts-Test (`exercise-catalog.test.ts`) fährt alle Richtungen durch
 * und verlangt für jede genau diese fünf Gruppen, jede mit mindestens
 * einer Übung — „Schreiben“ gehört seit dem Umbau zu „Lesen & Schreiben“.
 */

/** Karteikarten oder eine der richtungseigenen Übungen — plus „Heutige Runde“ als Sammelmodus. */
export type Mode =
  | 'path'
  | 'advanced'
  | 'cards'
  /** Wortliste: 20 Wörter, eine Seite verdeckt selbst eintragen (24.10.2026). */
  | 'wortliste'
  | DrillId
  | 'speaking'
  | 'sagen'
  | 'rollenspiel'
  | 'lesestoffe'
  | 'writing'
  | 'dictation'
  | SentenceMode
  | 'heute'
  /** Kapitel 0 „Grundlagen“ (18.10.2026) — nur über den Lernpfad erreichbar. */
  | FoundationMode;

/** Die Schritte von Kapitel 0 als Übersetzungsschlüssel. */
const FOUNDATION_KEYS: Record<FoundationMode, TranslationKey> = {
  zahlen: 'foundations.numbers',
  preise: 'foundations.prices',
  abc: 'foundations.alphabet',
  buchstabieren: 'foundations.spelling',
  konsonanten: 'foundations.consonants',
  vokale: 'foundations.vowels',
  toene: 'foundations.tones',
};

/** Die Wort-Sprechübung und die Auswahlübungen als Übersetzungsschlüssel. */
export const DRILL_KEYS: Record<DrillId, TranslationKey> = {
  tone: 'drill.tone',
  toneRule: 'drill.toneRule',
  article: 'drill.article',
  verbForms: 'drill.verbForms',
  stressRule: 'drill.stressRule',
  spelling: 'drill.spelling',
  stressHear: 'drill.stressHear',
  soundSpelling: 'drill.soundSpelling',
  deutschLesen: 'drill.deutschLesen',
  polite: 'drill.polite',
  irregularPast: 'drill.irregularPast',
  serEstar: 'drill.serEstar',
  zaehlerwort: 'drill.zaehlerwort',
  konsonantenklasse: 'drill.konsonantenklasse',
  praesensEndung: 'drill.praesensEndung',
  partizip: 'drill.partizip',
};

/**
 * Die Übungsliste einer Richtung.
 *
 * Allgemeine Übungen (Karten, Satzübungen, Diktat, Schreiben, Sag es,
 * Rollenspiel, Lesetexte) gibt es für JEDE Lernsprache; dazu kommen die
 * sprachspezifischen Übungen und die Wortübung aus `definitions.ts`
 * (Thai: Tonkontur-Messung; Englisch/Spanisch: Nachsprechen; Deutsch: keine
 * eigene Wortübung, Sprechen läuft über Shadowing und Satzübungen).
 */
export function modesForDirection(direction: PairDirection): Mode[] {
  const language = targetLanguageOf(direction);
  return [
    'cards',
    'wortliste',
    'advanced',
    ...drillsForDirection(direction),
    // Wortübung laut Definition: Tonkontur-Messung (Thai) oder Nachsprechen.
    ...(learningLanguage(language).wordSpeaking ? (['speaking'] as const) : []),
    // Die Satzübungen gehören seit AE-66 zu jeder Richtung jedes Paars.
    ...(['shadowing', 'sentenceRepeat', 'sentenceListening'] as const),
    // Schritt 3: selbst produzieren (Sag es auf …) und Szenen sprechen.
    // Schritt 4: die Situationen als Lese-/Hörtexte.
    ...(['sagen', 'rollenspiel', 'lesestoffe'] as const),
    'dictation',
    // Schreiben seit dem Sprach-Umbau in JEDER Richtung: der Auftrag steht in
    // der Ankersprache (`translations[anker]`), getippt wird die Zielform.
    'writing',
  ];
}

export function modeKey(mode: Mode): TranslationKey {
  if (mode === 'path') return 'tabs.learn';
  if (mode === 'advanced') return 'advanced.title';
  if (mode === 'cards') return 'mode.cards';
  if (mode === 'wortliste') return 'mode.wortliste';
  if (mode === 'heute') return 'mode.heute';
  if (mode === 'speaking') return 'mode.speaking';
  if (mode === 'sagen') return 'mode.sagen';
  if (mode === 'rollenspiel') return 'mode.rollenspiel';
  if (mode === 'lesestoffe') return 'mode.lesestoffe';
  if (mode === 'writing') return 'mode.writing';
  if (mode === 'shadowing') return 'mode.shadowing';
  if (mode === 'sentenceRepeat') return 'mode.sentenceRepeat';
  if (mode === 'sentenceListening') return 'mode.sentenceListening';
  if (mode === 'dictation') return 'mode.dictation';
  if (mode in FOUNDATION_KEYS) return FOUNDATION_KEYS[mode as FoundationMode];
  return DRILL_KEYS[mode as DrillId];
}

/** Beschriftung eines Übungsmodus in der aktuellen UI-Sprache. */
export function modeLabel(
  mode: Mode,
  t: (key: TranslationKey) => string
): string {
  return t(modeKey(mode));
}

export type Group = { label: TranslationKey; modes: Mode[] };

/**
 * Die fünf Kategorien, für JEDE Richtung, in fester Reihenfolge.
 *
 * „Schreiben“ steht seit dem Umbau in „Lesen & Schreiben“ (die zwei
 * Seiten einer Schrift-Fertigkeit), nicht mehr als eigene Gruppe hinter
 * „Sprechen“ — die alte Gruppe existierte nur für Deutsch und verhieß
 * den anderen Sprachen eine Lücke, die keine war.
 */
export function groupsForDirection(direction: PairDirection): Group[] {
  const modes = modesForDirection(direction);
  const drills = modes.filter((mode): mode is DrillId => mode in DRILL_META);
  const bySkill = (skill: 'hoeren' | 'lesen' | 'grammatik') =>
    drills.filter((drill) => DRILL_META[drill].skill === skill);

  const hoeren: Mode[] = bySkill('hoeren');
  hoeren.push('sentenceListening', 'dictation');
  const lesenSchreiben: Mode[] = bySkill('lesen');
  // Längere Texte (Schritt 4): die Situationen als Lese-/Hörtexte.
  lesenSchreiben.push('lesestoffe');
  if (modes.includes('writing')) lesenSchreiben.push('writing');
  lesenSchreiben.push('advanced');
  const sprechen: Mode[] = [];
  if (modes.includes('speaking')) sprechen.push('speaking');
  // „Sag es auf …“ und das Rollenspiel gehören zu jeder Richtung (Schritt 3):
  // Sag es produziert Wörter/Sätze aus dem eigenen Stoff, das Rollenspiel
  // spielt Szenen der Richtung.
  sprechen.push('sagen', 'shadowing', 'sentenceRepeat', 'rollenspiel');
  const grammatik = bySkill('grammatik');

  return [
    { label: 'skill.wortschatz', modes: ['cards', 'wortliste'] },
    { label: 'skill.hoeren', modes: hoeren },
    { label: 'skill.lesenSchreiben', modes: lesenSchreiben },
    { label: 'skill.sprechen', modes: sprechen },
    { label: 'skill.grammatik', modes: grammatik },
  ];
}
