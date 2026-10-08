// Admin-Werkzeug: alle fehlenden Audios direkt vom Anbieter erzeugen — als
// Node-Lauf fuer grosse Mengen (das Web-Studio kann seit der Nachmessung vom
// 2026-09-08 ebenfalls direkt zu OpenAI, siehe providers/types.ts; fuer
// tausende Clips ist der Skriptweg fortsetzbar und unbeaufsichtigt). Der Weg
// nutzt exakt dieselbe Ablage wie der Studio-Lauf: /stage validiert,
// komprimiert (mp3 64k mono 24 kHz) und misst den Thai-Ton; /publish
// uebernimmt nur Bestandenes (oder Ungeprueftes) in Katalog, assets/content
// und Berichte.
//
// Aufruf (Schluessel nur aus der Umgebung, nie in eine Datei):
//   OPENAI_API_KEY=sk-... node scripts/content/generate-audio.cjs [--limit N] [--no-publish]
//
// Umfang: exakt der Bedarf aus src/lib/content/audio-plan (planDeliveryAudio)
// ueber alle Sprachen + deutsche Begriffe + Pruefungsaudio + die Zuege aller
// AUSGELIEFERTEN Situationen. Lauf ist fortsetzbar: was im Katalog steht
// oder bereits fehlerfrei gestagt ist, wird uebersprungen; gepublished wird
// alle BATCH_SIZE Clips, damit ein Abbruch wenig verliert und der Node-Helper
// keinen Riesen-Request sieht.

const path = require('node:path');
const fs = require('node:fs');
const domain = require('./domain.cjs');
const { decodeAudio } = require('./media.cjs');
const { tryWriteProtocol } = require('../pipeline/protocol.cjs');
const { loadEnvLocal } = require('../pipeline/env.cjs');

