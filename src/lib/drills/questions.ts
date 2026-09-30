import { TONE_KEYS, TONES } from '@/constants/tones';
import { TargetVocabEntry, VocabEntry } from '@/data/vocab-types';

import { Direction } from '../fsrs/types';
import { syllablesOf } from '@/data/vocab-helpers';
import type { PairDirection } from '../languages/types';
import type { UiLanguage } from '../i18n/types';
import { HUB_LANGUAGE } from '../languages/types';
import { analyzeSyllable } from '../reading/syllable';
import { type DerivationStep } from '../reading/syllable';
import { ACUTE_TO_PLAIN } from '@/data/spanish-stress';

import { GraphemeGroup, graphemeGroups, groupFor } from '../spelling/graphemes';
import { analyzeStress } from '../stress/syllables';
import { type KeyedStep } from '../stress/syllables';

import { Random, shuffled } from './random';
import { DRILL_META, DrillOption, DrillQuestion } from './types';
import { translate } from '../i18n';
import { bridgeText } from '../languages/bridge';

/**
 * Anker-Kontext einer Aufgabe (21.09.2026, Nutzerbefund en-UI): Hints und
 * Lösungen durften ihre Bedeutungsseite nicht länger stillschweigend auf
 * Deutsch lesen. Auf der eigenen Ankerseite (etwa th_to_de mit Grundstock)
 * ist das Wort selbst der Kontext, sonst der Brückentext.
 */
function kontextFuer(entry: VocabEntry, anchor: UiLanguage): string {
  if (anchor === String(entry.language)) {
    return entry.romanization && entry.romanization !== entry.term
      ? `${entry.term} · ${entry.romanization}`
      : entry.term;
  }
  return bridgeText(entry, anchor).text;
}

/**
 * Lösungszeile ohne Dubletten: Form und Umschrift nur, wenn sie verschieden
 * sind, Bedeutung nur, wenn sie nicht das Wort selbst wiederholt — vorher
 * stand bei erzeugten Einträgen gern „diez · diez — diez“ oder für Deutsch
 * „Bis gleich · Bis glykh · Bis gleich“.
 */
function losungForm(entry: VocabEntry, anchor: UiLanguage): string {
  const form = entry.romanization && entry.romanization !== entry.term
    ? `${entry.term} · ${entry.romanization}`
    : entry.term;
  const bedeutung = bridgeText(entry, anchor).text;
  return bedeutung && bedeutung !== entry.term ? `${form} — ${bedeutung}` : form;
}

/** Schlüssel-Schritte der Betonungsherkunft in der UI-Sprache ausgeben. */
function uebersetzteSchritte(steps: KeyedStep[], ui: UiLanguage): DerivationStep[] {
  return steps.map((step) => ({
    label: translate(ui, step.labelKey),
    value: step.value,
    detail: translate(ui, step.detailKey, step.detailParams),
  }));
}

/** Die Regel-Sätze der Betonung — dieselben Schlüssel wie die Legende zeigt. */
const STRESS_REGEL_KEYS = {
  acute: 'legend.stressDetailAcute',
  monosyllable: 'legend.stressDetailPenultimate',
  penultimate: 'legend.stressDetailPenultimate',
  final: 'legend.stressDetailFinal',
} as const;

/**
 * Die Richtung, in der eine Aufgabe zu diesem Eintrag steht.
 *
 * SEIT PHASE 16 AUS DEM EINTRAG STATT ALS LITERAL. Vorher stand in jeder
 * Aufgabe `'th_to_de'` beziehungsweise `'de_to_th'`; damit haette eine
 * spanische Artikel-Aufgabe die falsche Richtung getragen und im
 * Tagesprotokoll unter Thai gezaehlt.
 *
 * SEIT DEM PAARMATRIX-START AUF `TargetVocabEntry` GERICHTET: Jeder
 * Ziel-Eintrag bildet hier dieselben Richtungen — sein Sprachcode liegt in
 * `TargetLanguage`.
 */
function toHub(entry: VocabEntry): Direction {
  return `${entry.language}_to_${HUB_LANGUAGE}` as Direction;
}

function toTarget(entry: TargetVocabEntry): Direction {
  return `${HUB_LANGUAGE}_to_${entry.language}` as Direction;
}

/**
 * Aus geprüften Vokabeldaten werden Aufgaben — es wird nichts erfunden.
 *
 * Das gilt ausdrücklich auch für die **falschen** Antworten. Jede Ablenkung
 * ist entweder eine echte Form aus derselben Datei (das Perfekt eines anderen
 * Verbs), eine der drei deutschen Artikelformen oder einer der fünf Töne, oder
 * eine mechanische Ableitung, die garantiert falsch ist (vertauschtes
 * Hilfsverb). Eine ausgedachte Form als Ablenker wäre dasselbe Problem wie ein
 * ausgedachter Ton: Lernende sehen sie, und Falsches prägt sich mit ein.
 */

/* ---------- Ton hören (de_to_th) ---------- */

