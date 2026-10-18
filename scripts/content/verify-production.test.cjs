const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { verify } = require('./verify-production.cjs');

test('Produktionsgate prüft Ordner-Index und alte Route gleich streng', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thaispeaker-production-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  function write(relative, data) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  for (const platform of ['ios', 'android', 'web']) {
    write(`${platform}/entry-test.js.map`, JSON.stringify({ sources: ['/src/app/index.tsx'] }));
  }
  write('settings/index.html', '<main>Einstellungen</main>');
  assert.equal(verify(root).checked.length, 3);
  write('settings/index.html', '<input type="password">');
  assert.throws(() => verify(root), /Eingabefeld/);
  fs.unlinkSync(path.join(root, 'settings/index.html'));
  write('settings.html', '<main>Einstellungen</main>');
  assert.equal(verify(root).productionSettingsInputs, 0);
  write('ios/entry-test.js.map', JSON.stringify({ sources: ['/src/dev/content-studio.tsx'] }));
  assert.throws(() => verify(root), /Entwicklercode/);
});

test('Produktionsgate: Sprachdateien nur aus einem Katalogstand', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thaispeaker-production-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function write(relative, data) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  for (const platform of ['ios', 'android', 'web']) write(`${platform}/entry-test.js.map`, JSON.stringify({ sources: [] }));
  write('settings.html', '<main/>');
  write('assets/catalog/th.abc.catalog', JSON.stringify({ format: 2, language: 'th', sourceCatalogSha256: 'a' }));
  write('assets/catalog/th-de.abc.catalog', JSON.stringify({ format: 2, language: 'th', ui: 'de', sourceCatalogSha256: 'a' }));
  const result = verify(root, { catalogSha: 'a' });
  assert.equal(result.catalogFiles, 2);
  assert.deepEqual(result.catalogLanguages, ['th']);
  assert.throws(() => verify(root, { catalogSha: 'b' }), /passen nicht zu src\/content\/catalog\.json/);
  write('assets/catalog/es.abc.catalog', JSON.stringify({ format: 2, language: 'es', sourceCatalogSha256: 'alt' }));
  assert.throws(() => verify(root), /2 verschiedenen Katalogständen/);
});
