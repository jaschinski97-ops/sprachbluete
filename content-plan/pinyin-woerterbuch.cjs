#!/usr/bin/env node
/**
 * Pinyin-Abgleich mit dem Wörterbuch CC-CEDICT (07.11.2026).
 *
 * `chinesische-woerter.cjs` prüft nur die Form des Pinyins (gültige Silbe,
 * Tonzeichen auf dem richtigen Vokal, eine Silbe je Zeichen). Ob 妈 wirklich
 * mā ist, sagt erst ein Wörterbuch: Anders als bei Thai lässt sich der Ton
 * nicht aus der Schrift berechnen. Das Gegenstück zu `tone-rules.ts`.
 *
 * Wörterbuch: CC-CEDICT von MDBG (Lizenz CC BY-SA 4.0), nur zum Prüfen, nie in
 * der App. Einmal laden:
 *   curl -L -o _Local/woerterbuch/cedict_1_0_ts_utf-8_mdbg.zip \
 *     https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip
 *   unzip _Local/woerterbuch/cedict_1_0_ts_utf-8_mdbg.zip -d _Local/woerterbuch/
 *
 *   node content-plan/pinyin-woerterbuch.cjs katalog [--alles]
 *     prüft Wörter, Beispielsätze und Dialogzüge auf Chinesisch im Katalog
 *   node content-plan/pinyin-woerterbuch.cjs text <hanzi> <pinyin>
 *
 * Befunde:
 *   fehler     Silbe oder Ton passt zu keiner Lesung des Zeichens im Wörterbuch
 *   verdacht   jede Silbe ist eine mögliche Lesung ihres Zeichens, aber das
 *              Wort im Wörterbuch wird anders gelesen (Mehrfach-Lesungen wie
 *              还 hái/huán, 长 cháng/zhǎng) — von Hand ansehen
 *   neutral    neutraler Ton gegen vollen Ton; Wörterbücher schwanken (道理
 *              dàoli/dàolǐ), deshalb nur mit --alles gelistet
 * Erlaubt ohne Befund: 一 als yí/yì und 不 als bú (Tonänderung vor dem
 * nächsten Ton, so steht es in Lehrbüchern), 儿 als Erhua-r.
 */
const fs = require('node:fs');
const path = require('node:path');
const { zerlege, ohneTon, SILBEN } = require('./chinesische-woerter.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATEI = path.join(ROOT, '_Local/woerterbuch/cedict_ts.u8');
const HAN = /\p{Script=Han}/u;
const MAX_WORT = 8;
const TON = { ā: 1, á: 2, ǎ: 3, à: 4, ē: 1, é: 2, ě: 3, è: 4, ī: 1, í: 2, ǐ: 3, ì: 4,
  ō: 1, ó: 2, ǒ: 3, ò: 4, ū: 1, ú: 2, ǔ: 3, ù: 4, ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4 };

/** Silbe mit Tonzeichen → Schlüssel „basis+ton“, neutral = 5: „hǎo“ → „hao3“. */
function schluessel(silbe) {
  const s = silbe.normalize('NFC').toLowerCase();
  const ton = Array.from(s).map((z) => TON[z]).find(Boolean) ?? 5;
  return `${ohneTon(s)}${ton}`;
}

/** CEDICT-Silbe („Wang2“, „lu:4“, „r5“) → Schlüssel; null bei Buchstaben o. ä. */
function cedictSilbe(roh) {
  const m = /^([a-zü]+)([1-5])$/.exec(roh.toLowerCase().replace(/u:/g, 'ü'));
  return m ? `${m[1]}${m[2]}` : null;
}

/** Liest CEDICT-Text: Kurzzeichen-Wort → Lesungen, je Zeichen ein Schlüssel. */
function leseCedict(text) {
  const woerter = new Map();
  const zeichen = new Map();
  for (const zeile of text.split(/\r?\n/)) {
    if (!zeile || zeile.startsWith('#')) continue;
    const m = /^\S+ (\S+) \[([^\]]*)\] (.*)$/.exec(zeile);
    if (!m) continue;
    const schrift = Array.from(m[1]);
    if (!schrift.every((z) => HAN.test(z))) continue;
    // Nebenlesungen stehen in der Bedeutung: „also pr. [xia4 zai4]“,
    // „colloquial pr. [xie3]“. Taiwan-Lesungen zählen nicht.
    const lesungen = [m[2], ...[...m[3].matchAll(/(?:also|colloquial) pr\. \[([^\]]+)\]/g)].map((x) => x[1])];
    for (const roh of lesungen) {
      // Nebenlesungen stehen manchmal ohne Leerzeichen („[xia4zai4]“).
      const teile = /\s/.test(roh.trim()) ? roh.trim().split(/\s+/) : (roh.match(/[A-Za-zü:]+[1-5]/g) ?? [roh]);
      const silben = teile.map(cedictSilbe);
      if (silben.length !== schrift.length || silben.some((s) => !s)) continue;
      const liste = woerter.get(m[1]) ?? [];
      if (!liste.some((l) => l.join(' ') === silben.join(' '))) liste.push(silben);
      woerter.set(m[1], liste);
      // Zeichen ohne eigenen Eintrag bekommen ihre Lesungen aus Wörtern.
      schrift.forEach((z, i) => {
        if (!zeichen.has(z)) zeichen.set(z, new Set());
        zeichen.get(z).add(silben[i]);
      });
    }
  }
  for (const [z, lesungen] of zeichen) {
    const eigene = woerter.get(z);
    if (eigene) zeichen.set(z, new Set(eigene.map((l) => l[0])));
    else zeichen.set(z, lesungen);
  }
  return { woerter, zeichen };
}