/**
 * Nur **einsilbige** Wörter.
 *
 * Grund ist derselbe wie bei AE-7 und AE-8: Thai vergibt den Ton je Silbe.
 * Die Frage „welchen Ton hat สวัสดี?" hat gar keine richtige Antwort — das
 * Wort ist tief-tief-mittel. Und nach einer einzelnen Silbe zu fragen geht
 * auch nicht, weil sich die Silbengrenze in der Thai-Schrift nicht
 * verlässlich bestimmen lässt. 69 der 84 Einträge sind einsilbig, und alle
 * fünf Töne kommen darin vor; die Übung hat also genug Material, ohne dass
 * geraten werden müsste.
 */
export function canBuildToneQuestion(entry: VocabEntry): boolean {
  // Seit Phase 16 auch die Sprache pruefen: Der Grundstock traegt jetzt
  // drei Sprachen, und ein einsilbiges spanisches Wort hat keinen Ton.
  return entry.language === 'th' && entry.syllables?.length === 1 && Boolean(entry.syllables[0].tone);
}

export function buildToneQuestion(
  entry: VocabEntry,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  if (!canBuildToneQuestion(entry)) {
    throw new Error(
      `"${entry.id}" (${entry.term}) ist mehrsilbig — jede Silbe hat einen eigenen Ton, ` +
        'eine einzelne Antwort gäbe es nicht.'
    );
  }
  const tone = entry.syllables[0].tone!;

  // Feste Reihenfolge, nicht gemischt: die fünf Töne sind ein festes
  // Inventar, und wer sie übt, baut sich eine Ordnung im Kopf auf (mittel,
  // tief, fallend, hoch, steigend). Wechselnde Positionen wären zusätzliche
  // Arbeit, die mit dem Hören nichts zu tun hat. Die Tonnamen kommen aus den
  // Wörterbüchern — auf jeder Oberfläche in ihrer Sprache.
  const options: DrillOption[] = TONE_KEYS.map((key) => ({
    label: translate(ui, `tone.${key}`),
    tone: key,
  }));

  return {
    id: `tone:${entry.id}`,
    drill: 'tone',
    direction: toTarget(entry),
    vocabId: entry.id,
    // Bewusst nichts sichtbar: Die Thai-Schrift trägt das Tonzeichen und wäre
    // die halbe Lösung, die Bedeutung erlaubt es, die Antwort aus dem
    // Gedächtnis abzurufen statt sie zu hören. Genau das soll die Übung nicht.
    visible: null,
    visibleHint: null,
    speak: { text: entry.term, language: 'th' },
    options,
    correctIndex: TONE_KEYS.indexOf(tone),
    solution: losungForm(entry, anchor),
    explanation: translate(ui, 'drill.toneIs', { tone: translate(ui, `tone.${tone}`) }),
  };
}

/* ---------- Ton herleiten (de_to_th) ---------- */

/**
 * Nur Eintraege, deren Ton sich aus der Schrift **herleiten** laesst — und
 * deren Herleitung mit dem quellengeprueften Ton uebereinstimmt.
 *
 * Die zweite Bedingung ist die wichtigere. Waeren beide je verschieden,
 * zeigte die Uebung eine Begruendung, die der als richtig markierten Antwort
 * widerspricht; die lernende Person lernte die falsche Regel mit. Lieber eine
 * Vokabel weniger im Topf. Ein Test faehrt den ganzen Grundstock durch und
 * belegt, dass es diesen Fall derzeit nicht gibt.
 *
 * Einsilbig ist ohnehin Voraussetzung (AE-8, Pflicht 3): Silbengrenzen sind
 * in der Thai-Schrift nicht markiert, und `analyzeSyllable` weist alles
 * zurueck, was sich nicht als genau eine Silbe lesen laesst.
 */
export function canBuildToneRuleQuestion(entry: VocabEntry): boolean {
  if (entry.language !== 'th') return false;
  if (entry.syllables?.length !== 1) return false;
  const analysis = analyzeSyllable(entry.term);
  return analysis.ok && analysis.tone === entry.syllables[0].tone;
}

export function buildToneRuleQuestion(
  entry: VocabEntry,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const analysis = analyzeSyllable(entry.term, ui);
  if (!analysis.ok) {
    throw new Error(`"${entry.id}" (${entry.term}): ${analysis.reason}`);
  }
  const tone = entry.syllables[0].tone!;
  if (analysis.tone !== tone) {
    throw new Error(
      `"${entry.id}" (${entry.term}): Herleitung ergibt ${TONES[analysis.tone].label}, ` +
        `belegt ist ${TONES[tone].label}. Solange das nicht geklaert ist, wird daraus keine Aufgabe.`
    );
  }

  // Dieselbe feste Reihenfolge wie bei der Hoer-Uebung: Wer beide uebt, soll
  // nicht zwei verschiedene Ordnungen im Kopf behalten muessen. Tonnamen aus
  // den Wörterbüchern — s. buildToneQuestion.
  const options: DrillOption[] = TONE_KEYS.map((key) => ({
    label: translate(ui, `tone.${key}`),
    tone: key,
  }));

  return {
    id: `toneRule:${entry.id}`,
    drill: 'toneRule',
    direction: toTarget(entry),
    vocabId: entry.id,
    // Die Tonzeichen der Umschrift sind auf ausdrücklichen Nutzerwunsch
    // auch während der Aufgabe sichtbar.
    visible: entry.term,
    visibleRoman: entry.romanization,
    visibleHint: null,
    speak: null,
    options,
    correctIndex: TONE_KEYS.indexOf(tone),
    solution: losungForm(entry, anchor),
    explanation: translate(ui, 'drill.toneIs', { tone: translate(ui, `tone.${tone}`) }),
    derivation: analysis.steps,
    uncertain: analysis.uncertain,
  };
}

