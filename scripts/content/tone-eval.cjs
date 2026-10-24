// Bewertung des Thai-Ton-Gates am Messkorpus (24.10.2026).
//
// Läuft offline über `_Local/tone-corpus/` (corpus.json + clips/): keine
// Anbieter, kein Studio, kein neues Audio. Misst
//   1. die Entscheidungsquote (bestanden / verworfen / ungeprüft) mit den
//      echten Soll-Tönen, je Clipart, Silbenzahl und Tonfolge;
//   2. falsche Freigaben an SYNTHETISCHEN Negativproben: derselbe Clip gegen
//      absichtlich falsche Soll-Folgen (gegenläufig, verschoben, gemischt,
//      zufällig, genau eine Silbe falsch) und das Signal selbst verändert
//      (zeitlich umgedreht = fallend↔steigend, Tonhöhe eingeebnet).
// Eine Negativprobe ist „Kontur“, wenn sich Soll und Probe an einer
// fallenden/steigenden Silbe unterscheiden (das Gate muss sie fangen), sonst
// „Register“ (nur mittel/tief/hoch vertauscht — ohne Sprecherreferenz schwer).
//
// Aufruf:
//   node scripts/content/tone-eval.cjs --korpus <ordner> [--name vorher]
//        [--worker 6] [--grenze 400]
//   node scripts/content/tone-eval.cjs --vergleich vorher --name nachher
// Ergebnis: measurements/tone-eval/<name>.json und <name>.md (gitignored).
// Die dekodierten Clips (8 kHz) liegen zwischengespeichert unter
// measurements/tone-eval/pcm/, damit Wiederholungen schnell laufen.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const root = path.resolve(__dirname, '../..');
const ausgabe = path.join(root, 'measurements/tone-eval');
const pcmOrdner = path.join(ausgabe, 'pcm');

function argument(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return standard;
  const wert = process.argv[i + 1];
  return wert === undefined || wert.startsWith('--') ? true : wert;
}

// ---------------------------------------------------------------------------
// Negativproben (reine Funktionen, auch für den Skripttest)
// ---------------------------------------------------------------------------

const TOENE = ['mid', 'low', 'falling', 'high', 'rising'];
const KONTUR = new Set(['falling', 'rising']);
const GEGENTEIL = { falling: 'rising', rising: 'falling', high: 'low', low: 'high', mid: 'mid' };

