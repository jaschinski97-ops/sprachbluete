import { VOWEL_PATTERNS } from '@/data/thai-script';
import { TON_AUSNAHMEN } from './tone-exceptions';
import {
  ergaenzeTonzeichen,
  PAIBOON_VOKAL,
  pruefeThaiTon,
  romanSilben,
  setzeTon,
  sollToeneAusSchrift,
} from './tone-rules';

const toene = (thai: string, roman: string, kontext: 'wort' | 'satz' = 'wort') =>
  pruefeThaiTon(thai, roman, { kontext }).silben.map((s) => s.sollSchrift);
const status = (thai: string, roman: string, kontext: 'wort' | 'satz' = 'wort') =>
  pruefeThaiTon(thai, roman, { kontext }).status;

describe('Ton-Engine: Regeln aus der Schrift', () => {
  it('kennt jedes Vokalmuster aus thai-script.ts', () => {
    for (const muster of VOWEL_PATTERNS) expect(PAIBOON_VOKAL[muster.display]).toBeDefined();
  });

  it('Klasse, lebende/tote Silbe und Tonzeichen', () => {
    expect(toene('มา', 'maa')).toEqual(['mid']);
    expect(toene('ขา', 'khǎa')).toEqual(['rising']);
    expect(toene('รถ', 'rót')).toEqual(['high']); // tief, tot, kurz
    expect(toene('มาก', 'mâak')).toEqual(['falling']); // tief, tot, lang
    expect(toene('กับ', 'gàp')).toEqual(['low']);
    expect(toene('ได้', 'dâai')).toEqual(['falling']);
    expect(toene('น้ำ', 'nám')).toEqual(['high']);
    expect(toene('โต๊ะ', 'dtó')).toEqual(['high']);
    expect(toene('ไป', 'bpai')).toEqual(['mid']); // ไ endet auf Gleitlaut: lebend
  });

  it('ห นำ, อ นำ, Cluster und unechte Cluster', () => {
    expect(toene('หมา', 'mǎa')).toEqual(['rising']);
    expect(toene('ใหม่', 'mài')).toEqual(['low']);
    expect(toene('อยู่', 'yùu')).toEqual(['low']);
    expect(toene('อย่างไร', 'yàang-rai')).toEqual(['low', 'mid']);
    expect(toene('ปลา', 'bplaa')).toEqual(['mid']);
    expect(toene('เปล่า', 'bplàao')).toEqual(['low']);
    expect(toene('ทราบ', 'sâap')).toEqual(['falling']);
    expect(toene('จริง', 'jing')).toEqual(['mid']);
    expect(toene('สร้าง', 'sâang')).toEqual(['falling']);
  });

  it('implizite Vokale mit Klassenübertragung (สบาย, ขนม, ตลาด)', () => {
    expect(toene('สบาย', 'sà-baai')).toEqual(['low', 'mid']);
    expect(toene('ขนม', 'khà-nǒm')).toEqual(['low', 'rising']);
    expect(toene('ตลาด', 'dtà-làat')).toEqual(['low', 'low']);
    expect(toene('อร่อย', 'à-rɔ̀i')).toEqual(['low', 'low']);
    expect(toene('คน', 'khon')).toEqual(['mid']);
    expect(toene('บริษัท', 'bɔɔ-rí-sàt')).toEqual(['mid', 'high', 'low']);
    expect(toene('เสมอ', 'sà-mə̌ə')).toEqual(['low', 'rising']);
    expect(toene('ไฉน', 'chà-nǎi')).toEqual(['low', 'rising']);
  });

  it('Bindesilben, ์, รร, stumme Vokale, ฤ und ๆ', () => {
    expect(toene('ผลไม้', 'phǒn-lá-máai')).toEqual(['rising', 'high', 'high']);
    expect(toene('ราชการ', 'râat-chá-gaan')).toEqual(['falling', 'high', 'mid']);
    expect(toene('ศาสนา', 'sàat-sà-nǎa')).toEqual(['low', 'low', 'rising']);
    expect(toene('จันทร์', 'jan')).toEqual(['mid']);
    expect(toene('โทรศัพท์', 'thoo-rá-sàp')).toEqual(['mid', 'high', 'low']);
    expect(toene('กรรม', 'gam')).toEqual(['mid']);
    expect(toene('บรรยาย', 'ban-yaai')).toEqual(['mid', 'mid']);
    expect(toene('ธรรมชาติ', 'tham-má-châat')).toEqual(['mid', 'high', 'falling']);
    expect(toene('อังกฤษ', 'ang-grìt')).toEqual(['mid', 'low']);
    expect(toene('ฤดู', 'rʉ́-duu')).toEqual(['high', 'mid']);
    expect(toene('เร็ว ๆ', 'reo-reo')).toEqual(['mid', 'mid']);
    expect(toene('เด็กๆ', 'dèk-dèk')).toEqual(['low', 'low']);
  });

  it('Sätze mit Leerzeichen, Satzzeichen und Ziffern', () => {
    const satz = pruefeThaiTon('สวัสดีครับ คุณสบายดีไหม', 'sà-wàt-dii khráp, khun sà-baai dii mái?', { kontext: 'satz' });
    expect(satz.status).toBe('ok');
    expect(satz.silben.map((s) => s.sollSchrift)).toEqual(['low', 'low', 'mid', 'high', 'mid', 'low', 'mid', 'mid', 'high']);
    expect(status('ราคา 20 บาท', 'raa-khaa yîi-sìp bàat', 'satz')).toBe('ok');
  });
});

