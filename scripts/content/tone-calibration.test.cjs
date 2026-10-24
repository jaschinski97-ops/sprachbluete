const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const domain = require('./domain.cjs');
const { startStimme, speichereClip, baueBericht, stand, kalibrierOrdner } = require('./tone-calibration.cjs');
const { createStudio } = require('./studio.cjs');

const { KALIBRIER_WOERTER } = domain.load('src/data/tone-calibration-words');

// Synthetischer Clip: Gleitton mit Obertönen, 24 kHz, 16 Bit mono.
function wav(vonHz, bisHz, sekunden = 0.5) {
  const rate = 24000;
  const n = Math.round(rate * sekunden);
  const daten = Buffer.alloc(n * 2);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const hz = vonHz + (bisHz - vonHz) * (i / n);
    phase += (2 * Math.PI * hz) / rate;
    const huelle = Math.min(1, i / 600, (n - i) / 600);
    const wert = huelle * (0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase));
    daten.writeInt16LE(Math.round(wert * 20000), i * 2);
  }
  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0); kopf.writeUInt32LE(36 + daten.length, 4); kopf.write('WAVE', 8);
  kopf.write('fmt ', 12); kopf.writeUInt32LE(16, 16); kopf.writeUInt16LE(1, 20); kopf.writeUInt16LE(1, 22);
  kopf.writeUInt32LE(rate, 24); kopf.writeUInt32LE(rate * 2, 28); kopf.writeUInt16LE(2, 32); kopf.writeUInt16LE(16, 34);
  kopf.write('data', 36); kopf.writeUInt32LE(daten.length, 40);
  return Buffer.concat([kopf, daten]).toString('base64');
}

const FORM = { mid: [200, 196], low: [185, 165], falling: [240, 160], high: [215, 245], rising: [170, 250] };
const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ton-kalibrierung-'));

test('legt Clips nur unter _Local/tone-calibration ab und prüft die Eingaben', () => {
  const root = tempRoot();
  startStimme(root, { voice: 'Kore', model: 'gemini-3.8-flash-tts', instructionsId: 'th-ton-gemini-1' });
  const wort = KALIBRIER_WOERTER[0];
  const ergebnis = speichereClip(root, { voice: 'Kore', wordId: wort.id, base64: wav(200, 196), format: 'wav' });
  assert.equal(ergebnis.clips, 1);
  assert.ok(fs.existsSync(path.join(root, '_Local/tone-calibration/Kore', `${wort.id}.wav`)));
  assert.equal(kalibrierOrdner(root), path.join(root, '_Local/tone-calibration'));
  assert.throws(() => speichereClip(root, { voice: 'Kore', wordId: 'th-fremd', base64: wav(200, 196), format: 'wav' }), /Kalibriersatz/);
  assert.throws(() => speichereClip(root, { voice: '../x', wordId: wort.id, base64: wav(200, 196), format: 'wav' }), /Stimmname/);
  assert.throws(() => speichereClip(root, { voice: 'Kore', wordId: wort.id, base64: wav(200, 196), format: 'ogg' }), /Format/);
  // Neustart einer Stimme räumt alte Clips weg.
  startStimme(root, { voice: 'Kore' });
  assert.equal(stand(root).voices[0].clips, 0);
});

