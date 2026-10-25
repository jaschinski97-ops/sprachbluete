#!/usr/bin/env node
/**
 * Verkleinert die Katalogbilder auf 512-Pixel-WebP (25.10.2026). Gemini
 * liefert 1024er JPEGs mit rund 380 KB; die App zeigt höchstens 512 Pixel.
 * Jedes Bild geht als neue Fassung über den Helper (`/delivery/*`), also
 * durch dieselbe Prüfung wie ein frisch erzeugtes; Kennung, Begriff, Prompt
 * und Zeitstempel bleiben. Danach werden die alten JPEG-Dateien unter
 * `assets/content/` und `public/content/` gelöscht, wenn der Katalog sie
 * nicht mehr nennt.
 *
 *   node content-plan/verkleinere-bilder.cjs [--probe <n>]
 * Voraussetzung: Helper läuft (8082), kein Studio-Lauf aktiv.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const ffmpeg = require('ffmpeg-static');

const root = path.join(__dirname, '..');
const KANTE = 512;
const QUALITAET = 85;
const HELPER = 'http://127.0.0.1:8082';

async function post(route, body) {
  const antwort = await fetch(HELPER + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' }, body: JSON.stringify(body),
  });
  const text = await antwort.text();
  if (!antwort.ok) throw Error(`${route} ${antwort.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function alsWebp(datei) {
  return execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-xerror', '-nostdin', '-i', datei,
    '-vf', `scale='min(${KANTE},iw)':-2`, '-c:v', 'libwebp', '-quality', String(QUALITAET), '-f', 'webp', 'pipe:1'],
  { maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
}

function katalog() {
  return JSON.parse(fs.readFileSync(path.join(root, 'src/content/catalog.json'), 'utf8'));
}

async function main() {
  const probe = process.argv.includes('--probe') ? Number(process.argv[process.argv.indexOf('--probe') + 1]) : Infinity;
  const bilder = katalog().entries.filter((e) => e.kind === 'images' && e.document.format !== 'webp').slice(0, probe);
  console.log(`${bilder.length} Bilder werden verkleinert.`);
  if (!bilder.length) return;
  let vorher = 0; let nachher = 0;
  const { token } = await post('/delivery/start', {});
  const herzschlag = setInterval(() => { post('/delivery/touch', { token }).catch(() => {}); }, 30000);
  try {
    for (const [i, eintrag] of bilder.entries()) {
      const bytes = alsWebp(path.join(root, 'assets/content', eintrag.asset));
      const blobKey = crypto.createHash('sha256').update(bytes).digest('hex') + '.webp';
      const document = { ...eintrag.document, format: 'webp', byteSize: bytes.length, blobKey };
      const geliefert = await post('/delivery/item', { token, kind: 'images', document, base64: bytes.toString('base64') });
      if (geliefert.check?.status !== 'passed') throw Error(`${eintrag.id}: Prüfung ${geliefert.check?.status}`);
      vorher += eintrag.byteSize; nachher += geliefert.byteSize;
      if ((i + 1) % 100 === 0) console.log(`${i + 1}/${bilder.length} …`);
    }
  } finally {
    clearInterval(herzschlag);
    await post('/delivery/finish', { token });
  }
  console.log(`Fertig: ${(vorher / 2 ** 20).toFixed(1)} MiB → ${(nachher / 2 ** 20).toFixed(1)} MiB.`);

  // Alte Dateien entfernen, die der Katalog nicht mehr nennt.
  const genannt = new Set(katalog().entries.map((e) => e.asset).filter(Boolean));
  let geloescht = 0;
  for (const eintrag of bilder) {
    if (genannt.has(eintrag.asset)) continue;
    for (const ordner of ['assets/content', 'public/content']) {
      const datei = path.join(root, ordner, eintrag.asset);
      if (fs.existsSync(datei)) { fs.rmSync(datei); geloescht += 1; }
    }
  }
  console.log(`${geloescht} alte JPEG-Dateien entfernt.`);
}

main().catch((fehler) => { console.error(fehler.message); process.exit(1); });
