import { Direction } from '../fsrs/types';
import { zieleFuerBruecke } from '../languages/goals';
import { contentDirectionOf, type ForeignBridge, type Lang, LANGUAGE_CODES, LanguageCode } from '../languages/types';
import type { UiLanguage } from '../i18n/types';

/**
 * Vorproduzierte Sprachsituationen.
 *
 * BEWUSST KEIN LIVE-CHAT. Der frühere Web-Prototyp fragte bei jeder
 * Nutzernachricht die API an. Das ist hier verworfen: die App muss ohne
 * Internet und ohne Schlüssel benutzbar sein. Die Dialoge werden einmalig
 * erzeugt (`scriptTurns`), gespeichert und danach offline abgespielt.
 *
 * ZUR BEDEUTUNG VON `direction` siehe AE-11 in PROGRESS.md: sie benennt die
 * Sprache, die der oder die Lernende **aktiv produziert** — passend zur
 * bereits etablierten `Direction` aus dem FSRS-Modul (`de_to_th` heißt:
 * Deutsch verstehen, Thai hervorbringen). Es gibt daher **zwei getrennte
 * Sätze** von Situationen, nicht einen Satz mit vertauschten Seiten.
 */

export const LEVELS = ['A1', 'A2'] as const;
export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
/** Alle GER-Stufen, die ein Studio-Gesprächslauf plant (Anfänger bis Profi). */
export const ALL_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const satisfies readonly Level[];

/**
 * Sprachcode eines Gesprächs-Eintrags. Deutsch ist als Dialogsprache dabei,
 * obwohl es im Stoff-Registry (`LanguageCode`) nur die Brücke ist — die
 * th_to_de-Situationen SIND die deutschen Gespräche.
 */
export type Situationssprache = LanguageCode;

/**
 * Die Gesprächs-Sprachen = alle Lernsprachen, je mit der Inhalts-Richtung,
 * unter der ihre Situationen gespeichert sind (`contentDirectionOf`:
 * `de_to_X`, für Deutsch der historische Schlüssel `th_to_de`).
 */
export const SITUATION_SPRACHEN: readonly {
  sprache: Situationssprache;
  direction: Direction;
}[] = [
  // Deutsch zuerst (Nutzerwunsch 14.09.), danach die übrigen Lernsprachen.
  ...LANGUAGE_CODES.filter((code) => code === 'de'),
  ...LANGUAGE_CODES.filter((code) => code !== 'de'),
].map((sprache) => ({ sprache, direction: contentDirectionOf(sprache) }));

/** Die Gesprächs-Sprachen einer Oberfläche — die App-Sprache selbst lernt man nicht. */
export function situationSprachenFuerBruecke(bridge: UiLanguage) {
  // Dieselben Sprachen wie die Lernziele der Oberfläche — also auch Thai auf
  // Thai-Oberfläche („Thai von Deutsch“), aber nie Deutsch auf deutscher.
  const lernsprachen = new Set(zieleFuerBruecke(bridge as Lang | ForeignBridge).map((ziel) => ziel.language));
  return SITUATION_SPRACHEN.filter(entry => lernsprachen.has(entry.sprache));
}

/**
 * Gesprächsthemen in Kapitel-Reihenfolge: `learning-path.ts` sortiert je
 * Niveau nach dieser Liste. `levels` nennt die GER-Stufen, auf denen der
 * Studio-Lauf das Thema plant. „Behörden & Bank“ passt erst ab B1, „Freizeit &
 * Wetter“ nur bis B2 (Nutzerentscheidung 18.10.2026). `focus` lenkt den Prompt
 * auf typische Szenen. Die IDs stecken in den Situations-IDs und bleiben fest.
 */
