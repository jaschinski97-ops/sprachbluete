const fs = require('node:fs');
const path = require('node:path');
const { digestOf, assertDocument, BUDGET, keyOf } = require('./pipeline.cjs');
const domain = require('./domain.cjs');
const { planDeliveryAudio } = domain.load('src/lib/content/audio-plan');
const { pruefeZielwoerter } = domain.load('src/lib/conversation/dialog-words');
const { checkThaiTone } = domain.load('src/lib/content/tone-gate');
const { isDeliverableEntry } = domain.load('src/lib/content/audio-policy');
const { decodeAudio, decodeImage } = require('./media.cjs');
const { vocabSchluessel } = domain.load('src/lib/content/vocab-schema');
const { imageCandidateIds } = domain.load('src/lib/images/concept-images');
const { pruefeThaiWortToene, pruefeThaiDialogToene } = domain.load('src/lib/thai/tone-check');
const { createHash } = require('node:crypto');

/** `extraVocabulary`: nur für Tests mit festen Fixture-Wörtern (siehe ContentPipeline). */
function checkContent(root, { integrityOnly = false, extraVocabulary = [] } = {}) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/content/catalog.json'), 'utf8'));
  const errors = [];
  const seen = new Set();
  const vocabSeen = new Set();
  const assetMap = fs.readFileSync(path.join(root, 'src/content/assets.ts'), 'utf8');
  let audioSourceBytes = 0;
  let audioCompressedBytes = 0;
  let contentBytes = 0;
  let uncheckedThaiDelivered = 0;
  if (catalog.version !== 2 || !Array.isArray(catalog.entries)) throw Error('Unbekannte Katalogversion.');
  for (const entry of catalog.entries) {
    try {
      assertDocument(entry.kind, entry.document, [...extraVocabulary, ...catalog.entries.filter(e => e.kind === 'vocabulary').map(e => e.document)]);
      if (entry.id !== entry.document.id || seen.has(keyOf(entry))) throw Error('Doppelte oder abweichende ID.');
      seen.add(keyOf(entry));
      // Phase 2, Schritt 6: inhaltliche Duplikate im Wortschatz — derselbe
      // normalisierte Begriff je Sprache zählt als Fehler.
      if (entry.kind === 'vocabulary') {
        const schluessel = vocabSchluessel(entry.document.term, String(entry.document.language));
        if (vocabSeen.has(schluessel)) throw Error('Doppelter Wortschatz-Begriff (normalisiert): ' + schluessel);
        vocabSeen.add(schluessel);
      }
      // Redaktionell geprüfte Bildmotive (Audit 04.10.2026) tragen einen eigenen Vermerk.
      const motivGeprueft = entry.kind === 'images' && entry.check.scope === 'schema-integrity-decode-motif-review'
        && entry.check.status === 'passed' && entry.check.label === 'Motiv redaktionell geprüft';
      if (entry.review || !isDeliverableEntry(entry) || !entry.check.checkedAt || (!motivGeprueft && (!['schema-integrity-decode', 'schema-language'].includes(entry.check.scope) ||
          entry.check.label !== (entry.check.status === 'unchecked' ? 'ungeprüft' : 'automatisch geprüft')))) throw Error('Automatische Prüfung fehlt.');
      const media = entry.kind === 'audio' || entry.kind === 'images';
      if (media && !entry.asset) throw Error('Mediendatei fehlt.');
      if (entry.asset && !/^[a-f0-9]{64}\.(mp3|png|jpeg|webp)$/.test(entry.asset)) throw Error('Unsicherer Assetpfad.');
      if (entry.asset && !assetMap.includes(`${JSON.stringify(entry.asset)}: require('../../assets/content/${entry.asset}')`)) throw Error('Statischer Expo-Asset-Verweis fehlt.');
      const bytes = entry.asset ? fs.readFileSync(path.join(root, 'assets/content', entry.asset)) : Buffer.alloc(0);
      if (digestOf(entry.kind, entry.document, bytes) !== entry.digest) throw Error('Datei oder Metadaten geändert.');
      if (media && createHash('sha256').update(bytes).digest('hex') + '.' + entry.document.format !== entry.asset) throw Error('Asset-Hash stimmt nicht.');
      if (media && (bytes.length !== entry.byteSize || bytes.length !== entry.document.byteSize)) throw Error('Falsche Größenangabe.');
      if (entry.kind === 'audio') {
        if (entry.document.format !== 'mp3' || !entry.asset.endsWith('.mp3')) throw Error('Unkomprimiertes Audio.');
        audioSourceBytes += entry.sourceBytes;
        audioCompressedBytes += bytes.length;
        // 18.09.: Solltöne aus dem Katalogwortschatz — das Tor findet die ki-*-Woerter nur so.
        const toneWortschatz = [...extraVocabulary, ...catalog.entries.filter(e => e.kind === 'vocabulary').map(e => e.document)];
        const tone = checkThaiTone(entry.document, decodeAudio(path.join(root, 'assets/content', entry.asset)), 24000, { woerter: toneWortschatz });
        if (entry.check.tone?.status !== tone.status || tone.status === 'failed') throw Error('Thai-Tontor nicht bestanden oder Status verändert: ' + tone.reason);
        if (entry.document.language === 'th' && tone.status === 'unchecked') uncheckedThaiDelivered++;
      } else if (entry.kind === 'images') {
        decodeImage(path.join(root, 'assets/content', entry.asset));
      }
      contentBytes += bytes.length + Buffer.byteLength(JSON.stringify(entry));
    } catch (error) { errors.push(`${entry.kind}:${entry.id}: ${error.message}`); }
  }
  // Gegenrichtung (Konsistenz): Nichts darf in assets/content/ oder in der
  // require-Map liegen, das der Katalog nicht referenziert — verwaiste Assets
  // aus alten Generierungsläufen blähen nur das Bundle auf. Der Katalog ist
  // die Definitions-Hoheit; assets.ts wird aus ihm generiert. Diese Prüfung
  // läuft in beiden Modi: prune-orphans.cjs hält den Zustand sauber, der
  // Check verhindert Regression.
  const referencedAssets = new Set(catalog.entries.flatMap((entry) => (entry.asset ? [entry.asset] : [])));
  const assetDir = path.join(root, 'assets/content');
  const orphanFiles = (fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [])
    .filter((name) => /\.(mp3|png|jpeg|webp)$/.test(name) && !referencedAssets.has(name)).sort();
  if (orphanFiles.length) errors.push(`${orphanFiles.length} nicht referenzierte Mediendateien in assets/content (${orphanFiles.slice(0, 3).join(', ')}${orphanFiles.length > 3 ? ' …' : ''}); verwaiste Assets mit scripts/content/prune-orphans.cjs --apply entfernen.`);
  const assetKeys = [...assetMap.matchAll(/"([a-f0-9]{64}\.(?:mp3|png|jpeg|webp))": require\('/g)].map((match) => match[1]);
  const orphanKeys = assetKeys.filter((key) => !referencedAssets.has(key));
  if (orphanKeys.length) errors.push(`${orphanKeys.length} Schlüssel in src/content/assets.ts ohne Katalogreferenz (${orphanKeys.slice(0, 3).join(', ')}${orphanKeys.length > 3 ? ' …' : ''}); die require-Map wird aus dem Katalog generiert und darf keine eigenen Einträge haben.`);
  if (contentBytes > BUDGET) errors.push(`Inhaltsbudget von ${Math.round(BUDGET / (1024 * 1024))} MiB überschritten. Keine automatische Kürzung zulässig.`);
  const situations = catalog.entries.filter((entry) => entry.kind === 'situations').map((entry) => entry.document);
  const words = [...catalog.entries.filter(e => e.kind === 'vocabulary').map(e => e.document)];
  const neededAudio = planDeliveryAudio(situations, undefined, words);
  const missingAudio = neededAudio.filter((spec) => !seen.has(`audio:${spec.id}`));
  // Bilder je Begriff (24.10.2026): Ein Wort hat ein Bild, wenn sein Begriff
  // (oder, alter Bestand, das Wort selbst) eines hat — aus welcher Sprache auch immer.
  const missingImages = words.filter((entry) => entry.isConcrete && !imageCandidateIds(entry).some((id) => seen.has(`images:${id}`)));
  // Dialoge aus dem Wortschatz (24.10.2026): Statt gegen ein festes Raster
  // zu zählen, muss jedes gespeicherte Zielwort existieren, zur Dialogsprache
  // gehören und im Dialog vorkommen — sonst übt das Kapitel etwas, das der
  // Dialog gar nicht zeigt.
  const wortNachId = new Map([...extraVocabulary, ...words].map((word) => [word.id, word]));
  for (const situation of situations) {
    if (!situation.vocabIds) continue;
    const sprache = situation.direction.split('_to_')[1];
    const unbekannt = situation.vocabIds.filter((id) => String(wortNachId.get(id)?.language) !== sprache);
    if (unbekannt.length) { errors.push(`situations:${situation.id}: Zielwörter ohne Wortschatzeintrag dieser Sprache: ${unbekannt.join(', ')}`); continue; }
    const { fehlend } = pruefeZielwoerter(situation, situation.vocabIds.map((id) => wortNachId.get(id)));
    if (fehlend.length) errors.push(`situations:${situation.id}: Zielwörter nicht im Dialog: ${fehlend.map((word) => word.term).join(', ')}`);
  }
  // Thai-Ton-Engine (24.10.2026): Schrift gegen Umschrift in Wörtern,
  // Beispielsätzen und Dialogzeilen. Widerspruch = Fehler, unsicher = Hinweis.
  const thaiTonHinweise = [];
  for (const word of words.filter((entry) => String(entry.language) === 'th')) {
    const pruefung = pruefeThaiWortToene(word);
    errors.push(...pruefung.fehler.map((text) => `vocabulary:${word.id}: ${text}`));
    thaiTonHinweise.push(...pruefung.hinweise.map((text) => `vocabulary:${word.id}: ${text}`));
  }
  for (const situation of situations.filter((entry) => entry.direction.split('_to_')[1] === 'th')) {
    const pruefung = pruefeThaiDialogToene(situation.scriptTurns ?? []);
    errors.push(...pruefung.fehler.map((text) => `situations:${situation.id}: ${text}`));
    thaiTonHinweise.push(...pruefung.hinweise.map((text) => `situations:${situation.id}: ${text}`));
  }
  if (!integrityOnly) {
    if (missingAudio.length) errors.push(`${missingAudio.length}/${neededAudio.length} benötigte Hörclips fehlen (auch Deutsch). System-TTS ist kein garantierter Offline-Ersatz.`);
    if (missingImages.length) errors.push(`${missingImages.length} konkrete Vokabeln ohne automatisch geprüftes Bild.`);
  }
  return { checkedAt: new Date().toISOString(), integrityOnly, entries: catalog.entries.length, contentBytes,
    audioSourceBytes, audioCompressedBytes, uncheckedThaiDelivered, thaiTonHinweise, missing: { audio: missingAudio.map((spec) => spec.id), images: missingImages.map((entry) => entry.id) }, errors };
}
if (require.main === module) {
  const result = checkContent(path.resolve(__dirname, '../..'), { integrityOnly: process.argv.includes('--integrity-only') });
  console.log(JSON.stringify({ ...result, thaiTonHinweise: { anzahl: result.thaiTonHinweise.length, erste: result.thaiTonHinweise.slice(0, 20) }, missing: Object.fromEntries(Object.entries(result.missing).map(([kind, ids]) => [kind, ids.length])) }, null, 2));
  process.exitCode = result.errors.length ? 1 : 0;
}
module.exports = { checkContent };
