import { spokenText, type ConversationSituation } from '@/lib/conversation/types';
import { targetLanguageOf } from '@/lib/languages/types';
import type { VocabEntry } from '@/data/vocab-types';

/**
 * Thai-Wörter der Dialoge, die im Wortschatz fehlen — häufigste zuerst.
 *
 * WARUM (Testlauf 16.10.2026): Der erzeugte Thai-Grundstock enthält keine
 * Zahlen (หนึ่ง, สอง …), kein บาท, ชื่อ, ประเทศ, ไหน oder จาก. In Lesetexten
 * sind diese Wörter deshalb nicht antippbar. Das Studio übernimmt die Liste
 * als Pflichtwörter für den nächsten Wortschatzlauf.
 *
 * NUR THAI: Ohne Flexion ist ein Dialogwort direkt ein Stichwort. Im
 * Deutschen, Englischen und Spanischen wären „möchte“ oder „nehme“ nur
 * gebeugte Formen vorhandener Einträge — die Liste wäre Rauschen.
 */
export function thaiDialogwoerterOhneEintrag(
  situations: readonly ConversationSituation[],
  vocabulary: readonly VocabEntry[]
): string[] {
  if (typeof Intl.Segmenter !== 'function') return [];
  const bekannt = new Set(vocabulary.filter((word) => String(word.language) === 'th').map((word) => word.term));
  const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  const haeufigkeit = new Map<string, number>();
  for (const situation of situations) {
    if (targetLanguageOf(situation.direction) !== 'th') continue;
    for (const turn of situation.scriptTurns) {
      for (const teil of segmenter.segment(spokenText(situation, turn))) {
        const wort = teil.segment;
        // Einzelne Zeichen sind Trennreste der Segmentierung (ะ, ส), keine Wörter.
        if (!teil.isWordLike || !/^[฀-๿]{2,}$/.test(wort) || bekannt.has(wort)) continue;
        haeufigkeit.set(wort, (haeufigkeit.get(wort) ?? 0) + 1);
      }
    }
  }
  return [...haeufigkeit].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th')).map(([wort]) => wort);
}
