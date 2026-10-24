import type { Tone } from '@/constants/tones';
import { isTeachableNumber, numberWord } from '@/data/numbers';
import {
  CLUSTER_BY_SPELLING,
  CONSONANT_BY_SYMBOL,
  HO_NAM_FOLLOWERS,
  O_NAM_WORDS,
  TONE_MARKS,
  TONE_RULES,
  VOWEL_PATTERNS,
  type ConsonantClass,
  type SyllableShape,
  type ToneMark,
  type VowelLength,
} from '@/data/thai-script';
import { tonAusRomanToken } from '@/lib/content/roman-tone';
import { TON_AUSNAHMEN, type TonAusnahme } from './tone-exceptions';

/**
 * Regelbasierte Thai-Ton-Engine (24.10.2026).
 *
 * WOZU: Die Thai-Wörter und Sätze schreibt der Orchestrator selbst, ohne
 * zweite Prüf-KI. Ein falscher Soll-Ton in der Umschrift lässt später das
 * Audio-Ton-Gate gute, bezahlte Clips verwerfen und Lernende lernen falsch.
 * Diese Engine berechnet den Ton jeder Silbe aus der SCHRIFT und vergleicht
 * ihn mit dem Ton der Umschrift.
 *
 * WIE: Thai schreibt ohne Silbengrenzen. Die Paiboon-Umschrift trennt Silben
 * mit Bindestrich und Wörter mit Leerzeichen. Die Engine richtet beide aus —
 * aber NUR über die Laute (Anlaut, Vokal, Auslaut), nie über den Ton. So
 * bleibt die Tonprüfung unabhängig von der Umschrift. Passt die Schrift auf
 * mehrere Arten und ergeben sie verschiedene Töne, heißt das „unsicher“.
 *
 * Regeln und Daten aus `data/thai-script.ts` (Klassen, Tonregeltabelle,
 * Vokalmuster, Cluster, ห นำ, อ นำ). Unregelmäßige Wörter stehen mit
 * Begründung in `tone-exceptions.ts`.
 */

export const TON_ENGINE_VERSION = 'thai-ton-regeln-1';

export type TonStatus = 'ok' | 'widerspruch' | 'unsicher';
export type TonKontext = 'wort' | 'satz';

export type SilbenBefund = {
  /** Position der Silbe in der Umschrift (0-basiert). */
  index: number;
  /** Die Thai-Schreibung dieser Silbe (bei Ausnahmen das ganze Wort). */
  thai: string;
  /** Die Umschrift-Silbe, wie sie dasteht. */
  roman: string;
  /** Ton laut Schrift; `null`, wenn er sich nicht bestimmen ließ. */
  sollSchrift: Tone | null;
  /** Ton laut Umschrift; `null`, wenn die Markierung unlesbar ist. */
  istUmschrift: Tone | null;
  status: TonStatus;
  begruendung: string;
  /**
   * Ist `sollSchrift` aus der Schrift sicher? `false` bei Lehnwort-Merkmal,
   * unsicherer Klassenübertragung, abweichendem Laut oder mehreren Lesungen.
   */
  eindeutig: boolean;
  /** Zusatz bei „ok“, z. B. umgangssprachliche Nebenform. */
  hinweis?: string;
};

export type TonBefund = {
  status: TonStatus;
  silben: SilbenBefund[];
  /** Grund, wenn sich Schrift und Umschrift gar nicht ausrichten ließen. */
  grund?: string;
  version: typeof TON_ENGINE_VERSION;
};

/* ------------------------------------------------------------------ *
 * Zeichen und Laute                                                    *
 * ------------------------------------------------------------------ */

const VORANGESTELLT = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ']);
const KARAN = '์';
const MAI_YAMOK = 'ๆ';
const RUE = 'ฤ';
const LAKKHANGYAO = 'ๅ';
/** Tiefe Einzelkonsonanten ohne hohes Gegenstück: Ziel von ห นำ und Klassenübertragung. */
const TIEFE_SONORANTEN = new Set(['ง', 'ญ', 'ณ', 'น', 'ม', 'ย', 'ร', 'ล', 'ว', 'ฬ']);

const IPA_ZU_PAIBOON: Record<string, string> = {
  '/k/': 'g', '/kʰ/': 'kh', '/ŋ/': 'ng', '/tɕ/': 'j', '/tɕʰ/': 'ch', '/s/': 's', '/j/': 'y',
  '/d/': 'd', '/t/': 'dt', '/tʰ/': 'th', '/n/': 'n', '/b/': 'b', '/p/': 'bp', '/pʰ/': 'ph',
  '/f/': 'f', '/m/': 'm', '/r/': 'r', '/l/': 'l', '/w/': 'w', '/h/': 'h', '/ʔ/': '',
};
const AUSLAUT_ZU_PAIBOON: Record<string, string> = {
  '/k/': 'k', '/t/': 't', '/p/': 'p', '/ŋ/': 'ng', '/n/': 'n', '/m/': 'm', '/n/ or /w/': 'n',
};

/** Paiboon-Anlaut(e) eines Konsonanten, abgeleitet aus der IPA-Spalte der Quelle. */
const ANLAUT: Record<string, string[]> = Object.fromEntries(
  Object.values(CONSONANT_BY_SYMBOL).map((k) => [
    k.symbol,
    k.initialIpa.split(' or ').map((ipa) => IPA_ZU_PAIBOON[ipa.startsWith('/') ? ipa : `/${ipa}`])
      .filter((wert): wert is string => wert !== undefined),
  ])
);

/**
 * Auslaut als Paiboon-Laut. ย und ว stehen bewusst nicht drin: Als Gleitlaut
 * gehören sie zu den Vokalmustern (◌าย, ◌าว …), sonst gäbe es Doppellesungen.
 */
function auslautVon(zeichen: string | undefined): { roman: string; verschluss: boolean } | null {
  if (!zeichen || zeichen === 'ย' || zeichen === 'ว') return null;
  const k = CONSONANT_BY_SYMBOL[zeichen];
  if (!k?.finalIpa || !k.finalKind) return null;
  const roman = AUSLAUT_ZU_PAIBOON[k.finalIpa];
  return roman === undefined ? null : { roman, verschluss: k.finalKind === 'plosive' };
}

/** Paiboon-Vokal je Vokalmuster aus `VOWEL_PATTERNS` (Gleitlaut eingeschlossen). */
export const PAIBOON_VOKAL: Record<string, string> = {
  'เ◌ียว': 'iao', 'เ◌ือย': 'ʉai', 'เ◌ียะ': 'ia', 'เ◌ือะ': 'ʉa', 'เ◌ีย◌': 'ia', 'เ◌ีย': 'ia',
  'เ◌ือ◌': 'ʉa', 'เ◌ือ': 'ʉa', '◌ัวะ': 'ua', '◌ัว': 'ua', '◌วย': 'uai', '◌ว◌': 'ua',
  'เ◌อะ': 'ə', 'เ◌อ◌': 'əə', 'เ◌อ': 'əə', 'เ◌ิ◌': 'əə', 'เ◌ย': 'əəi', 'เ◌าะ': 'ɔ', 'เ◌า': 'ao',
  'เ◌็ว': 'eo', 'เ◌ว': 'eeo', 'เ◌็◌': 'e', 'เ◌ะ': 'e', 'เ◌◌': 'ee', 'เ◌': 'ee',
  'แ◌ว': 'ɛɛo', 'แ◌็◌': 'ɛ', 'แ◌ะ': 'ɛ', 'แ◌◌': 'ɛɛ', 'แ◌': 'ɛɛ',
  'โ◌ย': 'ooi', 'โ◌ะ': 'o', 'โ◌◌': 'oo', 'โ◌': 'oo',
  '◌็อย': 'ɔi', '◌็อ◌': 'ɔ', '◌อย': 'ɔɔi', '◌อ◌': 'ɔɔ', '◌อ': 'ɔɔ',
  '◌าว': 'aao', '◌าย': 'aai', '◌า◌': 'aa', '◌า': 'aa', '◌ำ': 'am', '◌ัย': 'ai', '◌ั◌': 'a', '◌ะ': 'a',
  '◌ิว': 'iu', '◌ิ◌': 'i', '◌ี◌': 'ii', '◌ือ': 'ʉʉ', '◌ื◌': 'ʉʉ', '◌ึ◌': 'ʉ', '◌ุย': 'ui', '◌ุ◌': 'u', '◌ู◌': 'uu',
  'ไ◌ย': 'ai', 'ไ◌': 'ai', 'ใ◌': 'ai',
};

