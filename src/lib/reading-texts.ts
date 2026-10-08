import { spokenText, type ConversationSituation } from './conversation/types';
import { seededRandom, shuffled } from './drills/random';
import { type FSRSCardState } from './fsrs/types';
import { bridgeText } from './languages/bridge';
import { type PairDirection } from './languages/types';
import { type UiLanguage } from './i18n';
import { type VocabEntry } from '@/data/vocab-types';
import { contextualWord, vocabularyForms } from './vocabulary-forms';

/**
 * Längere Hör- und Lesetexte (Schritt 4, Lern-Reiter-Ausbau 13.09.).
 *
 * WOHER DER STOFF KOMMT: aus den vorhandenen Situationen — jede Szene IST
 * der kurze Dialog; als Ganzes gelesen (oder zeilenweise vorgelesen) wird
 * sie zum Text. Kein neuer Stoff wird geschrieben, keine Geschichte
 * erfunden — „möglichst nur mit bereits gelernten Wörtern" regelt hier die
 * FREISCHALTUNG: Eine Szene öffnet sich erst, wenn der Wortschatzstand der
 * Richtung groß genug ist (A1 ab 20 begonnenen Karten, A2 ab 50 — gezählt
 * über ALLE Karten der Richtung), und zeigt ehrlich, wie viele ihrer Wörter
 * schon begonnen sind.
 *
 * WÖRTER ANTIPPEN = ÜBERSATZ: Der Text wird mit einem Greedy-Longest-Match
 * über den geprüften Vokabel-Bestand zerlegt — Wörter, die im Bestand
 * liegen, sind tippbar und zeigen ihre Bedeutung; der Rest bleibt
 * unangetasteter Fließtext. Eine Segmentierung ist eine Anzeigehilfe, keine
 * Grammatikaussage über Thai.
 *
 * VERSTÄNDNISFRAGEN werden mechanisch aus der Szene abgeleitet (Bedeutung
 * → Zeile; Wer sagt die Zeile?) — nichts wird behauptet, was nicht in den
 * Daten steht.
 */

/** Freischalt-Schwellen: begonnene Karten je Level. */
const SCHWELLE: Record<string, number> = { A1: 20, A2: 50, B1: 100, B2: 150, C1: 200, C2: 250 };

export type TextToken = {
  text: string;
  /** Geprüfter Bestandseintrag hinter dem Wort — tippbar, wenn gesetzt. */
  entry?: { id: string; term: string; roman: string; german: string };
};

export type VerstaendnisFrage = {
  id: string;
  art: 'bedeutung' | 'sprecher';
  frage: string;
  optionen: string[];
  /** Romanization of Thai question text or Thai answer options. */
  frageRoman?: string;
  optionenRoman?: string[];
  correctIndex: number;
};

export type LeseStoff = {
  situation: ConversationSituation;
  offen: boolean;
  /** Wie viele Pool-Wörter der Szene schon begonnen sind. */
  bekannt: number;
  /** Wie viele Pool-Wörter die Szene überhaupt nutzt. */
  poolWoerter: number;
  /** Begonnene Karten, ab denen die Szene offen ist (je Level). */
  schwellwert: number;
  /** Begonnene Karten der ganzen Lernrichtung — daran hängt die Freischaltung. */
  gesamtBegonnen: number;
};

/** Begonnene Karten = Zustand außer 'new'. */
function begonnen(cards: FSRSCardState[], vocabIds: Set<string>): number {
  let n = 0;
  for (const card of cards) {
    if (vocabIds.has(card.vocabId) && card.state !== 'new') n += 1;
  }
  return n;
}

/**
 * Zerlegt eine Textzeile in tippbare Bestandswörter und Rest.
 *
 * Latein: ganze Wörter (Groß-/Kleinschreibung egal). Thai: Greedy-Longest-
 * Match nur an Wortgrenzen — der längste Bestandsterm gewinnt, alles andere
 * bleibt ein unveränderter Rest. Das verhindert Treffer mitten in Namen.
 */
export function tokenisiereFuerAntippen(
  text: string,
  pool: VocabEntry[],
  latin: boolean,
  /** Sprache der Bedeutung beim Antippen — sonst stand fest `german` da. */
  bedeutungsSprache: UiLanguage = 'de'
): TextToken[] {
  const tokens: TextToken[] = [];
  const bedeutung = (e: VocabEntry) => bridgeText(e, bedeutungsSprache).text;
  if (latin) {
    let before = '';
    for (const wort of text.split(/(\s+)/)) {
      if (/^\s+$/.test(wort) || wort.length === 0) {
        tokens.push({ text: wort });
        before += wort;
        continue;
      }
      const bloß = wort.replace(/[\p{P}\p{S}]/gu, '').toLowerCase();
      const entry = contextualWord(bloß, before, pool);
      tokens.push(entry ? { text: wort, entry: { id: entry.id, term: entry.term, roman: entry.romanization, german: bedeutung(entry) } } : { text: wort });
      before += wort;
    }
    return tokens;
  }

  // Thai hat keine Leerzeichen zwischen Wörtern. Die Sprachsegmentierung
  // liefert Grenzen, damit z. B. „ทอ“ nicht im Namen „ทอม“ tippbar wird.
  // Ohne Segmenter bleiben nur durch Leerzeichen/Satzzeichen abgegrenzte
  // Treffer tippbar: eine fehlende Hilfe ist besser als eine falsche.
  const grenzen = new Set<number>([0, text.length]);
  if (typeof Intl.Segmenter === 'function') {
    for (const teil of new Intl.Segmenter('th', { granularity: 'word' }).segment(text)) {
      grenzen.add(teil.index);
      grenzen.add(teil.index + teil.segment.length);
    }
  } else {
    for (const match of text.matchAll(/[\s\p{P}\p{S}]+/gu)) {
      grenzen.add(match.index);
      grenzen.add(match.index + match[0].length);
    }
  }
  // Längste Übereinstimmung nur zwischen echten Wortgrenzen.
  const sortiert = [...pool].sort((a, b) => b.term.length - a.term.length);
  let i = 0;
  let rest = '';
  const flushRest = () => {
    if (rest) {
      tokens.push({ text: rest });
      rest = '';
    }
  };
  while (i < text.length) {
    let gefunden: VocabEntry | null = null;
    for (const entry of sortiert) {
      if (entry.term.length > 0 && grenzen.has(i) &&
          grenzen.has(i + entry.term.length) && text.startsWith(entry.term, i)) {
        gefunden = entry;
        break;
      }
    }
    if (gefunden) {
      flushRest();
      tokens.push({
        text: gefunden.term,
        entry: { id: gefunden.id, term: gefunden.term, roman: gefunden.romanization, german: bedeutung(gefunden) },
      });
      i += gefunden.term.length;
    } else {
      rest += text[i];
      i += 1;
    }
  }
  flushRest();
  return tokens;
}

