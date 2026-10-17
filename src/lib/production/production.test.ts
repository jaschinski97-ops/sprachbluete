import { MemoryDataStore } from '../storage';

import { bewertungFuerErgebnis, vergleicheProduktion } from './compare';
import { produktionsAufgaben } from './tasks';
import { targetLanguageOf as zielSprache } from '../languages/types';

describe('vergleicheProduktion — Toleranzen', () => {
  it('ignoriert Groß-/Kleinschreibung und Satzzeichen', () => {
    expect(vergleicheProduktion('ich mag katzen', 'Ich mag Katzen.', 'en').bewertung).toBe('exact');
    expect(vergleicheProduktion('¡hola!', 'hola', 'es').bewertung).toBe('exact');
  });

  it('wertet fehlende lateinische Akzente als Hinweis, nicht als Fehler', () => {
    const ergebnis = vergleicheProduktion('medico', 'médico', 'es');
    expect(ergebnis.bewertung).toBe('accent');
    expect(ergebnis.ziel).toBe('médico');
    expect(bewertungFuerErgebnis('accent')).toBe(2);
  });

  it('wertet fehlende Thai-Tonzeichen als Hinweis', () => {
    // ข้าว (Reis) ohne Tonzeichen getippt
    const ergebnis = vergleicheProduktion('ขาว', 'ข้าว', 'th');
    expect(ergebnis.bewertung).toBe('accent');
    // Vokalzeichen bleiben Inhalt: ขาว gegen ขีว bleibt falsch.
    expect(vergleicheProduktion('ขีว', 'ข้าว', 'th').bewertung).toBe('wrong');
  });

  it('ignoriert Leerzeichen in Thai — Thai schreibt ohne Wortabstände', () => {
    expect(vergleicheProduktion('ขอน้ำเปล่าหนึ่งแก้วครับ', 'ขอน้ำเปล่า หนึ่งแก้ว ครับ', 'th').bewertung).toBe('exact');
    expect(vergleicheProduktion('ขอนำเปลาหนึงแกวครบ', 'ขอน้ำเปล่า หนึ่งแก้ว ครับ', 'th').bewertung).not.toBe('exact');
  });

  it('zählt Thai-Höflichkeitspartikeln nicht (Nutzertest 17.10.2026)', () => {
    expect(vergleicheProduktion('ผมมาจากเยอรมนีครับ', 'ผมมาจากเยอรมนี', 'th').bewertung).toBe('exact');
    expect(vergleicheProduktion('ขอบคุณ', 'ขอบคุณค่ะ', 'th').bewertung).toBe('exact');
    expect(vergleicheProduktion('สวัสดีครับ ยินดีที่ได้รู้จักครับ', 'สวัสดีค่ะ ยินดีที่ได้รู้จักค่ะ', 'th').bewertung).toBe('exact');
    expect(vergleicheProduktion('คุณชื่ออะไรคะ', 'คุณชื่ออะไรครับ', 'th').bewertung).toBe('exact');
    // คะ steckt auch in Wörtern (คะแนน) — dort bleibt es Inhalt.
    expect(vergleicheProduktion('แนนดี', 'คะแนนดี', 'th').bewertung).toBe('wrong');
    // Fehlende Wörter bleiben falsch, auch mit Partikel.
    expect(vergleicheProduktion('ผมมาครับ', 'ผมมาจากเยอรมนี', 'th').bewertung).toBe('wrong');
    // Tonzeichen bleiben ein Hinweis.
    expect(vergleicheProduktion('ขาวครับ', 'ข้าว', 'th').bewertung).toBe('accent');
  });

  it('bleibt hart bei falschen Wörtern und fehlenden Wörtern', () => {
    expect(vergleicheProduktion('Ich esse Fleisch', 'Ich mag Katzen', 'de').bewertung).toBe('wrong');
    expect(vergleicheProduktion('Ich mag', 'Ich mag Katzen', 'de').bewertung).toBe('wrong');
    expect(vergleicheProduktion('', 'hola', 'es').bewertung).toBe('wrong');
    expect(bewertungFuerErgebnis('wrong')).toBeNull();
  });

  it('misst exact als Gut', () => {
    expect(vergleicheProduktion('sà-wàt-dii', 'sà-wàt-dii', 'th').bewertung).toBe('exact');
    expect(bewertungFuerErgebnis('exact')).toBe(3);
  });
});

describe('zielSprache — welche Seite produziert wird', () => {
  it('folgt der Zielseite der Richtung', () => {
    expect(zielSprache('de_to_th')).toBe('th');
    expect(zielSprache('th_to_de')).toBe('de');
    expect(zielSprache('en_to_es')).toBe('es');
  });
});

describe('produktionsAufgaben — Stoff je Richtung', () => {
  it('baut Thai-Satzaufgaben, wo geprüfte Sätze liegen', async () => {
    const store = new MemoryDataStore();
    await store.init();
    const aufgaben = await produktionsAufgaben({ direction: 'de_to_th', store, seed: 7 });
    expect(aufgaben.length).toBeGreaterThan(0);
    expect(aufgaben.every((aufgabe) => aufgabe.art === 'satz')).toBe(true);
    for (const aufgabe of aufgaben) {
      expect(aufgabe.bedeutung.length).toBeGreaterThan(0);
      expect(aufgabe.ziel.length).toBeGreaterThan(0);
      expect(aufgabe.roman).toBeTruthy();
    }
  });

  it('baut im Deutsch-Ziel Wortaufgaben mit deutscher Zielform', async () => {
    const store = new MemoryDataStore();
    await store.init();
    const aufgaben = await produktionsAufgaben({ direction: 'th_to_de', store, seed: 7 });
    expect(aufgaben.length).toBeGreaterThan(0);
    for (const aufgabe of aufgaben) {
      expect(aufgabe.art).toBe('wort');
      // Vorderseite Thai, Lösung deutsch — genau andersherum als bei de_to_th.
      expect(aufgabe.roman).toBeUndefined();
    }
  });

  it('baut für Englisch Wortaufgaben aus dem schwächsten Bestand', async () => {
    const store = new MemoryDataStore();
    await store.init();
    // Auf nicht-deutscher Oberfläche gibt es keine Satzaufträge (Satzbedeutungen nur auf Deutsch).
    const aufgaben = await produktionsAufgaben({ direction: 'th_to_en', store, seed: 7 });
    expect(aufgaben.length).toBeGreaterThan(0);
    for (const aufgabe of aufgaben) {
      expect(aufgabe.art).toBe('wort');
      expect(aufgabe.bedeutung.length).toBeGreaterThan(0);
    }
  });
});
