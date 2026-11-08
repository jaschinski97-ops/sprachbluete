import type { VocabEntry } from '@/data/vocab-types';

import { ohneWortabstand } from '../languages/definitions';
import { contentDirectionOf, isLanguageCode, type LanguageCode } from '../languages/types';
import { STAGE_LEVELS, stageForLevel, stageOfEntry, type LearningStage } from '../learning-stages';
import { vocabularyForms } from '../vocabulary-forms';

import {
  situationId, spokenText, TOPICS, topicFitsLevel,
  type ConversationSituation, type Level, type SituationSpec, type TopicId,
} from './types';

/**
 * Dialoge aus dem Wortschatz (Nutzerentscheidung 24.10.2026).
 *
 * Statt eines festen Rasters (Themen × Stufen × Varianten) bekommt jeder neue
 * Dialog zuerst seine Wörter: die häufigsten Wörter der Stufe, die noch in
 * keinem Dialog Ziel waren, dazu ein paar schon abgedeckte zum Wiederholen.
 * Häufigkeit = Erzeugungsreihenfolge des Wortschatzes (`generatedAt`). Die
 * Anzahl wählt der Admin im Studio je Lernsprache und Stufe; ein Lauf mit
 * höherer Anzahl nimmt die nächsten offenen Wörter. Die Themen bleiben der
 * Rahmen und werden reihum verteilt.
 */

/** Neue Wörter je Dialog — das Kapitel übt höchstens 20 (CHAPTER_WORDS). */
export const ZIELWOERTER_JE_DIALOG = 20;
/** Schon abgedeckte Wörter, die ein neuer Dialog wieder aufgreift. */
export const WIEDERHOLWOERTER_JE_DIALOG = 4;
/** Startwerte im Studio. */
export const DIALOGE_VORSCHLAG: Record<LearningStage, number> = { beginner: 25, experienced: 15, pro: 10 };
export const MAX_DIALOGE_JE_STUFE = 200;

/** Wörter in Häufigkeitsreihenfolge (stabil: gleiche Zeit behält die Reihenfolge). */
export function nachHaeufigkeit<T extends { generatedAt?: number }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0));
}

/** Der Wortschatz einer Lernsprache und Stufe, häufigste zuerst. */
export function stufenWoerter(vocabulary: readonly VocabEntry[], language: LanguageCode, stage: LearningStage): VocabEntry[] {
  return nachHaeufigkeit(vocabulary.filter((entry) => String(entry.language) === language && stageOfEntry(entry) === stage));
}

/** Die Dialoge einer Lernsprache (gespeichert unter ihrer Inhalts-Richtung). */
export function dialogeDerSprache(situations: readonly ConversationSituation[], language: LanguageCode): ConversationSituation[] {
  const direction = contentDirectionOf(language);
  return situations.filter((situation) => situation.direction === direction);
}

/** Alle Wörter, die schon Ziel eines Dialogs der Sprache sind (jede Stufe). */
export function abgedeckteIds(situations: readonly ConversationSituation[], language: LanguageCode): Set<string> {
  return new Set(dialogeDerSprache(situations, language).flatMap((situation) => situation.vocabIds ?? []));
}

/** Dialoge, die aus dem Wortschatz gebaut wurden — nur die zählen gegen die Anzahl. */
function wortDialoge(situations: readonly ConversationSituation[], language: LanguageCode, stage: LearningStage) {
  return dialogeDerSprache(situations, language)
    .filter((situation) => situation.vocabIds !== undefined && stageForLevel(situation.level) === stage);
}

/** Gleichmäßig verteilte Wiederholwörter; `versatz` dreht die Auswahl je Dialog weiter. */
function waehleWiederholung(abgedeckt: readonly VocabEntry[], anzahl: number, versatz: number): VocabEntry[] {
  if (abgedeckt.length === 0 || anzahl <= 0) return [];
  if (abgedeckt.length <= anzahl) return [...abgedeckt];
  const schritt = abgedeckt.length / anzahl;
  const indizes = new Set<number>();
  for (let k = 0; k < anzahl; k++) indizes.add(Math.floor(k * schritt + versatz * 3) % abgedeckt.length);
  return [...indizes].sort((a, b) => a - b).map((index) => abgedeckt[index]);
}

