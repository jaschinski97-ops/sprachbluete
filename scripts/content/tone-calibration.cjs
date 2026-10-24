// Thai-Kalibrierlauf (24.10.2026): Ablage, Messung und Bericht.
//
// Das Studio erzeugt den festen Kalibriersatz (src/data/tone-calibration-words.ts)
// je Stimme und schickt jeden Clip hierher. Die Clips landen NICHT im
// Katalog, sondern unter _Local/tone-calibration/<stimme>/ (gitignored).
// Der Bericht misst jeden Clip mit dem Ton-Gate und schreibt:
//   _Local/tone-calibration/report.json                 Bericht aller Stimmen
//   _Local/tone-calibration/<stimme>/stimm-referenz.json  Stimmlage je Stimme
//   _Local/tone-calibration/stimm-referenzen.json       alle Referenzen gesammelt
// Aufruf ohne Studio: npm run content:tone-calibration
const fs = require('node:fs');
const path = require('node:path');
const domain = require('./domain.cjs');
const { decodeAudio } = require('./media.cjs');

const ORDNER = path.join('_Local', 'tone-calibration');
const STIMME = /^[A-Za-z][A-Za-z0-9_-]{1,39}$/;
const MODELL = /^[\w.:-]{1,120}$/;
const KENNUNG = /^[\w.-]{1,40}$/;
const MAX_CLIP_BYTES = 8 * 1024 * 1024;

const lade = () => ({
  ...domain.load('src/data/tone-calibration-words'),
  ...domain.load('src/lib/content/tone-calibration'),
  ...domain.load('src/lib/content/tone-gate'),
  ...domain.load('src/lib/speaking/analysis'),
});

const kalibrierOrdner = (root) => path.join(root, ORDNER);

function stimmOrdner(root, stimme) {
  if (typeof stimme !== 'string' || !STIMME.test(stimme)) throw Error('Stimmname ungültig.');
  return path.join(kalibrierOrdner(root), stimme);
}

function leseJson(datei, ersatz) {
  try { return JSON.parse(fs.readFileSync(datei, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return ersatz; throw error; }
}

function schreibeJson(datei, wert) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(wert, null, 2) + '\n');
  fs.renameSync(tmp, datei);
}

/** Beginnt eine Stimme neu: alte Clips weg, damit kein Stand mit alter Anweisung mitzählt. */
function startStimme(root, { voice, model, instructionsId } = {}) {
  const ordner = stimmOrdner(root, voice);
  if (model !== undefined && (typeof model !== 'string' || !MODELL.test(model))) throw Error('Modellname ungültig.');
  if (instructionsId !== undefined && (typeof instructionsId !== 'string' || !KENNUNG.test(instructionsId))) throw Error('Anweisungskennung ungültig.');
  fs.rmSync(ordner, { recursive: true, force: true });
  fs.mkdirSync(ordner, { recursive: true });
  const manifest = { voice, ...(model ? { model } : {}), ...(instructionsId ? { instructionsId } : {}), startedAt: new Date().toISOString(), clips: {} };
  schreibeJson(path.join(ordner, 'manifest.json'), manifest);
  return { voice, cleared: true };
}

/** Legt einen Clip ab. Nur Wörter des Kalibriersatzes, nur wav/mp3. */
function speichereClip(root, { voice, wordId, base64, format, model, instructionsId } = {}) {
  const { findeKalibrierWort } = lade();
  const ordner = stimmOrdner(root, voice);
  if (!findeKalibrierWort(wordId)) throw Error('Wort gehört nicht zum Kalibriersatz.');
  if (!['wav', 'mp3'].includes(format)) throw Error('Format muss wav oder mp3 sein.');
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) throw Error('Audiodaten fehlen.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 100 || bytes.length > MAX_CLIP_BYTES) throw Error('Audiodatei zu klein oder zu groß.');
  if (model !== undefined && (typeof model !== 'string' || !MODELL.test(model))) throw Error('Modellname ungültig.');
  if (instructionsId !== undefined && (typeof instructionsId !== 'string' || !KENNUNG.test(instructionsId))) throw Error('Anweisungskennung ungültig.');
  fs.mkdirSync(ordner, { recursive: true });
  const manifestDatei = path.join(ordner, 'manifest.json');
  const manifest = leseJson(manifestDatei, { voice, clips: {} });
  const alt = manifest.clips[wordId];
  if (alt && alt.file !== `${wordId}.${format}`) fs.rmSync(path.join(ordner, alt.file), { force: true });
  const datei = `${wordId}.${format}`;
  fs.writeFileSync(path.join(ordner, datei), bytes);
  if (model) manifest.model = model;
  if (instructionsId) manifest.instructionsId = instructionsId;
  manifest.clips[wordId] = { file: datei, bytes: bytes.length, generatedAt: new Date().toISOString() };
  schreibeJson(manifestDatei, manifest);
  return { voice, wordId, bytes: bytes.length, clips: Object.keys(manifest.clips).length };
}

function stimmen(root) {
  const ordner = kalibrierOrdner(root);
  if (!fs.existsSync(ordner)) return [];
  return fs.readdirSync(ordner, { withFileTypes: true })
    .filter((eintrag) => eintrag.isDirectory() && STIMME.test(eintrag.name) && fs.existsSync(path.join(ordner, eintrag.name, 'manifest.json')))
    .map((eintrag) => eintrag.name).sort();
}

