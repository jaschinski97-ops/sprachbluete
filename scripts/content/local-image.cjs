const { randomInt } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ffmpeg = require('ffmpeg-static');
const BASE = 'http://127.0.0.1:8188';
const MODEL = 'flux-2-klein-4b-fp8';

// Core-node workflow from Comfy-Org's FLUX.2 klein distilled template.
function workflow(prompt, seed = randomInt(2 ** 48 - 1)) {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: `${MODEL}.safetensors`, weight_dtype: 'default' } },
    // Let ComfyUI use the GPU and manage offloading instead of forcing CPU encoding.
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'flux2-vae.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], cfg: 1 } },
    '7': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '8': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '9': { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: 768, height: 768 } },
    '10': { class_type: 'EmptyFlux2LatentImage', inputs: { width: 768, height: 768, batch_size: 1 } },
    '11': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['7', 0], guider: ['6', 0], sampler: ['8', 0], sigmas: ['9', 0], latent_image: ['10', 0] } },
    '12': { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['3', 0] } },
    '13': { class_type: 'SaveImage', inputs: { images: ['12', 0], filename_prefix: 'ThaiSpeaker/trial' } },
  };
}

function cardImage(png) {
  return execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin',
    '-protocol_whitelist', 'pipe', '-i', 'pipe:0', '-frames:v', '1',
    '-vf', 'scale=512:512', '-c:v', 'libwebp', '-quality', '85', '-f', 'webp', 'pipe:1'],
  { input: png, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
}

async function generateLocalImage(data, request = fetch, encode = cardImage) {
  if (data?.model !== MODEL) throw Error(`Lokales Modell muss ${MODEL} heißen.`);
  if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 12000) throw Error('Bild-Prompt fehlt oder ist zu lang.');
  const deadline = Date.now() + 570000;
  const call = async (path, options) => {
    const res = await request(BASE + path, { ...options, signal: AbortSignal.timeout(Math.min(30000, Math.max(1, deadline - Date.now()))) });
    if (!res.ok) throw Error(`ComfyUI HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return res;
  };
  const submitted = await (await call('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow(data.prompt) }) })).json();
  if (!submitted.prompt_id) throw Error('ComfyUI hat keine Auftrags-ID geliefert.');
  while (Date.now() < deadline) {
    const history = await (await call(`/history/${encodeURIComponent(submitted.prompt_id)}`)).json();
    const job = history[submitted.prompt_id];
    if (job?.status?.status_str === 'error') throw Error(`ComfyUI: ${JSON.stringify(job.status.messages).slice(0, 700)}`);
    const file = job?.outputs?.['13']?.images?.[0];
    if (file) {
      const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type ?? 'output' });
      const bytes = Buffer.from(await (await call(`/view?${query}`)).arrayBuffer());
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('ComfyUI lieferte kein PNG.');
      const card = encode(bytes);
      return { data: [{ b64_json: card.toString('base64') }], model: MODEL, format: 'webp' };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  // Never interrupt an unrelated ComfyUI job or fall back to a paid provider.
  throw Error('ComfyUI-Zeitlimit erreicht. Auftrag und Warteschlange lokal prüfen.');
}
module.exports = { workflow, generateLocalImage, cardImage, MODEL };
