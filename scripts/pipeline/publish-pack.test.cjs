const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, checkGh, manualSteps, releaseBody, packRepo, main } = require('./publish-pack.cjs');

const ZIP_BYTES = 'PK Sprachpaket Testinhalt';

/** Eine Repo-Wurzel mit app.json und einem gebauten Paket wie von build-pack. */
async function fakeRoot(t, { repo = 'nutzer/thaispeaker-packs', versions = [1] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thaispeaker-publish-pack-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'app.json'), JSON.stringify({ expo: { extra: { pack: { repo } } } }));
  const langDir = path.join(root, 'dist', 'packs', 'th');
  await fs.mkdir(langDir, { recursive: true });
  for (const version of versions) {
    await fs.writeFile(path.join(langDir, `thai-pack-th-v${version}.zip`), ZIP_BYTES);
    await fs.writeFile(path.join(langDir, `thai-pack-th-v${version}.manifest.json`), '{}');
  }
  await fs.writeFile(path.join(langDir, 'index.json'), JSON.stringify({ language: 'th', versions, latest: Math.max(...versions) }));
  return { root, langDir };
}

test('Argument-Parsing: findet Zip und Manifest der zuletzt gebauten Version', async (t) => {
  const { root, langDir } = await fakeRoot(t, { versions: [1, 2] });
  const args = parseArgs(['--lang', 'th'], { root });
  assert.equal(args.ok, true);
  assert.equal(args.version, 2);
  assert.equal(args.tag, 'pack-th-v2');
  assert.equal(args.title, 'Sprachpaket th v2');
  assert.equal(args.zip, path.join(langDir, 'thai-pack-th-v2.zip'));
  assert.equal(args.manifest, path.join(langDir, 'thai-pack-th-v2.manifest.json'));
  assert.equal(parseArgs(['--lang', 'th', '--version', '1'], { root }).zip, path.join(langDir, 'thai-pack-th-v1.zip'));
});

test('Argument-Parsing: fehlende, falsche und nicht gebaute Werte werden abgefangen', async (t) => {
  const { root } = await fakeRoot(t);
  for (const argv of [
    [],
    ['--lang', 'TH1'],
    ['--lang', 'th', '--version', '0'],
    ['--lang', 'th', '--version', '1.5'],
    ['--lang', 'th', '--version', '7'],
    ['--lang', 'es'],
    ['--lang', '--version', '1'],
    ['--lang', 'th', '--repo', 'kein-schraegstrich'],
  ]) {
    const result = parseArgs(argv, { root });
    assert.equal(result.ok, false, `muss ablehnen: ${JSON.stringify(argv)}`);
    assert.ok(result.errors.length >= 1);
    assert.match(result.usage, /publish-pack\.cjs --lang/);
  }
});

test('Paket-Repo kommt aus app.json; der Platzhalter zählt nicht', async (t) => {
  assert.equal(packRepo((await fakeRoot(t)).root), 'nutzer/thaispeaker-packs');
  assert.equal(packRepo((await fakeRoot(t, { repo: 'OWNER/REPO' })).root), null);
});

test('checkGh unterscheidet fehlend, nicht angemeldet und ok (gh-Binary gemockt)', () => {
  assert.deepEqual(checkGh({ run: () => { throw new Error('ENOENT'); } }), { ok: false, reason: 'missing' });
  let calls = 0;
  const authFail = checkGh({ run: (cmd, args) => { calls++; if (args[0] === 'auth') throw new Error('not logged in'); } });
  assert.equal(calls, 2);
  assert.deepEqual(authFail, { ok: false, reason: 'unauthenticated' });
  assert.deepEqual(checkGh({ run: () => 'gh version 2.x' }), { ok: true });
});

test('manuelle Schritte ohne gh: Installlink, beide Dateien, Repo, sha256', () => {
  const steps = manualSteps({ lang: 'th', version: 1, zip: 'dist/packs/th/thai-pack-th-v1.zip', manifest: 'dist/packs/th/thai-pack-th-v1.manifest.json', sha256: 'abc123', bytes: 456, repo: 'nutzer/packs' });
  assert.match(steps, /cli\.github\.com/);
  assert.match(steps, /gh auth login/);
  assert.match(steps, /gh release create pack-th-v1 "dist\/packs\/th\/thai-pack-th-v1\.zip" "dist\/packs\/th\/thai-pack-th-v1\.manifest\.json" --repo nutzer\/packs/);
  assert.match(steps, /--title "Sprachpaket th v1"/);
  assert.match(steps, /gh release upload pack-th-v1/);
  assert.match(steps, /https:\/\/github\.com\/nutzer\/packs\/releases/);
  assert.match(steps, /sha256: abc123/);
});

test('Release-Body trägt Dateiname, Größe und sha256', () => {
  const body = releaseBody({ lang: 'th', version: 1, zip: 'dist/packs/th/thai-pack-th-v1.zip', sha256: 'f'.repeat(64), bytes: 1024 });
  assert.match(body, /thai-pack-th-v1\.zip/);
  assert.match(body, /1024 Byte/);
  assert.match(body, new RegExp(`sha256: ${'f'.repeat(64)}`));
  assert.match(body, /Sprache\/Version: th \/ v1/);
});

test('ohne Paket-Repo: Exit-Code 1, kein gh-Aufruf', async (t) => {
  const { root } = await fakeRoot(t, { repo: 'OWNER/REPO' });
  let ghCalled = false;
  const exitCode = main(['--lang', 'th'], { root, gh: () => { ghCalled = true; return { ok: true }; }, log: () => {} });
  assert.equal(exitCode, 1);
  assert.equal(ghCalled, false);
});

test('gh-Missing-Pfad: main endet mit Exit-Code 2, ohne Upload und ohne Dateiänderung am Paket', async (t) => {
  const { root, langDir } = await fakeRoot(t);
  const logs = [];
  const exitCode = main(['--lang', 'th'], {
    root,
    gh: () => ({ ok: false, reason: 'missing' }),
    log: (entry) => logs.push(entry),
  });
  assert.equal(exitCode, 2);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].script, 'publish-pack');
  assert.equal(logs[0].result, 'blocked');
  assert.equal(await fs.readFile(path.join(langDir, 'thai-pack-th-v1.zip'), 'utf8'), ZIP_BYTES);
});

test('echtes CLI ohne installiertes gh: Exit-Code 2 und manuelle Schritte auf der Konsole', async (t) => {
  // Nur laufen lassen, wenn gh tatsächlich fehlt — auf einer Maschine mit
  // angemeldetem gh würde der Test sonst einen echten Release-Upload starten.
  const probe = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  if (!probe.error && probe.status === 0) { t.skip('gh ist installiert; Rauchtest nur ohne gh.'); return; }
  const { root } = await fakeRoot(t);
  const run = spawnSync(process.execPath, [path.resolve(__dirname, 'publish-pack.cjs'), '--lang', 'th', '--dir', path.join(root, 'dist', 'packs'), '--repo', 'nutzer/packs'], {
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_PROTOCOL_ROOT: root },
  });
  assert.equal(run.status, 2);
  assert.match(run.stdout, /sha256/);
  assert.match(run.stderr, /cli\.github\.com/);
  assert.match(run.stderr, /gh release create pack-th-v1/);
  const files = await fs.readdir(path.join(root, 'pipeline', 'logs'));
  assert.ok(files.some((name) => /publish-pack-release-upload/.test(name)));
});