export const TOPICS = [
  { id: 'greeting', label: 'Begrüßung & Kennenlernen', levels: ALL_LEVELS,
    focus: 'sich vorstellen, Small Talk, Herkunft, Kontakte knüpfen' },
  { id: 'appointments', label: 'Uhrzeit & Termine', levels: ['A1', 'A2', 'B1', 'B2'],
    focus: 'Uhrzeit, Wochentage, Termine vereinbaren, verschieben und absagen' },
  { id: 'home', label: 'Familie & Wohnen', levels: ALL_LEVELS,
    focus: 'Familie, Wohnung, Nachbarn, Haushalt, Wohnungssuche und Miete' },
  { id: 'market', label: 'Markt & Einkaufen', levels: ALL_LEVELS,
    focus: 'einkaufen, Preise, Mengen und Größen, umtauschen und reklamieren' },
  { id: 'restaurant', label: 'Restaurant & Essen', levels: ALL_LEVELS,
    focus: 'bestellen, Vorlieben und Unverträglichkeiten, bezahlen, Essen bewerten' },
  { id: 'leisure', label: 'Freizeit & Wetter', levels: ['A1', 'A2', 'B1', 'B2'],
    focus: 'Hobbys, Sport, Wochenende, Wetter, Verabredungen' },
  { id: 'travel', label: 'Unterwegs', levels: ALL_LEVELS,
    focus: 'Weg fragen, Verkehrsmittel, Tickets, Hotel, Probleme auf Reisen' },
  { id: 'health', label: 'Gesundheit & Arzt', levels: ['A2', 'B1', 'B2', 'C1', 'C2'],
    focus: 'Beschwerden schildern, Arzt und Apotheke, Notfall, gesunde Lebensweise' },
  { id: 'work', label: 'Arbeit & Beruf', levels: ['A2', 'B1', 'B2', 'C1', 'C2'],
    focus: 'Beruf, Arbeitsalltag, Kollegen, Bewerbung, Besprechungen' },
  { id: 'services', label: 'Behörden & Bank', levels: ['B1', 'B2', 'C1', 'C2'],
    focus: 'Bank, Post, Amt, Formulare, Visum und Aufenthalt, Versicherung' },
  { id: 'opinion', label: 'Meinung & Diskussion', levels: ['B1', 'B2', 'C1', 'C2'],
    focus: 'Meinungen äußern und begründen, zustimmen, widersprechen, Kompromisse finden' },
  { id: 'society', label: 'Nachrichten & Gesellschaft', levels: ['B2', 'C1', 'C2'],
    focus: 'aktuelle Nachrichten, Umwelt, Technik, Bildung, gesellschaftliche Fragen' },
] as const satisfies readonly { id: string; label: string; levels: readonly Level[]; focus: string }[];

export type TopicId = (typeof TOPICS)[number]['id'];

export const TOPIC_LABELS: Record<TopicId, string> = TOPICS.reduce(
  (acc, topic) => ({ ...acc, [topic.id]: topic.label }),
  {} as Record<TopicId, string>
);

/** Ob ein Studio-Lauf das Thema auf dieser GER-Stufe plant. */
export function topicFitsLevel(topic: TopicId, level: Level): boolean {
  return (TOPICS.find((entry) => entry.id === topic)?.levels as readonly Level[] | undefined)?.includes(level) ?? false;
}

/** Eine Zeile im Dialog. */
export type ConversationTurn = {
  /**
   * `learner` markiert die Zeilen, die geübt werden sollen; `partner` ist die
   * Gegenseite und wird vorgegeben.
   */
  speaker: 'learner' | 'partner';
  /** Gesprochener Satz in der gewählten Lernsprache. */
  targetText?: string;
  thai: string;
  roman: string;
  german: string;
};

/** Typischer Fehler samt Erklärung — je Richtung andere Stolperstellen. */
export type CorrectionHint = {
  issue: string;
  explanation: string;
};

export type ConversationSituation = {
  id: string;
  level: Level;
  topic: TopicId;
  direction: Direction;
  title: string;
  /** Kurze Szenenbeschreibung auf Deutsch. */
  setting: string;
  scriptTurns: ConversationTurn[];
  corrections: CorrectionHint[];
  generatedAt: number;
  modelUsed: string;
  translations?: Partial<Record<UiLanguage, SituationTranslation>>;
};