let geladen;
/** Das Wörterbuch aus `_Local/woerterbuch/`, oder null, wenn es fehlt. */
function woerterbuch() {
  if (geladen === undefined) geladen = fs.existsSync(DATEI) ? leseCedict(fs.readFileSync(DATEI, 'utf8')) : null;
  return geladen;
}

/** Eine Silbe gegen eine Wörterbuch-Lesung: 'ok' | 'neutral' | 'fehler'. */
function vergleiche(unser, buch, zeichen) {
  if (unser === buch) return 'ok';
  if (zeichen === '儿' && unser === 'r5') return 'ok';
  const [ub, ut] = [unser.slice(0, -1), unser.slice(-1)];
  const [bb, bt] = [buch.slice(0, -1), buch.slice(-1)];
  if (ub !== bb) return 'fehler';
  if (zeichen === '一' && bt === '1' && (ut === '2' || ut === '4')) return 'ok';
  if (zeichen === '不' && bt === '4' && ut === '2') return 'ok';
  return ut === '5' || bt === '5' ? 'neutral' : 'fehler';
}

/** Wort-Silben („nǎr“ → „nǎ“ + „r“), passend zu den Zeichen (哪儿). */
function mitErhua(silben) {
  return silben.flatMap((silbe) => {
    const basis = ohneTon(silbe.normalize('NFC').toLowerCase());
    return !SILBEN.has(basis) && basis.endsWith('r') && SILBEN.has(basis.slice(0, -1)) ? [silbe.slice(0, -1), 'r'] : [silbe];
  });
}