// .env.local (gitignored) füllt leere Umgebungsvariablen — echte env gewinnt.
loadEnvLocal();
const { checkThaiTone } = domain.load('src/lib/content/tone-gate');
const { planDeliveryAudio } = domain.load('src/lib/content/audio-plan');
const root = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 0;
if (limitIndex >= 0 && (!Number.isInteger(limit) || limit <= 0)) {
  console.error('Ungueltiger Wert fuer --limit (positive ganze Zahl erwartet).');
  process.exit(1);
}
const publish = !args.includes('--no-publish');
const MODEL = 'gpt-4o-mini-tts-2025-12-15';
const VOICE = process.env.TTS_VOICE || 'coral';
const HELPER = 'http://127.0.0.1:8082';
const ORIGIN = 'http://localhost:8081';
const DELAY_MS = 300;
const BATCH_SIZE = 200;
const workDir = path.join(root, '.content-studio');
const inputFile = path.join(workDir, `generate-input-${process.pid}.wav`);
const key = process.env.OPENAI_API_KEY;
if (!key) { console.error('OPENAI_API_KEY fehlt in der Umgebung.'); process.exit(1); }
// Lauf-Protokoll (pipeline/logs): Zähle den Lauf von Anfang an, damit auch
// Abbrüche und der Nichts-zu-tun-Fall sichtbar bleiben.
const run = { staged: 0, failed: 0, result: 'started', notes: '' };
fs.mkdirSync(workDir, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/content/catalog.json'), 'utf8'));
const delivered = new Set(catalog.entries.filter((e) => e.kind === 'audio').map((e) => e.document.id));
const situations = catalog.entries.filter((e) => e.kind === 'situations').map((e) => e.document);

// Bereits fehlerfrei gestagte Clips (z. B. nach einem abgebrochenen Publish)
// nicht noch einmal bezahlen: sie warten nur auf den naechsten Publish.
const stageFile = path.join(workDir, 'stage.json');
const stagedOk = new Set();
if (fs.existsSync(stageFile)) {
  for (const entry of JSON.parse(fs.readFileSync(stageFile, 'utf8')).entries ?? []) {
    if (entry.kind === 'audio' && entry.check?.status !== 'failed' && !delivered.has(entry.id)) stagedOk.add(entry.id);
  }
}

const specs = planDeliveryAudio(situations)
  .filter((spec) => !delivered.has(spec.id) && !stagedOk.has(spec.id))
  .slice(0, limit || undefined);

if (specs.length === 0 && stagedOk.size === 0) {
  console.log('Nichts zu tun: alle Audios dieses Umfangs liegen im Katalog.');
  run.result = 'nothing-to-do';
  tryWriteProtocol({ script: 'generate-audio', action: 'tts-batch', model: MODEL, voice: VOICE, items: 0, result: 'nothing-to-do', notes: 'alle Audios dieses Umfangs liegen im Katalog' });
  process.exit(0);
}
const byKind = {};
const byLanguage = {};
for (const spec of specs) {
  byKind[spec.kind] = (byKind[spec.kind] ?? 0) + 1;
  byLanguage[spec.language] = (byLanguage[spec.language] ?? 0) + 1;
}
console.log(`Fehlend: ${specs.length} Audios — Sprachen ${JSON.stringify(byLanguage)}, Arten ${JSON.stringify(byKind)} — Modell ${MODEL}, Stimme ${VOICE}.` +
  (stagedOk.size ? ` Dazu warten ${stagedOk.size} bereits gestagte Clips auf den Publish.` : ''));

/**
 * OpenAI liefert WAV mit Streaming-Header: die RIFF- und data-Groessen stehen
 * auf 0xFFFFFFFF. ffmpeg nennt das „corrupt input packet" und -xerror macht
 * es fatal; die App-weg-Messkette (decodeAudio) scheitert dadurch. Hier die
 * echten Groessen eintragen; die data-Chunk-Position wird gesucht, nicht
 * angenommen, und gleich fuer die Dauer mitverwendet.
 */
function normalizeWavHeader(bytes) {
  const result = { bytes, durationMs: null };
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF') return result;
  let offset = 12;
  let dataOffset = -1;
  let byteRate = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ' && offset + 20 <= bytes.length) byteRate = bytes.readUInt32LE(offset + 16);
    if (id === 'data') { dataOffset = offset + 8; break; }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) return result;
  const dataLength = bytes.length - dataOffset;
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.writeUInt32LE(dataLength, dataOffset - 4);
  result.durationMs = byteRate ? Math.round((dataLength / byteRate) * 1000) : null;
  return result;
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError' ||
    error?.cause?.name === 'TimeoutError' || error?.cause?.name === 'AbortError';
}

async function synthesize(text) {
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, voice: VOICE, input: text, response_format: 'wav' }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    const wrapped = new Error(`Anbieter nicht erreichbar (${error.message})`);
    wrapped.retryable = true;
    throw wrapped;
  }
  if (response.status === 429 || response.status >= 500) {
    const error = new Error(`Anbieter antwortet ${response.status}`);
    error.retryable = true;
    throw error;
  }
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Antwort ist kein WAV.');
  return normalizeWavHeader(bytes);
}

async function post(pathname, body, timeoutMs = 120000) {
  const response = await fetch(HELPER + pathname, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`Helper ${response.status}: ${text.slice(0, 200)}`); }
  if (!response.ok) throw new Error(value.error ?? `Helper ${response.status}`);
  return value;
}

