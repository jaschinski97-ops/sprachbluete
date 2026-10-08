// Paket-Upload für GitHub Releases: Die App lädt Sprachpakete von dort
// (src/lib/packs/config.ts). Ein Release je Sprache und Version, Tag
// `pack-<lang>-v<N>`, mit ZWEI Assets — der Zip und dem Manifest daneben;
// ohne das Manifest bricht der Download auf dem Gerät vor dem Laden ab.
//
// Aufruf (nach `npm run pack:build -- --lang th`):
//   node scripts/pipeline/publish-pack.cjs --lang th [--version N] [--dir dist/packs] [--repo owner/name]
//
// Ohne --version nimmt es die zuletzt gebaute Version (index.json). Das Repo
// kommt aus app.json (expo.extra.pack.repo) — dasselbe, aus dem die App lädt.
// KEIN Key, KEIN Token: gh benutzt die eigene lokale Anmeldung (`gh auth login`).
// Ohne gh bricht es sauber ab und druckt die exakten manuellen Schritte.

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { tryWriteProtocol } = require('./protocol.cjs');

const GH_INSTALL_URL = 'https://cli.github.com/';
const USAGE = 'node scripts/pipeline/publish-pack.cjs --lang th [--version N] [--dir dist/packs] [--repo owner/name]';
const PLACEHOLDER_REPO = 'OWNER/REPO';

/** Dateinamen wie in src/lib/packs/config.ts (packZipName/packManifestName). */
const zipName = (lang, version) => `thai-pack-${lang}-v${version}.zip`;
const manifestName = (lang, version) => `thai-pack-${lang}-v${version}.manifest.json`;

function parseArgs(argv, { root = path.resolve(__dirname, '../..') } = {}) {
  const errors = [];
  const value = (flag) => {
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) { errors.push(`${flag} ohne Wert.`); return undefined; }
    return next;
  };
  const lang = value('--lang');
  const dir = path.resolve(root, value('--dir') ?? 'dist/packs');
  const repoArg = value('--repo');
  const versionArg = value('--version');
  if (!lang || !/^[a-z]{2,8}$/.test(lang)) errors.push('--lang fehlt oder ist kein Sprachkürzel (z. B. th).');
  if (repoArg !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(repoArg)) errors.push('--repo muss die Form owner/name haben.');
  let version = versionArg === undefined ? undefined : Number(versionArg);
  if (version !== undefined && (!Number.isInteger(version) || version <= 0)) errors.push('--version ist keine positive ganze Zahl.');
  if (errors.length) return { ok: false, errors, usage: USAGE };

  const langDir = path.join(dir, lang);
  if (version === undefined) {
    try {
      version = JSON.parse(fs.readFileSync(path.join(langDir, 'index.json'), 'utf8')).latest;
    } catch { /* unten gemeldet */ }
    if (!Number.isInteger(version) || version <= 0) {
      return { ok: false, errors: [`Kein gebautes Paket für ${lang} in ${langDir} — erst \`npm run pack:build -- --lang ${lang}\`.`], usage: USAGE };
    }
  }
  const zip = path.join(langDir, zipName(lang, version));
  const manifest = path.join(langDir, manifestName(lang, version));
  for (const file of [zip, manifest]) if (!fs.existsSync(file)) errors.push(`Datei nicht gefunden: ${file}`);
  if (errors.length) return { ok: false, errors, usage: USAGE };
  return { ok: true, lang, version, zip, manifest, repoArg, tag: `pack-${lang}-v${version}`, title: `Sprachpaket ${lang} v${version}` };
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Das Repo, aus dem die App lädt: app.json expo.extra.pack.repo. */
function packRepo(root) {
  try {
    const repo = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo?.extra?.pack?.repo;
    if (typeof repo === 'string' && repo.includes('/') && repo !== PLACEHOLDER_REPO) return repo;
  } catch { /* kein app.json lesbar */ }
  return null;
}

function releaseBody({ lang, version, zip, sha256, bytes }) {
  return [
    `Sprachpaket ${lang} v${version}: Hörclips und Bilder der Lernsprache für die App.`,
    '',
    'Die App lädt Zip und Manifest, prüft die Byteanzahl vor dem Entpacken und gleicht danach Dateianzahl und Gesamtgröße mit dem Manifest ab.',
    '',
    `- Datei: ${path.basename(zip)}`,
    `- Größe: ${bytes} Byte`,
    `- sha256: ${sha256}`,
    `- Sprache/Version: ${lang} / v${version}`,
  ].join('\n');
}

function checkGh({ run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } = {}) {
  try { run('gh', ['--version']); }
  catch { return { ok: false, reason: 'missing' }; }
  try { run('gh', ['auth', 'status']); }
  catch { return { ok: false, reason: 'unauthenticated' }; }
  return { ok: true };
}

