const fs = require('node:fs/promises');
const path = require('node:path');
const { MODEL } = require('./local-image.cjs');

// Small, repeatable preview; never stages/publishes or invokes text/audio APIs.
const motifs = [
  ['apple', 'A single ripe red apple with one green leaf'],
  ['chair', 'A single simple wooden chair, shown from a three-quarter angle, all four legs visible, empty seat'],
  ['bicycle', 'A single blue city bicycle shown clearly from the side, two wheels, complete frame, pedals, saddle and handlebar, no rider'],
];
async function main() {
  const output = path.resolve(__dirname, '../../_Local/image-trial', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(output, { recursive: true });
  for (const [name, subject] of motifs) {
    const prompt = `${subject}. Clean flat illustration for a vocabulary flashcard, centered, warm neutral ivory background, soft subtle shadow, clear recognizable silhouette, square composition. No text, letters, logo, watermark or extra objects.`;
    const started = Date.now();
    const response = await fetch('http://127.0.0.1:8082/api/comfyui/image', {
      method: 'POST', headers: { Origin: 'http://localhost:8081', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt }), signal: AbortSignal.timeout(600000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(JSON.stringify(result));
    const seconds = (Date.now() - started) / 1000;
    await fs.writeFile(path.join(output, `${name}.webp`), Buffer.from(result.data[0].b64_json, 'base64'));
    await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify({ model: MODEL, prompt, seconds }, null, 2));
    console.log(`${name}: ${seconds.toFixed(1)} s`);
  }
  console.log(`Vorschau: ${output}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