describe('Ton-Engine: Widerspruch, unsicher, Ausnahmen', () => {
  it('meldet einen falschen Ton mit Begründung', () => {
    const befund = pruefeThaiTon('รถ', 'rôt');
    expect(befund.status).toBe('widerspruch');
    expect(befund.silben[0]).toMatchObject({ sollSchrift: 'high', istUmschrift: 'falling', status: 'widerspruch' });
    expect(befund.silben[0].begruendung).toBe('ร: tiefe Klasse (implizites o), tote Silbe, kurzer Vokal → hoch');
    // Typische Erzeugerfehler aus dem alten Katalog:
    expect(status('วันนี้', 'wan-nii')).toBe('widerspruch');
    expect(status('ไม้', 'mâai')).toBe('widerspruch');
    expect(status('หลัง', 'lang')).toBe('widerspruch');
    expect(status('ขนม', 'khà-nom')).toBe('widerspruch'); // Übertragung am Wortanfang ist Regel
  });

  it('rät nicht: ohne Ausrichtung oder bei mehrdeutiger Schrift „unsicher“', () => {
    expect(pruefeThaiTon('สวัสดี', 'sawatdii').grund).toMatch(/Paiboon/);
    const ohne = pruefeThaiTon('สวัสดี', 'sà-wàt');
    expect(ohne.status).toBe('unsicher');
    expect(ohne.grund).toMatch(/ausrichten/);
    // Laut passt nicht (แคบ ist khɛ̂ɛp): die Silbe wird benannt.
    const laut = pruefeThaiTon('ใจแคบ', 'jai-khâap');
    expect(laut.status).toBe('unsicher');
    expect(laut.silben[1].begruendung).toMatch(/Schrift liest khɛɛp/);
    // Wortmitte nach Bindesilbe: Pali/Sanskrit lassen die Übertragung oft weg.
    expect(status('นิตยสาร', 'nít-dtà-yá-sǎan')).toBe('unsicher');
    // Englisches Lehnwort mit stummem ร์.
    expect(status('กีตาร์', 'gii-dtâa')).toBe('unsicher');
    expect(status('คอมพิวเตอร์', 'khɔm-phiu-dtə̂ə')).toBe('ok'); // steht in der Ausnahmeliste
    expect(status('ABC', 'ee-bii-sii')).toBe('unsicher');
  });

  it('Ausnahmeliste: unregelmäßige Wörter und Kontext von ไหม', () => {
    expect(TON_AUSNAHMEN.every((a) => a.grund.length > 10 && a.lesarten.length > 0)).toBe(true);
    expect(status('ก็', 'gɔ̂ɔ')).toBe('ok');
    expect(status('ไหม', 'mǎi', 'wort')).toBe('ok');
    expect(status('ไปไหม', 'bpai mái', 'satz')).toBe('ok');
    expect(status('ไปไหม', 'bpai mǎi', 'satz')).toBe('unsicher');
    expect(status('สมาคม', 'sà-maa-khom')).toBe('ok');
    expect(status('ประโยชน์', 'bprà-yòot')).toBe('ok');
    expect(status('ประโยชน์', 'bprà-yôot')).toBe('widerspruch');
    const khao = pruefeThaiTon('เขา', 'kháo');
    expect(khao.status).toBe('ok');
    expect(khao.silben[0].hinweis).toMatch(/gesprochen/);
  });

  it('jede Ausnahme passt zu ihrer eigenen Lesart', () => {
    for (const ausnahme of TON_AUSNAHMEN) {
      for (const lesart of ausnahme.lesarten) {
        expect([ausnahme.thai, status(ausnahme.thai, lesart.roman, lesart.nur ?? 'wort')]).toEqual([ausnahme.thai, 'ok']);
      }
    }
  });
});

describe('Ton-Engine: Schnittstellen', () => {
  it('liest Wortgrenzen der Umschrift', () => {
    expect(romanSilben('khun sà-baai').map((s) => s.wortAnfang)).toEqual([true, true, false]);
  });

  it('ergänzt Tonzeichen nur, wenn alle Silben sicher sind', () => {
    expect(ergaenzeTonzeichen('ขอบคุณครับ', 'khɔɔp-khun khrap').roman).toBe('khɔ̀ɔp-khun khráp');
    expect(ergaenzeTonzeichen('สบาย', 'sá-baai').roman).toBe('sà-baai');
    expect(ergaenzeTonzeichen('นิตยสาร', 'nit-dta-ya-saan').roman).toBeNull();
    expect(setzeTon('khaao', 'falling')).toBe('khâao');
  });

  it('liefert Soll-Töne fürs Audio-Ton-Gate', () => {
    expect(sollToeneAusSchrift('ใช่ไหม', 'châi mái', 'satz')).toEqual(['falling', 'high']);
    expect(sollToeneAusSchrift('สวัสดี', 'sawatdii')).toBeNull();
  });
});