/* ---------- Artikel (th_to_de) ---------- */

const ARTICLES = ['der', 'die', 'das'] as const;

/**
 * Das Substantiv ohne seinen Artikel.
 *
 * Das Stichwort trägt das Genus mit (`"das Haus"`), damit es beim Lernen
 * immer mitgelesen wird — für diese Aufgabe muss es weg. Bei Einträgen mit
 * mehreren Bedeutungen (`"der Laden, der Verkaufsstand"`) wird nur die erste
 * gefragt; die zweite steht danach in der Auflösung.
 */
export function bareNoun(entry: VocabEntry): string {
  const first = entry.german.split(',')[0].trim();
  for (const article of ARTICLES) {
    if (first.toLowerCase().startsWith(`${article} `)) {
      return first.slice(article.length + 1).trim();
    }
  }
  return first;
}

export function canBuildArticleQuestion(entry: VocabEntry): boolean {
  return Boolean(entry.germanNoun) && bareNoun(entry).length > 0;
}

export function buildArticleQuestion(entry: VocabEntry, anchor: UiLanguage = 'de', ui: UiLanguage = 'de'): DrillQuestion {
  const noun = entry.germanNoun;
  if (!noun) {
    throw new Error(`"${entry.id}" ist kein Substantiv — kein Artikel zu üben.`);
  }
  const word = bareNoun(entry);

  // Feste Reihenfolge der/die/das: dieselbe Überlegung wie bei den Tönen.
  const options: DrillOption[] = ARTICLES.map((article) => ({ label: article }));

  const parts = [`${noun.article} ${word}`, translate(ui, 'flashcard.plural', { plural: noun.plural })];
  if (entry.note) parts.push(entry.note);

  return {
    id: `article:${entry.id}`,
    drill: 'article',
    direction: toHub(entry),
    vocabId: entry.id,
    visible: `___ ${word}`,
    // Der Kontext gehört der ANKERSEITE (21.09.2026): Für th_to_de das Thai-
    // Wort mit Umschrift, für en_to_de die englische Bedeutung — vorher
    // wiederholte der Hint bei erzeugten de-Einträgen nur das Fragewort.
    visibleHint: kontextFuer(entry, anchor),
    speak: null,
    options,
    correctIndex: ARTICLES.indexOf(noun.article),
    solution: `${noun.article} ${word}`,
    explanation: parts.join(' · '),
  };
}

/* ---------- Stammformen (th_to_de) ---------- */

const AUXILIARIES = ['hat', 'ist'] as const;

/** Vertauscht `hat` und `ist` — ergibt garantiert eine falsche Form. */
export function swapAuxiliary(perfekt: string): string | null {
  for (const aux of AUXILIARIES) {
    if (perfekt.startsWith(`${aux} `)) {
      const other = aux === 'hat' ? 'ist' : 'hat';
      return `${other} ${perfekt.slice(aux.length + 1)}`;
    }
  }
  return null;
}

export function canBuildVerbFormQuestion(entry: VocabEntry): boolean {
  return Boolean(entry.germanVerb?.perfekt);
}

/**
 * Vier Antworten: die richtige, dieselbe Form mit vertauschtem Hilfsverb und
 * zwei echte Perfektformen anderer Verben.
 *
 * Das vertauschte Hilfsverb ist mit Absicht immer dabei — „haben" gegen
 * „sein" ist genau die Stelle, an der Thai-Muttersprachler danebengreifen,
 * weil Thai überhaupt kein Hilfsverb kennt. Wer nur zwischen fremden
 * Partizipien wählen müsste, könnte die Aufgabe lösen, ohne je über das
 * Hilfsverb nachzudenken.
 */
