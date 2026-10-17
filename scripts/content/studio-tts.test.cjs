const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { handleTtsProxy, createStudio, createRateLimiter, TTS_LIMITS } = require('./studio.cjs');

// Nachgestellt req/res (node:http-Kern reicht nicht für Direktaufrufe) —
// der Handler-Funktion wird genau das geboten, was der Server auch gibt.
function fakeRequest(body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(body)];
  return {
    headers,
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; },
  };
}
function fakeResponse() {
  const state = { statusCode: null, headers: null, body: [], ended: false, destroyed: false, headersSent: false };
  const res = {
    get headersSent() { return state.headersSent; },
    state,
    writeHead(code, headers) { state.statusCode = code; state.headers = headers; state.headersSent = true; return res; },
    write(chunk) { state.body.push(Buffer.from(chunk)); return true; },
    end(chunk) { if (chunk) state.body.push(Buffer.from(chunk)); state.ended = true; },
    destroy() { state.destroyed = true; },
    once(_event, listener) { listener(); },
  };
  return res;
}
const jsonRequest = (data, headers = {}) => fakeRequest(JSON.stringify(data), { 'content-type': 'application/json', ...headers });
const webStream = (buffers) => Readable.toWeb(Readable.from(buffers));
function collectLogsSimple() { const list = []; return { list, logRun: (entry) => list.push(entry) }; }

const base = { getApiKey: () => 'sk-test', logRun: () => {} };

test('fehlender Umgebungsschlüssel: 500 ohne Aufruf von OpenAI, Schlüsselname im Fehler', async () => {
  const logs = collectLogsSimple();
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'สวัสดี' }), res, { ...base, getApiKey: () => '', logRun: logs.logRun });
  assert.equal(res.state.statusCode, 500);
  const message = JSON.parse(Buffer.concat(res.state.body).toString('utf8'));
  assert.match(message.error, /OPENAI_API_KEY/);
  assert.equal(logs.list.at(-1).result, 'error');
});

test('Textlimit: über 2000 Zeichen wird mit 400 abgelehnt', async () => {
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'a'.repeat(TTS_LIMITS.maxTextLength + 1) }), res, base);
  assert.equal(res.state.statusCode, 400);
  const message = JSON.parse(Buffer.concat(res.state.body).toString('utf8'));
  assert.match(message.error, /2000/);
});

test('Erfolg: Audio-Bytes werden durchgereicht, Standardmodell gesetzt, Schlüssel nie in der Antwort', async () => {
  const logs = collectLogsSimple();
  const calls = [];
  const audio = Buffer.from('ID3 gefaelschte-but-gueltig-grosse-mp3-bytes-fuer-den-test');
  const openaiFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, headers: { get: (name) => (name === 'content-type' ? 'audio/mpeg' : null) }, body: webStream([audio]) };
  };
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'สวัสดีครับ', purpose: 'studio-test' }), res, { getApiKey: () => 'sk-geist', openaiFetch, logRun: logs.logRun });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-geist');
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.model, 'gpt-4o-mini-tts-2025-12-15');
  assert.equal(sent.voice, 'coral');
  assert.equal(sent.input, 'สวัสดีครับ');
  assert.equal(sent.response_format, 'mp3');
  assert.equal(res.state.statusCode, 200);
  assert.equal(res.state.headers['Content-Type'], 'audio/mpeg');
  assert.equal(res.state.headers['X-Tts-Model'], 'gpt-4o-mini-tts-2025-12-15');
  assert.deepEqual(Buffer.concat(res.state.body), audio);
  const bodyText = Buffer.concat(res.state.body).toString('utf8');
  assert.ok(!bodyText.includes('sk-geist'), 'Schlüssel darf nie im Antwortkörper landen');
  assert.equal(logs.list.length, 1);
  assert.equal(logs.list[0].script, 'studio-helper');
  assert.equal(logs.list[0].action, 'openai-tts');
  assert.equal(logs.list[0].result, 'ok');
  assert.equal(logs.list[0].model, 'gpt-4o-mini-tts-2025-12-15');
  assert.equal(logs.list[0].voice, 'coral');
  assert.match(logs.list[0].notes, /studio-test/);
});