export type DialogPlanOptionen = {
  language: LanguageCode;
  stage: LearningStage;
  /** Gewünschte Gesamtzahl der Wortschatz-Dialoge dieser Stufe. */
  anzahl: number;
  vocabulary: readonly VocabEntry[];
  /** Der ganze Bestand (alle Sprachen dürfen dabei sein). */
  situations: readonly ConversationSituation[];
  zielwoerter?: number;
  wiederholung?: number;
};

/**
 * Plant die noch fehlenden Dialoge einer Stufe bis zur gewünschten Anzahl.
 *
 * Deterministisch aus Bestand und Wortschatz: Ein abgebrochener Lauf plant
 * beim Neustart genau die Dialoge, die noch fehlen. Sind alle Wörter der
 * Stufe abgedeckt, endet der Plan früher — ein Dialog ohne neue Wörter hätte
 * keinen Zweck. Die erste Hälfte der Anzahl wird die untere GER-Stufe (A1),
 * der Rest die obere (A2); die IDs behalten das bekannte Schema.
 */
export function planeWortDialoge(optionen: DialogPlanOptionen): SituationSpec[] {
  const { language, stage, vocabulary, situations } = optionen;
  const anzahl = Math.max(0, Math.min(MAX_DIALOGE_JE_STUFE, Math.floor(optionen.anzahl)));
  const jeDialog = optionen.zielwoerter ?? ZIELWOERTER_JE_DIALOG;
  const wiederholung = optionen.wiederholung ?? WIEDERHOLWOERTER_JE_DIALOG;
  const direction = contentDirectionOf(language);
  const vorhanden = wortDialoge(situations, language, stage);
  const woerter = stufenWoerter(vocabulary, language, stage);
  const abgedeckt = abgedeckteIds(situations, language);
  const offen = woerter.filter((word) => !abgedeckt.has(word.id));
  const wiederholbar = woerter.filter((word) => abgedeckt.has(word.id));

  const [unten, oben] = STAGE_LEVELS[stage] as readonly Level[];
  const jeStufe = new Map<Level, number>([[unten, 0], [oben, 0]]);
  const jeThema = new Map<TopicId, number>();
  for (const situation of vorhanden) {
    jeStufe.set(situation.level, (jeStufe.get(situation.level) ?? 0) + 1);
    jeThema.set(situation.topic, (jeThema.get(situation.topic) ?? 0) + 1);
  }
  const belegt = new Set(dialogeDerSprache(situations, language).map((situation) => situation.id));

  const specs: SituationSpec[] = [];
  for (let nummer = vorhanden.length; nummer < anzahl && offen.length > 0; nummer++) {
    const targetWords = offen.splice(0, jeDialog);
    const reviewWords = waehleWiederholung(wiederholbar, wiederholung, nummer);
    const level = (jeStufe.get(unten) ?? 0) < Math.ceil(anzahl / 2) ? unten : oben;
    // Reihum: das passende Thema mit den wenigsten Dialogen, bei Gleichstand
    // in Kapitelreihenfolge.
    const topic = TOPICS.filter((entry) => topicFitsLevel(entry.id, level))
      .reduce<TopicId | undefined>((best, entry) =>
        best === undefined || (jeThema.get(entry.id) ?? 0) < (jeThema.get(best) ?? 0) ? entry.id : best, undefined)!;
    let variant = 1;
    while (belegt.has(situationId(topic, level, direction, variant))) variant++;
    const id = situationId(topic, level, direction, variant);
    specs.push({ id, level, topic, direction, variant, targetWords, reviewWords });
    belegt.add(id);
    jeStufe.set(level, (jeStufe.get(level) ?? 0) + 1);
    jeThema.set(topic, (jeThema.get(topic) ?? 0) + 1);
    wiederholbar.push(...targetWords);
  }
  return specs;
}

export type StufenAbdeckung = {
  stage: LearningStage;
  /** Wörter der Stufe insgesamt. */
  gesamt: number;
  /** Davon schon Ziel eines Dialogs. */
  abgedeckt: number;
  /** Wortschatz-Dialoge im Bestand. */
  dialoge: number;
  /** Ältere Dialoge der Stufe ohne Zielwörter (zählen nicht gegen die Anzahl). */
  aeltere: number;
  /** So viele Dialoge erzeugt der nächste Lauf. */
  neueDialoge: number;
  /** Dialoge nach dem Lauf. */
  dialogeNachLauf: number;
  /** Abgedeckte Wörter nach dem Lauf — die häufigsten der Stufe. */
  abgedecktNachLauf: number;
  /** Was über Karten, Wortliste und Sätze kommt. */
  uebrig: number;
};

