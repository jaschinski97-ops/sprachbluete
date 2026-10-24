import type { Tone } from '@/constants/tones';
import { pruefeThaiTon, TON_DE, type SilbenBefund, type TonBefund, type TonKontext } from './tone-rules';

/**
 * Ton-Prüfung für Inhalte (24.10.2026): Wörter, Beispielsätze und
 * Dialogzeilen gegen die Ton-Engine. Gemeinsam genutzt von
 * `pruefeVocabDoc`, `content:integrity` (check.cjs) und dem Werkzeug
 * `npm run content:thai-tones`.
 *
 * Widerspruch = Fehler (die Umschrift trägt einen anderen Ton als die
 * Schrift); „unsicher“ = Hinweis (Schrift mehrdeutig, Lehnwort, Laut der
 * Umschrift passt nicht).
 */

export type TonFund = {
  /** Wo im Eintrag: „Wort“, „Silben“, „Beispielsatz“, „Dialogzeile 3“. */
  ort: string;
  thai: string;
  roman: string;
  befund: TonBefund;
};

export type TonPruefung = { fehler: string[]; hinweise: string[]; funde: TonFund[] };

type Silbe = { roman?: unknown; syllable?: unknown; text?: unknown; tone?: unknown };

const tonText = (ton: Tone | null) => (ton ? TON_DE[ton] : '?');

/** Eine Zeile je abweichender Silbe, für Fehlerlisten und die Konsole. */
export function beschreibeSilbe(fund: TonFund, silbe: SilbenBefund): string {
  const kopf = `${fund.ort} „${fund.thai}“: Silbe ${silbe.index + 1}${silbe.thai ? ` „${silbe.thai}“` : ''} (${silbe.roman})`;
  if (silbe.status === 'widerspruch') {
    return `${kopf} — Schrift ergibt ${tonText(silbe.sollSchrift)}, Umschrift ${tonText(silbe.istUmschrift)}. ${silbe.begruendung}`;
  }
  return `${kopf} — unsicher: ${silbe.begruendung}`;
}

function sammle(funde: TonFund[]): TonPruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  for (const fund of funde) {
    if (fund.befund.grund) {
      hinweise.push(`${fund.ort} „${fund.thai}“ (${fund.roman}) — unsicher: ${fund.befund.grund}`);
      continue;
    }
    for (const silbe of fund.befund.silben) {
      if (silbe.status === 'widerspruch') fehler.push(`Ton-Widerspruch: ${beschreibeSilbe(fund, silbe)}`);
      else if (silbe.status === 'unsicher') hinweise.push(beschreibeSilbe(fund, silbe));
      else if (silbe.hinweis) hinweise.push(`${fund.ort} „${fund.thai}“: ${silbe.roman} — ${silbe.hinweis}`);
    }
  }
  return { fehler, hinweise, funde };
}

function pruefe(ort: string, thai: string, roman: string, kontext: TonKontext): TonFund {
  return { ort, thai, roman, befund: pruefeThaiTon(thai, roman, { kontext }) };
}

/**
 * Ein Thai-Wort: Stichwort gegen `romanization`, die Silben (`roman` +
 * `tone`) gegen Schrift und gegen ihre eigene Umschrift, das Beispiel
 * `exampleTerm` gegen `exampleRoman` (Satzkontext).
 */
export function pruefeThaiWortToene(doc: {
  term: string;
  romanization?: string;
  tone?: unknown;
  syllables?: unknown;
  exampleTerm?: string;
  exampleRoman?: string;
}): TonPruefung {
  const funde: TonFund[] = [];
  const fehler: string[] = [];
  if (doc.romanization?.trim()) funde.push(pruefe('Wort', doc.term, doc.romanization, 'wort'));

  const silben = Array.isArray(doc.syllables) ? (doc.syllables as Silbe[]) : [];
  const silbenRoman = silben.map((s) => String(s.roman ?? s.syllable ?? s.text ?? '').trim());
  if (silben.length && silbenRoman.every(Boolean)) {
    const gleich = (a: string) => a.normalize('NFC').toLowerCase().replace(/\s+/g, '-');
    const wortFund = funde.find((f) => f.ort === 'Wort');
    // Gleiche Umschrift wie das Stichwort: dieselbe Prüfung nicht doppelt melden.
    const fund = wortFund && gleich(wortFund.roman) === gleich(silbenRoman.join('-'))
      ? wortFund : pruefe('Silben', doc.term, silbenRoman.join('-'), 'wort');
    if (fund !== wortFund) funde.push(fund);
    // Das Ton-Feld muss zur Umschrift der Silbe passen; die Umschrift prüft der Fund gegen die Schrift.
    if (!fund.befund.grund && fund.befund.silben.length === silben.length) {
      silben.forEach((silbe, index) => {
        const ist = fund.befund.silben[index].istUmschrift;
        if (typeof silbe.tone === 'string' && ist && silbe.tone !== ist) {
          fehler.push(`Ton-Widerspruch: Silbe ${index + 1} (${silbenRoman[index]}) trägt das Ton-Feld ${tonText(silbe.tone as Tone)}, die Umschrift aber ${tonText(ist)}.`);
        }
      });
    }
    if (typeof doc.tone === 'string' && typeof silben[0]?.tone === 'string' && doc.tone !== silben[0].tone) {
      fehler.push(`Ton-Widerspruch: Feld tone (${tonText(doc.tone as Tone)}) weicht vom Ton der ersten Silbe ab (${tonText(silben[0].tone as Tone)}).`);
    }
  }

  if (doc.exampleTerm?.trim() && doc.exampleRoman?.trim()) {
    funde.push(pruefe('Beispielsatz', doc.exampleTerm, doc.exampleRoman, 'satz'));
  }
  const gesammelt = sammle(funde);
  // Wort und Silben prüfen meist dasselbe: gleiche Meldungen nur einmal.
  return {
    fehler: [...new Set([...gesammelt.fehler, ...fehler])],
    hinweise: [...new Set(gesammelt.hinweise)],
    funde,
  };
}

/** Die Thai-Zeilen eines Dialogs (`thai` gegen `roman`, Satzkontext). */
export function pruefeThaiDialogToene(turns: readonly { thai?: string; targetText?: string; roman?: string }[]): TonPruefung {
  const funde = turns.flatMap((turn, index) => {
    const text = turn.targetText ?? turn.thai;
    return text?.trim() && /[\u0E01-\u0E5B]/.test(text) && turn.roman?.trim()
      ? [pruefe(`Dialogzeile ${index + 1}`, text, turn.roman, 'satz')] : [];
  });
  return sammle(funde);
}