test('Modell/Stimme-Freitext: unsichere Zeichen werden abgelehnt, eigene Werte durchgereicht', async () => {
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'hallo', model: 'böses\nmodell' }), res, base);
  assert.equal(res.state.statusCode, 400);
  await handleTtsProxy(jsonRequest({ text: 'hallo', voice: 'x'.repeat(200) }), res, base);
  assert.equal(res.state.statusCode, 400);

  const calls = [];
  const openaiFetch = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, body: webStream([Buffer.from('x'.repeat(200))]) }; };
  const okRes = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'hallo', model: 'gpt-4o-mini-tts-2025-12-15', voice: 'alloy' }), okRes, { ...base, openaiFetch });
  assert.equal(okRes.state.statusCode, 200);
  assert.equal(calls[0].voice, 'alloy');
});

test('OpenAI-Fehler werden weitergereicht, ohne den Schlüssel zu erwähnen', async () => {
  const logs = collectLogsSimple();
  const openaiFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid api key (geheim bleibt beim Anbieter)' });
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'hallo' }), res, { ...base, openaiFetch, logRun: logs.logRun });
  assert.equal(res.state.statusCode, 401);
  const message = JSON.parse(Buffer.concat(res.state.body).toString('utf8'));
  assert.match(message.error, /OpenAI 401/);
  assert.doesNotMatch(message.error, /sk-test/);
  assert.equal(logs.list.at(-1).result, 'error');
});

test('Netzfehler Richtung OpenAI: 502 mit lesbarer Ursache', async () => {
  const openaiFetch = async () => { throw new Error('ECONNREFUSED'); };
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'hallo' }), res, { ...base, openaiFetch });
  assert.equal(res.state.statusCode, 502);
  const message = JSON.parse(Buffer.concat(res.state.body).toString('utf8'));
  assert.match(message.error, /nicht erreichbar/);
});

test('Rate-Limiter: gleitendes Fenster lässt Maximalzahl zu, Rest mit Retry-After ablehnen', async () => {
  let now = 0;
  const allowRequest = createRateLimiter({ max: 2, windowMs: 60000, now: () => now });
  assert.equal(allowRequest().ok, true);
  assert.equal(allowRequest().ok, true);
  const third = allowRequest();
  assert.equal(third.ok, false);
  assert.equal(third.retryAfterSeconds, 60);
  now = 61000; // Fenster abgelaufen: wieder frei
  assert.equal(allowRequest().ok, true);
  const handlerLimiter = createRateLimiter({ max: 1 });
  const openaiFetch = async () => ({ ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, body: webStream([Buffer.from('x'.repeat(200))]) });
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'eins' }), res, { ...base, allowRequest: handlerLimiter, openaiFetch });
  assert.equal(res.state.statusCode, 200);
  const second = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'zwei' }), second, { ...base, allowRequest: handlerLimiter });
  assert.equal(second.state.statusCode, 429);
  const message = JSON.parse(Buffer.concat(second.state.body).toString('utf8'));
  assert.match(message.error, /Rate-Limit/);
});

test('Rate-Limit-Warte: volles Fenster ist Wartezeit — der Helper stellt nach Ablauf selbst durch (17.09.)', async () => {
  const wartendeMs = [];
  const sleep = async (ms) => { wartendeMs.push(ms); };
  let gateAufrufe = 0;
  const allowRequest = () => (gateAufrufe++ === 0 ? { ok: false, retryAfterSeconds: 2 } : { ok: true });
  const openaiFetch = async () => ({ ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, body: webStream([Buffer.from('y'.repeat(120))]) });
  const logs = collectLogsSimple();
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'eins' }), res, { ...base, allowRequest, openaiFetch, sleep, logRun: logs.logRun });
  assert.equal(res.state.statusCode, 200);
  assert.deepEqual(wartendeMs, [2000]);
  assert.match(logs.list.at(-1).notes, /nach 2s Limit-Warte/);
});

