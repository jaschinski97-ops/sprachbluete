import { editDistance } from '@/lib/writing/compare';

import {
  type DictationLanguageConfig,
} from '@/data/dictation-config';

import { type Rating } from '@/lib/fsrs/types';
import type { TranslationKey } from '@/lib/i18n/keys';
import type { TParams } from '@/lib/i18n/types';

/**
 * Diktat-Bewertung: Gehörtes gegen Getipptes — vollständig offline, reine
 * Rechnung (kein Netz, kein Anbieter, kein Schlüssel).
 *
 * ARCHITEKTUR: Zwei Wege, ein Ergebnis.
 *
 * - **Latein** vergleicht WORTWEISE. Wörter werden über ein
 *   Levenshtein-Alignment (das ist das „Wort-Fenster": die globale Ausrichtung
 *   darf Wörter lokal einrücken, statt reihenweise insert/delete zu erzwingen)
 *   zusammengefügt. Ein Wort zählt als **Tippfehler-Wort**, wenn es innerhalb
 *   des konfigurierten Fensters (`wordTypoWindow`, nur ab 5 Zeichen) an den
 *   Zieltext herankommt — dieselbe Grenze wie `typoTolerance` im freien
 *   Schreiben. `baseScore` = passende Wörter / Sollwörter.
 * - **Thai** vergleicht ZWEISTUFIG (Scoring-Spec): Erst die **Basisschrift**
 *   ohne Tonzeichen und unterlautenden Vokalzeichen (U+0E31, U+0E34–U+0E3A,
 *   U+0E47–U+0E4E) per Zeichen-Levenshtein → `baseScore`. Dann die
 *   **Tonzeichen** positionsbasiert nach dem Best-Effort-Alignment der
 *   Basiszeichen → `diacriticScore`. Thai hat keine Leerzeichen — die
 *   Lehrhilfen-Leerzeichen der Satzdaten fallen vor dem Vergleich weg.
 *
 * BESTEHEN (beide Wege): `baseScore >= passThreshold` (Default 90) UND
 * `diacriticScore >= diacriticThreshold` (Default 50, weiche Schwelle).
 * Die Verknüpfung ist absichtlich UND: Ein Reintext ohne Tonzeichen ist im
 * Thai noch kein richtiges Diktat — aber die weiche Schwelle verhindert auch,
 * dass EIN vergessenes Zeichen in einem langen Satz die ganze Leistung
 * auslöscht. Die Rückmeldung sagt dann ehrlich: „Basisschrift korrekt —
 * Töne/Tonzeichen prüfen."
 *
 * Das `diff`-Array ist für die Anzeige: Zieltext farbig aufbereitet (grün =
 * sitzt, rot = fehlt/anders), zu viel Getipptes steht als `extra` separat.
 */

export type DictationDiffStatus = 'match' | 'typo' | 'missing' | 'extra';

export type DictationDiffToken = {
  text: string;
  status: DictationDiffStatus;
};

export type DictationScore = {
  /** 0–100: Basisschrift (Thai ohne Tonzeichen, Latein wortweise). */
  baseScore: number;
  /** 0–100: Tonzeichen/Diakritika. Bei strikten Latein-Sprachen immer 100 — dort zählen sie bereits in der Basisschrift. */
  diacriticScore: number;
  /** Basisschrift UND Diakritika über ihren Schwellen. */
  passed: boolean;
  /** Nach Normalisierung zeichenidentisch. */
  exact: boolean;
  /** Bestanden, aber nicht fehlerfrei (Tippfehler-Wörter, weiche Diakritika). */
  typo: boolean;
  /** Bestanden, aber die Tonzeichen/Diakritika waren nicht sauber — die Rückmeldung muss das benennen. */
  toneWarning: boolean;
  /** Leere Eingabe — wird nie als Diktat gewertet. */
  empty: boolean;
  /**
   * Ein ehrlicher Satz zur Abweichung; `null` nur bei `exact`. SEIT DEM
   * 21.09.2026 ALS WÖRTERBUCHSCHLÜSSEL: Der Runner übersetzt ihn in der
   * App-Sprache — vorher standen hier deutsche Sätze auf jeder Oberfläche.
   */
  message: { key: TranslationKey; params?: TParams } | null;
  /** Zieltext (plus zu viel Getipptes) für die Farb-Anzeige. */
  diff: DictationDiffToken[];
};