export type SituationTranslation = {
  title: string;
  setting: string;
  turns: string[];
  corrections: CorrectionHint[];
};

export function spokenText(situation: Pick<ConversationSituation, 'direction'>, turn: ConversationTurn): string {
  return turn.targetText ?? (situation.direction.endsWith('_to_de') ? turn.german : turn.thai);
}

export function situationTranslation(situation: ConversationSituation, language: UiLanguage): SituationTranslation {
  return situation.translations?.[language] ?? {
    title: situation.title, setting: situation.setting,
    turns: situation.scriptTurns.map(turn => turn.german), corrections: situation.corrections,
  };
}

/** Read-only view for learning screens that use the legacy text fields. */
export function localizedSituation(situation: ConversationSituation, language: UiLanguage): ConversationSituation {
  const translation = situationTranslation(situation, language);
  return {
    ...situation,
    title: translation.title,
    setting: translation.setting,
    corrections: translation.corrections,
    scriptTurns: situation.scriptTurns.map((turn, index) => ({
      ...turn,
      targetText: spokenText(situation, turn),
      thai: spokenText(situation, turn),
      german: translation.turns[index],
    })),
  };
}

/** Was erzeugt werden soll — vor dem Lauf bekannt, damit er fortsetzbar ist. */
export type SituationSpec = {
  id: string;
  level: Level;
  topic: TopicId;
  direction: Direction;
  /** Laufende Nummer innerhalb derselben Kombination. */
  variant: number;
};

export function situationId(
  topic: TopicId,
  level: Level,
  direction: Direction,
  variant: number
): string {
  return `${topic}-${level}-${direction}-${String(variant).padStart(3, '0')}`;
}

/**
 * Prüft eine Situation aus dem Speicher, bevor der Gespräch-Screen sie
 * anzeigt.
 *
 * Dieselbe Lücke wie bei den Prüfungsaufgaben (Phase 9): Der Generator prüft
 * beim Schreiben streng, das Lesen vertraute blind. Ein Dokument ohne
 * `scriptTurns` ließ den Reiter abstürzen, statt einfach zu fehlen.
 */
export function isValidSituation(value: unknown): value is ConversationSituation {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;

  if (typeof s.id !== 'string' || s.id === '') return false;
  if (typeof s.title !== 'string' || typeof s.setting !== 'string') return false;
  if (!SITUATION_SPRACHEN.some(item => item.direction === s.direction)) return false;
  if (!Array.isArray(s.scriptTurns) || s.scriptTurns.length === 0) return false;

  const zuegeOk = s.scriptTurns.every((raw) => {
    const turn = raw as Record<string, unknown>;
    return (
      (turn?.speaker === 'learner' || turn?.speaker === 'partner') &&
      typeof turn.thai === 'string' &&
      typeof turn.roman === 'string' &&
      typeof turn.german === 'string'
      && (turn.targetText === undefined || (typeof turn.targetText === 'string' && turn.targetText.trim() !== ''))
    );
  });
  if (!zuegeOk) return false;
  if (s.translations !== undefined) {
    if (!s.translations || typeof s.translations !== 'object' || Array.isArray(s.translations)) return false;
    for (const translation of Object.values(s.translations)) {
      const tr = translation as SituationTranslation;
      if (!tr || typeof tr.title !== 'string' || !tr.title.trim() || typeof tr.setting !== 'string' || !tr.setting.trim() ||
        !Array.isArray(tr.turns) || tr.turns.length !== s.scriptTurns.length || tr.turns.some(text => typeof text !== 'string' || !text.trim()) ||
        !Array.isArray(tr.corrections) || !Array.isArray(s.corrections) || tr.corrections.length !== s.corrections.length ||
        tr.corrections.some(hint => !hint || typeof hint.issue !== 'string' || typeof hint.explanation !== 'string')) return false;
    }
  }

  return (
    Array.isArray(s.corrections) &&
    s.corrections.every((raw) => {
      const hint = raw as Record<string, unknown>;
      return typeof hint?.issue === 'string' && typeof hint.explanation === 'string';
    })
  );
}