/** Silben eines Pinyin-Satzes in Reihenfolge, oder null. */
function satzSilbenListe(pinyin) {
  const woerter = pinyin.normalize('NFC').replace(/[.,!?;:"“”()…，。？！：；、《》—–-]/g, ' ').split(/\s+/).filter(Boolean);
  const silben = [];
  for (const w of woerter) {
    const teile = zerlege(w);
    if (!teile) return null;
    silben.push(...teile);
  }
  return silben;
}

const zeige = (s) => s.replace(/5$/, '');

// Partikel mit neutralem Ton: 迟到了 enthält 到了 (dàoliǎo, „schließlich“),
// 穿着 das Nomen chuānzhuó — gemeint ist fast immer die Partikel.
const PARTIKEL = new Set(Array.from('的地得着了过么呢吧啊'));
// Wörterbuchwörter, deren Zeichenfolge im Alltag fast immer anders gemeint ist.
const SELTEN_GEMEINT = new Set(['都会']); // 都会 dōu huì „werden alle“, selten dūhuì „Großstadt“

/**
 * Prüft Text gegen Silben (je Han-Zeichen eine). Zerlegt den Text so in
 * Wörterbuchwörter, dass möglichst wenige Zeichen auffallen.
 * Ergebnis: { befunde: [{ art, stelle, unser, buch }] } oder { nichtPruefbar }.
 */
function pruefe(buch, text, silben) {
  if (/[0-9A-Za-z０-９]/.test(text)) return { nichtPruefbar: 'Ziffern oder lateinische Buchstaben' };
  const zeichen = Array.from(text.normalize('NFC')).filter((z) => HAN.test(z));
  if (zeichen.length !== silben.length) return { nichtPruefbar: `${zeichen.length} Zeichen, aber ${silben.length} Silben` };
  const unser = silben.map(schluessel);
  const n = zeichen.length;
  const best = new Array(n + 1);
  best[n] = { kosten: 0 };
  for (let i = n - 1; i >= 0; i -= 1) {
    let wahl = null;
    for (let laenge = Math.min(MAX_WORT, n - i); laenge >= 1; laenge -= 1) {
      const wort = zeichen.slice(i, i + laenge).join('');
      for (const lesung of buch.woerter.get(wort) ?? []) {
        const urteile = lesung.map((b, k) => vergleiche(unser[i + k], b, zeichen[i + k]));
        if (urteile.includes('fehler')) continue;
        // Kleiner Aufschlag je Stück: lieber ein langes Wort als Einzelzeichen.
        const kosten = urteile.filter((u) => u === 'neutral').length + 0.01 + best[i + laenge].kosten;
        if (!wahl || kosten < wahl.kosten) wahl = { kosten, laenge, urteile, lesung };
      }
    }
    if (!wahl) {
      const bekannt = buch.zeichen.get(zeichen[i]);
      wahl = { kosten: (bekannt ? 100 : 1) + best[i + 1].kosten, laenge: 1, art: bekannt ? 'fehler' : 'unbekannt' };
    }
    best[i] = wahl;
  }
  const befunde = [];
  const woerterImText = [];
  for (let i = 0; i < n; i += best[i].laenge) {
    if (!best[i].art && best[i].laenge > 1) woerterImText.push([i, i + best[i].laenge]);
  }
  for (let i = 0; i < n; i += best[i].laenge) {
    const schritt = best[i];
    if (schritt.art) {
      befunde.push({ art: schritt.art, stelle: zeichen[i], unser: zeige(unser[i]), buch: [...(buch.zeichen.get(zeichen[i]) ?? [])].map(zeige).join('/') });
      continue;
    }
    schritt.urteile.forEach((u, k) => {
      if (u === 'neutral') befunde.push({ art: 'neutral', stelle: zeichen[i + k], unser: zeige(unser[i + k]), buch: zeige(schritt.lesung[k]) });
    });
  }
  // Verdacht: Ein Wörterbuchwort im Text, dessen Lesungen alle nicht passen,
  // obwohl jedes Zeichen für sich eine mögliche Lesung hat. Nicht, wenn ein
  // passendes längeres Wort die Stelle überdeckt oder schneidet (牛奶和面包:
  // 面包 schneidet 和面), und nicht bei Partikeln mit neutralem Ton.
  for (let i = 0; i < n; i += 1) {
    for (let laenge = 2; laenge <= Math.min(MAX_WORT, n - i); laenge += 1) {
      const wort = zeichen.slice(i, i + laenge).join('');
      const lesungen = buch.woerter.get(wort);
      if (!lesungen || SELTEN_GEMEINT.has(wort)) continue;
      if (woerterImText.some(([a, b]) => a < i + laenge && b > i)) continue;
      if (zeichen.slice(i, i + laenge).some((z, k) => PARTIKEL.has(z) && unser[i + k].endsWith('5'))) continue;
      const passt = lesungen.some((l) => l.every((b, k) => vergleiche(unser[i + k], b, zeichen[i + k]) !== 'fehler'));
      const einzelnOk = zeichen.slice(i, i + laenge).every((z, k) => [...(buch.zeichen.get(z) ?? [])].some((b) => vergleiche(unser[i + k], b, z) !== 'fehler'));
      if (!passt && einzelnOk) {
        befunde.push({ art: 'verdacht', stelle: wort, unser: unser.slice(i, i + laenge).map(zeige).join(' '), buch: lesungen.map((l) => l.map(zeige).join(' ')).join(' / ') });
      }
    }
  }
  return { befunde };
}

/** Kurzform für die Bau- und Prüfwerkzeuge: nur Fehler als Text, sonst leer. */
function fehlerText(buch, text, silben) {
  const ergebnis = pruefe(buch, text, silben);
  if (ergebnis.nichtPruefbar) return [];
  return ergebnis.befunde.filter((b) => b.art === 'fehler').map((b) => `${b.stelle} als „${b.unser}“, Wörterbuch: ${b.buch}`);
}

function katalog(alles) {
  const buch = woerterbuch();
  if (!buch) throw Error(`Wörterbuch fehlt: ${path.relative(ROOT, DATEI)} (siehe Kopf dieser Datei)`);
  const k = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/catalog.json'), 'utf8'));
  const zaehler = { geprueft: 0, nichtPruefbar: 0, fehler: 0, verdacht: 0, neutral: 0, unbekannt: 0 };
  const zeilen = [];
  const melde = (wo, text, silben) => {
    const ergebnis = silben ? pruefe(buch, text, silben) : { nichtPruefbar: 'Pinyin nicht zerlegbar' };
    if (ergebnis.nichtPruefbar) { zaehler.nichtPruefbar += 1; return; }
    zaehler.geprueft += 1;
    for (const b of ergebnis.befunde) {
      zaehler[b.art] += 1;
      if (b.art === 'neutral' && !alles) continue;
      zeilen.push(`${b.art.padEnd(9)} ${wo}: ${b.stelle} „${b.unser}“ — Wörterbuch ${b.buch}   [${text}]`);
    }
  };
  for (const e of k.entries) {
    if (e.kind === 'vocabulary' && e.document.language === 'zh') {
      const d = e.document;
      melde(`${d.id} Wort`, d.term, mitErhua((d.syllables ?? []).map((s) => s.roman)));
      if (d.exampleTerm && d.exampleRoman) melde(`${d.id} Satz`, d.exampleTerm, satzSilbenListe(d.exampleRoman));
    }
    if (e.kind === 'situations' && /_to_zh-/.test(e.id)) {
      e.document.scriptTurns.forEach((t, i) => melde(`${e.id} Zug ${i + 1}`, t.targetText, satzSilbenListe(t.roman)));
    }
  }
  const reihenfolge = ['fehler', 'verdacht', 'unbekannt', 'neutral'];
  zeilen.sort((a, b) => reihenfolge.indexOf(a.split(' ')[0]) - reihenfolge.indexOf(b.split(' ')[0]));
  for (const z of zeilen) console.log(z);
  console.log(`\n${zaehler.geprueft} Texte geprüft, ${zaehler.nichtPruefbar} nicht prüfbar (Ziffern, Latein). `
    + `Fehler ${zaehler.fehler}, Verdacht ${zaehler.verdacht}, unbekannte Zeichen ${zaehler.unbekannt}, neutraler Ton ${zaehler.neutral}${alles ? '' : ' (Liste mit --alles)'}.`);
  if (zaehler.fehler) process.exitCode = 1;
}

if (require.main === module) {
  const [befehl, ...rest] = process.argv.slice(2);
  if (befehl === 'katalog') katalog(rest.includes('--alles'));
  else if (befehl === 'text' && rest.length >= 2) {
    const buch = woerterbuch();
    if (!buch) throw Error(`Wörterbuch fehlt: ${path.relative(ROOT, DATEI)}`);
    console.log(JSON.stringify(pruefe(buch, rest[0], satzSilbenListe(rest.slice(1).join(' ')) ?? []), null, 1));
  } else {
    console.log('Aufruf: node content-plan/pinyin-woerterbuch.cjs katalog [--alles] | text <hanzi> <pinyin>');
    process.exitCode = 1;
  }
}

module.exports = { leseCedict, woerterbuch, pruefe, fehlerText, mitErhua, satzSilbenListe, schluessel };