/** Leerraum vereinheitlichen — derselbe erste Schritt wie überall im Vergleich. */
export function tidyDictation(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Interpunktion, die man nicht hören kann. Der Apostroph ist bewusst dabei:
 * „don't" für „dont" ist kein Diktatfehler. Thai ๆ (U+0E46, Wiederholung)
 * steht absichtlich NICHT hier — es ist Schrift, keine Satzzeichen.
 */
// Dazu die chinesischen Vollbreiten-Satzzeichen (，。？！：；、《》（）「」).
const PUNCTUATION = /[.,!?;:"„“”‚‘’«»‹›()[\]{}…–—‽¡¿'，。？！：；、《》（）「」『』]/gu;

const THAI_DIACRITIC = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/u;

/** Zieht Diakritika ab (NFD + kombinatorische Zeichen weg) — nur für weiche Sprachen und die Diakritik-Kontrolle. */
export function stripLatinDiacritics(word: string): string {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
}

/** Normalisiert einen Einzel-Token: Interpunktion weg, ß ≡ ss, case je nach Sprache. */
function normalizeToken(raw: string, config: DictationLanguageConfig): string {
  let norm = config.ignorePunctuation ? raw.replace(PUNCTUATION, '') : raw;
  if (config.eszettEquivalence) norm = norm.replace(/ß/gu, 'ss').replace(/ẞ/gu, 'SS');
  if (config.foldCase) norm = norm.toLowerCase();
  return norm;
}

type Token = { raw: string; norm: string };

/**
 * Zerlegt Text in normierte Token. Latein: Wörter. Thai: Zeichen (die
 * Lehrhilfen-Leerzeichen der Satzdaten fallen in `norm` weg, bleiben in
 * `raw` für die Anzeige aber erhalten).
 */
function tokenize(text: string, config: DictationLanguageConfig): Token[] {
  // Chinesisch hat keine Leerzeichen: jedes Schriftzeichen ist ein Token,
  // sonst wäre ein Satz ein einziges Alles-oder-nichts-Wort.
  const rawTokens = config.script === 'han'
    ? Array.from(tidyDictation(text).replace(/\s+/gu, ''))
    : tidyDictation(text).split(/\s+/).filter(Boolean);
  const tokens: Token[] = [];
  // Nur der ERSTE behaltene Token bekommt den Satz-Anfangs-Toleranz-Faltung —
  // auf jeden Token angewandt, würde sie Groß-/Kleinschreibung im Satzinneren
  // still weg Bügeln (geschützt bleiben sie: siehe latinCost).
  let erste = true;
  for (const raw of rawTokens) {
    // Thai läuft durch dieselbe Interpunktions-Regel; zusätzlich fallen die
    // Lehrhilfen-Leerzeichen aus dem normierten Token (siehe splitThai).
    let norm = normalizeToken(raw, config);
    if (config.script === 'thai') norm = norm.replace(/\s+/gu, '');
    if (!norm) continue;
    const fertig = erste ? foldInitial(norm, config) : norm;
    erste = false;
    tokens.push({ raw, norm: fertig });
  }
  return tokens;
}

/** Den Großbuchstaben am Satzanfang tolerieren — auf dem ersten Token. */
function foldInitial(norm: string, config: DictationLanguageConfig): string {
  if (config.foldCase || !config.tolerateSentenceInitialCase) return norm;
  const chars = Array.from(norm);
  const first = chars.findIndex((ch) => /\p{L}/u.test(ch));
  if (first === -1 || first > 1) return norm;
  chars[first] = chars[first].toLowerCase();
  return chars.join('');
}

/** Der ganzer Satz normiert — für `exact`. */
function normalizedWhole(tokens: Token[], config: DictationLanguageConfig): string {
  return tokens.map((token) => token.norm).join(config.script === 'latin' ? ' ' : '');
}

/* ---------- Alignment ---------- */

/**
 * Alignment zweier Token-Folgen. Das ist das „Wort-Fenster" der Spec: die
 * globale Ausrichtung darf Paare lokal bevorzugen, damit ein eingefügtes Wort
 * nicht alle Folgewörter als Fehler aussehen lässt.
 *
 * Kosten: 0 gleich, 0.5 Tippfehler-ähnlich (nur Latein), 1 ungleich. Die
 * Halbierung sorgt dafür, dass zwei ahnliche Wörter (1.0) einer Substitution
 * plus Deletion (2.0) vorgezogen werden — die Ausrichtung sucht die
 * nachsichtigste *plausible* Lesart.
 */
type Op =
  | { kind: 'equal' | 'typo' | 'sub'; a: number; b: number }
  | { kind: 'extra'; a: number }
  | { kind: 'missing'; b: number };

function alignTokens(
  a: string[],
  b: string[],
  cost: (x: string, y: string) => number
): { ops: Op[]; distance: number } {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i++) d[i][0] = d[i - 1][0] + 1;
  for (let j = 1; j < cols; j++) d[0][j] = d[0][j - 1] + 1;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + cost(a[i - 1], b[j - 1]),
        d[i - 1][j] + 1,
        d[i][j - 1] + 1
      );
    }
  }

  const ops: Op[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + cost(a[i - 1], b[j - 1])) {
      const c = cost(a[i - 1], b[j - 1]);
      ops.push({ kind: c === 0 ? 'equal' : c === 0.5 ? 'typo' : 'sub', a: i - 1, b: j - 1 });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ kind: 'extra', a: i - 1 });
      i--;
    } else {
      ops.push({ kind: 'missing', b: j - 1 });
      j--;
    }
  }
  return { ops: ops.reverse(), distance: d[a.length][b.length] };
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 100;
  // Zu viel Getipptes kann die Distanz über die Ziellänge treiben — die
  // Punktzahl bleibt dann bei 0, statt negativ zu werden.
  const clamped = Math.max(0, Math.min(whole, part));
  return Math.round((clamped / whole) * 100);
}