function manualSteps({ lang, version, zip, manifest, sha256, bytes, repo }) {
  const target = repo ?? '<nutzer>/<repo>';
  const tag = `pack-${lang}-v${version}`;
  const releases = `https://github.com/${target}/releases`;
  return [
    '`gh` ist hier nicht installiert oder nicht angemeldet — der Upload wurde NICHT gestartet.',
    '',
    'Manuelle Schritte (Reihenfolge einhalten):',
    '',
    '1. GitHub CLI installieren: ' + GH_INSTALL_URL + ' (danach Terminal neu starten).',
    '2. Anmelden: `gh auth login` (GitHub.com → HTTPS → Browser-Anmeldung).',
    '3. Release anlegen und BEIDE Dateien hochladen (exakt dieses Tag-Muster: pack-<lang>-v<version>):',
    '',
    '   ```sh',
    `   gh release create ${tag} "${zip}" "${manifest}" --repo ${target} \\`,
    `     --title "Sprachpaket ${lang} v${version}" \\`,
    `     --notes "sha256: ${sha256} (${bytes} Byte)"`,
    '   ```',
    '',
    `   Falls das Release-Tag schon existiert, nur nachladen: \`gh release upload ${tag} "${zip}" "${manifest}" --repo ${target} --clobber\`.`,
    `4. Prüfen: ${releases} — Zip und Manifest müssen als Assets unter dem Tag ${tag} hängen.`,
    '',
    `Ohne gh im Browser: ${releases} → „Draft a new release" → Tag ${tag} (neu anlegen) → Titel „Sprachpaket ${lang} v${version}" →`,
    `   ${path.basename(zip)} und ${path.basename(manifest)} anhängen → in die Beschreibung „sha256: ${sha256} (${bytes} Byte)" → Publish.`,
  ].join('\n');
}

/**
 * main(argv, options) — options nur für Tests:
 *   root: Repo-Wurzel (app.json, dist/packs, Protokoll) überschreiben
 *   gh:   checkGh-Ersatz (z. B. () => ({ ok: false, reason: 'missing' }))
 *   log:  Protokoll-Empfänger stubben
 */
function main(argv = process.argv.slice(2), options = {}) {
  const root = options.root ?? path.resolve(__dirname, '../..');
  const { gh = checkGh } = options;
  const log = options.log ?? ((entry) => tryWriteProtocol(entry, options.root ? { root } : undefined));
  const args = parseArgs(argv, { root });
  if (!args.ok) {
    console.error('Aufruf unvollständig:');
    for (const error of args.errors) console.error('  ' + error);
    console.error(`\nVerwendung: ${args.usage}`);
    return 1;
  }
  const { lang, version, zip, manifest, tag, title } = args;
  const repo = args.repoArg ?? packRepo(root);
  const bytes = fs.statSync(zip).size;
  const sha256 = sha256File(zip);
  console.log(`Paket: ${zip} (${bytes} Byte, sha256 ${sha256})`);
  console.log(`Release: Tag ${tag}, Titel „${title}", Repo ${repo ?? '(fehlt)'}`);

  if (!repo) {
    console.error(`\nKein Paket-Repo: In app.json unter expo.extra.pack.repo „owner/name“ eintragen (jetzt „${PLACEHOLDER_REPO}“) oder --repo angeben. Das Repo muss öffentlich sein, sonst können Nutzer nicht laden.`);
    return 1;
  }

  const ghResult = gh();
  if (!ghResult.ok) {
    console.error('\n' + manualSteps({ lang, version, zip, manifest, sha256, bytes, repo }));
    log({
      script: 'publish-pack',
      action: 'release-upload',
      items: 2,
      checks: { gh: ghResult.reason, sha256, bytes },
      result: 'blocked',
      notes: `gh ${ghResult.reason === 'missing' ? 'fehlt' : 'nicht angemeldet'}; manuelle Schritte ausgegeben, kein Upload`,
    });
    return 2;
  }

  const notesFile = path.join(path.dirname(zip), `release-notes-${tag}.md`);
  fs.writeFileSync(notesFile, releaseBody({ lang, version, zip, sha256, bytes }) + '\n');
  console.log('\nlege Release an und lade hoch …');
  execFileSync('gh', ['release', 'create', tag, zip, manifest, '--repo', repo, '--title', title, '--notes-file', notesFile], { stdio: 'inherit' });
  console.log(`\nfertig: https://github.com/${repo}/releases/tag/${tag}`);
  log({
    script: 'publish-pack',
    action: 'release-upload',
    items: 2,
    checks: { gh: 'ok', sha256, bytes },
    result: 'ok',
    notes: `Release ${tag} mit ${path.basename(zip)} und Manifest nach ${repo} hochgeladen`,
  });
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { parseArgs, checkGh, manualSteps, releaseBody, sha256File, packRepo, main, zipName, manifestName };
