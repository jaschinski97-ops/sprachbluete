import type { ConversationSituation } from '@/lib/conversation/types';
import type { VocabEntry } from '@/data/vocab-types';

import { thaiDialogwoerterOhneEintrag } from './dialogue-gaps';

const szene = (direction: string, saetze: string[]) => ({
  id: `s-${direction}`,
  direction,
  scriptTurns: saetze.map((thai) => ({ speaker: 'partner', thai, german: '', roman: '' })),
}) as unknown as ConversationSituation;

const wort = (term: string, language = 'th') => ({ term, language }) as unknown as VocabEntry;

test('liefert fehlende Thai-Dialogwörter, häufigste zuerst', () => {
  const liste = thaiDialogwoerterOhneEintrag(
    [szene('de_to_th', ['ผมชื่อทอมครับ', 'คุณชื่ออะไรครับ', 'มาจากประเทศไหน'])],
    [wort('ผม'), wort('ครับ'), wort('คุณ'), wort('อะไร'), wort('มา')]
  );
  expect(liste[0]).toBe('ชื่อ');
  expect(liste).toEqual(expect.arrayContaining(['จาก', 'ประเทศ', 'ไหน']));
  expect(liste).not.toContain('ครับ');
});

test('ignoriert Dialoge anderer Lernsprachen', () => {
  expect(thaiDialogwoerterOhneEintrag([szene('th_to_de', ['ชื่อ'])], [])).toEqual([]);
});