/* ---------- Latein ---------- */

function latinWordWindow(norm: string, config: DictationLanguageConfig): number {
  if (config.wordTypoWindow <= 0) return 0;
  // Dieselbe Grenze wie im freien Schreiben: Bei kurzen Wörtern ist ein
  // Zeichen Unterschied fast immer ein anderes Wort.
  if (Array.from(norm).length < 5) return 0;
  return config.wordTypoWindow;
}

function latinCost(a: string, b: string, config: DictationLanguageConfig): number {
  if (a === b) return 0;
  // Geschützte Groß-/Kleinschreibung (Sprachen ohne case-folding, also
  // Deutsch): „Essen" für „essen" ist kein Ausrutscher — im Deutschen tragen
  // Nomen den Großbuchstaben (dieselbe Regel wie im freien Schreiben).
  if (!config.foldCase && a.toLowerCase() === b.toLowerCase()) return 1;
  // Geschützte Diakritika: Wer strikt ist, lässt ein Wort, dessen einzige
  // Abweichung ein Akzent/Umlaut ist, NICHT durch das Fenster gehen —
  // „hablo" für „habló" ist im Spanischen die Aufgabe, kein Ausrutscher.
  if (config.strictDiacritics && stripLatinDiacritics(a) === stripLatinDiacritics(b)) return 1;
  if (editDistance(a, b) <= latinWordWindow(b, config)) return 0.5;
  return 1;
}

/* ---------- Thai ---------- */

/** Ein Basiszeichen plus die Ton-/Vokalzeichen, die dazu gehören. */
type ThaiSegment = { base: string; marks: string[]; raw: string };

/**
 * Zerlegt Thai in Basiszeichen mit ihren Diakritika. Die Lehrhilfen-
 * Leerzeichen der Satzdaten hängen an der Anzeige (`raw`) und zählen nicht
 * als Schrift — Thai trennt Wörter im Fließtext nicht.
 */
export function splitThai(text: string): { segments: ThaiSegment[]; leading: string[] } {
  const segments: ThaiSegment[] = [];
  const leading: string[] = [];
  for (const ch of Array.from(tidyDictation(text))) {
    if (THAI_DIACRITIC.test(ch)) {
      if (segments.length === 0) leading.push(ch);
      else segments[segments.length - 1].marks.push(ch);
      if (segments.length > 0) segments[segments.length - 1].raw += ch;
    } else if (/\s/u.test(ch)) {
      if (segments.length > 0) segments[segments.length - 1].raw += ch;
    } else {
      segments.push({ base: ch, marks: [], raw: ch });
    }
  }
  return { segments, leading };
}

function sameMarks(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((mark, index) => mark === b[index]);
}