export function buildVerbFormQuestion(
  entry: VocabEntry,
  pool: VocabEntry[],
  random: Random,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const verb = entry.germanVerb;
  if (!verb) {
    throw new Error(`"${entry.id}" ist kein Verb — keine Stammformen zu üben.`);
  }

  const correct = verb.perfekt;
  const distractors: string[] = [];

  const swapped = swapAuxiliary(correct);
  if (swapped) distractors.push(swapped);

  const foreign = shuffled(
    pool
      .filter((other) => other.id !== entry.id && other.germanVerb)
      .map((other) => other.germanVerb!.perfekt)
      // Zwei Verben koennten dieselbe Form tragen - dann waere der "falsche"
      // Ablenker in Wahrheit richtig.
      .filter((form) => form !== correct && !distractors.includes(form)),
    random
  );

  for (const form of foreign) {
    if (distractors.length >= 3) break;
    if (!distractors.includes(form)) distractors.push(form);
  }

  const options = shuffled([correct, ...distractors], random).map((label) => ({ label }));

  const stems = `${entry.german.split(',')[0].trim()} — ${verb.thirdPerson} — ${verb.praeteritum} — ${verb.perfekt}`;
  // „unregelmäßig/regelmäßig" ist Übersichts-Chrome, nicht Stoff — localized
  // über die Wörterbücher (21.09.2026, en-UI).
  const parts = [stems, verb.irregular ? translate(ui, 'drill.irregular') : translate(ui, 'drill.regular')];
  if (entry.note) parts.push(entry.note);

  return {
    id: `verbForms:${entry.id}`,
    drill: 'verbForms',
    direction: toHub(entry),
    vocabId: entry.id,
    visible: entry.german.split(',')[0].trim(),
    visibleHint: kontextFuer(entry, anchor),
    speak: null,
    options,
    correctIndex: options.findIndex((option) => option.label === correct),
    solution: correct,
    explanation: parts.join(' · '),
  };
}

/* ---------- Wort lesen (X_to_de — Deutsch als Ziel) ---------- */

/**
 * Das deutsche Wort GELESEN verstehen: Wort sichtbar, Bedeutung wählen.
 *
 * WARUM DIESE ÜBUNG: Der Kategorien-Gleichstand (Lern-Reiter-Ausbau
 * 13.09.) verlangt für das Deutsch-Ziel auch Lesestoff — vorher gab es
 * dort nur Hören (Diktat), Schreiben und Grammatik. Geübt wird
 * Form-Wiedererkennen: die Schreibung steht da, die Bedeutung kommt aus
 * dem Gedächtnis. Die falschen Antworten sind echte Wörter derselben
 * Sprache — dieselbe Regel wie bei allen Ablenkern.
 *
 * Bewusst KEIN Hinweis und KEIN Audio: Das Zielwort wäre die Lösung, und
 * die Aussprache des richtigen Begriffs würde beim Raten mithelfen.
 */
export function canBuildDeutschLesenQuestion(entry: VocabEntry): boolean {
  return entry.german.trim().length > 0 && entry.term.trim().length > 0;
}

export function buildDeutschLesenQuestion(
  entry: VocabEntry,
  pool: VocabEntry[],
  random: Random,
  direction: PairDirection = 'th_to_de'
): DrillQuestion {
  const source = direction.split('_to_')[0] as UiLanguage;
  const visible = String(entry.language) === 'de'
    ? (entry.translations?.[source] ?? '').trim()
    : entry.german.split(',')[0].trim();
  const correct = entry.term;
  const foreign = shuffled(
    pool
      .filter((other) => other.id !== entry.id)
      .map((other) => other.term)
      .filter((term) => term !== correct),
    random
  ).slice(0, 3);

  const options = shuffled([correct, ...foreign], random).map((label) => ({ label }));
  if (options.length < 4) {
    throw new Error(`"${entry.id}" hat keinen Ablenker-Bestand — Pool zu klein.`);
  }

  // Erklärzeile ohne Dubletten (Nutzerbefund 21.09.: „Bis gleich · Bis glykh
  // · Bis gleich"): Form und Bedeutung nur, wenn sie etwas Neues sagen.
  const form = entry.romanization && entry.romanization !== entry.term
    ? `${entry.term} · ${entry.romanization}`
    : entry.term;
  const parts = [
    form,
    entry.german !== entry.term ? entry.german : '',
    entry.note ?? '',
  ].filter((teil) => teil.length > 0);

  return {
    id: `deutschLesen:${entry.id}`,
    drill: 'deutschLesen',
    direction: direction as Direction,
    vocabId: entry.id,
    visible,
    visibleHint: null,
    speak: null,
    options,
    correctIndex: options.findIndex((option) => option.label === correct),
    solution: `${visible} — ${correct}`,
    explanation: parts.join(' · '),
  };
}

/* ---------- Unregelmäßige Verben (de_to_en) ---------- */

/**
 * Die zweite Form UNREGELMÄSSIGER englischer Verben.
 *
 * Nur `irregular: true`-Einträge: Für regelmäßige Verben ist „-ed anhängen"
 * eine ableitbare Regel — die gehört in eine eigene Herleitungsübung (wie
 * die Betonungsregel), nicht in eine Liste Übung. Die Formen stehen
 * quellengeprüft am Eintrag (`englishVerb.past`), nichts wird rekonstruiert.
 * Die Ablenker sind echte zweite Formen anderer unregelmäßiger Verben —
 * go/went gegen eat/ate ist genau die Verwechslung, die im Englischen
 * passiert.
 */
export function canBuildIrregularPastQuestion(entry: VocabEntry): boolean {
  return entry.language === 'en' && Boolean(entry.englishVerb?.irregular && entry.englishVerb.past);
}