async function postWithRetry(pathname, body, timeoutMs) {
  for (let attempt = 1; ; attempt++) {
    try { return await post(pathname, body, timeoutMs); }
    catch (error) {
      const transient = error.cause?.code === 'ECONNRESET' || isTimeout(error) || error.retryable;
      if (attempt >= 3 || !transient) throw error;
      console.log(`  (Wiederholung ${attempt} nach Netzfehler: ${error.message})`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
}

async function publishBatch(count) {
  // Publish dekodiert jeden gestagten Clip erneut — Batches halten den
  // Request im Rahmen des Node-Helper-Timeouts.
  const report = await postWithRetry('/publish', {}, 600000);
  console.log(`  Publish nach ${count}: ${report.entries} ausgeliefert gesamt, ${report.failed} aussortiert, Budget ${(report.budgetBytes / 1024 / 1024).toFixed(1)} / 150 MiB.`);
}

async function main() {
  // Erst der billige Helper-Check — sonst wird ein Clip bezahlt, bevor die
  // Ablage fehlt.
  try {
    const response = await fetch(HELPER + '/state', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Inhaltsstudio-Helper auf ${HELPER} nicht erreichbar (${error.cause?.code ?? error.message}). Im Repo „npm run content:studio" starten.`);
  }

  const started = Date.now();
  const failed = [];
  let staged = 0;
  let sincePublish = stagedOk.size;

  for (const spec of specs) {
    let clip;
    let attempt = 0;
    for (;;) {
      try { clip = await synthesize(spec.text); break; }
      catch (error) {
        attempt += 1;
        if (!error.retryable || attempt >= 3) {
          console.log(`  FEHLER ${spec.text}: ${error.message}`);
          failed.push({ text: spec.text, reason: error.message });
          clip = null;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
      }
    }
    if (!clip) continue;
    const { bytes, durationMs } = clip;

    // Dieselbe Pruefung wie im App-Lauf, nur Node-seitig: erst messen, dann
    // ablegen — ein klarer Widerspruch wird gar nicht erst gestagt.
    // decodeAudio nimmt einen Pfad (ffmpeg), nicht Bytes.
    fs.writeFileSync(inputFile, bytes);
    let check;
    try {
      check = checkThaiTone(spec, decodeAudio(inputFile), 24000);
    } catch (error) {
      console.log(`  FEHLER ${spec.text}: Dekodierung scheiterte (${error.message.split('\n')[0]})`);
      failed.push({ text: spec.text, reason: 'Dekodierung: ' + error.message.split('\n')[0] });
      continue;
    }
    if (check.status === 'failed') {
      console.log(`  ABGELEHNT ${spec.text} (${check.targetTone}): ${check.reason}`);
      failed.push({ text: spec.text, reason: 'Ton-Check: ' + check.reason });
      continue;
    }

    await postWithRetry('/stage', {
      kind: 'audio',
      document: {
        id: spec.id, language: spec.language, text: spec.text, kind: spec.kind,
        sourceId: spec.sourceId, format: 'wav', byteSize: bytes.length,
        durationMs, blobKey: `${spec.id}.wav`,
        provider: 'chatgpt', model: MODEL, voice: VOICE,
        generatedAt: Date.now(), synthetic: true,
      },
      base64: bytes.toString('base64'),
    });
    staged += 1;
    sincePublish += 1;
    if (staged % 25 === 0) {
      const rate = staged / ((Date.now() - started) / 1000 / 60);
      const remaining = (specs.length - staged - failed.length) / rate;
      console.log(`  ${staged}/${specs.length} gestagt (${Math.round(rate)}/min, ~${Math.max(0, Math.round(remaining))} min offen)`);
    }
    if (publish && sincePublish >= BATCH_SIZE) {
      await publishBatch(staged);
      sincePublish = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log(`\nStaging fertig: ${staged} gestagt, ${failed.length} ausgeschieden. Lauf ${(Math.round((Date.now() - started) / 60000))} min.`);
  run.staged = staged;
  run.failed = failed.length;
  run.result = failed.length ? 'partial' : 'ok';
  run.notes = `gestagt ${staged}, ausgeschieden ${failed.length}, Publish ${publish ? 'an' : 'aus'}`;
  tryWriteProtocol({ script: 'generate-audio', action: 'tts-batch', model: MODEL, voice: VOICE, items: staged, checks: { failed: failed.length, reasons: failed.slice(0, 20) }, result: run.result, notes: run.notes });
  if (publish && sincePublish > 0) await publishBatch(staged);
  if (failed.length) {
    console.log('\nAusgeschieden (neu anlaufen lassen oder Stimme wechseln):');
    for (const item of failed) console.log(`  ${item.text}: ${item.reason}`);
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    tryWriteProtocol({ script: 'generate-audio', action: 'tts-batch', model: MODEL, voice: VOICE, items: run.staged, result: 'error', notes: String(error.message ?? error).slice(0, 300) });
  })
  .finally(() => { fs.rmSync(inputFile, { force: true }); });
