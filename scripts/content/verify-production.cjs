const fs = require('node:fs');
const path = require('node:path');
function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}
// Katalog je Lernsprache: Alle Sprachdateien im Export müssen aus EINEM
// Katalogstand stammen, auf Wunsch genau aus `catalogSha` (sha256 der
// `catalog.json`). Sonst trüge der Build alte Texte.
function verifyCatalogFiles(files, catalogSha) {
  const catalogs = files.filter((file) => file.endsWith('.catalog'));
  const shas = new Set();
  const bases = new Set();
  for (const file of catalogs) {
    const head = JSON.parse(fs.readFileSync(file, 'utf8'));
    shas.add(head.sourceCatalogSha256);
    if (head.ui === undefined) bases.add(head.language);
  }
  if (shas.size > 1) throw Error(`Sprachdateien aus ${shas.size} verschiedenen Katalogständen im Export.`);
  if (catalogSha && catalogs.length && !shas.has(catalogSha)) throw Error('Die Sprachdateien im Export passen nicht zu src/content/catalog.json.');
  return { catalogFiles: catalogs.length, catalogLanguages: [...bases].sort() };
}
function verify(root, { catalogSha } = {}) {
  const files = filesUnder(root);
  const maps = files.filter((file) => /entry-.*\.(js|hbc)\.map$/.test(file));
  if (maps.length !== 3) throw Error('Die drei Produktions-Source-Maps für Web, Android und iOS fehlen.');
  const checked = [];
  for (const file of maps) {
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sources = map.sources.map((source) => source.replaceAll('\\', '/'));
    const forbidden = sources.filter((source) => /src\/(dev\/|components\/generator-card|lib\/(api-key|providers\/(text|image|audio)|content\/rejections))/.test(source));
    if (forbidden.length) throw Error(`Entwicklercode im Produktionsgraph: ${forbidden.join(', ')}`);
    checked.push({ platform: path.basename(path.dirname(file)), modules: sources.length, generatorModules: forbidden.length });
  }
  for (const file of files.filter((file) => /\.(js|html)$/.test(file))) {
    const content = fs.readFileSync(file, 'utf8');
    if (/API-Schlüssel|Schlüssel übernehmen|Generator:|generativelanguage\.googleapis\.com|api\.anthropic\.com|stability-api-key/.test(content)) throw Error(`Schlüssel- oder Anbietercode in ${file}`);
  }
  const settingsIndex = path.join(root, 'settings/index.html');
  const settings = fs.readFileSync(fs.existsSync(settingsIndex)
    ? settingsIndex : path.join(root, 'settings.html'), 'utf8');
  if (/<input\b|<textarea\b|role="progressbar"/.test(settings)) throw Error('Eingabefeld/Fortschrittsbalken in Produktionseinstellungen.');
  return { verifiedAt: new Date().toISOString(), checked, productionSettingsInputs: 0, ...verifyCatalogFiles(files, catalogSha) };
}
if (require.main === module) {
  const root = path.resolve(process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'build-verification/production');
  const catalog = path.join(__dirname, '../../src/content/catalog.json');
  const catalogSha = fs.existsSync(catalog) ? require('node:crypto').createHash('sha256').update(fs.readFileSync(catalog)).digest('hex') : undefined;
  console.log(JSON.stringify(verify(root, { catalogSha }), null, 2));
  if (process.argv.includes('--serve')) {
    require('node:http').createServer((req, res) => {
      const relative = new URL(req.url, 'http://localhost').pathname;
      let file = path.resolve(root, '.' + relative);
      if (!path.extname(relative)) {
        const index = path.join(file, 'index.html');
        file = fs.existsSync(index) ? index : file + '.html';
      }
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      try {
        const content = fs.readFileSync(file);
        const type = { '.catalog': 'application/json', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf' }[path.extname(file)] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type }); res.end(content);
      } catch { res.writeHead(404); res.end(); }
    }).listen(8083, '127.0.0.1', () => console.log('Produktionsprüfung: http://localhost:8083/settings'));
  }
}
module.exports = { verify };