export function buildIrregularPastQuestion(
  entry: VocabEntry,
  pool: VocabEntry[],
  random: Random,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const verb = entry.englishVerb;
  if (!verb?.past) {
    throw new Error(`"${entry.id}" hat keine zweite Form — keine unregelmäßige Übung möglich.`);
  }

  const correct = verb.past;
  const distractors = shuffled(
    [
      ...new Set(
        pool
          .filter((other) => other.id !== entry.id && other.englishVerb?.irregular)
          .map((other) => other.englishVerb!.past)
          .filter((form) => form !== correct)
      ),
    ],
    random
  ).slice(0, 3);
  if (distractors.length < 3) {
    throw new Error(`"${entry.id}" hat keinen Ablenker-Bestand — zu wenige unregelmäßige Verben.`);
  }

  const options = shuffled([correct, ...distractors], random).map((label) => ({ label }));
  const parts = [
    `${entry.term} — ${correct} — ${verb.participle}`,
    translate(ui, verb.irregular ? 'drill.irregular' : 'drill.regular'),
  ];
  if (entry.ipa) parts.push(entry.ipa);
  if (entry.note && anchor === 'de') parts.push(entry.note);

  return {
    id: `irregularPast:${entry.id}`,
    drill: 'irregularPast',
    direction: toTarget(entry),
    vocabId: entry.id,
    visible: entry.term,
    // Bedeutung in der Ankersprache statt fest Deutsch (Testrunde 26.09.).
    visibleHint: bridgeText(entry, anchor).text,
    speak: null,
    options,
    correctIndex: options.findIndex((option) => option.label === correct),
    solution: `${entry.term} → ${correct}`,
    explanation: parts.join(' · '),
  };
}

/* ---------- Präsens-Endungen (de_to_es, Schritt 5) ---------- */

/**
 * Regelmäßige Präsensformen aus der KONJUGATIONSKLASSE abgeleitet.
 *
 * Die Endungstabelle (-ar/-er/-ir × 5 Personen) ist eine geschlossene,
 * regelhafte Menge — dieselbe epistemische Stufe wie die spanische
 * Betonungsregel. Geübt wird die Ableitung: Person + Infinitiv → Endung.
 * Ablenker sind echte Endungen ANDERER Klassen — hablar → -amos gegen
 -emos/-imos ist genau die Verwechslung zwischen den Klassen.
 */
const PERSONEN = ['yo', 'tú', 'él/ella', 'nosotros', 'ellos/ellas'] as const;

const ENDUNGEN: Record<'ar' | 'er' | 'ir', string[]> = {
  ar: ['o', 'as', 'a', 'amos', 'an'],
  er: ['o', 'es', 'e', 'emos', 'en'],
  ir: ['o', 'es', 'e', 'imos', 'en'],
};

/**
 * Endungen, bei denen „Stamm + Endung“ im Präsens nicht die richtige Form
 * ergibt, obwohl die Daten das Verb regelmäßig nennen: Akzentverschiebung
 * (evaluar → evalúo, vaciar → vacío, maullar → maúllo) und Schreibänderung
 * in der 1. Person (proteger → protejo, convencer → convenzo, construir →
 * construyo). -iar/-uar sind nicht sicher trennbar (estudiar ist regelmäßig,
 * vaciar nicht) — lieber ein paar Verben weniger als eine falsche Lösung.
 */
const PRAESENS_UNSICHER = /(?:[^g]uar|iar|ullar|ger|gir|cer|cir|uir)$/;

export function canBuildPraesensEndungQuestion(entry: VocabEntry): boolean {
  if (entry.language !== 'es') return false;
  const verb = entry.spanishVerb;
  if (!verb || verb.irregular) return false;
  if (PRAESENS_UNSICHER.test(entry.term)) return false;
  return Boolean(verb.conjugation && entry.term.endsWith(verb.conjugation));
}

export function buildPraesensEndungQuestion(
  entry: VocabEntry,
  pool: VocabEntry[],
  random: Random,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const verb = entry.spanishVerb;
  if (!verb) throw new Error(`"${entry.id}" ist kein spanisches Verb.`);
  const klasse = verb.conjugation;
  if (!klasse) throw new Error(`"${entry.id}" hat keine Konjugationsklasse.`);
  const personIndex = Math.floor(random() * PERSONEN.length) % PERSONEN.length;
  const richtig = ENDUNGEN[klasse][personIndex];
  const stamm = entry.term.slice(0, entry.term.length - klasse.length);

  // -er und -ir teilen vier Endungen — ohne Set stünden sie doppelt zur Wahl.
  const fremd = shuffled(
    [
      ...new Set(
        (['ar', 'er', 'ir'] as const)
          .filter((k) => k !== klasse)
          .flatMap((k) => ENDUNGEN[k])
          .filter((endung) => endung !== richtig)
      ),
    ],
    random
  ).slice(0, 3);
  const optionenListe = shuffled([richtig, ...fremd], random);

  const parts = [
    `${entry.term} → ${stamm}${richtig}`,
    translate(ui, 'drill.verbClass', { klasse: `-${klasse}` }),
  ];
  if (entry.note) parts.push(entry.note);

  return {
    id: `praesensEndung:${entry.id}:${personIndex}`,
    drill: 'praesensEndung',
    direction: toTarget(entry),
    vocabId: entry.id,
    visible: `${PERSONEN[personIndex]} · ${entry.term}`,
    // Bedeutung in der Ankersprache statt stur Deutsch (21.09.2026, en-UI:
    // „miauen“ unter englischer Oberfläche).
    visibleHint: kontextFuer(entry, anchor),
    speak: null,
    options: optionenListe.map((label) => ({ label })),
    correctIndex: optionenListe.findIndex((label) => label === richtig),
    solution: `${PERSONEN[personIndex]} ${stamm}${richtig}`,
    explanation: parts.join(' · '),
  };
}

