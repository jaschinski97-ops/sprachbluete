// Tonbericht je Stimme und Sprechanweisung (17.10.2026).
//
// Misst die einsilbigen Thai-Wortclips des Katalogs und vergleicht die
// Gruppen „Stimme × instructionsId“. Gedacht für den Vergleich nach einem
// kleinen Probelauf mit Sprechanweisung (src/lib/clips/tts-instructions.ts):
// Werden mittlere Töne ebener, enden tiefe tiefer, trennt sich fallend?
//
// Kennzahlen (Halbtöne; nur lebende, lange Silben ≥ 300 ms, damit kurze tote
// Silben die Formen nicht verzerren):
//   Abfall mittel   Median Ende−Anfang eines mittleren Tons. Microsoft-Referenz
//                   (AE-31, Niwat/Premwadee): −2,6 bzw. −4,2.
//   tief < mittel   Wahrscheinlichkeit, dass ein tiefes Wort tiefer endet als
//                   ein mittleres (0,5 = Zufall, 1 = sauber getrennt).
//   fallend ≠ mittel  dieselbe Trennschärfe über die Bauchform (früher Gipfel,
//                   später Absturz).
// Aufruf: npm run content:tone-report [-- --alle]
const fs = require('node:fs');
const path = require('node:path');
const domain = require('./domain.cjs');
const { decodeAudio } = require('./media.cjs');
const { analyzeToneContour, konturBewegung } = domain.load('src/lib/speaking/analysis');

const root = path.resolve(__dirname, '../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/content/catalog.json'), 'utf8'));
const woerter = new Map(catalog.entries
  .filter((entry) => entry.kind === 'vocabulary' && entry.document.language === 'th')
  .map((entry) => [entry.document.id, entry.document]));

const halbton = (hz) => 12 * Math.log2(hz / 100);
const tot = (roman) => /[ktp]$/.test(String(roman).normalize('NFD').replace(/[̀-ͯ]/g, ''));
const median = (werte) => {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
function trennschaerfe(kleiner, groesser) {
  if (!kleiner.length || !groesser.length) return null;
  let summe = 0;
  for (const a of kleiner) for (const b of groesser) summe += a < b ? 1 : a === b ? 0.5 : 0;
  return summe / (kleiner.length * groesser.length);
}

const messungen = [];
for (const entry of catalog.entries) {
  if (entry.kind !== 'audio' || entry.document.language !== 'th' || entry.document.kind !== 'vocab') continue;
  const wort = woerter.get(entry.document.sourceId);
  if (!wort || wort.syllables?.length !== 1 || !wort.syllables[0].tone) continue;
  let messung;
  try { messung = analyzeToneContour(decodeAudio(path.join(root, 'assets/content', entry.asset)), 24000); }
  catch { continue; }
  if (messung.status !== 'measured') continue;
  const span = messung.span;
  const pts = messung.summary.pts;
  messungen.push({
    gruppe: `${entry.document.voice} · ${entry.document.instructionsId ?? 'ohne Anweisung'}`,
    ton: wort.syllables[0].tone,
    lebendLang: !tot(wort.romanization) && messung.summary.durMs >= 300,
    gate: entry.check?.tone?.status,
    abfall: messung.summary.slope,
    ende: halbton(span[span.length - 1].f0),
    bauch: (pts[0] + pts[5]) / 2 - (pts[2] + pts[3]) / 2,
    bewegung: konturBewegung(messung.summary),
  });
}

const zahl = (wert, stellen = 1) => (wert === null || wert === undefined ? '–' : wert.toFixed(stellen).replace('.', ','));
const bericht = { gemessenAm: new Date().toISOString(), gruppen: [] };
for (const gruppe of [...new Set(messungen.map((m) => m.gruppe))].sort()) {
  const alle = messungen.filter((m) => m.gruppe === gruppe);
  const lang = alle.filter((m) => m.lebendLang);
  const je = (ton, liste = lang) => liste.filter((m) => m.ton === ton);
  const eintrag = {
    gruppe,
    clips: alle.length,
    jeTon: Object.fromEntries(['mid', 'low', 'falling', 'high', 'rising'].map((ton) => [ton, {
      n: je(ton, alle).length,
      tonGateBestanden: je(ton, alle).filter((m) => m.gate === 'passed').length,
      abfallMedian: median(je(ton).map((m) => m.abfall)),
      endeMedian: median(je(ton).map((m) => m.ende)),
    }])),
    abfallMittel: median(je('mid').map((m) => m.abfall)),
    mittelSteilerAlsReferenz: je('mid').length ? je('mid').filter((m) => m.abfall < -4.2).length / je('mid').length : null,
    tiefUnterMittel: trennschaerfe(je('low').map((m) => m.ende), je('mid').map((m) => m.ende)),
    fallendGegenMittel: trennschaerfe(je('falling').map((m) => m.bauch), je('mid').map((m) => m.bauch)),
  };
  bericht.gruppen.push(eintrag);
}

const ziel = path.join(root, 'pipeline/reports');
fs.mkdirSync(ziel, { recursive: true });
fs.writeFileSync(path.join(ziel, 'tone-report.json'), JSON.stringify(bericht, null, 2) + '\n');

console.log(`Tonbericht: ${messungen.length} einsilbige Thai-Wortclips gemessen (Bericht: pipeline/reports/tone-report.json)`);
for (const g of bericht.gruppen) {
  console.log(`\n${g.gruppe} — ${g.clips} Clips`);
  console.log('  Ton       n  Ton-Gate  Abfall  Ende (nur lebende, lange Silben)');
  for (const [ton, t] of Object.entries(g.jeTon)) {
    if (!t.n) continue;
    console.log(`  ${ton.padEnd(8)} ${String(t.n).padStart(3)}  ${String(t.tonGateBestanden).padStart(8)}  ${zahl(t.abfallMedian).padStart(6)}  ${zahl(t.endeMedian).padStart(5)}`);
  }
  console.log(`  Abfall mittel ${zahl(g.abfallMittel)} Halbtöne (Microsoft-Referenz −2,6 / −4,2); steiler als −4,2: ${g.mittelSteilerAlsReferenz === null ? '–' : `${Math.round(100 * g.mittelSteilerAlsReferenz)} %`}`);
  console.log(`  Trennschärfe tief < mittel (Ende) ${zahl(g.tiefUnterMittel, 2)}, fallend ≠ mittel (Form) ${zahl(g.fallendGegenMittel, 2)} — 0,5 = Zufall, 1 = sauber`);
}