/**
 * Tonzeichen positionsbasiert nach Best-Effort-Alignment: Wo die
 * Basiszeichen einander entsprechen, zählen gleiche Zeichenfolgen als Treffer;
 * wo sie es nicht tun, ist der Vergleich ehrlich — und zählt die Abweichung.
 */
function thaiDiacriticScore(
  input: { segments: ThaiSegment[]; leading: string[] },
  target: { segments: ThaiSegment[]; leading: string[] },
  ops: Op[]
): number {
  let hits = 0;
  let misses = 0;
  // Ein Tonzeichen ohne Basiszeichen davor ist orthografisch unmöglich —
  // falls es doch auftaucht, zählt es als Abweichung, nicht still weg.
  misses += input.leading.length + target.leading.length;
  for (const op of ops) {
    if (op.kind === 'equal' || op.kind === 'typo' || op.kind === 'sub') {
      const a = input.segments[op.a].marks;
      const b = target.segments[op.b].marks;
      if (sameMarks(a, b)) hits += b.length;
      else misses += Math.max(a.length, b.length, 1);
    } else if (op.kind === 'extra') {
      misses += input.segments[op.a].marks.length;
    } else {
      misses += target.segments[op.b].marks.length;
    }
  }
  return percent(hits, hits + misses);
}

/* ---------- Diff ---------- */

/** Verbindet gleichartige Nachbar-Ops zu Anzeige-Stücken, damit ein ganzes Wort nicht zeichenweise auseinanderfällt. */
function mergeOps(
  ops: Op[],
  rawOf: (kind: 'a' | 'b', index: number) => string,
  statusOf: (op: Op) => DictationDiffStatus
): DictationDiffToken[] {
  const tokens: DictationDiffToken[] = [];
  for (const op of ops) {
    const status = statusOf(op);
    const text = op.kind === 'extra' ? rawOf('a', op.a) : rawOf('b', op.b);
    const last = tokens[tokens.length - 1];
    if (last && last.status === status) last.text += text;
    else tokens.push({ text, status });
  }
  return tokens;
}

/* ---------- Der Einstieg ---------- */

export function scoreDictation(
  given: string,
  target: string,
  config: DictationLanguageConfig
): DictationScore {
  if (!tidyDictation(target)) {
    throw new Error('Leeres Diktat-Ziel — dagegen lässt sich nichts prüfen.');
  }

  const inputTokens = tokenize(given, config);
  const targetTokens = tokenize(target, config);
  const empty = inputTokens.length === 0;

  const finish = (
    baseScore: number,
    diacriticScore: number,
    exact: boolean,
    diff: DictationDiffToken[]
  ): DictationScore => {
    const passed =
      !empty && baseScore >= config.passThreshold && diacriticScore >= config.diacriticThreshold;
    const exactAll = !empty && exact && baseScore === 100 && diacriticScore === 100;
    const toneWarning = passed && diacriticScore < 100;
    return {
      baseScore,
      diacriticScore,
      passed,
      exact: exactAll,
      typo: passed && !exactAll,
      toneWarning,
      empty,
      message: messageFor(baseScore, diacriticScore, exactAll, passed, toneWarning, empty, config),
      diff,
    };
  };

  if (config.script === 'thai') {
    // Dieselbe Interpunktions-Regel wie in tokenize — Thai-Sätze haben
    // ohnehin keine, aber getippt werden könnte sie.
    const prep = (text: string) => (config.ignorePunctuation ? text.replace(PUNCTUATION, '') : text);
    const targetSegments = splitThai(prep(target));
    const inputSegments = splitThai(prep(given));
    const baseTarget = targetSegments.segments.map((segment) => segment.base);
    const baseInput = inputSegments.segments.map((segment) => segment.base);

    const { ops, distance } = alignTokens(
      baseInput,
      baseTarget,
      (x, y) => (x === y ? 0 : 1)
    );
    const baseScore = percent(baseTarget.length - distance, baseTarget.length);
    const diacriticScore = empty
      ? 0
      : thaiDiacriticScore(inputSegments, targetSegments, ops);

    const diff = mergeOps(
      ops,
      (side, index) =>
        side === 'a'
          ? inputSegments.segments[index].raw
          : targetSegments.segments[index].raw,
      (op) => {
        if (op.kind === 'extra') return 'extra';
        if (op.kind === 'missing') return 'missing';
        const marksOk = sameMarks(
          inputSegments.segments[op.a].marks,
          targetSegments.segments[op.b].marks
        );
        return op.kind === 'equal' && marksOk ? 'match' : 'typo';
      }
    );

    const exact =
      normalizedWhole(inputTokens, config) === normalizedWhole(targetTokens, config);
    return finish(baseScore, diacriticScore, exact, empty ? diff.filter((token) => token.status !== 'extra') : diff);
  }

  // Latein: Wortebene.
  const { ops } = alignTokens(
    inputTokens.map((token) => token.norm),
    targetTokens.map((token) => token.norm),
    (x, y) => latinCost(x, y, config)
  );
  // Ein Tippfehler-Wort zählt als GETROFFEN (es steht im Diff und macht das
  // Ergebnis zu „Schwer") — bestraft wird es nicht doppelt über die
  // Basispunktzahl. Ein verwechseltes oder fehlendes Wort zählt als Fehler.
  const matched = ops.filter((op) => op.kind === 'equal' || op.kind === 'typo').length;
  const whole = Math.max(inputTokens.length, targetTokens.length);
  const baseScore = percent(matched, whole);

  // Diakritika: bei strikten Sprachen bereits in der Basisschrift gezählt;
  // sonst weich — nur Akzent-Unterschiede ansonsten gleicher Wörter zählen.
  let diacriticScore = 100;
  if (!config.strictDiacritics && !empty) {
    let hits = 0;
    let misses = 0;
    for (const op of ops) {
      if (op.kind !== 'equal' && op.kind !== 'typo' && op.kind !== 'sub') continue;
      const a = inputTokens[op.a].norm;
      const b = targetTokens[op.b].norm;
      if (a === b) hits += 1;
      else if (stripLatinDiacritics(a) === stripLatinDiacritics(b)) misses += 1;
    }
    diacriticScore = percent(hits, hits + misses);
  }

  const diff = mergeOps(
    ops,
    (side, index) =>
      side === 'a' ? inputTokens[index].raw : targetTokens[index].raw,
    (op) =>
      op.kind === 'extra' ? 'extra' : op.kind === 'missing' ? 'missing' : op.kind === 'equal' ? 'match' : 'typo'
  );

  const exact = normalizedWhole(inputTokens, config) === normalizedWhole(targetTokens, config);
  return finish(baseScore, diacriticScore, exact, empty ? diff.filter((token) => token.status !== 'extra') : diff);
}