/* ---------- Dritte Form (de_to_en, Schritt 5) ---------- */

/**
 * Das Past Participle unregelmäßiger englischer Verben — die Form, die
 * zusammengesetzte Zeitformen (Present Perfect, Passiv) brauchen. Gleiche
 * Bauart wie `irregularPast`, zweite Spalte desselben geprüften Eintrags.
 */
export function canBuildPartizipQuestion(entry: VocabEntry): boolean {
  return (
    entry.language === 'en' &&
    Boolean(entry.englishVerb?.irregular && entry.englishVerb.participle)
  );
}

export function buildPartizipQuestion(
  entry: VocabEntry,
  pool: VocabEntry[],
  random: Random,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const verb = entry.englishVerb;
  if (!verb?.participle) {
    throw new Error(`"${entry.id}" hat keine dritte Form.`);
  }

  const correct = verb.participle;
  // Set: mehrere Verben teilen eine Form (got, set …) — nie doppelt anbieten.
  const distractors = shuffled(
    [
      ...new Set(
        pool
          .filter((other) => other.id !== entry.id && other.englishVerb?.irregular)
          .map((other) => other.englishVerb!.participle)
          .filter((form): form is string => Boolean(form) && form !== correct)
      ),
    ],
    random
  ).slice(0, 3);
  if (distractors.length < 3) {
    throw new Error(`"${entry.id}" hat keinen Ablenker-Bestand.`);
  }

  const options = shuffled([correct, ...distractors], random).map((label) => ({ label }));
  const parts = [
    `${entry.term} — ${verb.past} — ${correct}`,
    translate(ui, verb.irregular ? 'drill.irregular' : 'drill.regular'),
  ];
  if (entry.note && anchor === 'de') parts.push(entry.note);

  return {
    id: `partizip:${entry.id}`,
    drill: 'partizip',
    direction: toTarget(entry),
    vocabId: entry.id,
    visible: entry.term,
    visibleHint: bridgeText(entry, anchor).text,
    speak: null,
    options,
    correctIndex: options.findIndex((option) => option.label === correct),
    solution: `have ${correct}`,
    explanation: parts.join(' · '),
  };
}

/* ---------- Betonung herleiten (de_to_es) ---------- */

/**
 * Nur **mehrsilbige** Woerter — aus demselben Grund, aus dem die Ton-Uebung
 * nur einsilbige nimmt: Bei einem einsilbigen Wort hat die Frage nur eine
 * moegliche Antwort, und wer sie richtig beantwortet, hat nichts gezeigt.
 *
 * Und nur Woerter, deren Herleitung mit der abgelegten Betonung
 * uebereinstimmt. Diese zweite Bedingung ist wie in Phase 13 die wichtigere:
 * Waeren beide je verschieden, zeigte die Uebung eine Begruendung, die der
 * als richtig markierten Antwort widerspricht. Ein Test faehrt den ganzen
 * spanischen Grundstock durch und belegt, dass es diesen Fall nicht gibt.
 */
export function canBuildStressQuestion(entry: VocabEntry): boolean {
  if (entry.language !== 'es') return false;
  if (entry.syllables.length < 2) return false;
  const analysis = analyzeStress(entry.term);
  if (!analysis.ok) return false;
  if (analysis.syllables.length !== entry.syllables.length) return false;
  return analysis.stressedIndex === entry.syllables.findIndex((syllable) => syllable.stressed);
}

export function buildStressQuestion(
  entry: VocabEntry,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const analysis = analyzeStress(entry.term);
  if (!analysis.ok) throw new Error(`"${entry.id}" (${entry.term}): ${analysis.reason}`);
  const abgelegt = entry.syllables.findIndex((syllable) => syllable.stressed);
  if (analysis.stressedIndex !== abgelegt) {
    throw new Error(
      `"${entry.id}" (${entry.term}): Herleitung ergibt Silbe ${analysis.stressedIndex + 1}, ` +
        `abgelegt ist ${abgelegt + 1}. Solange das nicht geklaert ist, wird daraus keine Aufgabe.`
    );
  }

  // Die Antworten sind die Silben DIESES Wortes - keine ausgedachte Auswahl.
  // Ihre Zahl haengt damit am Wort, anders als bei den fuenf Toenen, die ein
  // festes Inventar sind. Die Silbennummer ist Chrome — Wörterbuchschlüssel.
  const options: DrillOption[] = analysis.syllables.map((syllable, index) => ({
    label: syllable,
    hint: translate(ui, 'drill.syllableOrdinal', { index: index + 1 }),
  }));

  // Der Regeltext kommt aus den LEGENDEN-Schlüsseln — dieselben Sätze, die
  // die Betonungs-Legende zeigt, in der UI-Sprache (21.09.2026). Die
  // Herleitungsschritte trägt `analyzeStress` als Schlüssel und werden hier
  // übersetzt.
  const regel = STRESS_REGEL_KEYS[analysis.rule];

  return {
    id: `stressRule:${entry.id}`,
    drill: 'stressRule',
    direction: toTarget(entry),
    vocabId: entry.id,
    // Die Schreibung IST die Aufgabe: Genau aus ihr soll die Betonung folgen.
    // Die Silbentrennung steht bewusst nicht dabei - sie waere der halbe Weg.
    visible: entry.term,
    visibleHint: kontextFuer(entry, anchor),
    speak: null,
    options,
    correctIndex: analysis.stressedIndex,
    solution: `${analysis.syllables.join('-')} - ${bridgeText(entry, anchor).text}`,
    explanation: translate(ui, regel),
    derivation: uebersetzteSchritte(analysis.steps, ui),
    uncertain: analysis.uncertain ? translate(ui, analysis.uncertain.key, analysis.uncertain.params) : null,
  };
}

