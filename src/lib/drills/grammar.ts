import { ZAEHLER_ITEMS, ZAEHLER_OPTIONEN, type ZaehlerItem } from '@/data/grammar-th-counters';
import { POLITE_ITEMS, type PoliteItem } from '@/data/grammar-th';
import { SER_ESTAR_ITEMS, type SerEstarItem } from '@/data/grammar-es';
import { CONSONANT_MEANING_DE, THAI_CONSONANTS, type ThaiConsonant } from '@/data/thai-script';

import type { UiLanguage } from '../i18n/types';
import { translate } from '../i18n';
import { Random, shuffled } from './random';
import { directionForDrill, DrillOption, DrillQuestion } from './types';

/**
 * Die kleinen Grammatik-Datensätze tragen ihre Erklärtexte NUR auf Deutsch
 * (`german`, `reason`, Sprecher-Hinweise). Auf anderen Brücken gibt es
 * keine ehrliche Übersetzung — dort bleibt der Hinweis weg (21.09.2026,
 * en-UI: deutsche Sätze unter englischer Oberfläche). `de` liefert das
 * bisherige Verhalten.
 */
function deutscheErklaerung(anker: UiLanguage): boolean {
  return anker === 'de';
}

/**
 * Aufgaben aus den kleinen Grammatik-Datensätzen (`data/grammar-th.ts`,
 * `data/grammar-es.ts`).
 *
 * WARUM EIN EIGENER BAUSTEIN NEBEN `questions.ts`: Die Ton-, Artikel- und
 * Betonungsübungen ziehen ihre Aufgaben aus dem Vokabel-Grundstock und sind
 * über den FSRS-Zustand der Karten gewichtet. Die Grammatik-Datensätze sind
 * regulative Kleinstübungen (Partikelwahl, ser/estar) ohne eigene Karten —
 * sie legen KEINE FSRS-Zustände an und haben keinen Wiederholungsstand.
 * Ihre Sitzung wird deshalb rein aus dem Datensatz gemischt, zufällig und
 * mit fester Rundenlänge; schwachgewichtige Auswahl wäre hier Scheinpräzi-
 * sion über Daten, die keinen Lernstand messen.
 *
 * Dasselbe Ehrlichkeitsprinzip wie überall: Die falschen Antworten sind die
 * ECHTE Alternative derselben Entscheidung (ครับ gegen ค่ะ, ser gegen
 * estar) — nicht erfundene Formen.
 */

/** Die Partikel-Wahl: feste Reihenfolge, männlich zuerst — dieselbe Überlegung wie bei den Tönen. */
const POLITE_OPTIONS: DrillOption[] = [
  { label: 'ครับ', roman: 'khráp' },
  { label: 'ค่ะ', roman: 'khâ' },
];

export function buildPoliteQuestion(item: PoliteItem, anchor: UiLanguage = 'de', ui: UiLanguage = 'de'): DrillQuestion {
  return {
    id: `polite:${item.id}`,
    drill: 'polite',
    direction: directionForDrill('polite', 'th'),
    vocabId: item.id,
    visible: `${item.text} ___`,
    visibleRoman: `${item.roman} ___`,
    visibleHint: item.speaker === 'male'
      ? translate(ui, 'grammar.speakerMale')
      : translate(ui, 'grammar.speakerFemale'),
    // Bewusst kein Audio vor der Antwort: Der gesprochene Satz ENDET mit der
    // Partikel — er würde die Lösung vorlesen.
    speak: null,
    options: POLITE_OPTIONS,
    correctIndex: item.answer === 'ครับ' ? 0 : 1,
    solution: `${item.text} ${item.answer}`,
    solutionRoman: `${item.roman} ${item.answer === 'ครับ' ? 'khráp' : 'khâ'}`,
    explanation: deutscheErklaerung(anchor)
      ? `${item.german} · ${translate(ui, 'grammar.particleGender')}`
      : translate(ui, 'grammar.particleGender'),
  };
}

/** Die Form der 3. Person für die Lösung: ser → es, estar → está (sonst `item.form`). */
const SER_ESTAR_FORMS: Record<SerEstarItem['answer'], string> = { ser: 'es', estar: 'está' };

export function buildSerEstarQuestion(item: SerEstarItem, anchor: UiLanguage = 'de'): DrillQuestion {
  const options: DrillOption[] = [{ label: 'ser' }, { label: 'estar' }];
  return {
    id: `serEstar:${item.id}`,
    drill: 'serEstar',
    direction: directionForDrill('serEstar', 'es'),
    vocabId: item.id,
    visible: item.text,
    // Der Satz-Träger des Datensatzes ist deutsch (`item.german`) — auf
    // anderen Brücken ehrlich weg, die Aufgabe (ser/estar) bleibt lesbar.
    visibleHint: deutscheErklaerung(anchor) ? item.german : '',
    speak: null,
    options,
    correctIndex: item.answer === 'ser' ? 0 : 1,
    solution: item.text.replace('___', item.form ?? SER_ESTAR_FORMS[item.answer]),
    explanation: deutscheErklaerung(anchor) ? item.reason : '',
  };
}

/* ---------- Zählwörter (de_to_th, Schritt 5) ---------- */

const ZAEHLER_ROMAN: Record<(typeof ZAEHLER_OPTIONEN)[number], string> = {
  คน: 'khon', ตัว: 'dtua', เล่ม: 'lêm', แก้ว: 'gɛ̂ɛo', หลัง: 'lǎng',
};

