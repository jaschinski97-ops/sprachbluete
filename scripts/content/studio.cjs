const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { generateLocalImage } = require('./local-image.cjs');
const { generateLocalText } = require('./local-text.cjs');
const { ContentPipeline } = require('./pipeline.cjs');
const { AutomaticDelivery } = require('./automatic-delivery.cjs');
const { tryWriteProtocol } = require('../pipeline/protocol.cjs');
const { loadEnvLocal } = require('../pipeline/env.cjs');

// .env.local (gitignored) füllt leere Umgebungsvariablen — echte env gewinnt.
// Nutzerentscheidung 09.09.2026: Der Schlüssel steht lokal dauerhaft, statt
// bei jedem Sitzungsstart neu gesetzt werden zu müssen.
loadEnvLocal();
// Beide Loopback-Schreibweisen gültig — der Helper selbst wird über
// 127.0.0.1 angesprochen (Review P2-5, 2026-09-09).
const ALLOWED_ORIGINS = new Set(['http://localhost:8081', 'http://127.0.0.1:8081']);
const originAllowed = (origin) => typeof origin === 'string' && ALLOWED_ORIGINS.has(origin);

// ---------------------------------------------------------------------------
// TTS-Proxy für das Web-Studio (ROADMAP v2, Phase 2): Der Browser auf 8081
// kann api.openai.com nicht zuverlässig direkt rufen (CORS kann sich jederzeit
// wieder ändern — gemessen 2026-09-08 offen, 2026-09-03 zu). Der Helper ruft
// stattdessen serverseitig mit OPENAI_API_KEY aus der Umgebung auf und reicht
// die Audiodaten durch. Der Schlüssel verlässt den Prozess nie als Antwort.
// ---------------------------------------------------------------------------

const TTS_LIMITS = {
  maxTextLength: 2000,
  maxRequestsPerMinute: 30,
  maxBodyBytes: 64 * 1024,
  maxAudioBytes: 32 * 1024 * 1024,
  timeoutMs: 60000,
  defaultModel: 'gpt-4o-mini-tts-2025-12-15',
  defaultVoice: 'coral',
};
const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const SAFE_NAME = /^[\w.:-]{1,120}$/;

/** Einfaches gleitendes Fenster (localhost-Einzelplatzwerkzeug, kein Konto). */
function createRateLimiter({ max = TTS_LIMITS.maxRequestsPerMinute, windowMs = 60000, now = Date.now } = {}) {
  const hits = [];
  return function allowRequest() {
    const timestamp = now();
    while (hits.length && timestamp - hits[0] >= windowMs) hits.shift();
    if (hits.length >= max) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - timestamp) / 1000)) };
    hits.push(timestamp);
    return { ok: true };
  };
}

function ttsRequestError(code, message, upstream = false) {
  return Object.assign(new Error(message), { statusCode: code, upstream });
}

/**
 * Der eigentliche Proxy-Handler, vom Server getrennt, damit node:test ihn
 * direkt mit nachgestellten req/res-Objekten und gemocktem fetch Aufruf für
 * Aufruf prüfen kann. Antwortet mit den rohen Audio-Bytes (mp3) oder JSON-
 * Fehlern; der API-Schlüssel wird nie ausgespielt.
 */