test('Rate-Limit-Warte: nach drei vergeblichen Wartedurchläufen bleibt der ehrliche 429', async () => {
  const wartendeMs = [];
  const sleep = async (ms) => { wartendeMs.push(ms); };
  const allowRequest = () => ({ ok: false, retryAfterSeconds: 1 });
  const res = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'eins' }), res, { ...base, allowRequest, sleep });
  assert.equal(res.state.statusCode, 429);
  assert.deepEqual(wartendeMs, [1000, 1000, 1000]);
  const message = JSON.parse(Buffer.concat(res.state.body).toString('utf8'));
  assert.match(message.error, /Rate-Limit/);
});

test('Formatfragen: kein JSON, kaputtes JSON, fehlender/leerer Text — jeweils 400/413', async () => {
  for (const [request, expected] of [
    [fakeRequest('hallo', { 'content-type': 'text/plain' }), 400],
    [fakeRequest('nicht json', { 'content-type': 'application/json' }), 400],
    [jsonRequest({}), 400],
    [jsonRequest({ text: '   ' }), 400],
    [fakeRequest('x'.repeat(70 * 1024), { 'content-type': 'application/json' }), 413],
  ]) {
    const res = fakeResponse();
    await handleTtsProxy(request, res, base);
    assert.equal(res.state.statusCode, expected, `erwartet ${expected}`);
  }
});

test('End-to-End durch den Helper-Server: Route, CORS, falscher Origin, alte Routen unangetastet', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thaispeaker-tts-server-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const audio = Buffer.from('ID3 ende-zu-ende-audio');
  const openaiFetch = async (_url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer sk-ende-zu-ende');
    return { ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, body: webStream([audio]) };
  };
  const server = createStudio(root, {
    getApiKey: () => 'sk-ende-zu-ende',
    openaiFetch,
    logRun: () => {},
    allowRequest: createRateLimiter({ max: 100 }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/openai/tts`;
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' };

  // Preflight (Browser-POST mit application/json) geht durch.
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:8081');

  const good = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ text: 'สวัสดี', purpose: 'e2e' }) });
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('content-type'), 'audio/mpeg');
  assert.equal(good.headers.get('x-tts-model'), 'gpt-4o-mini-tts-2025-12-15');
  assert.deepEqual(Buffer.from(await good.arrayBuffer()), audio);

  // Andere Web-Origin wird vor dem Handler abgeblockt.
  const bad = await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://angreifer.example' }, body: JSON.stringify({ text: 'x' }) });
  assert.equal(bad.status, 403);

  // Alte Verträge bleiben: unbekannter Pfad 404, /state ohne Origin lesbar.
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/anders`)).status, 404);
  const state = await fetch(`http://127.0.0.1:${server.address().port}/state`);
  assert.equal(state.status, 200);
});

test('Sprechanweisung: wird an OpenAI durchgereicht und ist auf 1000 Zeichen begrenzt (17.10.2026)', async () => {
  const calls = [];
  const openaiFetch = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, body: webStream([Buffer.from('x'.repeat(200))]) }; };
  const ok = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'มา', instructions: 'Say it in citation form.' }), ok, { ...base, openaiFetch });
  assert.equal(ok.state.statusCode, 200);
  assert.equal(calls[0].instructions, 'Say it in citation form.');
  const ohne = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'มา' }), ohne, { ...base, openaiFetch });
  assert.equal('instructions' in calls[1], false);
  const zuLang = fakeResponse();
  await handleTtsProxy(jsonRequest({ text: 'มา', instructions: 'x'.repeat(1001) }), zuLang, { ...base, openaiFetch });
  assert.equal(zuLang.state.statusCode, 400);
  assert.equal(calls.length, 2);
});