function zufall(saat) {
  let s = 2166136261;
  for (const zeichen of `eval:${saat}`) s = Math.imul(s ^ zeichen.codePointAt(0), 16777619) >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Kontur, wenn sich Soll und Probe an einer fallenden/steigenden Silbe unterscheiden. */
function kategorie(soll, probe) {
  for (let i = 0; i < soll.length; i++) {
    if (soll[i] !== probe[i] && (KONTUR.has(soll[i]) || KONTUR.has(probe[i]))) return 'kontur';
  }
  return 'register';
}

/** Falsche Soll-Folgen zu einer echten; nur solche, die sich wirklich unterscheiden. */
function falscheFolgen(soll, saat) {
  const r = zufall(saat);
  const gleich = (a) => a.join() === soll.join();
  const proben = [];
  const dazu = (art, folge) => { if (folge && !gleich(folge)) proben.push({ art, folge, kat: kategorie(soll, folge) }); };
  dazu('gegenlaeufig', soll.map((ton) => GEGENTEIL[ton]));
  if (soll.length > 1) dazu('verschoben', [...soll.slice(1), soll[0]]);
  if (soll.length > 1) {
    let gemischt = null;
    for (let versuch = 0; versuch < 20 && (!gemischt || gleich(gemischt)); versuch++) {
      gemischt = [...soll];
      for (let i = gemischt.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [gemischt[i], gemischt[j]] = [gemischt[j], gemischt[i]];
      }
    }
    dazu('gemischt', gemischt);
  }
  let zufaellig;
  do zufaellig = soll.map(() => TOENE[Math.floor(r() * TOENE.length)]); while (gleich(zufaellig));
  dazu('zufaellig', zufaellig);
  // Genau EINE Silbe falsch — der häufigste echte TTS-Fehler. Kontur-Silbe
  // → Gegenteil, Register-Silbe → fallend oder steigend.
  const stelle = Math.floor(r() * soll.length);
  const eine = [...soll];
  eine[stelle] = KONTUR.has(soll[stelle]) ? GEGENTEIL[soll[stelle]] : r() < 0.5 ? 'falling' : 'rising';
  dazu('eine-silbe', eine);
  return proben;
}

/** Kategorie einer Signalprobe gegen den echten Soll; null = keine Negativprobe. */
function signalKategorie(art, soll) {
  if (soll.some((ton) => KONTUR.has(ton))) return 'kontur';
  if (art === 'eingeebnet' && soll.every((ton) => ton === 'mid')) return null;
  // Ein umgedrehter hoher Einsilber (Anstieg zum Ende) fällt; gleiche
  // Registertöne in Folge bleiben umgedreht dieselben.
  if (art === 'umgedreht' && soll.length === 1) return soll[0] === 'high' ? 'register' : null;
  if (art === 'umgedreht' && soll.every((ton) => ton === soll[0])) return null;
  return 'register';
}

/** Solltöne eines Korpus-Clips: Wortsilben, Beispiel-Umschrift oder Dialogzug-Umschrift. */
function sollFuerKorpusClip(clip, tonfolgeAusRoman) {
  if (clip.kind === 'vocab') {
    const silben = clip.word?.syllables ?? [];
    if (!silben.length || silben.some((s) => !TOENE.includes(s.tone))) return null;
    return silben.map((s) => s.tone);
  }
  if (clip.kind === 'example') return clip.word?.exampleRoman ? tonfolgeAusRoman(clip.word.exampleRoman) : null;
  if (clip.kind === 'turn' && clip.situation?.roman) {
    return tonfolgeAusRoman(clip.situation.roman.replace(/[.,!?;:"“”'…()]/g, ' '));
  }
  return null;
}

/** Umschrift je Silbe (für den Silbenbau) oder null, wenn die Zahl nicht passt. */
function romanFuerKorpusClip(clip, soll) {
  if (!soll) return null;
  let roman = null;
  if (clip.kind === 'vocab') roman = clip.word?.syllables?.map((s) => s.roman);
  else if (clip.kind === 'example') roman = clip.word?.exampleRoman?.split(/[-\s]+/).filter(Boolean);
  else if (clip.kind === 'turn') roman = clip.situation?.roman?.replace(/[.,!?;:"“”'…()]/g, ' ').split(/[-\s]+/).filter(Boolean);
  return roman && roman.length === soll.length && roman.every(Boolean) ? roman : null;
}

// ---------------------------------------------------------------------------
// Worker: misst und urteilt
// ---------------------------------------------------------------------------

function arbeite({ clips, korpus }) {
  const domain = require('./domain.cjs');
  const analyse = domain.load('src/lib/speaking/analysis');
  const gate = domain.load('src/lib/content/tone-gate');
  const { tonfolgeAusRoman } = domain.load('src/lib/content/roman-tone');
  const ergebnisse = [];
  for (const clip of clips) {
    const datei = path.join(pcmOrdner, `${path.basename(clip.file, path.extname(clip.file))}.f32`);
    const roh = fs.readFileSync(datei);
    const pcm = new Float32Array(roh.buffer, roh.byteOffset, roh.byteLength / 4);
    const soll = sollFuerKorpusClip(clip, tonfolgeAusRoman);
    const roman = romanFuerKorpusClip(clip, soll);
    const eintrag = {
      id: clip.id, kind: clip.kind, voice: clip.voice, alt: clip.check?.tone?.status ?? null,
      soll, proben: [],
    };
    if (!soll) { ergebnisse.push(eintrag); continue; }
    const doc = { language: 'th', kind: clip.kind, text: clip.text, sourceId: clip.sourceId };
    const messung = analyse.analyzeToneContour(pcm, 8000);
    const urteil = (m, toene, diagnose = false) => {
      const check = gate.pruefeThaiTonMessung(doc, m, { woerter: [] }, { sollToene: toene, diagnose, ...(roman ? { sollRoman: roman } : {}) });
      return { status: check.status, grund: check.reason.slice(0, 60), silben: check.silben?.map((s) => (s.form === 'gegen' ? 'x' : s.form[0])).join(''),
        ...(check.diagnose ? { diagnose: check.diagnose } : {}) };
    };
    eintrag.echt = urteil(messung, soll, true);
    for (const probe of falscheFolgen(soll, clip.id)) {
      const u = urteil(messung, probe.folge);
      eintrag.proben.push({ art: probe.art, kat: probe.kat, folge: probe.folge, status: u.status, grund: u.grund.slice(0, 24), silben: u.silben });
    }
    const umgedrehtKat = signalKategorie('umgedreht', soll);
    if (umgedrehtKat) {
      const umgedreht = Float32Array.from(pcm).reverse();
      const u = urteil(analyse.analyzeToneContour(umgedreht, 8000), soll);
      eintrag.proben.push({ art: 'umgedreht', kat: umgedrehtKat, status: u.status, grund: u.grund.slice(0, 24), silben: u.silben });
    }
    const flachKat = signalKategorie('eingeebnet', soll);
    if (flachKat) {
      const stimmhaft = messung.frames.filter((f) => f.f0 > 0).map((f) => f.f0).sort((a, b) => a - b);
      if (stimmhaft.length) {
        const mitte = stimmhaft[Math.floor(stimmhaft.length / 2)];
        const flach = messung.frames.map((f) => ({ ...f, f0: f.f0 > 0 ? mitte : 0 }));
        const m = analyse.measureFrames(flach, 8000, 8000);
        const u = urteil(m, soll);
        eintrag.proben.push({ art: 'eingeebnet', kat: flachKat, status: u.status, grund: u.grund.slice(0, 24), silben: u.silben });
      }
    }
    ergebnisse.push(eintrag);
    parentPort.postMessage({ fortschritt: 1 });
  }
  return ergebnisse;
}

// ---------------------------------------------------------------------------
// Hauptprozess: Zwischenspeicher, Verteilung, Tabellen
// ---------------------------------------------------------------------------

function dekodiere(datei, ziel, downsampleForF0) {
  return new Promise((fertig, fehler) => {
    execFile(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', datei, '-map', '0:a:0', '-vn',
      '-ac', '1', '-ar', '24000', '-f', 'f32le', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return fehler(err);
      const pcm24 = new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4);
      // Dieselbe Vorverarbeitung wie analyzeToneContour (24 kHz → 8 kHz).
      const { samples } = downsampleForF0(Float32Array.from(pcm24), 24000);
      fs.writeFileSync(ziel, Buffer.from(samples.buffer));
      fertig();
    });
  });
}

async function zwischenspeicher(clips, korpus) {
  fs.mkdirSync(pcmOrdner, { recursive: true });
  const { downsampleForF0 } = require('./domain.cjs').load('src/lib/speaking/analysis');
  const offen = clips.filter((clip) => !fs.existsSync(path.join(pcmOrdner, `${path.basename(clip.file, path.extname(clip.file))}.f32`)));
  if (!offen.length) return;
  process.stderr.write(`Dekodiere ${offen.length} Clips …\n`);
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < offen.length) {
      const clip = offen[i++];
      await dekodiere(path.join(korpus, clip.file), path.join(pcmOrdner, `${path.basename(clip.file, path.extname(clip.file))}.f32`), downsampleForF0);
    }
  }));
}