/** Die Anzeige unter der Anzahl: was die gewählte Zahl abdeckt. */
export function stufenAbdeckung(optionen: DialogPlanOptionen): StufenAbdeckung {
  const woerter = stufenWoerter(optionen.vocabulary, optionen.language, optionen.stage);
  const abgedecktSet = abgedeckteIds(optionen.situations, optionen.language);
  const abgedeckt = woerter.filter((word) => abgedecktSet.has(word.id)).length;
  const stufe = dialogeDerSprache(optionen.situations, optionen.language)
    .filter((situation) => stageForLevel(situation.level) === optionen.stage);
  const dialoge = stufe.filter((situation) => situation.vocabIds !== undefined).length;
  const plan = planeWortDialoge(optionen);
  const abgedecktNachLauf = abgedeckt + plan.reduce((sum, spec) => sum + (spec.targetWords?.length ?? 0), 0);
  return {
    stage: optionen.stage,
    gesamt: woerter.length,
    abgedeckt,
    dialoge,
    aeltere: stufe.length - dialoge,
    neueDialoge: plan.length,
    dialogeNachLauf: dialoge + plan.length,
    abgedecktNachLauf,
    uebrig: woerter.length - abgedecktNachLauf,
  };
}

// ---------------------------------------------------------------------------
// Kommt ein Zielwort im Dialog vor?
//
// Bewusst NUR vom Wort und vom Text abhängig, nicht vom übrigen Wortschatz:
// Erzeugung und `content:integrity` müssen später dasselbe Ergebnis liefern,
// auch wenn der Wortschatz inzwischen gewachsen ist. Deshalb großzügig
// (Wortanfang bei Verben und Adjektiven, gespeicherte Beugungen); unregel-
// mäßige Formen wie „soy“ zu „ser“ findet die Prüfung nicht und meldet das
// Wort als fehlend.
// ---------------------------------------------------------------------------

const ARTIKEL = /^(?:der|die|das|ein|eine|el|la|los|las|un|una|le|les|une|des|the|a|an|to)\s+/;

function klein(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase();
}

/** Grundformen aus dem Stichwort: Klammern weg, Alternativen getrennt, Artikel ab. */
function grundformen(term: string): string[] {
  return klein(term).replace(/\([^)]*\)/g, ' ').split(/[/,;]/)
    .map((teil) => teil.replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim().replace(ARTIKEL, ''))
    .filter((teil) => teil !== '');
}

const letztesWort = (text?: string) => (text ? klein(text).trim().split(/\s+/).pop() ?? '' : '');

function formen(entry: VocabEntry): string[] {
  const liste = [
    ...grundformen(entry.term),
    ...vocabularyForms(entry).flatMap(grundformen),
    letztesWort(entry.germanVerb?.thirdPerson), letztesWort(entry.germanVerb?.praeteritum),
    letztesWort(entry.germanVerb?.perfekt), letztesWort(entry.englishVerb?.past),
    letztesWort(entry.englishVerb?.participle), letztesWort(entry.germanAdjective?.comparative),
    letztesWort(entry.germanAdjective?.superlative),
  ];
  return [...new Set(liste.filter((form) => form !== '' && form !== '—'))];
}

/** Wortanfänge für gebeugte Formen — kürzer als 3 Zeichen nur exakt. */
function staemme(entry: VocabEntry): string[] {
  const language = String(entry.language);
  const verb = entry.partOfSpeech === 'verb';
  // Französisch (04.11.2026): „se lever“, „s’asseoir“ ohne Reflexivpronomen, damit der Stamm greift.
  // Portugiesisch „levantar-se“: der Bindestrich ist in `grundformen` schon ein Leerzeichen.
  const ohneSe = (form: string) => {
    if (verb && language === 'fr') return form.replace(/^(?:se|s)\s+/, '');
    if (verb && language === 'pt') return form.replace(/\s+se$/, '');
    return form;
  };
  return grundformen(entry.term).map(ohneSe).filter((form) => !form.includes(' ')).map((form) => {
    if (verb) {
      if (language === 'de') return /(?:el|er)n$/.test(form) ? form.slice(0, -1) : form.replace(/e?n$/, '');
      if (language === 'es') return form.replace(/se$/, '').replace(/(?:ar|er|ir)$/, '');
      // „manger“ → „mang“ trifft „je mange“; kurze Stämme (être, avoir, dire) zählen nur exakt.
      if (language === 'fr') return form.replace(/(?:er|ir|re|oir)$/, '');
      // Portugiesisch „levantar-se“ → „levant“, „pôr“ zählt nur exakt (07.11.2026).
      if (language === 'pt') return form.replace(/(?:ar|er|ir)$/, '');
      // Italienisch „alzarsi“ → „alz“, „parlare“ → „parl“, „tradurre“ → „tradu“.
      if (language === 'it') return form.replace(/rsi$/, 're').replace(/(?:are|ere|ire|rre)$/, '');
      return form.replace(/e$/, '');
    }
    if (entry.partOfSpeech === 'adjective' && language === 'es') return form.replace(/[oae]$/, '');
    // Portugiesisch: „vulnerável“ → „vulneráveis“, „rural“ → „rurais“, „fácil“ → „fáceis“.
    if (entry.partOfSpeech === 'adjective' && language === 'pt') return form.replace(/(?:il|l|[oae])$/, '');
    if (entry.partOfSpeech === 'adjective' && language === 'it') return form.replace(/[oaie]$/, '');
    return form;
  }).filter((stamm) => stamm.length >= 3);
}