/* ---------- Gleiche Schreibung, anderer Laut (de_to_en) ---------- */

/**
 * Nur Woerter, die zu einer Gruppe mit mindestens zwei Lesarten gehoeren.
 *
 * Ohne Gegenstueck gaebe es nichts zu vergleichen, und die Frage haette genau
 * eine moegliche Antwort. Der ganze Punkt der Uebung ist, dass dasselbe
 * Schriftstueck im Grundstock nachweislich verschieden klingt (AE-44).
 */
export function canBuildSpellingQuestion(
  entry: VocabEntry,
  groups: GraphemeGroup[] = graphemeGroups()
): boolean {
  if (entry.language !== 'en') return false;
  const group = groupFor(entry, groups);
  return Boolean(group && entry.englishSpelling && group.sounds.length >= 2);
}

export function buildSpellingQuestion(
  entry: VocabEntry,
  groups: GraphemeGroup[] = graphemeGroups(),
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const spelling = entry.englishSpelling;
  const group = groupFor(entry, groups);
  if (!spelling || !group) {
    throw new Error(`"${entry.id}" gehoert zu keiner Schriftstueck-Gruppe - keine Aufgabe.`);
  }

  // Die falschen Antworten sind ECHTE Lesarten desselben Schriftstuecks aus
  // demselben Grundstock. Ein ausgedachter Laut waere hier besonders
  // schaedlich: Die Uebung behauptet ja gerade, dass all diese Lesarten
  // wirklich vorkommen.
  const options: DrillOption[] = group.sounds.map((sound) => ({
    label: sound,
    // Als Beispiel NIE das gefragte Wort selbst - das waere die Antwort.
    // Bleibt keines uebrig, steht der Laut ohne Beispiel da.
    hint: group.members.find(
      (member) => member.sound === sound && member.entry.id !== entry.id
    )?.entry.term,
  }));

  // Nur was wirklich anders klingt. Ein Wort mit demselben Laut unter
  // "anders gesprochen" waere schlicht falsch.
  const andere = group.members
    .filter((member) => member.entry.id !== entry.id && member.sound !== spelling.sound)
    .slice(0, 4)
    .map((member) => `${member.entry.term} ${member.sound}`)
    .join(' · ');

  const gleiche = group.members
    .filter((member) => member.entry.id !== entry.id && member.sound === spelling.sound)
    .slice(0, 4)
    .map((member) => member.entry.term)
    .join(', ');

  return {
    id: `spelling:${entry.id}`,
    drill: 'spelling',
    direction: toTarget(entry),
    vocabId: entry.id,
    visible: entry.term,
    visibleHint: `„${spelling.grapheme}" — ${bridgeText(entry, anchor).text}`,
    // Kein Vorsprechen: Das Wort zu hoeren WAERE die Antwort. Die Aufloesung
    // spricht es danach aus.
    speak: null,
    options,
    correctIndex: group.sounds.indexOf(spelling.sound),
    solution: `${entry.term} ${entry.ipa ?? ''} — ${bridgeText(entry, anchor).text}`.trim(),
    explanation: [
      andere ? translate(ui, 'drill.spellingOther', { grapheme: spelling.grapheme, list: andere }) : null,
      gleiche ? translate(ui, 'drill.spellingSame', { list: gleiche }) : null,
    ]
      .filter(Boolean)
      .join(' ') || translate(ui, 'drill.spellingHere', { grapheme: spelling.grapheme, sound: spelling.sound }),
  };
}

/* ---------- Betonung hoeren (de_to_es) ---------- */

/**
 * Die Silbe ohne ihr Akzentzeichen.
 *
 * DER GANZE PUNKT DER UEBUNG haengt an dieser Zeile. Stuenden die Silben mit
 * Akut da, waere „mé·di·co" die Antwort zum Ablesen und niemand muesste
 * hinhoeren. Ohne Zeichen — „me · di · co" — sieht man, WELCHE Silben es gibt,
 * und muss hoeren, welche davon getragen wird.
 */
