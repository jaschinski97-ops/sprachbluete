import { sollAusSchriftUndUmschrift, sollToeneFuerClipAusSchrift, textUndUmschriftFuerClip } from './soll-toene-schrift';

const woerter = [
  { id: 'ki-th-chicken', term: 'ไก่', romanization: 'gài', exampleTerm: 'ไม่เป็นไรครับ', exampleRoman: 'mâi bpen rai khráp' },
  { id: 'ki-th-falsch', term: 'ไก่', romanization: 'gâi' },
];
const situationen = [{ scriptTurns: [{ thai: 'สวัสดีครับ', roman: 'sà-wàt-dii khráp' }] }];

describe('Soll-Töne aus Schrift und Umschrift', () => {
  it('übernimmt die Umschrift-Töne, wenn die Schrift zustimmt', () => {
    expect(sollAusSchriftUndUmschrift('ไก่', 'gài', 'wort')).toEqual({ art: 'ok', sollToene: ['low'], sollRoman: ['gài'] });
    expect(sollAusSchriftUndUmschrift('ไม่เป็นไรครับ', 'mâi bpen rai khráp', 'satz')).toEqual({
      art: 'ok', sollToene: ['falling', 'mid', 'mid', 'high'], sollRoman: ['mâi', 'bpen', 'rai', 'khráp'],
    });
  });

  it('meldet einen Widerspruch als strittig statt ihn zu werten', () => {
    const befund = sollAusSchriftUndUmschrift('ไก่', 'gâi', 'wort');
    expect(befund?.art).toBe('strittig');
  });

  it('findet Text und Umschrift für Wort-, Satz- und Dialog-Clips', () => {
    expect(textUndUmschriftFuerClip({ language: 'th', kind: 'vocab', text: 'ไก่', sourceId: 'ki-th-chicken' }, woerter))
      .toEqual({ thai: 'ไก่', roman: 'gài', kontext: 'wort' });
    expect(textUndUmschriftFuerClip({ language: 'th', kind: 'example', text: 'ไม่เป็นไรครับ', sourceId: 'ki-th-chicken' }, woerter)?.kontext).toBe('satz');
    expect(textUndUmschriftFuerClip({ language: 'th', kind: 'turn', text: 'สวัสดีครับ' }, woerter, situationen)?.roman).toBe('sà-wàt-dii khráp');
    expect(textUndUmschriftFuerClip({ language: 'en', kind: 'vocab', text: 'chicken', sourceId: 'x' }, woerter)).toBeNull();
  });

  it('macht Dialogzeilen prüfbar und lässt Unbekanntes beim alten Weg', () => {
    const zug = sollToeneFuerClipAusSchrift({ language: 'th', kind: 'turn', text: 'สวัสดีครับ' }, woerter, situationen);
    expect(zug).toEqual({ art: 'ok', sollToene: ['low', 'low', 'mid', 'high'], sollRoman: ['sà', 'wàt', 'dii', 'khráp'] });
    expect(sollToeneFuerClipAusSchrift({ language: 'th', kind: 'turn', text: 'ไม่มี' }, woerter, situationen)).toBeNull();
    expect(sollToeneFuerClipAusSchrift({ language: 'th', kind: 'vocab', text: 'ไก่', sourceId: 'ki-th-falsch' }, woerter)?.art).toBe('strittig');
  });
});