export function buildZaehlerQuestion(item: ZaehlerItem, anchor: UiLanguage = 'de', ui: UiLanguage = 'de'): DrillQuestion {
  const options: DrillOption[] = ZAEHLER_OPTIONEN.map((label) => ({ label, roman: ZAEHLER_ROMAN[label] }));
  return {
    id: `zaehler:${item.id}`,
    drill: 'zaehlerwort',
    direction: directionForDrill('zaehlerwort', 'th'),
    vocabId: item.id,
    // Die deutsche Bedeutung in Klammern nur auf der de-Brücke — andere
    // Anker haben keine Übersetzung des Datensatzes (21.09.2026).
    visible: deutscheErklaerung(anchor) ? `${item.nomen} (${item.german})` : item.nomen,
    visibleRoman: item.roman,
    // Thai: Nomen + Zahl + Zählwort — die Lücke steht HINTER der Zahl.
    visibleHint: translate(ui, 'grammar.counterHint', { example: `${item.nomen} หนึ่ง ___` }),
    visibleHintRoman: `${item.roman} nʉ̀ng ___`,
    speak: null,
    options,
    correctIndex: ZAEHLER_OPTIONEN.indexOf(item.answer),
    solution: deutscheErklaerung(anchor)
      ? `${item.nomen} หนึ่ง ${item.answer} — 1 × ${item.german}`
      : `${item.nomen} หนึ่ง ${item.answer}`,
    solutionRoman: `${item.roman} nʉ̀ng ${ZAEHLER_ROMAN[item.answer]}`,
    explanation: translate(ui, 'grammar.counterBetween'),
  };
}

/* ---------- Konsonantenklassen (de_to_th, Schritt 5) ---------- */

function konsonantBedeutung(konsonant: ThaiConsonant, anchor: UiLanguage): string | null {
  if (anchor === 'de') return CONSONANT_MEANING_DE[konsonant.symbol] ?? null;
  if (anchor === 'en') return konsonant.meaning;
  return null;
}

export function buildKonsonantenklasseQuestion(konsonant: ThaiConsonant, anchor: UiLanguage = 'de', ui: UiLanguage = 'de'): DrillQuestion {
  const klassenLabel = (klasse: 'mid' | 'high' | 'low'): string => translate(ui, `consonantClass.${klasse}`);
  const optionen = (['mid', 'high', 'low'] as const).map((klasse) => ({ label: klassenLabel(klasse) }));
  const richtige = klassenLabel(konsonant.consonantClass);
  return {
    id: `konsonantenklasse:${konsonant.symbol}`,
    drill: 'konsonantenklasse',
    direction: directionForDrill('konsonantenklasse', 'th'),
    vocabId: konsonant.symbol,
    visible: konsonant.name,
    visibleRoman: konsonant.nameRtgs,
    // Die Merkwort-Bedeutung gibt es englisch (Quelle) und deutsch
    // (CONSONANT_MEANING_DE) — auf anderen Brücken bleibt die RTGS-Umschrift.
    visibleHint: konsonantBedeutung(konsonant, anchor)
      ? `${konsonantBedeutung(konsonant, anchor)} · ${konsonant.nameRtgs}`
      : konsonant.nameRtgs,
    speak: null,
    options: optionen,
    correctIndex: optionen.findIndex((option) => option.label === richtige),
    solution: `${konsonant.name} — ${richtige}`,
    solutionRoman: konsonant.nameRtgs,
    explanation: translate(ui, 'grammar.classIntro'),
  };
}

/** Die drei Datensatz-Übungen der Stufe 5 mischen wie polite/serEstar. */
export function buildGrammarSession(
  drill: 'polite' | 'serEstar' | 'zaehlerwort' | 'konsonantenklasse',
  random: Random,
  size: number,
  anchor: UiLanguage = 'de',
  ui: UiLanguage = 'de'
): { questions: DrillQuestion[]; available: number } {
  if (drill === 'polite') {
    return {
      questions: shuffled([...POLITE_ITEMS], random).slice(0, size).map((item) => buildPoliteQuestion(item, anchor, ui)),
      available: POLITE_ITEMS.length,
    };
  }
  if (drill === 'serEstar') {
    return {
      questions: shuffled([...SER_ESTAR_ITEMS], random).slice(0, size).map((item) => buildSerEstarQuestion(item, anchor)),
      available: SER_ESTAR_ITEMS.length,
    };
  }
  if (drill === 'zaehlerwort') {
    return {
      questions: shuffled([...ZAEHLER_ITEMS], random).slice(0, size).map((item) => buildZaehlerQuestion(item, anchor, ui)),
      available: ZAEHLER_ITEMS.length,
    };
  }
  // Konsonantenklasse: regelgetreu aus der quellengeprüften Schrifttabelle —
  // veraltete/obsolete Buchstaben (ฃ/ฅ) bewusst ausgeschlossen.
  const konsonanten = THAI_CONSONANTS.filter(
    (k) => !k.meaning.includes('obsolete')
  );
  return {
    questions: shuffled(konsonanten, random)
      .slice(0, size)
      .map((konsonant) => buildKonsonantenklasseQuestion(konsonant, anchor, ui)),
    available: konsonanten.length,
  };
}
