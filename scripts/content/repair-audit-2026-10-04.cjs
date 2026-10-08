// Idempotent, local editorial repair. No provider calls, no new media files.
const fs = require('node:fs');
const path = require('node:path');
const { digestOf, assertDocument, shippingBytes, BUDGET } = require('./pipeline.cjs');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'src/content/catalog.json');
const before = fs.readFileSync(file, 'utf8');
const catalog = JSON.parse(before);
const stamp = '2026-10-04T10:00:00.000Z';
const generatedAt = Date.parse(stamp);
const find = (kind, id) => catalog.entries.find(entry => entry.kind === kind && entry.id === id);
const changed = [];
const install = entry => {
  const bytes = entry.asset ? fs.readFileSync(path.join(root, 'assets/content', entry.asset)) : undefined;
  assertDocument(entry.kind, entry.document, catalog.entries.filter(e => e.kind === 'vocabulary').map(e => e.document));
  entry.digest = digestOf(entry.kind, entry.document, bytes);
  const index = catalog.entries.findIndex(e => e.kind === entry.kind && e.id === entry.id);
  if (index < 0) catalog.entries.push(entry); else catalog.entries[index] = entry;
  changed.push(`${entry.kind}:${entry.id}`);
};
const imageCopy = (from, id) => {
  const entry = structuredClone(find('images', from));
  if (!entry) throw Error(`Missing reviewed image: ${from}`);
  entry.id = id;
  entry.document.id = entry.document.vocabId = id;
  entry.check = { ...entry.check, checkedAt: stamp, scope: 'schema-integrity-decode-motif-review', label: 'Motiv redaktionell geprüft' };
  return entry;
};
const apple = find('vocabulary', 'ki-en-e05784d0').document;
for (const [language, term, romanization, noun, source] of [
  ['de', 'Apfel', 'Ap-fel', { article: 'der', plural: 'Äpfel' }, 'https://www.duden.de/rechtschreibung/Apfel'],
  ['es', 'manzana', 'man-za-na', { gender: 'f', article: 'la', plural: 'manzanas' }, 'https://dle.rae.es/manzana'],
]) {
  const id = `ki-${language}-redaktion-apfel`;
  if (find('vocabulary', id)) continue;
  const document = {
    id, generatedAt, learningStage: 'beginner', language, concept: apple.concept,
    term, romanization, german: 'Apfel', translations: apple.translations,
    syllables: language === 'es' ? [{ roman: 'man', stressed: false }, { roman: 'za', stressed: true }, { roman: 'na', stressed: false }] : [{ roman: 'Ap' }, { roman: 'fel' }],
    partOfSpeech: 'noun', register: 'neutral', isConcrete: true,
    [language === 'de' ? 'germanNoun' : 'spanishNoun']: noun,
    sourceVerified: false, source,
    verificationNote: 'Redaktionell ergänzt: Form, Bedeutung und Genus aus dem Wörterbuch; Aussprache und übernommene Brückentexte nicht unabhängig geprüft.',
  };
  install({ kind: 'vocabulary', id, document, check: { status: 'unchecked', label: 'ungeprüft', checkedAt: stamp, scope: 'schema-language', reason: document.verificationNote } });
  install(imageCopy('ki-en-e05784d0', id));
}
for (const [to, from, rejected] of [
  ['ki-th-305f3ec3', 'ki-en-8f22a374', 'd4f70f9be80e8ad66b134a86c19cc290071b1c6d7374afda572ae662408e7ccd.webp'],
  [catalog.entries.find(e => e.kind === 'images' && e.asset === 'c33e81738ab44452cc4603f38e5991e173e9b094d340d055921dc5dda459abd6.webp')?.id, 'ki-de-bbd783b1', 'c33e81738ab44452cc4603f38e5991e173e9b094d340d055921dc5dda459abd6.webp'],
]) {
  if (to && find('images', to)?.asset === rejected) install(imageCopy(from, to));
}
if (catalog.entries.reduce((sum, entry) => sum + shippingBytes(entry), 0) > BUDGET) throw Error('Shipping budget exceeded');
if (changed.length) {
  const backup = path.join(root, 'build-verification/audit-2026-10-04/catalog-before-repair.json');
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, before);
  fs.writeFileSync(file + '.repair.tmp', JSON.stringify(catalog, null, 2) + '\n');
  fs.renameSync(file + '.repair.tmp', file);
}
// Keep the native index aligned; keep original files and the backup intact.
const indexFile = path.join(root, 'src/content/assets.ts');
const assets = new Set(catalog.entries.flatMap(entry => entry.asset ? [entry.asset] : []));
const index = fs.readFileSync(indexFile, 'utf8');
const trimmed = index.split('\n').filter(line => {
  const match = line.match(/^\s*"([a-f0-9]{64}\.[a-z]+)":/);
  return !match || assets.has(match[1]);
}).join('\n');
if (trimmed !== index) fs.writeFileSync(indexFile, trimmed);
console.log(JSON.stringify({ changed, newMediaFiles: 0 }, null, 2));