async function handleTtsProxy(req, res, {
  getApiKey = () => process.env.OPENAI_API_KEY,
  openaiFetch = fetch,
  logRun = tryWriteProtocol,
  allowRequest = () => ({ ok: true }),
  limits = TTS_LIMITS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  const log = (result, notes) => { try { logRun({ script: 'studio-helper', action: 'openai-tts', items: 1, result, notes }); } catch { /* Protokoll darf nie die Antwort blockieren */ } };
  try {
    // 17.09. Nacht: Ein volles eigenes 30/min-Fenster ist kein Fehler, sondern
    // eine Wartezeit — der Helper stellt den Aufruf nach der vom Fenster
    // genannten Sekundenzahl selbst durch (der Lauf arbeitet damit AM Limit,
    // statt Fehlschläge zu produzieren; der erste Parallelversuch verlor so
    // 139 Aufrufe). Erst nach drei vergeblichen Wartedurchläufen oder über
    // 15 s Wartezeit bleibt es beim ehrlichen 429 an den Lauf.
    let gate = allowRequest();
    let gewartetSekunden = 0;
    for (let versuch = 0; !gate.ok && versuch < 3; versuch += 1) {
      const warteMs = (gate.retryAfterSeconds ?? 1) * 1000;
      if (warteMs > 15000) break;
      gewartetSekunden += Math.round(warteMs / 1000);
      await sleep(warteMs);
      gate = allowRequest();
    }
    if (!gate.ok) throw ttsRequestError(429, `Rate-Limit: maximal ${limits.maxRequestsPerMinute} Aufrufe pro Minute. In ${gate.retryAfterSeconds}s wiederholen.`);
    if (req.headers['content-type'] !== 'application/json') throw ttsRequestError(400, 'Content-Type application/json erwartet.');
    let size = 0;
    const parts = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limits.maxBodyBytes) throw ttsRequestError(413, 'Anfragekörper zu groß.');
      parts.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); }
    catch { throw ttsRequestError(400, 'Ungültiges JSON.'); }
    if (typeof data !== 'object' || data === null) throw ttsRequestError(400, 'JSON-Objekt erwartet.');
    const { text, voice = limits.defaultVoice, model = limits.defaultModel, purpose, instructions } = data;
    if (typeof text !== 'string' || !text.trim()) throw ttsRequestError(400, 'text fehlt oder ist leer.');
    if (text.length > limits.maxTextLength) throw ttsRequestError(400, `text überschreitet ${limits.maxTextLength} Zeichen (${text.length}).`);
    if (typeof model !== 'string' || !SAFE_NAME.test(model)) throw ttsRequestError(400, 'model enthält unerwartete Zeichen.');
    if (typeof voice !== 'string' || !SAFE_NAME.test(voice)) throw ttsRequestError(400, 'voice enthält unerwartete Zeichen.');
    if (purpose !== undefined && (typeof purpose !== 'string' || purpose.length > 200)) throw ttsRequestError(400, 'purpose ist kein kurzer Text.');
    // Sprechanweisung (Thai-Töne, src/lib/clips/tts-instructions.ts) — nur durchgereicht, nie ausgewertet.
    if (instructions !== undefined && (typeof instructions !== 'string' || !instructions.trim() || instructions.length > 1000)) throw ttsRequestError(400, 'instructions ist kein Text bis 1000 Zeichen.');

    const apiKey = getApiKey();
    if (!apiKey) throw ttsRequestError(500, 'OPENAI_API_KEY ist im Helper nicht gesetzt (Umgebung, nicht Datei).');

    let upstream;
    try {
      upstream = await openaiFetch(OPENAI_SPEECH_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, voice, input: text, response_format: 'mp3', ...(instructions ? { instructions } : {}) }),
        signal: AbortSignal.timeout(limits.timeoutMs),
      });
    } catch (error) {
      throw ttsRequestError(502, `OpenAI nicht erreichbar (${error.message}).`, true);
    }
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 200);
      throw ttsRequestError(upstream.status >= 500 ? 502 : upstream.status, `OpenAI ${upstream.status}: ${detail}`, true);
    }
    const contentType = upstream.headers.get('content-type') ?? 'audio/mpeg';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Tts-Model': model,
      'X-Tts-Voice': voice,
    });
    let bytes = 0;
    try {
      for await (const chunk of Readable.fromWeb(upstream.body)) {
        bytes += chunk.length;
        if (bytes > limits.maxAudioBytes) throw new Error(`Antwort größer als ${limits.maxAudioBytes} Byte.`);
        if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve));
      }
      res.end();
    } catch (error) {
      res.destroy();
      throw ttsRequestError(502, `Übertragung abgebrochen: ${error.message}`, true);
    }
    try { logRun({ script: 'studio-helper', action: 'openai-tts', model, voice, items: 1, result: 'ok', notes: `${purpose ? `Zweck ${purpose}; ` : ''}${bytes} Byte Audio${gewartetSekunden > 0 ? `; nach ${gewartetSekunden}s Limit-Warte` : ''}` }); } catch { /* siehe oben */ }
  } catch (error) {
    const code = error.statusCode ?? 500;
    if (res.headersSent) res.destroy();
    else json(code, { error: error.message });
    if (error.upstream || code >= 500) log('error', error.message);
    else log('rejected', error.message);
  }
}