const KLASSE_DE: Record<ConsonantClass, string> = { high: 'hohe Klasse', mid: 'mittlere Klasse', low: 'tiefe Klasse' };
const FORM_DE: Record<SyllableShape, string> = {
  live: 'lebende Silbe',
  'dead-short': 'tote Silbe, kurzer Vokal',
  'dead-long': 'tote Silbe, langer Vokal',
};
export const TON_DE: Record<Tone, string> = { mid: 'mittel', low: 'tief', falling: 'fallend', high: 'hoch', rising: 'steigend' };

/* ------------------------------------------------------------------ *
 * Schrift vorbereiten                                                  *
 * ------------------------------------------------------------------ */

/** Einheitliche Schreibung: NFC, ํา → ำ, Tonzeichen hinter Vokalzeichen. */
export function normalisiereThai(text: string): string {
  return text.normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/ํ([่-๋]?)า/g, '$1ำ')
    .replace(/([่-๋])([ัิ-ฺ็])/g, '$2$1');
}

const THAI_ZIFFERN = '๐๑๒๓๔๕๖๗๘๙';

/** Ziffern als Thai-Zahlwort (nur die festen Zahlen aus `data/numbers.ts`). */
function ziffernAlsWort(text: string): { text: string; problem: string | null } {
  let problem: string | null = null;
  const ersetzt = text.replace(/[0-9๐-๙](?:[0-9๐-๙,]*[0-9๐-๙])?/g, (ziffern) => {
    const wert = Number([...ziffern.replace(/,/g, '')].map((z) => {
      const thai = THAI_ZIFFERN.indexOf(z);
      return thai >= 0 ? String(thai) : z;
    }).join(''));
    if (!isTeachableNumber(wert)) {
      problem = `Zahl „${ziffern}“ in Ziffern: Aussprache nicht hinterlegt.`;
      return ziffern;
    }
    return ` ${numberWord('th', wert).text} `;
  });
  return { text: ersetzt, problem };
}

/**
 * Das Skelett: Thai-Zeichen ohne Tonzeichen. Ein Tonzeichen hängt am
 * Zeichen davor; Leerzeichen und Satzzeichen werden zu Grenzen, über die
 * keine Silbe reicht.
 */
type Sicht = {
  zeichen: string[];
  marke: (ToneMark | null)[];
  grenzeVor: boolean[];
  /** Index im Hauptskelett (für abgeleitete Sichten). */
  orig: number[];
};

type Skelett = Sicht & { anzeige: string[]; problem: string | null };