/** Die Pool-Wörter, die in der Szene vorkommen (für Statistik + Antippen). */
export function poolWoerterDerSzene(
  situation: ConversationSituation,
  pool: VocabEntry[],
  latin: boolean
): VocabEntry[] {
  const text = situation.scriptTurns.map((t) => spokenText(situation, t)).join(' ');
  if (latin) {
    const woerter = new Set(
      text
        .toLowerCase()
        .replace(/[\p{P}\p{S}]/gu, ' ')
        .split(/\s+/)
    );
    return pool.filter((e) => vocabularyForms(e).some(form => woerter.has(form)));
  }
  const ids = new Set(
    situation.scriptTurns.flatMap((turn) =>
      tokenisiereFuerAntippen(spokenText(situation, turn), pool, false)
        .flatMap((token) => token.entry ? [token.entry.id] : [])
    )
  );
  return pool.filter((entry) => ids.has(entry.id));
}

/**
 * Verständnisfragen aus der Szene — rein mechanisch:
 *   • Bedeutung: „Welche Zeile heißt …?" (Optionen: Zeilen derselben Szene)
 *   • Sprecher: „Wer sagt …?" (Du oder Gegenüber)
 */
export function verstaendnisFragen(
  situation: ConversationSituation,
  seed: number,
  anzahl = 3
): VerstaendnisFrage[] {
  const zeilen = situation.scriptTurns.map(t => ({ ...t, thai: spokenText(situation, t) })).filter((t) => t.thai.trim().length > 0);
  if (zeilen.length < 3) return [];
  const random = seededRandom(seed);
  const reihen = shuffled(zeilen, random).slice(0, anzahl);

  return reihen.map((zeile, i) => {
    if (i % 2 === 0) {
      // Bedeutungs-Frage: richtige Zeile + zwei fremde Zeilen.
      const fremde = zeilen
        .filter((t) => t.thai !== zeile.thai)
        .map((t) => t.thai);
      const gesucht = shuffled(fremde, seededRandom(seed + i)).slice(0, 2);
      const optionen = shuffled([zeile.thai, ...gesucht], seededRandom(seed + i + 1));
      return {
        id: `${situation.id}-bedeutung-${i}`,
        art: 'bedeutung' as const,
        frage: zeile.german,
        optionen,
        optionenRoman: optionen.map((text) => zeilen.find((turn) => turn.thai === text)?.roman ?? ''),
        correctIndex: optionen.indexOf(zeile.thai),
      };
    }
    const richtig = zeile.speaker === 'learner' ? 0 : 1;
    return {
      id: `${situation.id}-sprecher-${i}`,
      art: 'sprecher' as const,
      frage: zeile.thai,
      frageRoman: zeile.roman,
      optionen: [],
      correctIndex: richtig,
    };
  });
}

/**
 * Die Lesestoffe einer Richtung — Szene, Offen-Status, Wortstatistik.
 * Sortiert: offene zuerst, dann nach Level und Titel (stabil, ehrlich).
 */
export function lesestoffeFuerRichtung(options: {
  direction: PairDirection;
  situationen: ConversationSituation[];
  pool: VocabEntry[];
  cards: FSRSCardState[];
  latin: boolean;
}): LeseStoff[] {
  const { direction, situationen, pool, cards, latin } = options;
  const passend = situationen.filter((s) => s.direction.split('_to_')[1] === direction.split('_to_')[1]);
  // Freischaltung am GESAMTEN Wortschatzstand der Richtung. Vorher zählten nur
  // die Wörter der Szene selbst — die kommen in der Kartenreihenfolge aber
  // kaum vor, die Texte blieben praktisch für immer gesperrt (Testrunde 26.09.).
  const gesamtBegonnen = cards.filter((card) => card.state !== 'new').length;
  const stoffe = passend.map((situation) => {
    const woerter = poolWoerterDerSzene(situation, pool, latin);
    const vocabIds = new Set(woerter.map((w) => w.id));
    const bekannt = begonnen(cards, vocabIds);
    const schwellwert = SCHWELLE[situation.level] ?? SCHWELLE.A1;
    return {
      situation,
      offen: gesamtBegonnen >= schwellwert,
      bekannt,
      poolWoerter: woerter.length,
      schwellwert,
      gesamtBegonnen,
    };
  });
  return stoffe.sort((a, b) =>
    a.offen === b.offen ? a.situation.title.localeCompare(b.situation.title) : a.offen ? -1 : 1
  );
}