function createStudio(root, { getApiKey, openaiFetch, logRun, allowRequest = createRateLimiter() } = {}) {
  const pipeline = new ContentPipeline(root);
  const delivery = new AutomaticDelivery(pipeline);
  const ready = delivery.recover();
  void ready.catch(error => console.error('Automatische Wiederherstellung:', error.message));
  let queue = Promise.resolve();
  let generationQueue = Promise.resolve();
  let generating = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Exact Host and Origin checks block DNS rebinding and other web origins.
    const host = req.headers.host;
    const port = res.socket.localPort;
    if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(host)) { res.writeHead(403); res.end(); return; }
    if (req.headers.origin && !originAllowed(req.headers.origin)) { res.writeHead(403); res.end(); return; }
    if (originAllowed(req.headers.origin)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      await ready;
      if (req.method === 'POST' && ['/api/local/text', '/api/comfyui/image', '/api/openai/tts'].includes(req.url)) {
        generating += 1;
        // A background tab can throttle heartbeats. Never finalize build
        // files while its outstanding model request is still running.
        res.once('close', () => { generating -= 1; });
      }
      if (req.method === 'GET' && req.url === '/state') {
        const state = await pipeline.state();
        state.shipped = delivery.catalog() ?? state.shipped;
        json(200, state); return;
      }
      // Turbo (23.10.2026): Die Wortschatz-Karte brauchte je Paket den ganzen
      // `/state` (rund 73 MB samt Prüfbericht). Sie liest nur Sprache, Wort,
      // Stufe und (seit 24.10.) Begriff samt deutscher Bedeutung — aus
      // Katalog bzw. laufender Übernahme und Stage.
      if (req.method === 'GET' && req.url === '/vocabulary') {
        const katalog = delivery.vocabulary() ?? (await pipeline.catalog()).entries
          .filter((entry) => entry.kind === 'vocabulary').map((entry) => entry.document);
        const kurz = new Map();
        for (const wort of [...katalog, ...await pipeline.stageVocabulary()]) {
          kurz.set(wort.id, { id: wort.id, language: wort.language, term: wort.term, german: wort.german, concept: wort.concept, learningStage: wort.learningStage });
        }
        json(200, { woerter: [...kurz.values()] }); return;
      }
      if (req.method === 'GET' && /^\/asset\/[a-f0-9]{64}\.(mp3|png|jpeg|webp)$/.test(req.url)) {
        const name = req.url.slice('/asset/'.length);
        let bytes;
        try { bytes = await fs.readFile(path.join(pipeline.work, name)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; bytes = await fs.readFile(path.join(root, 'assets/content', name)); }
        res.writeHead(200, { 'Content-Type': name.endsWith('.mp3') ? 'audio/mpeg' : 'image/' + name.split('.').pop(), 'Content-Length': bytes.length });
        res.end(bytes); return;
      }
      if (req.method === 'POST' && req.url === '/api/local/text') {
        if (!originAllowed(req.headers.origin) || req.headers['content-type'] !== 'application/json') { json(403, {error:'Nur die lokale Entwickler-App darf Texte erzeugen.'}); return; }
        let size=0; const parts=[];
        for await (const chunk of req) { size+=chunk.length; if(size>1024*1024){json(413,{error:'Textauftrag zu groß.'});return;}parts.push(chunk); }
        const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
        const operation=generationQueue.then(()=>generateLocalText(data)); generationQueue=operation.catch(()=>{});
        json(200, await operation); return;
      }
      if (req.method === 'POST' && req.url === '/api/comfyui/image') {
        if (!originAllowed(req.headers.origin) || req.headers['content-type'] !== 'application/json') { json(403, { error: 'Nur die lokale Entwickler-App darf Bilder erzeugen.' }); return; }
        let size = 0; const parts = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 64 * 1024) { json(413, { error: 'Bildauftrag zu groß.' }); return; }
          parts.push(chunk);
        }
        const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
        const operation = generationQueue.then(() => generateLocalImage(data));
        generationQueue = operation.catch(() => {});
        json(200, await operation); return;
      }
      if (req.method === 'POST' && req.url === '/api/openai/tts') {
        if (!originAllowed(req.headers.origin) || req.headers['content-type'] !== 'application/json') { json(403, { error: 'Nur die lokale Entwickler-App darf den Helper nutzen.' }); return; }
        await handleTtsProxy(req, res, { getApiKey, openaiFetch, logRun, allowRequest });
        return;
      }
      // Fehlerprotokoll der Generatoren (Nutzerwunsch 16.09.: was failt, gehört
      // in eine DATEI, nicht als Debug-Ausgabe in die GUI). Hängt JSON-Zeilen
      // an pipeline/logs/studio-failures.ndjson — reines Anhängen, ohne
      // Einfluss auf Stage/Publish, deshalb bewusst NICHT in der Warteschlange.
      if (req.method === 'POST' && req.url === '/log') {
        if (!originAllowed(req.headers.origin) || req.headers['content-type'] !== 'application/json') { json(403, { error: 'Nur die lokale Entwickler-App darf schreiben.' }); return; }
        let size = 0; const parts = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 256 * 1024) { json(413, { error: 'Log-Paket zu groß.' }); return; }
          parts.push(chunk);
        }
        const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
        const eintraege = Array.isArray(data?.entries) ? data.entries.slice(0, 200) : [];
        if (eintraege.length === 0) { json(400, { error: 'entries[] erforderlich.' }); return; }
        const zeilen = eintraege.map((eintrag) => JSON.stringify({
          loggedAt: new Date().toISOString(),
          kind: String(eintrag.kind ?? 'unbekannt').slice(0, 40),
          language: typeof eintrag.language === 'string' ? eintrag.language.slice(0, 8) : undefined,
          term: typeof eintrag.term === 'string' ? eintrag.term.slice(0, 120) : undefined,
          gruende: Array.isArray(eintrag.gruende) ? eintrag.gruende.map(String).join(' | ').slice(0, 500) : undefined,
        }));
        // pipeline/logs ist gitignored — in einem frischen Klon fehlt der Ordner.
        await fs.mkdir(path.join(root, 'pipeline', 'logs'), { recursive: true });
        await fs.appendFile(path.join(root, 'pipeline', 'logs', 'studio-failures.ndjson'), zeilen.join('\n') + '\n', 'utf8');
        json(200, { written: zeilen.length });
        return;
      }
      // Die frühere Route /catalog/clear-generated („alles Generierte löschen“)
      // ist entfernt (26.09.): Seit der erzeugte Wortschatz der Grundstock ist,
      // traf ihr Stichtag-Urteil den GESAMTEN Katalog.
      if (req.method !== 'POST' || !['/delivery/start','/delivery/item','/delivery/touch','/delivery/finish','/stage','/publish','/stage/delete','/catalog/delete','/catalog/clear-selection'].includes(req.url)) { json(404, { error: 'Unbekannter Pfad.' }); return; }
      if (!originAllowed(req.headers.origin) || req.headers['content-type'] !== 'application/json') { json(403, { error: 'Nur die lokale Entwickler-App darf schreiben.' }); return; }
      let size = 0; const parts = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw Error('Einzelexport überschreitet 32 MiB.');
        parts.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (req.url === '/delivery/touch') { json(200, delivery.touch(data.token)); return; }
      if (req.url === '/catalog/clear-selection' && (!data || !['vocabulary','situations','images','audio'].includes(data.kind) || !Array.isArray(data.languages) || !data.languages.length)) throw Error('Inhaltsart und Sprachauswahl sind erforderlich.');
      // Phase 2, Schritt 1: die Lösch-Endpunkte des Prüfberichts. /stage/delete
      // nimmt einen Entwurf aus dem Stage, /catalog/delete löscht einen
      // ausgelieferten Eintrag (inkl. Stage-Zwilling und verwaistem Asset) —
      // beides über dieselbe Serialisierungs-Warteschlange wie Stage/Publish.
      const action = () =>
        req.url === '/delivery/start' ? delivery.begin() :
        req.url === '/delivery/item' ? delivery.accept(data.token, data) :
        req.url === '/delivery/finish' ? delivery.finish(data.token) :
        delivery.active ? Promise.reject(Error('Inhaltslauf aktiv; Änderungen erst nach dessen Ende.')) :
        req.url === '/stage' ? pipeline.stage(data) :
        req.url === '/publish' ? pipeline.publish({ vocabularyIds: data.vocabularyIds, imageIds: data.imageIds }) :
        req.url === '/stage/delete' ? pipeline.deleteFromStage(data.kind, data.id) :
        req.url === '/catalog/clear-selection' ? pipeline.clearGenerated({ kind: data.kind, languages: data.languages, includeBase: true }) :
        pipeline.deleteFromCatalog(data.kind, data.id);
      const operation = queue.then(action);
      queue = operation.catch(() => {});
      json(200, await operation);
    } catch (error) { json(400, { error: error.message }); }
  });
  const idle = setInterval(() => {
    if (generating || !delivery.active || Date.now() - delivery.active.touched < 120000) return;
    const token = delivery.active.token;
    const operation = queue.then(() => !generating && delivery.active?.token === token && Date.now() - delivery.active.touched >= 120000 ? delivery.finish(token) : undefined);
    queue = operation.catch(error => console.error('Automatische Übernahme:', error.message));
    return operation;
  }, 30000);
  idle.unref(); server.on('close', () => clearInterval(idle));
  return server;
}
if (require.main === module) {
  createStudio(path.resolve(__dirname, '../..')).listen(8082, '127.0.0.1', () => {
    console.log('Inhaltsstudio bereit. App: http://localhost:8081/settings · nur Loopback, keine API-Schlüssel im Export.');
  });
}
module.exports = { createStudio, handleTtsProxy, createRateLimiter, TTS_LIMITS };
