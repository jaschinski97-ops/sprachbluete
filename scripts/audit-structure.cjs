// Static import/require graph, including platform variants and configured entry
// points. A zero count is evidence for inspection, not permission to delete.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function walk(folder) {
  return fs.readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap(entry => {
    const file = path.posix.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const tracked = [...walk('src'), ...walk('scripts'), ...fs.readdirSync(root).filter(file => /\.[cm]?js$/.test(file))];
const files = tracked.filter(file => /\.(tsx?|[cm]?js)$/.test(file) && fs.existsSync(path.join(root, file)));
const edges = [];
const packages = new Map();
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    let name;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) name = node.moduleSpecifier.text;
    if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.getText(source) === 'require' || node.expression.kind === ts.SyntaxKind.ImportKeyword)) name = node.arguments[0].text;
    if (name) {
      if (name.startsWith('.') || name.startsWith('@/')) {
        const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(root, path.dirname(file), name);
        const options = [base, ...['.ts', '.tsx', '.cjs', '.js', '.web.ts', '.web.tsx', '.native.ts', '.native.tsx', '/index.ts'].map(ext => base + ext)];
        for (const candidate of options) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) edges.push({ from: file, to: path.relative(root, candidate).replaceAll('\\', '/') });
      } else {
        const dependency = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];
        packages.set(dependency, [...(packages.get(dependency) ?? []), file]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
const candidates = ['expo-device', 'expo-font', 'expo-glass-effect', '@expo/ui'];
const result = {
  checkedAt: new Date().toISOString(), sourceFiles: files.length, importEdges: edges.length,
  note: 'Static imports/reexports/require/dynamic import, all platform variants. Config and npm script roots listed separately. No automatic dead-code deletion.',
  scripts: pkg.scripts, expoPlugins: JSON.parse(fs.readFileSync(path.join(root, 'app.json'))).expo.plugins,
  candidates: candidates.map(name => ({ name, directImports: packages.get(name) ?? [],
    requiredBy: Object.entries(lock.packages).filter(([location, entry]) => location &&
      (entry.dependencies?.[name] || entry.peerDependencies?.[name])).map(([location]) => location) })),
  zeroIncomingScripts: files.filter(file => file.startsWith('scripts/') && !edges.some(edge => edge.to === file)),
  edges,
};
fs.writeFileSync(path.resolve(root, process.argv[2] ?? 'pipeline/reports/structure-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sourceFiles: result.sourceFiles, importEdges: result.importEdges, candidates: result.candidates, zeroIncomingScripts: result.zeroIncomingScripts }, null, 2));