const anteil = (n, von) => (von ? `${((100 * n) / von).toFixed(1).replace('.', ',')} %` : '–');

function zaehle(liste) {
  const z = { n: liste.length, passed: 0, failed: 0, unchecked: 0 };
  for (const status of liste) if (status in z) z[status] += 1;
  return z;
}

function zeile(name, z) {
  return `| ${name} | ${z.n} | ${anteil(z.passed, z.n)} | ${anteil(z.failed, z.n)} | ${anteil(z.unchecked, z.n)} |`;
}

function bericht(ergebnisse, name) {
  const mitSoll = ergebnisse.filter((e) => e.echt);
  const zeilen = [`# Ton-Gate-Bewertung „${name}“`, '', `Stand: ${new Date().toISOString()}, ${mitSoll.length} Clips mit Soll-Tönen (von ${ergebnisse.length}).`, ''];
  const tabelle = (titel, gruppen) => {
    zeilen.push(`## ${titel}`, '', '| Gruppe | n | bestanden | verworfen | ungeprüft |', '|---|---:|---:|---:|---:|');
    for (const [gruppe, liste] of gruppen) zeilen.push(zeile(gruppe, zaehle(liste)));
    zeilen.push('');
  };
  const gruppiere = (liste, schluessel, wert) => {
    const karte = new Map();
    for (const e of liste) {
      const k = schluessel(e);
      if (!karte.has(k)) karte.set(k, []);
      karte.get(k).push(wert(e));
    }
    return [...karte.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'de', { numeric: true }));
  };
  const echt = (e) => e.echt.status;
  tabelle('Echte Soll-Töne: gesamt', [['alle', mitSoll.map(echt)], ...gruppiere(mitSoll.filter((e) => e.kind !== 'turn'), () => 'ohne Dialogzüge', echt)]);
  tabelle('Echte Soll-Töne je Clipart', gruppiere(mitSoll, (e) => e.kind, echt));
  tabelle('Echte Soll-Töne je Stimme', gruppiere(mitSoll, (e) => e.voice, echt));
  tabelle('Echte Soll-Töne je Silbenzahl', gruppiere(mitSoll, (e) => (e.soll.length >= 9 ? '9+' : String(e.soll.length)), echt));
  tabelle('Einsilber je Ton', gruppiere(mitSoll.filter((e) => e.soll.length === 1), (e) => e.soll[0], echt));
  tabelle('Echte Soll-Töne je altem Status', gruppiere(mitSoll, (e) => `alt ${e.alt}`, echt));
  const folgen = gruppiere(mitSoll.filter((e) => e.soll.length <= 3), (e) => e.soll.join('-'), echt).filter(([, l]) => l.length >= 15);
  tabelle('Häufige Tonfolgen (≤ 3 Silben, n ≥ 15)', folgen);
  const proben = mitSoll.flatMap((e) => e.proben.map((p) => ({ ...p, n: e.soll.length })));
  zeilen.push('## Negativproben (bestanden = FALSCHE Freigabe)', '');
  tabelle('Negativproben je Kategorie', gruppiere(proben, (p) => p.kat, (p) => p.status));
  tabelle('Negativproben je Art und Kategorie', gruppiere(proben, (p) => `${p.art} · ${p.kat}`, (p) => p.status));
  const falsch = proben.filter((p) => p.status === 'passed' && p.grund);
  zeilen.push('## Falsche Freigaben je Prüfweg', '', '| Prüfweg (Grundanfang) | n |', '|---|---:|');
  for (const [weg, liste] of gruppiere(falsch, (p) => p.grund.replace(/\d+/g, '#'), () => 1).sort((a, b) => b[1].length - a[1].length)) zeilen.push(`| ${weg} | ${liste.length} |`);
  zeilen.push('');
  tabelle('Kontur-Negativproben je Silbenzahl', gruppiere(proben.filter((p) => p.kat === 'kontur'), (p) => (p.n >= 9 ? '9+' : String(p.n)), (p) => p.status));
  const gruende = gruppiere(mitSoll.filter((e) => e.echt.status === 'unchecked'), (e) => e.echt.grund.replace(/\d+/g, '#'), () => 'unchecked')
    .sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  zeilen.push('## Häufigste Gründe für „ungeprüft“ (echte Soll-Töne)', '', '| Grund | n |', '|---|---:|');
  for (const [grund, liste] of gruende) zeilen.push(`| ${grund} | ${liste.length} |`);
  const verworfen = mitSoll.filter((e) => e.echt.status === 'failed');
  zeilen.push('', `## Verworfen mit echten Soll-Tönen: ${verworfen.length}`, '', 'Der Korpus enthält nur Clips, die das alte Gate NICHT verworfen hat — jeder Verwurf hier ist entweder ein echter Fang oder ein unnötiger Verwurf.', '');
  for (const e of verworfen.slice(0, 40)) zeilen.push(`- ${e.id} (${e.kind}, ${e.soll.join('-')}, alt ${e.alt}): ${e.echt.grund}`);
  return `${zeilen.join('\n')}\n`;
}