/**
 * Japanisch beugt Verben und い-Adjektive (07.11.2026): 食べる → 食べました,
 * 行く → 行きます, 高い → 高かった, 勉強する → 勉強しています. Der Stamm zählt
 * nur, wenn danach Hiragana folgen; reine Kana-Stämme brauchen zwei Zeichen,
 * sonst träfe „い“ (いる) jeden Satz.
 */
function japanischerStamm(entry: VocabEntry): string | null {
  const term = entry.term.replace(/\s+/g, '');
  let stamm: string | null = null;
  if (term.endsWith('する') && term.length > 2) stamm = term.slice(0, -2);
  else if (entry.partOfSpeech === 'verb' && /[うくぐすつぬぶむる]$/u.test(term)) stamm = term.slice(0, -1);
  else if (entry.partOfSpeech === 'adjective' && term.endsWith('い')) stamm = term.slice(0, -1);
  if (!stamm) return null;
  const nurKana = /^[\u3040-\u30ffー]+$/u.test(stamm);
  if (stamm.length < (nurKana ? 2 : 1)) return null;
  return stamm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ob das Wort in diesem Text (einer Dialogzeile) vorkommt. */
export function zielwortImText(entry: VocabEntry, text: string): boolean {
  // Thai, Chinesisch und Japanisch ohne Leerzeichen: das Wort als Teilstring.
  if (isLanguageCode(entry.language) && ohneWortabstand(entry.language)) {
    const term = entry.term.replace(/\s+/g, '');
    const zeile = text.replace(/\s+/g, '');
    if (term !== '' && zeile.includes(term)) return true;
    const stamm = entry.language === 'ja' ? japanischerStamm(entry) : null;
    if (stamm === null) return false;
    // Gebeugte Form: Stamm, danach Hiragana. Bei Verben/Adjektiven ohne する
    // keine Partikel danach (銀行は ist nicht 行く) und kein Kanji davor (Teil
    // eines anderen Worts); bei する-Verben passt jede Form (対処できる).
    const muster = term.endsWith('する')
      ? `${stamm}[\u3040-\u309f]`
      : `(?<![\u4e00-\u9fff々])${stamm}(?![はがをのにでともへやか])[\u3040-\u309f]`;
    return new RegExp(muster, 'u').test(zeile);
  }
  const satz = ` ${klein(text).replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  const alle = formen(entry);
  if (alle.some((form) => satz.includes(` ${form} `))) return true;
  const anfaenge = staemme(entry);
  return anfaenge.length > 0 && satz.trim().split(' ').some((wort) => anfaenge.some((stamm) => wort.startsWith(stamm)));
}

/** Welche Zielwörter der Dialog enthält (in Zielreihenfolge) und welche fehlen. */
export function pruefeZielwoerter(
  situation: Pick<ConversationSituation, 'direction' | 'scriptTurns'>,
  targets: readonly VocabEntry[]
): { gefunden: string[]; fehlend: VocabEntry[] } {
  const zeilen = situation.scriptTurns.map((turn) => spokenText(situation, turn));
  const gefunden: string[] = [];
  const fehlend: VocabEntry[] = [];
  for (const word of targets) {
    if (zeilen.some((zeile) => zielwortImText(word, zeile))) gefunden.push(word.id);
    else fehlend.push(word);
  }
  return { gefunden, fehlend };
}