function baueSkelett(rohtext: string): Skelett {
  const vorbereitet = ziffernAlsWort(normalisiereThai(rohtext));
  const s: Skelett = { zeichen: [], marke: [], grenzeVor: [], orig: [], anzeige: [], problem: vorbereitet.problem };
  let grenze = true;
  for (const zeichen of vorbereitet.text) {
    if (zeichen in TONE_MARKS) {
      const letztes = s.zeichen.length - 1;
      if (letztes < 0 || grenze) continue;
      if (s.marke[letztes]) s.problem = 'Zwei Tonzeichen an einem Zeichen.';
      s.marke[letztes] = zeichen as ToneMark;
      s.anzeige[letztes] += zeichen;
      continue;
    }
    const code = zeichen.codePointAt(0)!;
    const istThai = code >= 0x0e01 && code <= 0x0e4e && zeichen !== 'ฯ' && zeichen !== '฿' && !(code >= 0x0e50);
    if (istThai) {
      s.orig.push(s.zeichen.length);
      s.zeichen.push(zeichen);
      s.marke.push(null);
      s.grenzeVor.push(grenze);
      s.anzeige.push(zeichen);
      grenze = false;
    } else if (/[\s\p{P}\p{S}]/u.test(zeichen) || zeichen === 'ฯ') {
      grenze = true;
    } else {
      s.problem = `Zeichen „${zeichen}“ lässt sich keiner Thai-Silbe zuordnen.`;
      grenze = true;
    }
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * Umschrift vorbereiten                                                *
 * ------------------------------------------------------------------ */

export type RomanSilbe = {
  roh: string;
  /** Erste Silbe eines Umschrift-Worts (Leerzeichen davor oder Textanfang). */
  wortAnfang: boolean;
  ton: Tone | null;
  anlaut: string;
  vokal: string;
  auslaut: string;
  lesbar: boolean;
};

const ROMAN_SILBE = /^(kh|ph|th|ch|ng|bp|dt|g|j|b|d|m|n|l|r|s|h|f|w|y|k|t|p)?(r|l|w)?([aeiouɛɔəʉ]+)(ng|p|t|k|m|n)?$/;
/** Silbenstücke der Umschrift: Buchstaben samt Diakritika; alles andere trennt. */
const ROMAN_STUECK = /[\p{L}\p{M}]+/gu;

/** Eine Umschrift-Silbe in Laute zerlegt (Tonzeichen entfernt). */
export function zerlegeRomanSilbe(roh: string): RomanSilbe {
  const basis = roh.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase()
    .replace(/æ/g, 'ɛ').replace(/ŋ/g, 'ng').replace(/ɯ/g, 'ʉ').replace(/ʔ/g, '');
  const treffer = basis.match(ROMAN_SILBE);
  const ton = tonAusRomanToken(roh);
  if (!treffer) return { roh, wortAnfang: true, ton, anlaut: '', vokal: '', auslaut: '', lesbar: false };
  let anlaut = treffer[1] ?? '';
  // Wiktionary-Paiboon schreibt behaucht ohne h (k/t/p); die App mit h.
  if (anlaut === 'k' || anlaut === 't' || anlaut === 'p') anlaut += 'h';
  return { roh, wortAnfang: true, ton, anlaut: anlaut + (treffer[2] ?? ''), vokal: treffer[3], auslaut: treffer[4] ?? '', lesbar: true };
}

export function romanSilben(roman: string): RomanSilbe[] {
  const text = roman.normalize('NFC');
  let vorigesEnde = 0;
  return [...text.matchAll(ROMAN_STUECK)].map((treffer) => {
    // Wortanfang: nach einer Lücke oder am Textanfang, nicht nach Bindestrich.
    const trenner = text.slice(vorigesEnde, treffer.index);
    vorigesEnde = treffer.index + treffer[0].length;
    return { ...zerlegeRomanSilbe(treffer[0]), wortAnfang: treffer.index === 0 || !trenner.includes('-') };
  });
}

/** Vokal ohne Länge: aa → a, ɔɔi → ɔi. Länge ändert den Ton nur in toten Silben. */
function ohneLaenge(vokal: string): string {
  return vokal.replace(/([aeiouɛɔəʉ])\1/g, '$1');
}

/* ------------------------------------------------------------------ *
 * Silbenlesungen aus der Schrift                                       *
 * ------------------------------------------------------------------ */

type Lesung = {
  /** Skelett-Indizes dieser Silbe (Anzeige, Ende). */
  indices: number[];
  anlaut: string[];
  vokal: string;
  auslaut: string;
  laenge: VowelLength;
  lebendDurchVokal: boolean;
  verschluss: boolean;
  klasse: ConsonantClass;
  /** Einzelner tiefer Sonorant ohne eigenes ห: kann die Klasse der Vorsilbe übernehmen. */
  uebertragbar: boolean;
  /** Ein vorangestellter Vokal trennt die Konsonanten — dann keine Übertragung. */
  praefix: boolean;
  tonzeichen: ToneMark | null;
  implizit: 'a' | 'o' | 'ɔɔ' | null;
  zeichen: string;
  /** Auslaut, der als Anlaut der Folgesilbe erneut gelesen werden darf. */
  wiederlesbar: boolean;
  notizen: string[];
  /** Englisches Lehnwort-Merkmal (stummes ร์): Ton folgt oft nicht der Regel. */
  lehnwort: boolean;
  strafe: number;
};

type Anlaut = {
  laenge: number;
  roman: string[];
  klasse: ConsonantClass;
  zeichen: string;
  uebertragbar: boolean;
  notiz: string | null;
  strafe: number;
  oNam?: boolean;
  lehnwort?: boolean;
};

const UNECHTE_CLUSTER: Record<string, string> = { 'ทร': 's', 'ซร': 's', 'จร': 'j', 'สร': 's', 'ศร': 's' };
const LEHN_CLUSTER = new Set(['ฟร', 'ฟล', 'บร', 'บล', 'ดร', 'ทร']);

const istKonsonant = (zeichen: string | undefined): zeichen is string => !!zeichen && zeichen in CONSONANT_BY_SYMBOL;
const klasseVon = (zeichen: string): ConsonantClass => CONSONANT_BY_SYMBOL[zeichen].consonantClass;

function zeichenAn(s: Sicht, i: number): string | undefined {
  return i >= 0 && i < s.zeichen.length ? s.zeichen[i] : undefined;
}

/** Steht ab `i` die Zeichenfolge `folge`, ohne Grenze dazwischen? */
function beginntMit(s: Sicht, i: number, folge: string): boolean {
  const teile = [...folge];
  return teile.every((zeichen, t) => zeichenAn(s, i + t) === zeichen && (t === 0 || !s.grenzeVor[i + t]));
}

function anlauteAb(s: Sicht, j: number): Anlaut[] {
  const c1 = zeichenAn(s, j);
  if (!istKonsonant(c1)) return [];
  const aus: Anlaut[] = [{
    laenge: 1, roman: ANLAUT[c1], klasse: klasseVon(c1), zeichen: c1,
    uebertragbar: TIEFE_SONORANTEN.has(c1), notiz: null, strafe: 0,
  }];
  const c2 = zeichenAn(s, j + 1);
  if (!istKonsonant(c2) || s.grenzeVor[j + 1]) return aus;
  const paar = c1 + c2;
  if (c1 === 'ห' && (HO_NAM_FOLLOWERS as readonly string[]).includes(c2)) {
    aus.push({ laenge: 2, roman: ANLAUT[c2], klasse: 'high', zeichen: paar, uebertragbar: false,
      notiz: `ห นำ: ${c2} zählt zur hohen Klasse`, strafe: 0 });
  }
  if (c1 === 'อ' && c2 === 'ย') {
    aus.push({ laenge: 2, roman: ['y'], klasse: 'mid', zeichen: paar, uebertragbar: false,
      notiz: 'อ นำ: ย zählt zur mittleren Klasse', strafe: 0, oNam: true });
  }
  const zweiter = c2 === 'ร' ? 'r' : c2 === 'ล' ? 'l' : c2 === 'ว' ? 'w' : null;
  if (zweiter && (paar in CLUSTER_BY_SPELLING || LEHN_CLUSTER.has(paar))) {
    const echt = paar in CLUSTER_BY_SPELLING;
    aus.push({ laenge: 2, roman: ANLAUT[c1].map((a) => a + zweiter), klasse: klasseVon(c1), zeichen: paar,
      uebertragbar: false, notiz: echt ? null : 'Lehnwort-Cluster', strafe: echt ? 0 : 1, lehnwort: !echt });
  }
  if (paar in UNECHTE_CLUSTER) {
    aus.push({ laenge: 2, roman: [UNECHTE_CLUSTER[paar]], klasse: klasseVon(c1), zeichen: paar,
      uebertragbar: false, notiz: `unechter Cluster ${paar}: ร stumm`, strafe: 0 });
  }
  return aus;
}

/** Endet die Silbe hier, oder beginnt eine neue (Konsonant / vorangestellter Vokal)? */
function endeOderNeueSilbe(s: Sicht, k: number): boolean {
  const z = zeichenAn(s, k);
  return z === undefined || s.grenzeVor[k] || istKonsonant(z) || VORANGESTELLT.has(z) || z === RUE;
}

function folgtSilbe(s: Sicht, k: number): boolean {
  const z = zeichenAn(s, k);
  return z !== undefined && !s.grenzeVor[k] && (istKonsonant(z) || VORANGESTELLT.has(z) || z === RUE);
}

type Schwanz = { ende: number; notiz: string | null; strafe: number; lehnwort?: boolean };

/** Stumme Zeichen hinter dem Silbenkern: ์-Gruppen, stummes ร, stummer Pali-Vokal. */
function schwaenze(s: Sicht, e: number, hatAuslaut: boolean): Schwanz[] {
  const aus: Schwanz[] = [{ ende: e, notiz: null, strafe: 0 }];
  for (const anzahl of [1, 2]) {
    let k = e;
    let ok = true;
    for (let t = 0; t < anzahl; t++, k++) {
      if (!istKonsonant(zeichenAn(s, k)) || s.grenzeVor[k] || s.marke[k]) ok = false;
    }
    if (!ok) continue;
    if ((zeichenAn(s, k) === 'ิ' || zeichenAn(s, k) === 'ุ') && !s.grenzeVor[k]) k++;
    if (zeichenAn(s, k) === KARAN && !s.grenzeVor[k]) {
      const stumm = s.zeichen.slice(e, k).join('');
      aus.push({ ende: k + 1, notiz: `${stumm}์ stumm`, strafe: 0, lehnwort: stumm === 'ร' && !hatAuslaut });
    }
  }
  if (hatAuslaut && !s.grenzeVor[e]) {
    if (zeichenAn(s, e) === 'ร' && !s.marke[e] && zeichenAn(s, e + 1) !== KARAN && endeOderNeueSilbe(s, e + 1)) {
      aus.push({ ende: e + 1, notiz: 'ร hinter dem Auslaut stumm', strafe: 3 });
    }
    if ((zeichenAn(s, e) === 'ิ' || zeichenAn(s, e) === 'ุ') && !s.marke[e] && endeOderNeueSilbe(s, e + 1)) {
      aus.push({ ende: e + 1, notiz: 'Vokal hinter dem Auslaut stumm (Pali/Sanskrit)', strafe: 1 });
    }
  }
  return aus;
}

type Kern = {
  von: number;
  anlaut: Anlaut;
  anlautIndex: number;
  vokal: string;
  laenge: VowelLength;
  lebendDurchVokal: boolean;
  /** Erstes Zeichen hinter Anlaut und Vokal (dort steht ggf. der Auslaut). */
  nachVokal: number;
  auslaut: { roman: string; verschluss: boolean; index: number } | null;
  implizit: Lesung['implizit'];
  praefix: boolean;
  strafe: number;
  notiz?: string;
  lehnwort?: boolean;
};

/** Aus einem Silbenkern alle Lesungen mit Schwanz bauen; Tonzeichen prüfen. */
function lesungenAusKern(s: Sicht, kern: Kern): Lesung[] {
  const ende = kern.auslaut ? kern.auslaut.index + 1 : kern.nachVokal;
  const aus: Lesung[] = [];
  for (const schwanz of schwaenze(s, ende, kern.auslaut !== null)) {
    const bis = schwanz.ende;
    if (bis <= kern.von) continue;
    let grenzeInnen = false;
    for (let k = kern.von + 1; k < bis; k++) if (s.grenzeVor[k]) grenzeInnen = true;
    if (grenzeInnen) continue;
    // Tonzeichen: höchstens eines, und nur an Anlaut oder Vokalzeichen.
    const tonGrenze = kern.auslaut ? kern.auslaut.index : kern.nachVokal;
    let tonzeichen: ToneMark | null = null;
    let ungueltig = false;
    for (let k = kern.von; k < bis; k++) {
      const marke = s.marke[k];
      if (!marke) continue;
      if (tonzeichen || k < kern.anlautIndex || k >= tonGrenze) ungueltig = true;
      tonzeichen = marke;
    }
    if (ungueltig) continue;
    const indices: number[] = [];
    for (let k = kern.von; k < bis; k++) indices.push(s.orig[k]);
    if (kern.anlaut.oNam) {
      const text = s.zeichen.slice(kern.von, bis).map((z, t) => z + (s.marke[kern.von + t] ?? '')).join('');
      if (!(O_NAM_WORDS as readonly string[]).includes(text)) continue;
    }
    const notizen = [kern.anlaut.notiz, kern.notiz, schwanz.notiz].filter((n): n is string => !!n);
    aus.push({
      indices,
      anlaut: kern.anlaut.roman,
      vokal: kern.vokal,
      auslaut: kern.auslaut?.roman ?? '',
      laenge: kern.laenge,
      lebendDurchVokal: kern.lebendDurchVokal,
      verschluss: kern.auslaut?.verschluss ?? false,
      klasse: kern.anlaut.klasse,
      uebertragbar: kern.anlaut.uebertragbar,
      praefix: kern.praefix,
      tonzeichen,
      implizit: kern.implizit,
      zeichen: kern.anlaut.zeichen,
      wiederlesbar: kern.auslaut !== null && schwanz.ende === kern.auslaut.index + 1 && kern.anlaut.laenge >= 1,
      notizen,
      lehnwort: Boolean(kern.lehnwort || schwanz.lehnwort || kern.anlaut.lehnwort),
      strafe: kern.strafe + kern.anlaut.strafe + schwanz.strafe,
    });
  }
  return aus;
}

function auslautAn(s: Sicht, k: number): Kern['auslaut'] {
  if (s.grenzeVor[k]) return null;
  const a = auslautVon(zeichenAn(s, k));
  return a ? { ...a, index: k } : null;
}

/** Alle Lesungen einer Silbe, die bei `i` beginnt. */
function silbenAb(s: Sicht, i: number, nurMitPraefix = false): Lesung[] {
  const aus: Lesung[] = [];
  const kerne: Kern[] = [];

  // 1. Geschriebene Vokalmuster.
  for (const muster of VOWEL_PATTERNS) {
    if (muster.prefix && !beginntMit(s, i, muster.prefix)) continue;
    if (nurMitPraefix && !muster.prefix) continue;
    const j = i + [...muster.prefix].length;
    for (const anlaut of anlauteAb(s, j)) {
      const k = j + anlaut.laenge;
      if (muster.infix && (s.grenzeVor[k] || !beginntMit(s, k, muster.infix))) continue;
      const m = k + [...muster.infix].length;
      const basis = {
        von: i, anlaut, anlautIndex: j, vokal: PAIBOON_VOKAL[muster.display], laenge: muster.length,
        lebendDurchVokal: Boolean(muster.endsInSonorant), nachVokal: m, implizit: null, praefix: !!muster.prefix, strafe: 0,
      } as const;
      if (muster.final !== 'required') kerne.push({ ...basis, auslaut: null });
      if (muster.final !== 'none') {
        const auslaut = auslautAn(s, m);
        if (auslaut) kerne.push({ ...basis, auslaut });
        // ล am Ende in Lehnwörtern auch als Gleitlaut: อีเมล ii-meeo.
        if (auslaut && zeichenAn(s, m) === 'ล') {
          kerne.push({ ...basis, vokal: basis.vokal + 'o', lebendDurchVokal: true, nachVokal: m + 1, auslaut: null,
            notiz: 'ล am Ende als o (Lehnwort)', lehnwort: true, strafe: 1 });
        }
        // Stummer Konsonant mit ์ vor dem Auslaut: การ์ด gáat, ชอล์ก chɔ́ɔk (Lehnwörter).
        const stumm = zeichenAn(s, m);
        const hinter = auslautAn(s, m + 2);
        if (istKonsonant(stumm) && zeichenAn(s, m + 1) === KARAN && !s.grenzeVor[m + 1] && hinter) {
          kerne.push({ ...basis, auslaut: hinter, notiz: `${stumm}์ stumm`, lehnwort: stumm === 'ร' || stumm === 'ล' });
        }
      }
    }
  }
  if (nurMitPraefix) return kerne.flatMap((kern) => lesungenAusKern(s, kern));

  // 2. Ohne Vokalzeichen: implizites o / ɔɔ / a und รร.
  const alleinstehend = (i === 0 || s.grenzeVor[i]) && (i + 1 >= s.zeichen.length || s.grenzeVor[i + 1]);
  for (const anlaut of anlauteAb(s, i)) {
    const k = i + anlaut.laenge;
    const basis = { von: i, anlaut, anlautIndex: i, nachVokal: k, praefix: false, lebendDurchVokal: false } as const;
    if (!s.grenzeVor[k] && zeichenAn(s, k) === 'ร' && zeichenAn(s, k + 1) === 'ร' && !s.grenzeVor[k + 1] && anlaut.laenge === 1) {
      // รร: mit Auslaut „a + Auslaut“ (กรรม gam), sonst „an“ (บรรยาย ban-).
      const auslaut = auslautAn(s, k + 2);
      if (auslaut) kerne.push({ ...basis, nachVokal: k + 2, vokal: 'a', laenge: 'short', implizit: null, strafe: 0, notiz: 'รร liest a', auslaut });
      kerne.push({ ...basis, nachVokal: k + 2, vokal: 'a', laenge: 'short', implizit: null, strafe: 0, notiz: 'รร liest an',
        auslaut: { roman: 'n', verschluss: false, index: k + 1 } });
      continue;
    }
    const auslaut = auslautAn(s, k);
    if (auslaut) {
      kerne.push({ ...basis, vokal: 'o', laenge: 'short', implizit: 'o', strafe: 0, notiz: 'implizites o', auslaut });
    }
    if (zeichenAn(s, k) === 'ร' && !s.grenzeVor[k]) {
      kerne.push({ ...basis, vokal: 'ɔɔ', laenge: 'long', implizit: 'ɔɔ', strafe: 0, notiz: 'implizites ɔɔ, ร liest n',
        auslaut: { roman: 'n', verschluss: false, index: k } });
    }
    if (folgtSilbe(s, k) || (alleinstehend && anlaut.laenge === 1)) {
      kerne.push({ ...basis, vokal: 'a', laenge: 'short', implizit: 'a', strafe: 0, notiz: 'implizites a', auslaut: null });
      kerne.push({ ...basis, vokal: 'ɔɔ', laenge: 'long', implizit: 'ɔɔ', strafe: 1, notiz: 'implizites ɔɔ', auslaut: null });
    }
  }

  // 3. ฤ: allein (ฤดู rʉ́-) oder hinter einem Konsonanten (อังกฤษ grìt).
  const ruePos = zeichenAn(s, i) === RUE ? i : istKonsonant(zeichenAn(s, i)) && zeichenAn(s, i + 1) === RUE && !s.grenzeVor[i + 1] ? i + 1 : -1;
  if (ruePos >= 0) {
    const vor = ruePos > i ? zeichenAn(s, i)! : null;
    const lang = zeichenAn(s, ruePos + 1) === LAKKHANGYAO;
    const nach = ruePos + (lang ? 2 : 1);
    const lesarten: [string, VowelLength][] = lang ? [['ʉʉ', 'long']] : [['ʉ', 'short'], ['i', 'short'], ['əə', 'long']];
    const anlaut: Anlaut = {
      laenge: ruePos - i + 1, roman: vor ? ANLAUT[vor].map((a) => a + 'r') : ['r'], klasse: vor ? klasseVon(vor) : 'low',
      zeichen: vor ? vor + RUE : RUE, uebertragbar: !vor, notiz: 'ฤ', strafe: 0,
    };
    for (const [vokal, laenge] of lesarten) {
      const basis = { von: i, anlaut, anlautIndex: i, vokal, laenge, lebendDurchVokal: false, nachVokal: nach, implizit: null, praefix: false, strafe: 0 } as const;
      kerne.push({ ...basis, auslaut: null });
      const auslaut = auslautAn(s, nach);
      if (auslaut) kerne.push({ ...basis, auslaut });
    }
  }

  for (const kern of kerne) aus.push(...lesungenAusKern(s, kern));
  return aus;
}

/**
 * Vorangestellter Vokal vor zwei Konsonanten, deren erster ein implizites a
 * trägt: เสมอ sà-mə̌ə, แสดง sà-dɛɛng, ไฉน chà-nǎi. Liefert Paare
 * [Vorsilbe, Hauptsilbe].
 */
function geteilteSilben(s: Sicht, i: number): [Lesung, Lesung][] {
  const vokal = zeichenAn(s, i);
  const c1 = zeichenAn(s, i + 1);
  if (!vokal || !VORANGESTELLT.has(vokal) || !istKonsonant(c1) || !istKonsonant(zeichenAn(s, i + 2))) return [];
  if (s.grenzeVor[i + 1] || s.grenzeVor[i + 2] || s.marke[i + 1]) return [];
  const vorsilbe: Lesung = {
    indices: [s.orig[i + 1]], anlaut: ANLAUT[c1], vokal: 'a', auslaut: '', laenge: 'short', lebendDurchVokal: false,
    verschluss: false, klasse: klasseVon(c1), uebertragbar: TIEFE_SONORANTEN.has(c1), praefix: false, tonzeichen: null,
    implizit: 'a', zeichen: c1, wiederlesbar: false, notizen: ['implizites a', `vorangestelltes ${vokal} gehört zur Folgesilbe`], lehnwort: false, strafe: 1,
  };
  // Sicht ohne c1: Der Vokal steht direkt vor dem zweiten Konsonanten.
  const behalten = s.zeichen.map((_, k) => k).filter((k) => k !== i + 1);
  const ohne: Sicht = {
    zeichen: behalten.map((k) => s.zeichen[k]),
    marke: behalten.map((k) => s.marke[k]),
    grenzeVor: behalten.map((k) => s.grenzeVor[k]),
    orig: behalten.map((k) => s.orig[k]),
  };
  return silbenAb(ohne, i, true).map((haupt) => [vorsilbe, { ...haupt, praefix: false }]);
}

/* ------------------------------------------------------------------ *
 * Ton einer Lesung                                                     *
 * ------------------------------------------------------------------ */

export function silbenForm(laenge: VowelLength, verschluss: boolean, auslaut: string, lebendDurchVokal: boolean): SyllableShape {
  if (verschluss) return laenge === 'long' ? 'dead-long' : 'dead-short';
  if (auslaut || lebendDurchVokal || laenge === 'long') return 'live';
  return 'dead-short';
}

type Uebertrag = { klasse: ConsonantClass; von: string; sicher: boolean };

type Bewertung = {
  ton: Tone | null;
  /** Ton ohne Klassenübertragung, wenn eine angewandt wurde. */
  tonOhne: Tone | null;
  begruendung: string;
  klasse: ConsonantClass;
  uebertragen: Uebertrag | null;
};

function tonNachRegel(l: Lesung, klasse: ConsonantClass): Tone | null {
  const form = silbenForm(l.laenge, l.verschluss, l.auslaut, l.lebendDurchVokal);
  return l.tonzeichen ? TONE_RULES.marked[l.tonzeichen][klasse] : TONE_RULES.unmarked[form][klasse];
}

function bewerte(l: Lesung, uebertrag: Uebertrag | null): Bewertung {
  const uebertragen = uebertrag && l.uebertragbar && !l.praefix ? uebertrag : null;
  const klasse = uebertragen ? uebertragen.klasse : l.klasse;
  const form = silbenForm(l.laenge, l.verschluss, l.auslaut, l.lebendDurchVokal);
  const ton = tonNachRegel(l, klasse);
  const notizen = [...l.notizen];
  if (uebertragen) notizen.push(`Klasse von ${uebertragen.von} übertragen (Vorsilbe mit implizitem a)`);
  const regel = l.tonzeichen ? `Tonzeichen ${TONE_MARKS[l.tonzeichen].nameRtgs}` : FORM_DE[form];
  const begruendung = `${l.zeichen}: ${KLASSE_DE[klasse]}${notizen.length ? ` (${notizen.join('; ')})` : ''}, ${regel} → ${ton ? TON_DE[ton] : 'in der Tonregel nicht vorgesehen'}`;
  return { ton, tonOhne: uebertragen ? tonNachRegel(l, l.klasse) : null, begruendung, klasse, uebertragen };
}

/** Reim ohne Länge: Vokal + Auslaut (ำ steht als „am“ im Vokal, die Umschrift als a + m). */
function reim(vokal: string, auslaut: string): string {
  return ohneLaenge(vokal + auslaut);
}

function passt(l: Lesung, r: RomanSilbe): boolean {
  return r.lesbar && l.anlaut.includes(r.anlaut) && reim(l.vokal, l.auslaut) === reim(r.vokal, r.auslaut);
}

/**
 * Lockere Ausrichtung nur für die Fehlersuche: Anlaut ODER Vokal darf
 * abweichen, der Auslaut nicht. So lässt sich die Silbe benennen, deren
 * Umschrift nicht zur Schrift passt (แคบ khɛ̂ɛp, nicht „khâap“).
 */
function passtLocker(l: Lesung, r: RomanSilbe): boolean {
  if (!r.lesbar || l.auslaut !== r.auslaut) return false;
  return l.anlaut.includes(r.anlaut) || ohneLaenge(l.vokal) === ohneLaenge(r.vokal);
}

/** Wie die Schrift diese Silbe liest, in Paiboon ohne Ton. */
function lesungAlsRoman(l: Lesung): string {
  return `${l.anlaut[0]}${l.vokal}${l.auslaut}`;
}

/* ------------------------------------------------------------------ *
 * Ausnahmen                                                            *
 * ------------------------------------------------------------------ */

type AusnahmeForm = { ausnahme: TonAusnahme; zeichen: string[]; marke: (ToneMark | null)[]; lesarten: { silben: RomanSilbe[]; nur?: TonKontext }[] };

const AUSNAHME_FORMEN: AusnahmeForm[] = TON_AUSNAHMEN.map((ausnahme) => {
  const skelett = baueSkelett(ausnahme.thai);
  return {
    ausnahme,
    zeichen: skelett.zeichen,
    marke: skelett.marke,
    lesarten: ausnahme.lesarten.map((lesart) => ({ silben: romanSilben(lesart.roman), nur: lesart.nur })),
  };
}).sort((a, b) => b.zeichen.length - a.zeichen.length);

function ausnahmenAb(s: Skelett, i: number): AusnahmeForm[] {
  return AUSNAHME_FORMEN.filter((form) => form.zeichen.every((zeichen, t) =>
    s.zeichen[i + t] === zeichen && s.marke[i + t] === form.marke[t] && (t === 0 || !s.grenzeVor[i + t]))
    && (i + form.zeichen.length >= s.zeichen.length || endeOderNeueSilbe(s, i + form.zeichen.length)));
}

/* ------------------------------------------------------------------ *
 * Ausrichtung (dynamische Programmierung)                              *
 * ------------------------------------------------------------------ */

type Urteil = { soll: Tone | null; status: TonStatus; begruendung: string; hinweis?: string; thai: string; mehrdeutig?: boolean };

type Schritt = {
  /** Umschrift-Silben, die dieser Schritt abdeckt, mit ihrem Urteil. */
  urteile: Urteil[];
  /** Für ๆ: die regulären Lesungen samt Bewertung. */
  silben: { lesung: Lesung; bewertung: Bewertung }[];
};

type Ergebnis = { strafe: number; pfade: Schritt[][] };
const UNMOEGLICH: Ergebnis = { strafe: Infinity, pfade: [] };
const PFAD_GRENZE = 8;
const LOCKER_STRAFE = 20;

function urteilRegulaer(ton: Tone | null, begruendung: string, r: RomanSilbe, thai: string): Urteil {
  if (!ton) return { soll: null, status: 'unsicher', begruendung, thai };
  if (!r.ton) return { soll: ton, status: 'unsicher', begruendung: `${begruendung}; Ton der Umschrift unlesbar`, thai };
  return { soll: ton, status: ton === r.ton ? 'ok' : 'widerspruch', begruendung, thai };
}

/**
 * Urteil über eine regulär gelesene Silbe. Klassenübertragung nach einer
 * Vorsilbe mit implizitem a gilt am Wortanfang als Regel (ขนม khà-nǒm);
 * in der Wortmitte und nach einer Bindesilbe lassen Pali/Sanskrit-Wörter
 * sie oft weg (นิตยสาร nít-dtà-yá-sǎan) — dann nur „unsicher“.
 */
function urteilLesung(l: Lesung, b: Bewertung, r: RomanSilbe, thai: string, locker: boolean): Urteil {
  if (locker) {
    return { soll: b.ton, status: 'unsicher', thai, mehrdeutig: true,
      begruendung: `Umschrift „${r.roh}“ passt lautlich nicht zur Schrift ${thai} (Schrift liest ${lesungAlsRoman(l)}); ${b.begruendung}` };
  }
  let urteil = urteilRegulaer(b.ton, b.begruendung, r, thai);
  const offeneUebertragung = !!(b.uebertragen && !b.uebertragen.sicher && b.tonOhne && b.tonOhne !== b.ton);
  if (offeneUebertragung || l.lehnwort) urteil = { ...urteil, mehrdeutig: true };
  if (urteil.status === 'widerspruch' && b.uebertragen && b.tonOhne && b.tonOhne !== b.ton) {
    if (r.ton === b.tonOhne && !b.uebertragen.sicher) {
      urteil = { ...urteil, status: 'unsicher',
        begruendung: `${urteil.begruendung}; die Umschrift liest ohne Klassenübertragung (${TON_DE[b.tonOhne]}) — in Lehnwörtern aus Pali/Sanskrit üblich, sonst falsch` };
    } else if (r.ton === b.tonOhne) {
      urteil = { ...urteil,
        begruendung: `${urteil.begruendung}; ohne Klassenübertragung wäre es ${TON_DE[b.tonOhne]} — nur bei Lehnwörtern wie สมาคม, dann in die Ausnahmeliste` };
    } else {
      urteil = { ...urteil, begruendung: `${urteil.begruendung}; ohne Klassenübertragung ${TON_DE[b.tonOhne]}` };
    }
  }
  if (urteil.status === 'widerspruch' && l.lehnwort) {
    urteil = { ...urteil, status: 'unsicher',
      begruendung: `${urteil.begruendung}; englisches Lehnwort (stummes ร์/ล์ oder Lehn-Cluster): die Aussprache folgt oft nicht der Tonregel` };
  }
  return urteil;
}

function urteileAusnahme(form: AusnahmeForm, rs: RomanSilbe[], kontext: TonKontext, thai: string): Urteil[] | null {
  const passende = form.lesarten.filter((lesart) => lesart.silben.length === rs.length && lesart.silben.every((silbe, t) =>
    rs[t].lesbar && silbe.anlaut === rs[t].anlaut && reim(silbe.vokal, silbe.auslaut) === reim(rs[t].vokal, rs[t].auslaut)));
  if (!passende.length) return null;
  const bevorzugt = passende.filter((lesart) => !lesart.nur || lesart.nur === kontext);
  const andere = passende.filter((lesart) => lesart.nur && lesart.nur !== kontext);
  const begruendung = `Ausnahme ${form.ausnahme.thai}: ${form.ausnahme.grund}`;
  return rs.map((r, t) => {
    const erlaubt = bevorzugt.map((lesart) => lesart.silben[t].ton);
    const soll = erlaubt[0] ?? andere[0]?.silben[t].ton ?? null;
    if (!r.ton) return { soll, status: 'unsicher' as const, begruendung: `${begruendung}; Ton der Umschrift unlesbar`, thai };
    if (erlaubt.includes(r.ton)) {
      // Hinweis nur, wenn die erlaubten Lesarten sich im Ton unterscheiden (เขา khǎo/kháo).
      const mehrereToene = new Set(erlaubt).size > 1;
      return { soll: r.ton, status: 'ok' as const, begruendung, thai, ...(mehrereToene ? { hinweis: form.ausnahme.grund } : {}) };
    }
    if (andere.some((lesart) => lesart.silben[t].ton === r.ton)) {
      return { soll, status: 'unsicher' as const, begruendung: `${begruendung} Diese Lesart gilt nur ${kontext === 'satz' ? 'als Stichwort' : 'im Satz'}.`, thai };
    }
    return { soll, status: 'widerspruch' as const, begruendung, thai };
  });
}

type Kontext = { uebertrag: Uebertrag | null; wiederlesen: boolean; verlauf: Schritt['silben'] };

function ausrichten(s: Skelett, rs: RomanSilbe[], kontext: TonKontext, locker: boolean): { ergebnis: Ergebnis; weitest: { pos: number; r: number } } {
  const memo = new Map<string, Ergebnis>();
  const hatYamokAb: boolean[] = [];
  for (let k = s.zeichen.length - 1, gesehen = false; k >= 0; k--) {
    gesehen = gesehen || s.zeichen[k] === MAI_YAMOK;
    hatYamokAb[k] = gesehen;
  }
  const weitest = { pos: 0, r: 0 };
  const silbenCache = new Map<number, Lesung[]>();
  const silbenBei = (von: number) => {
    if (!silbenCache.has(von)) silbenCache.set(von, silbenAb(s, von));
    return silbenCache.get(von)!;
  };
  const geteiltCache = new Map<number, [Lesung, Lesung][]>();
  const geteiltBei = (von: number) => {
    if (!geteiltCache.has(von)) geteiltCache.set(von, geteilteSilben(s, von));
    return geteiltCache.get(von)!;
  };
  const anzeige = (indices: number[]) => indices.map((k) => s.anzeige[k]).join('');
  /** Passt die Lesung zur Umschrift-Silbe? `null` = nein, sonst Zusatzstrafe und ob nur locker. */
  const vergleiche = (l: Lesung, r: RomanSilbe): { strafe: number; locker: boolean } | null => {
    if (passt(l, r)) return { strafe: 0, locker: false };
    return locker && passtLocker(l, r) ? { strafe: LOCKER_STRAFE, locker: true } : null;
  };

  function loese(pos: number, r: number, ctx: Kontext): Ergebnis {
    if (r > weitest.r || (r === weitest.r && pos > weitest.pos)) { weitest.r = r; weitest.pos = pos; }
    if (pos >= s.zeichen.length) return r === rs.length ? { strafe: 0, pfade: [[]] } : UNMOEGLICH;
    if (r >= rs.length) return UNMOEGLICH;
    const verlaufSchluessel = hatYamokAb[pos] ? ctx.verlauf.map((v) => v.lesung.indices.join(',')).join('/') : '';
    const u = ctx.uebertrag;
    const schluessel = `${pos}|${r}|${u ? `${u.klasse}${u.von}${u.sicher ? 1 : 0}` : ''}|${ctx.wiederlesen ? 1 : 0}|${verlaufSchluessel}`;
    const gemerkt = memo.get(schluessel);
    if (gemerkt) return gemerkt;

    let beste: Ergebnis = UNMOEGLICH;
    const nimm = (schritt: Schritt, strafe: number, weiter: Ergebnis) => {
      const gesamt = strafe + weiter.strafe;
      if (gesamt > beste.strafe || !Number.isFinite(gesamt)) return;
      const pfade = weiter.pfade.map((pfad) => [schritt, ...pfad]);
      if (gesamt < beste.strafe) beste = { strafe: gesamt, pfade: pfade.slice(0, PFAD_GRENZE) };
      else beste = { strafe: gesamt, pfade: [...beste.pfade, ...pfade].slice(0, PFAD_GRENZE) };
    };
    const neuerVerlauf = (silben: Schritt['silben']) => (hatYamokAb[pos] ? [...ctx.verlauf, ...silben].slice(-3) : []);
    const wortAnfangHier = (von: number, roman: RomanSilbe) => von === 0 || s.grenzeVor[von] || roman.wortAnfang;

    // ๆ: die letzten 1–3 Silben noch einmal.
    if (s.zeichen[pos] === MAI_YAMOK) {
      for (let n = 1; n <= ctx.verlauf.length; n++) {
        const wiederholt = ctx.verlauf.slice(-n);
        if (r + n > rs.length || !wiederholt.every((v, t) => passt(v.lesung, rs[r + t]))) continue;
        const schritt: Schritt = {
          urteile: wiederholt.map((v, t) => urteilLesung(v.lesung,
            { ...v.bewertung, begruendung: `ๆ wiederholt: ${v.bewertung.begruendung}` }, rs[r + t], 'ๆ', false)),
          silben: wiederholt,
        };
        nimm(schritt, 0, loese(pos + 1, r + n, { uebertrag: null, wiederlesen: false, verlauf: neuerVerlauf(wiederholt) }));
      }
    }

    // Ausnahmen aus der Liste (Vorrang über die Strafe).
    for (const form of ausnahmenAb(s, pos)) {
      for (const lesart of new Set(form.lesarten.map((l) => l.silben.length))) {
        if (r + lesart > rs.length) continue;
        const thai = anzeige(Array.from({ length: form.zeichen.length }, (_, t) => pos + t));
        const urteile = urteileAusnahme(form, rs.slice(r, r + lesart), kontext, thai);
        if (!urteile) continue;
        nimm({ urteile, silben: [] }, -10 * lesart, loese(pos + form.zeichen.length, r + lesart, { uebertrag: null, wiederlesen: false, verlauf: [] }));
      }
    }

    // Reguläre Silben — auch ab dem zuletzt gelesenen Auslaut (Bindesilbe, ผลไม้ phǒn-lá-máai).
    const starts: { von: number; strafe: number }[] = [{ von: pos, strafe: 0 }];
    if (ctx.wiederlesen) starts.push({ von: pos - 1, strafe: 2 });
    const roman = rs[r];
    for (const start of starts) {
      for (const lesung of silbenBei(start.von)) {
        const ende = Math.max(...lesung.indices) + 1;
        if (ende <= pos && !(start.von === pos - 1 && lesung.implizit === 'a')) continue;
        const vergleich = vergleiche(lesung, roman);
        if (!vergleich) continue;
        const bewertung = bewerte(lesung, ctx.uebertrag);
        if (start.von < pos) bewertung.begruendung += '; Auslaut zugleich Anlaut dieser Silbe';
        const schritt: Schritt = {
          urteile: [urteilLesung(lesung, bewertung, roman, anzeige(lesung.indices), vergleich.locker)],
          silben: [{ lesung, bewertung }],
        };
        const uebertrag = lesung.implizit === 'a' && !lesung.auslaut && bewertung.klasse !== 'low'
          ? { klasse: bewertung.klasse, von: lesung.zeichen, sicher: start.von === pos && wortAnfangHier(start.von, roman) } : null;
        nimm(schritt, start.strafe + lesung.strafe + vergleich.strafe,
          loese(Math.max(ende, pos), r + 1, { uebertrag, wiederlesen: lesung.wiederlesbar, verlauf: neuerVerlauf(schritt.silben) }));
      }
    }

    // เสมอ & Co.: Vorsilbe + Hauptsilbe hinter vorangestelltem Vokal.
    if (r + 2 <= rs.length) {
      for (const [vorsilbe, haupt] of geteiltBei(pos)) {
        const vv = vergleiche(vorsilbe, rs[r]);
        const vh = vv && vergleiche(haupt, rs[r + 1]);
        if (!vv || !vh) continue;
        const v = bewerte(vorsilbe, null);
        const h = bewerte(haupt, v.klasse !== 'low'
          ? { klasse: v.klasse, von: vorsilbe.zeichen, sicher: wortAnfangHier(pos, rs[r]) } : null);
        const schritt: Schritt = {
          urteile: [
            urteilLesung(vorsilbe, v, rs[r], anzeige(vorsilbe.indices), vv.locker),
            urteilLesung(haupt, h, rs[r + 1], anzeige(haupt.indices), vh.locker),
          ],
          silben: [{ lesung: vorsilbe, bewertung: v }, { lesung: haupt, bewertung: h }],
        };
        const ende = Math.max(...haupt.indices) + 1;
        nimm(schritt, vorsilbe.strafe + haupt.strafe + vv.strafe + vh.strafe,
          loese(ende, r + 2, { uebertrag: null, wiederlesen: haupt.wiederlesbar, verlauf: neuerVerlauf(schritt.silben) }));
      }
    }

    memo.set(schluessel, beste);
    return beste;
  }

  const ergebnis = loese(0, 0, { uebertrag: null, wiederlesen: false, verlauf: [] });
  return { ergebnis, weitest };
}

/* ------------------------------------------------------------------ *
 * Öffentliche Prüfung                                                  *
 * ------------------------------------------------------------------ */

function gesamtStatus(silben: SilbenBefund[]): TonStatus {
  if (silben.some((s) => s.status === 'widerspruch')) return 'widerspruch';
  if (silben.some((s) => s.status === 'unsicher')) return 'unsicher';
  return 'ok';
}

function unsicherOhneAusrichtung(rs: RomanSilbe[], grund: string): TonBefund {
  return {
    status: 'unsicher',
    grund,
    silben: rs.map((r, index) => ({ index, thai: '', roman: r.roh, sollSchrift: null, istUmschrift: r.ton, status: 'unsicher', begruendung: grund, eindeutig: false })),
    version: TON_ENGINE_VERSION,
  };
}

/**
 * Prüft den Ton jeder Silbe: Thai-Schrift gegen Paiboon-Umschrift.
 *
 * `kontext` „wort“ für Stichwörter, „satz“ für Beispielsätze und
 * Dialogzeilen (z. B. ไหม: als Stichwort mǎi, im Satz mái).
 */
export function pruefeThaiTon(thai: string, roman: string, optionen: { kontext?: TonKontext } = {}): TonBefund {
  const kontext = optionen.kontext ?? 'wort';
  const rs = romanSilben(roman);
  const skelett = baueSkelett(thai);
  if (!rs.length) return unsicherOhneAusrichtung(rs, 'Keine Umschrift.');
  if (skelett.problem) return unsicherOhneAusrichtung(rs, skelett.problem);
  if (!skelett.zeichen.length) return unsicherOhneAusrichtung(rs, 'Keine Thai-Schrift.');
  const unlesbar = rs.findIndex((r) => !r.lesbar);
  if (unlesbar >= 0) return unsicherOhneAusrichtung(rs, `Umschrift-Silbe „${rs[unlesbar].roh}“ folgt nicht dem Paiboon-Aufbau.`);

  const streng = ausrichten(skelett, rs, kontext, false);
  const weitest = streng.weitest;
  let ergebnis = streng.ergebnis;
  if (!ergebnis.pfade.length) {
    // Zweiter Versuch nur zur Fehlersuche: Welche Silbe passt lautlich nicht?
    const locker = ausrichten(skelett, rs, kontext, true);
    if (!locker.ergebnis.pfade.length) {
      const rest = skelett.anzeige.slice(weitest.pos).join('');
      const ab = rs[weitest.r]?.roh;
      return unsicherOhneAusrichtung(rs, `Schrift und Umschrift lassen sich nicht ausrichten${ab ? ` (ab Umschrift „${ab}“, Schrift „${rest}“)` : ''}.`);
    }
    ergebnis = locker.ergebnis;
  }

  const proPfad = ergebnis.pfade.map((pfad) => pfad.flatMap((schritt) => schritt.urteile));
  const silben: SilbenBefund[] = rs.map((r, index) => {
    const urteile = proPfad.map((urteil) => urteil[index]);
    const erstes = urteile[0];
    const einig = urteile.every((u) => u.soll === erstes.soll && u.status === erstes.status);
    if (!einig) {
      const moeglich = [...new Set(urteile.map((u) => (u.soll ? TON_DE[u.soll] : '?')))].join(' oder ');
      return {
        index, thai: erstes.thai, roman: r.roh, sollSchrift: null, istUmschrift: r.ton, status: 'unsicher', eindeutig: false,
        begruendung: `Mehrere Lesungen der Schrift möglich (${moeglich}): ${[...new Set(urteile.map((u) => u.begruendung))].join(' | ')}`,
      };
    }
    return {
      index, thai: erstes.thai, roman: r.roh, sollSchrift: erstes.soll, istUmschrift: r.ton, status: erstes.status,
      eindeutig: erstes.soll !== null && !urteile.some((u) => u.mehrdeutig), begruendung: erstes.begruendung, ...(erstes.hinweis ? { hinweis: erstes.hinweis } : {}),
    };
  });
  return { status: gesamtStatus(silben), silben, version: TON_ENGINE_VERSION };
}

/**
 * Soll-Töne aus der Schrift je Umschrift-Silbe — die Schnittstelle für das
 * Audio-Ton-Gate. `null` an einer Stelle heißt „nicht sicher bestimmbar“;
 * `null` insgesamt: keine Ausrichtung möglich.
 */
export function sollToeneAusSchrift(thai: string, roman: string, kontext: TonKontext = 'wort'): (Tone | null)[] | null {
  const befund = pruefeThaiTon(thai, roman, { kontext });
  if (befund.grund) return null;
  return befund.silben.map((silbe) => (silbe.eindeutig ? silbe.sollSchrift : null));
}

const TON_DIAKRITIKUM: Record<Tone, string> = { mid: '', low: '̀', falling: '̂', high: '́', rising: '̌' };

/** Setzt den Ton einer Umschrift-Silbe (Diakritikum auf den ersten Vokal). */
export function setzeTon(silbe: string, ton: Tone): string {
  const basis = silbe.normalize('NFD').replace(/[̀-̂̆̌]/g, '');
  const vokal = basis.search(/[aeiouɛɔəʉ]/i);
  if (vokal < 0) return silbe;
  return (basis.slice(0, vokal + 1) + TON_DIAKRITIKUM[ton] + basis.slice(vokal + 1)).normalize('NFC');
}

/**
 * Ergänzt die Tonzeichen einer Umschrift aus der Schrift (Bonus). Die
 * vorhandenen Tonzeichen werden ersetzt. `roman` ist `null`, wenn auch nur
 * eine Silbe nicht sicher bestimmbar ist — dann wird nichts geraten.
 */
export function ergaenzeTonzeichen(thai: string, roman: string, kontext: TonKontext = 'wort'): { roman: string | null; befund: TonBefund } {
  const ohneToene = roman.normalize('NFD').replace(/[̀-̂̆̌]/g, '').normalize('NFC');
  const befund = pruefeThaiTon(thai, ohneToene, { kontext });
  // Ein Widerspruch zählt hier nicht: Die Umschrift trägt ja gerade keine Töne.
  if (befund.grund || befund.silben.some((silbe) => !silbe.eindeutig)) return { roman: null, befund };
  let index = 0;
  const ergebnis = roman.normalize('NFC').replace(ROMAN_STUECK, (stueck) => setzeTon(stueck, befund.silben[index++].sollSchrift!));
  return { roman: ergebnis, befund };
}