/**
 * Vorher/Nachher auf denselben Clips und denselben Proben (id + Art): die
 * Zahlen, an denen eine Gate-Änderung gemessen wird.
 */
function vergleich(alt, neu) {
  const altKarte = new Map(alt.ergebnisse.filter((e) => e.echt).map((e) => [e.id, e]));
  const paare = neu.ergebnisse.filter((e) => e.echt && altKarte.has(e.id)).map((e) => [altKarte.get(e.id), e]);
  const kennzahlen = (welche) => {
    const echt = (filter) => zaehle(paare.filter(([a]) => filter(a)).map((p) => p[welche].echt.status));
    const proben = (filter) => {
      const liste = [];
      for (const [a, n] of paare) {
        const andere = new Map(n.proben.map((p) => [p.art, p]));
        for (const p of a.proben) {
          const gegenstueck = andere.get(p.art);
          if (!gegenstueck || !filter(p, a)) continue;
          liste.push((welche === 0 ? p : gegenstueck).status);
        }
      }
      return zaehle(liste);
    };
    return {
      alle: echt(() => true),
      einsilber: echt((e) => e.soll.length === 1),
      mehrsilber: echt((e) => e.soll.length > 1),
      altUngeprueft: echt((e) => e.alt === 'unchecked'),
      kontur: proben((p) => p.kat === 'kontur'),
      register: proben((p) => p.kat === 'register'),
      eineSilbe: proben((p) => p.art === 'eine-silbe'),
      umgedreht: proben((p) => p.art === 'umgedreht' && p.kat === 'kontur'),
      eingeebnet: proben((p) => p.art === 'eingeebnet' && p.kat === 'kontur'),
    };
  };
  const vorher = kennzahlen(0);
  const nachher = kennzahlen(1);
  const zeilen = [`# Vergleich „${alt.name}“ → „${neu.name}“`, '', `${paare.length} gemeinsame Clips mit Soll-Tönen.`, '',
    '| Messgröße | n | vorher | nachher |', '|---|---:|---:|---:|'];
  const dazu = (name, schluessel, feld) => zeilen.push(`| ${name} | ${vorher[schluessel].n} | ${anteil(vorher[schluessel][feld], vorher[schluessel].n)} | ${anteil(nachher[schluessel][feld], nachher[schluessel].n)} |`);
  dazu('Echte Soll-Töne bestanden', 'alle', 'passed');
  dazu('Echte Soll-Töne verworfen', 'alle', 'failed');
  dazu('… Einsilber bestanden', 'einsilber', 'passed');
  dazu('… Mehrsilber bestanden', 'mehrsilber', 'passed');
  dazu('… früher ungeprüft, jetzt bestanden', 'altUngeprueft', 'passed');
  dazu('FALSCHE Freigabe: Kontur-Negativproben', 'kontur', 'passed');
  dazu('FALSCHE Freigabe: genau eine Silbe falsch', 'eineSilbe', 'passed');
  dazu('FALSCHE Freigabe: Signal umgedreht', 'umgedreht', 'passed');
  dazu('FALSCHE Freigabe: Signal eingeebnet', 'eingeebnet', 'passed');
  dazu('FALSCHE Freigabe: Register-Negativproben', 'register', 'passed');
  dazu('Kontur-Negativproben verworfen', 'kontur', 'failed');
  return `${zeilen.join('\n')}\n`;
}