function messageFor(
  baseScore: number,
  diacriticScore: number,
  exact: boolean,
  passed: boolean,
  toneWarning: boolean,
  empty: boolean,
  config: DictationLanguageConfig
): { key: TranslationKey; params?: TParams } | null {
  if (empty) return { key: 'dictation.msgEmpty' };
  if (exact) return null;
  if (passed && toneWarning) return { key: 'dictation.msgToneWarning' };
  if (passed) return { key: 'dictation.msgPassedImpure' };
  if (config.script === 'thai' && baseScore >= config.passThreshold) {
    return { key: 'dictation.msgToneMarksOff', params: { score: diacriticScore } };
  }
  return { key: 'dictation.msgBaseOff' };
}

/**
 * Vom Diktat-Ergebnis zur FSRS-Bewertung — **nur bestandene Diktate
 * bewerten** (Scoring-Spec), also anders als das freie Schreiben:
 *
 * | Ergebnis                      | Bewertung      | Warum |
 * | ----------------------------- | -------------- | ----- |
 * | bestanden, fehlerfrei         | 3 Gut          | Ein sauberer Abruf des ganzen Satzes. |
 * | bestanden mit Abweichung      | 2 Schwer       | Abruf gelungen, aber nicht sicher (Tippfehler-Wort, Tonzeichen knapp). |
 * | nicht bestanden               | **gar nicht**  | Die Karte bleibt unverändert — das Diktat ist die härtere Übung; ein Miss dort darf den Wortplan nicht abstrafen. |
 * | —                             | 4 Leicht       | **wird nie vergeben** (dieselbe Begründung wie `lib/writing/rating.ts`: Getipptes misst Mühe nicht). |
 *
 * Die Rückmeldung im Runner sagt das ausdrücklich, sonst bliebe unklar,
 * warum eine nicht bestandene Aufgabe die Wiederholung nicht bewegt.
 */
export function ratingForScore(score: DictationScore): Rating | null {
  if (!score.passed) return null;
  return score.exact ? 3 : 2;
}
