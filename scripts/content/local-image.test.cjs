const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workflow, generateLocalImage, cardImage, MODEL } = require('./local-image.cjs');

test('local image workflow uses the distilled model and one image, with CPU text encoding', () => {
  const graph = workflow('one apple', 42);
  assert.equal(graph['1'].inputs.unet_name, `${MODEL}.safetensors`);
  assert.equal(graph['2'].inputs.device, 'cpu');
  assert.equal(graph['7'].inputs.noise_seed, 42);
  assert.equal(graph['9'].inputs.steps, 4);
  assert.equal(graph['10'].inputs.batch_size, 1);
});

test('invalid model or empty prompt never sends a request', async () => {
  const request = () => { throw Error('Must not fetch'); };
  await assert.rejects(generateLocalImage({ model: 'https://evil.test', prompt: 'apple' }, request), /Modell/);
  await assert.rejects(generateLocalImage({ model: MODEL, prompt: '' }, request), /Prompt/);
});

test('retrieves only this job from loopback and returns an offline card', async () => {
  const urls = [];
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const request = async url => {
    urls.push(url);
    if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'own-job' });
    if (url.endsWith('/history/own-job')) return Response.json({ 'own-job': { outputs: { '13': { images: [{ filename: 'card.png', subfolder: 'ThaiSpeaker', type: 'output' }] } } } });
    return new Response(png);
  };
  const card = Buffer.from('RIFF0000WEBP');
  const image = await generateLocalImage({ model: MODEL, prompt: 'apple' }, request, bytes => { assert.deepEqual(bytes, png); return card; });
  assert.equal(image.data[0].b64_json, card.toString('base64'));
  assert.equal(image.format, 'webp');
  assert.ok(urls.every(url => url.startsWith('http://127.0.0.1:8188/')));
  assert.match(urls[2], /filename=card.png/);
});

test('real PNG is converted to a compact, decodable card WebP', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSocAAAAASUVORK5CYII=', 'base64');
  const webp = cardImage(png);
  assert.equal(webp.subarray(0, 4).toString(), 'RIFF');
  assert.equal(webp.subarray(8, 12).toString(), 'WEBP');
  assert.ok(webp.length < 10000);
});

test('failed Comfy job propagates instead of trying another provider', async () => {
  let calls = 0;
  const request = async () => ++calls === 1
    ? Response.json({ prompt_id: 'own-job' })
    : Response.json({ 'own-job': { status: { status_str: 'error', messages: ['out of memory'] } } });
  await assert.rejects(generateLocalImage({ model: MODEL, prompt: 'apple' }, request), /out of memory/);
  assert.equal(calls, 2);
});