async function main() {
  const vergleichMit = argument('vergleich', null);
  if (vergleichMit) {
    // Nur vergleichen: --vergleich <alt> --name <neu>, beide aus measurements/tone-eval/.
    const lies = (name) => JSON.parse(fs.readFileSync(path.join(ausgabe, `${name}.json`), 'utf8'));
    const text = vergleich(lies(String(vergleichMit)), lies(String(argument('name', 'bewertung'))));
    fs.writeFileSync(path.join(ausgabe, `vergleich-${vergleichMit}-${argument('name', 'bewertung')}.md`), text);
    process.stdout.write(text);
    return;
  }
  const korpus = path.resolve(String(argument('korpus', path.join(root, '_Local/tone-corpus'))));
  const name = String(argument('name', 'bewertung'));
  const worker = Number(argument('worker', Math.min(6, os.cpus().length)));
  const grenze = Number(argument('grenze', 0));
  const daten = JSON.parse(fs.readFileSync(path.join(korpus, 'corpus.json'), 'utf8'));
  let clips = daten.clips.filter((clip) => fs.existsSync(path.join(korpus, clip.file)));
  // Stichprobe gleichmäßig über den Korpus, nicht nur der Anfang.
  if (grenze > 0 && clips.length > grenze) {
    const schritt = clips.length / grenze;
    clips = Array.from({ length: grenze }, (_, i) => clips[Math.floor(i * schritt)]);
  }
  await zwischenspeicher(clips, korpus);
  const teile = Array.from({ length: worker }, (_, w) => clips.filter((_, i) => i % worker === w));
  let erledigt = 0;
  const start = Date.now();
  const ergebnisse = (await Promise.all(teile.map((teil) => new Promise((fertig, fehler) => {
    const w = new Worker(__filename, { workerData: { clips: teil, korpus } });
    w.on('message', (nachricht) => {
      if (nachricht.fortschritt) {
        erledigt += 1;
        if (erledigt % 250 === 0) process.stderr.write(`${erledigt}/${clips.length} (${Math.round((Date.now() - start) / 1000)} s)\n`);
      } else fertig(nachricht.ergebnisse);
    });
    w.on('error', fehler);
  })))).flat();
  fs.mkdirSync(ausgabe, { recursive: true });
  fs.writeFileSync(path.join(ausgabe, `${name}.json`), JSON.stringify({ name, korpus, clips: ergebnisse.length, ergebnisse }));
  const text = bericht(ergebnisse, name);
  fs.writeFileSync(path.join(ausgabe, `${name}.md`), text);
  process.stdout.write(text);
}

if (!isMainThread) {
  parentPort.postMessage({ ergebnisse: arbeite(workerData) });
} else if (require.main === module) {
  main().catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { falscheFolgen, kategorie, signalKategorie, sollFuerKorpusClip, vergleich };