/** Misst einen Clip: Tonhöhenstrecke und Gate-Urteil. */
function messeClip(datei, wort, d, decode) {
  let pcm;
  try { pcm = decode(datei); }
  catch (error) { return { wortId: wort.id, status: 'fehlt', grund: `Nicht dekodierbar: ${String(error.message ?? error).split('\n')[0]}` }; }
  const messung = d.analyzeToneContour(pcm, 24000);
  const check = d.checkThaiTone({ language: 'th', kind: 'vocab', text: wort.term, sourceId: wort.id }, pcm, 24000, { woerter: d.kalibrierToneWoerter() });
  return {
    wortId: wort.id,
    status: check.status === 'not-applicable' ? 'unchecked' : check.status,
    grund: check.reason,
    ...(messung.status === 'measured' ? {
      referenzHz: messung.referenceHz,
      pts: [...messung.summary.pts],
      spanHz: messung.span.map((frame) => frame.f0).filter((f0) => f0 > 0),
    } : {}),
    ...(check.silben ? { silben: check.silben } : {}),
  };
}

/** Misst alle abgelegten Stimmen und schreibt Bericht und Stimm-Referenzen. */
function baueBericht(root, { decode = decodeAudio, jetzt = new Date() } = {}) {
  const d = lade();
  const laeufe = [];
  for (const stimme of stimmen(root)) {
    const ordner = path.join(kalibrierOrdner(root), stimme);
    const manifest = leseJson(path.join(ordner, 'manifest.json'), { clips: {} });
    const messungen = [];
    for (const wort of d.KALIBRIER_WOERTER) {
      const clip = manifest.clips?.[wort.id];
      if (!clip) continue;
      const datei = path.join(ordner, path.basename(clip.file));
      if (!fs.existsSync(datei)) continue;
      messungen.push(messeClip(datei, wort, d, decode));
    }
    laeufe.push({ stimme, model: manifest.model, instructionsId: manifest.instructionsId, messungen });
  }
  const optionen = { jetzt, toneGateVersion: d.TONE_GATE_VERSION };
  const bericht = d.kalibrierBericht(laeufe, optionen);
  const referenzen = {};
  for (const lauf of laeufe) {
    const referenz = d.stimmReferenz(lauf, { ...optionen, provider: 'gemini' });
    if (!referenz) continue;
    referenzen[lauf.stimme] = referenz;
    schreibeJson(path.join(kalibrierOrdner(root), lauf.stimme, 'stimm-referenz.json'), referenz);
  }
  schreibeJson(path.join(kalibrierOrdner(root), 'report.json'), bericht);
  schreibeJson(path.join(kalibrierOrdner(root), 'stimm-referenzen.json'), {
    format: d.STIMM_REFERENZ_FORMAT, empfohlen: bericht.empfehlung.stimme, stimmen: referenzen,
  });
  return bericht;
}

/** Was liegt schon da — für die Studio-Karte, ohne neu zu messen. */
function stand(root) {
  const liste = stimmen(root).map((stimme) => {
    const manifest = leseJson(path.join(kalibrierOrdner(root), stimme, 'manifest.json'), { clips: {} });
    return { voice: stimme, clips: Object.keys(manifest.clips ?? {}).length, model: manifest.model, instructionsId: manifest.instructionsId };
  });
  return { voices: liste, report: leseJson(path.join(kalibrierOrdner(root), 'report.json'), null) };
}

module.exports = { ORDNER, startStimme, speichereClip, baueBericht, stand, kalibrierOrdner };

if (require.main === module) {
  const root = path.resolve(__dirname, '../..');
  const bericht = baueBericht(root);
  console.log(`Kalibrierbericht (${bericht.satzVersion}, Gate ${bericht.toneGateVersion}) — ${path.join(ORDNER, 'report.json')}`);
  for (const s of bericht.stimmen) {
    const lage = s.stimmlage ? `Median ${s.stimmlage.medianHz} Hz, ${s.stimmlage.p10Hz}–${s.stimmlage.p90Hz} Hz (${s.stimmlage.spannweiteHalbtoene} Halbtöne)` : 'Stimmlage –';
    console.log(`\n${s.stimme}${s.instructionsId ? ` · ${s.instructionsId}` : ''}: ${s.gesamt.bestanden}/${s.gesamt.n} bestanden, ${s.gesamt.verworfen} verworfen, ${s.gesamt.ungeprueft} ungeprüft, ${s.gesamt.fehlt} fehlen · ${lage}`);
    for (const [ton, z] of Object.entries(s.jeTon)) console.log(`  ${ton.padEnd(8)} ${z.bestanden}/${z.n} bestanden, ${z.verworfen} verworfen, ${z.ungeprueft} ungeprüft`);
    console.log(`  Mehrsilber ${s.mehrsilber.bestanden}/${s.mehrsilber.n} bestanden, ${s.mehrsilber.verworfen} verworfen`);
    for (const hinweis of s.hinweise) console.log(`  ⚠ ${hinweis}`);
  }
  console.log(`\n${bericht.empfehlung.text}`);
}