test('Bericht und Stimm-Referenz aus synthetischen Clips', () => {
  const root = tempRoot();
  for (const voice of ['Kore', 'Charon']) {
    startStimme(root, { voice, model: 'gemini-3.8-flash-tts', instructionsId: 'th-ton-gemini-1' });
    const faktor = voice === 'Kore' ? 1 : 0.6;
    for (const wort of KALIBRIER_WOERTER.filter((w) => w.toene.length === 1).slice(0, 30)) {
      const [von, bis] = FORM[wort.toene[0]];
      speichereClip(root, { voice, wordId: wort.id, base64: wav(von * faktor, bis * faktor), format: 'wav' });
    }
  }
  const bericht = baueBericht(root, { jetzt: new Date('2026-10-24T12:00:00Z') });
  assert.equal(bericht.stimmen.length, 2);
  for (const s of bericht.stimmen) {
    assert.equal(s.gesamt.n, KALIBRIER_WOERTER.length);
    assert.equal(s.gesamt.bestanden + s.gesamt.verworfen + s.gesamt.ungeprueft + s.gesamt.fehlt, s.gesamt.n);
    // 30 Clips abgelegt, der Rest fehlt: nicht aussagekräftig.
    assert.equal(s.gesamt.fehlt, KALIBRIER_WOERTER.length - 30);
    assert.equal(s.geeignet, false);
    assert.equal(s.instructionsId, 'th-ton-gemini-1');
  }
  assert.equal(bericht.empfehlung.stimme, null);
  const kore = bericht.stimmen.find((s) => s.stimme === 'Kore');
  const charon = bericht.stimmen.find((s) => s.stimme === 'Charon');
  assert.ok(kore.stimmlage.medianHz > charon.stimmlage.medianHz * 1.4, 'Stimmlage folgt der Tonhöhe der Clips');

  const ordner = path.join(root, '_Local/tone-calibration');
  const gespeichert = JSON.parse(fs.readFileSync(path.join(ordner, 'report.json'), 'utf8'));
  assert.equal(gespeichert.satzVersion, 'th-kalibrierung-1');
  const referenz = JSON.parse(fs.readFileSync(path.join(ordner, 'Kore/stimm-referenz.json'), 'utf8'));
  assert.equal(referenz.format, 'thaispeaker-stimmreferenz-1');
  assert.equal(referenz.voice, 'Kore');
  assert.ok(referenz.medianHz > 150 && referenz.medianHz < 260);
  assert.deepEqual(Object.keys(referenz.toene).sort(), ['falling', 'high', 'low', 'mid', 'rising']);
  const alle = JSON.parse(fs.readFileSync(path.join(ordner, 'stimm-referenzen.json'), 'utf8'));
  assert.deepEqual(Object.keys(alle.stimmen).sort(), ['Charon', 'Kore']);
  assert.equal(stand(root).report.erstelltAm, '2026-10-24T12:00:00.000Z');
});

test('Studio-Routen: start, clip, report, Stand — nur von der Entwickler-App', async () => {
  const root = tempRoot();
  const server = createStudio(root, { getApiKey: () => '', logRun: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' };
  const post = (pfad, body, h = headers) => fetch(basis + pfad, { method: 'POST', headers: h, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/tone-calibration/start', { voice: 'Kore' })).status, 200);
    const wort = KALIBRIER_WOERTER.find((w) => w.toene.join() === 'rising');
    const clip = await post('/tone-calibration/clip', { voice: 'Kore', wordId: wort.id, base64: wav(170, 250), format: 'wav', model: 'gemini-3.8-flash-tts', instructionsId: 'th-ton-gemini-1' });
    assert.equal(clip.status, 200);
    assert.equal((await clip.json()).clips, 1);
    const fremd = await post('/tone-calibration/clip', { voice: 'Kore', wordId: wort.id, base64: wav(170, 250), format: 'wav' }, { ...headers, Origin: 'https://angreifer.example' });
    assert.equal(fremd.status, 403);
    const falsch = await post('/tone-calibration/clip', { voice: 'Kore', wordId: 'nicht-im-satz', base64: wav(170, 250), format: 'wav' });
    assert.equal(falsch.status, 400);
    const bericht = await (await post('/tone-calibration/report', {})).json();
    assert.equal(bericht.stimmen[0].stimme, 'Kore');
    assert.equal(bericht.stimmen[0].jeTon.rising.n >= 6, true);
    const stand = await (await fetch(`${basis}/tone-calibration`)).json();
    assert.deepEqual(stand.voices.map((v) => [v.voice, v.clips, v.instructionsId]), [['Kore', 1, 'th-ton-gemini-1']]);
    assert.ok(stand.report);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