export function withoutAccent(syllable: string): string {
  return [...syllable].map((letter) => ACUTE_TO_PLAIN[letter] ?? letter).join('');
}

/**
 * Nur mehrsilbige Woerter mit abgelegter Betonung.
 *
 * Dieselbe Schranke wie bei „Betonung herleiten": Bei einem einsilbigen Wort
 * gaebe es nur eine moegliche Antwort.
 */
export function canBuildStressHearQuestion(entry: VocabEntry): boolean {
  if (entry.language !== 'es') return false;
  if (entry.syllables.length < 2) return false;
  return entry.syllables.some((syllable) => syllable.stressed);
}

export function buildStressHearQuestion(
  entry: VocabEntry,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const syllables = syllablesOf(entry);
  const stressed = syllables.findIndex((syllable) => syllable.stressed);
  if (stressed < 0) {
    throw new Error(`"${entry.id}" hat keine abgelegte Betonung - keine Hoeraufgabe.`);
  }

  const options: DrillOption[] = syllables.map((syllable, index) => ({
    label: withoutAccent(syllable.roman),
    hint: translate(ui, 'drill.syllableOrdinal', { index: index + 1 }),
  }));

  const geschrieben = syllables.some((syllable) => syllable.roman !== withoutAccent(syllable.roman));

  return {
    id: `stressHear:${entry.id}`,
    drill: 'stressHear',
    direction: toTarget(entry),
    vocabId: entry.id,
    // Das Wort selbst bleibt unsichtbar: Die Schreibung traegt den Akut, und
    // die Bedeutung erlaubte es, die Antwort aus dem Gedaechtnis abzurufen
    // statt sie zu hoeren. Dieselbe Ueberlegung wie bei der Thai-Ton-Uebung
    // aus Phase 6.
    visible: null,
    visibleHint: null,
    speak: { text: entry.term, language: 'es' },
    options,
    correctIndex: stressed,
    solution: losungForm(entry, anchor),
    explanation: geschrieben
      ? translate(ui, 'drill.stressHearWritten')
      : translate(ui, 'drill.stressHearNoAccent'),
  };
}

/* ---------- Wort hoeren (de_to_en) ---------- */

/**
 * Die Umkehrung der Vergleichsuebung: nicht sehen und den Laut waehlen,
 * sondern hoeren und die Schreibung waehlen.
 *
 * Das ist die ehrliche Hoeruebung fuer Englisch. Eine Aussprache HERZULEITEN
 * geht dort nicht (AE-44) - sie zu ERKENNEN sehr wohl, und genau daran
 * scheitert man im Alltag: though, through, thought und enough sehen fast
 * gleich aus und klingen voellig verschieden.
 */
export function canBuildSoundSpellingQuestion(
  entry: VocabEntry,
  groups: GraphemeGroup[] = graphemeGroups()
): boolean {
  if (entry.language !== 'en') return false;
  const group = groupFor(entry, groups);
  return Boolean(group && group.members.length >= 3);
}

export function buildSoundSpellingQuestion(
  entry: VocabEntry,
  groups: GraphemeGroup[] = graphemeGroups(),
  random: Random = Math.random,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): DrillQuestion {
  const group = groupFor(entry, groups);
  if (!group) {
    throw new Error(`"${entry.id}" gehoert zu keiner Schriftstueck-Gruppe - keine Hoeraufgabe.`);
  }

  // Die Ablenker sind die anderen Woerter derselben Gruppe - echte Woerter des
  // Grundstocks mit derselben Buchstabenfolge. Erfunden ist daran nichts, und
  // sie sind genau die Verwechslung, um die es geht.
  const members = shuffled([
    group.members.find(member => member.entry.id === entry.id)!,
    ...shuffled(group.members.filter(member => member.entry.id !== entry.id && member.entry.term !== entry.term)
      .filter((member, index, rest) => rest.findIndex(other => other.entry.term === member.entry.term) === index), random)
      .slice(0, 3),
  ], random);
  // Ohne Laut-Hinweis an den Optionen: Das IPA verriete die Antwort, bevor
  // man hingehört hat. Die Erklärung nennt die Laute danach.
  const options: DrillOption[] = members.map((member) => ({ label: member.entry.term }));

  return {
    id: `soundSpelling:${entry.id}`,
    drill: 'soundSpelling',
    direction: toTarget(entry),
    vocabId: entry.id,
    visible: null,
    visibleHint: null,
    speak: { text: entry.term, language: 'en' },
    options,
    correctIndex: members.findIndex(member => member.entry.id === entry.id),
    solution: `${entry.term} ${entry.ipa ?? ''} — ${bridgeText(entry, anchor).text}`.trim(),
    explanation: translate(ui, 'drill.soundSpellingContains', {
      grapheme: group.grapheme,
      list: members.map((member) => `${member.entry.term} ${member.sound}`).join(' · '),
    }),
  };
}

/* ---------- gemeinsamer Zugang ---------- */

export const DRILL_PROMPTS = {
  tone: DRILL_META.tone.prompt,
  article: DRILL_META.article.prompt,
  verbForms: DRILL_META.verbForms.prompt,
};
