const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const ffmpeg = require('ffmpeg-static');
const domain = require('./domain.cjs');
const { isValidSituation } = domain.load('src/lib/conversation/types');
const { isValidVocabEntry, pruefeVocabDoc } = domain.load('src/lib/content/vocab-schema');
const { isValidExamModule } = domain.load('src/lib/exam/types');
const { isValidAudioClip, clipIdFor } = domain.load('src/lib/clips/types');
const { checkThaiTone, TONE_GATE_LIMITS, TONE_GATE_VERSION } = domain.load('src/lib/content/tone-gate');
const { isDeliverableEntry } = domain.load('src/lib/content/audio-policy');
// Die EINE Lernsprachen-Liste der App (src/lib/languages/types.ts).
const { LANGUAGE_CODES } = domain.load('src/lib/languages/types');
const { decodeAudio, decodeImage } = require('./media.cjs');
const { tryWriteProtocol } = require('../pipeline/protocol.cjs');

const KINDS = ['situations', 'images', 'audio', 'exam', 'vocabulary'];
// VERSANDBUDGET (21.09.2026): 512 MiB. Die alte 256-MiB-Marke war das
// Testbudget vom 08.09. (~185 MiB Inhalt) — der Bestand ist seit dem
// Thai-Audio-Lauf real bei ~320 MiB (de/en/es/th Clips + Bilder). Die
// Paket-Architektur (docs/ROADMAP-v2-sprachplattform.md) kennt das alte
// 150-MiB-Store-Ziel nicht mehr: Die App selbst bleibt klein, Audio+Bilder
// wandern pro Sprache in Download-Pakete (GitHub Releases); Play erlaubt
// 500 MB Basismodul — 512 MiB gibt neben dem vollen vier-Sprachen-Bestand
// Luft für Bildpakete, ohne dass ein Sprachlauf am Budget scheitert.
const BUDGET = 512 * 1024 * 1024;
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const digestOf = (kind, document, bytes = Buffer.alloc(0)) => sha(JSON.stringify(canonical({ kind, document, assetHash: sha(bytes) })));
const keyOf = (entry) => `${entry.kind}:${entry.id}`;
// Budget and size report count only what actually ships. The diagnostic F0
// track in check.tone.track is stripped from every catalog entry (see the
// delivered copies in publish()), so it must not count toward the budget.
function shippingBytes(entry) {
  const copy = structuredClone(entry);
  if (copy.check?.tone) delete copy.check.tone.track;
  return (entry.byteSize ?? 0) + Buffer.byteLength(JSON.stringify(copy));
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function atomicFile(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  await fs.writeFile(temp, bytes);
  await fs.rename(temp, file);
}
async function atomicJson(file, value) {
  await atomicFile(file, JSON.stringify(value, null, 2) + '\n');
}
function assertDocument(kind, doc, vocabulary = []) {
  if (!KINDS.includes(kind) || !doc || !/^[a-zA-Z0-9_-]{1,180}$/.test(doc.id)) throw Error('Ungültige Inhaltsart oder ID.');
  const valid = kind === 'situations' ? isValidSituation(doc) && ['A1','A2','B1','B2','C1','C2'].includes(doc.level) && ['greeting','market','restaurant','travel'].includes(doc.topic) && Number.isFinite(doc.generatedAt) && typeof doc.modelUsed === 'string' :
    kind === 'exam' ? isValidExamModule(doc) && doc.source === 'generated' :
    // 17.09.: 'chatgpt-helper' ergänzt — der Helper-Weg der Audio-Karte erzeugt
    // Clips mit genau diesem Provider; ohne ihn verwarf der Stage-Export jeden
    // Clip mit „Inhalt verletzt den audio-Vertrag" (141 im Nutzer-Lauf).
    kind === 'audio' ? isValidAudioClip(doc) && doc.id === clipIdFor(doc.language, doc.text) && ['vocab','example','turn'].includes(doc.kind) && ['gemini','chatgpt','chatgpt-helper'].includes(doc.provider) && typeof doc.voice === 'string' && typeof doc.model === 'string' && Number.isFinite(doc.generatedAt) :
    // Phase 2, Schritt 4: Wortschatz als Inhaltsart — derselbe Weg über
    // Stage und catalog.json. 'de' ist gültig (abgeleiteter de-Pool).
    kind === 'vocabulary' ? isValidVocabEntry(doc) :
    doc.id === doc.vocabId && vocabulary.some((word) => word.id === doc.id && word.isConcrete) && ['png','jpeg','webp'].includes(doc.format) && typeof doc.prompt === 'string' && typeof doc.model === 'string' && Number.isFinite(doc.generatedAt);
  if (!valid) throw Error(`Inhalt verletzt den ${kind}-Vertrag: ${doc.id}`);
  // Export content documents only. Preferences, keys, learner records and
  // unrecognised top-level fields cannot cross this boundary.
  const fields = {
    situations: 'id level topic direction title setting scriptTurns corrections generatedAt modelUsed translations',
    images: 'id vocabId format byteSize blobKey prompt model generatedAt',
    audio: 'id language text kind sourceId format byteSize durationMs blobKey provider model voice generatedAt synthetic',
    exam: 'id certificate level skill direction title instruction stimulus minutes source generatedAt modelUsed taskType items production',
    vocabulary: 'id generatedAt learningStage language concept term romanization syllables ipa ipaAccent ipaSyllables german germanNoun germanVerb germanAdjective spanishNoun spanishVerb englishVerb englishSpelling translations partOfSpeech register isConcrete exampleTerm exampleRoman exampleGerman sourceVerified source verificationNote note',
  }[kind].split(' ');
  if (Object.keys(doc).some((key) => !fields.includes(key))) throw Error('Unbekannte Metadatenfelder; Export verweigert.');
}
async function compressAudio(input, output) {
  await exec(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe',
    '-i', input, '-map','0:a:0','-vn','-map_metadata','-1','-ac','1','-ar','24000',
    '-c:a','libmp3lame','-b:a','64k', output], { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
}
class ContentPipeline {
  /**
   * `extraVocabulary`: zusätzliche, NICHT im Katalog stehende Wörter, auf die
   * sich Clips/Bilder beziehen dürfen — nur für Tests mit festen
   * Fixture-Wörtern. Der Betrieb kennt ausschließlich den Katalog-Wortschatz.
   */
  constructor(root, { extraVocabulary = [] } = {}) {
    this.root = root;
    this.extraVocabulary = extraVocabulary;
    this.work = path.join(root, '.content-studio');
    this.stageFile = path.join(this.work, 'stage.json');
    this.catalogFile = path.join(root, 'src/content/catalog.json');
    // Berichte leben seit der pipeline/-Struktur (ROADMAP v2, Phase 2) unter
    // pipeline/reports/; alte Kopien in content/ sind veraltet (content/README.md).
    this.reportFile = path.join(root, 'pipeline/reports/automatic-checks.json');
  }
  async catalog() { return readJson(this.catalogFile, { version: 2, entries: [] }); }
  async state() {
    const stageState = await readJson(this.stageFile, { version: 2, entries: [] });
    const shipped = await this.catalog();
    // Phase 2, Schritt 1 (14.09.2026): Der Bericht wird LIVE aus Stage und
    // Katalog ABGELEITET statt aus pipeline/reports/automatic-checks.json
    // durchgereicht. Die Datei wird nur bei publish() geschrieben — nach den
    // Grundstock-Kürzungen (d1a54ac, 677cd7b) listete der Bericht deshalb
    // weiter 3.085 Einträge, die längst gelöscht waren. Die Ableitung kennt
    // denselben Stand wie das Studio: Stage gewinnt per Schlüssel gegen den
    // Katalog (jüngerer Stand), gelöschte Einträge verschwinden, und ein
    // Eintrag ohne Prüfungsinformation erscheint ehrlich als ungeprüft. Die
    // Report-Datei bleibt als Messspuren-Archiv von publish() bestehen.
    return { stage: stageState, shipped, report: this.deriveReport(stageState, shipped) };
  }
  /**
   * Berichtseinträge aus Stage ∪ Katalog, dedupe per `kind:id` (Stage
   * gewinnt), deterministisch sortiert. Je Eintrag die Anzeige-Felder des
   * Prüfberichts plus die Prüfung selbst — ein fehlender Check zählt als
   * ungeprüft mit Grund, nie als bestanden.
   */
  deriveReport(stageState, shipped) {
    const merged = new Map(shipped.entries.map((entry) => [keyOf(entry), entry]));
    for (const entry of stageState.entries) merged.set(keyOf(entry), entry);
    const entries = [...merged.values()]
      .sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
      .map((entry) => ({
        kind: entry.kind,
        id: entry.id,
        digest: entry.digest,
        text: entry.document.text ?? entry.document.title,
        language: entry.document.language,
        sourceId: entry.document.sourceId,
        clipKind: entry.document.kind,
        asset: entry.asset,
        ...(entry.check ?? {
          status: 'unchecked',
          label: 'ungeprüft',
          scope: 'none',
          reason: 'Keine Prüfungsinformation hinterlegt.',
        }),
      }));
    return { checkedAt: new Date().toISOString(), limitations: TONE_GATE_LIMITS, entries };
  }
  /** Ist das eine wohlgeformte Inhaltsart/ID für die Lösch-Endpunkte? */
  static gueltigerSchluessel(kind, id) {
    return KINDS.includes(kind) && /^[a-zA-Z0-9_-]{1,180}$/.test(String(id ?? ''));
  }
  /**
   * Löscht einen Stage-Eintrag (aussortierte oder unerwünschte Entwürfe).
   * Liefert den entfernten Eintrag, `null` wenn es ihn nicht gibt.
   */
  async deleteFromStage(kind, id) {
    if (!ContentPipeline.gueltigerSchluessel(kind, id)) throw Error('Ungültige Inhaltsart oder ID.');
    const stageState = await readJson(this.stageFile, { version: 2, entries: [] });
    const entry = stageState.entries.find((item) => keyOf(item) === `${kind}:${id}`);
    if (!entry) return null;
    stageState.entries = stageState.entries.filter((item) => keyOf(item) !== `${kind}:${id}`);
    await atomicJson(this.stageFile, stageState);
    // Ohne Vermerk in `deleted` käme der Entwurf mit dem nächsten Export aus
    // dem Browser-Speicher zurück (isDeletedDraft prüft genau diese Liste).
    const shipped = await this.catalog();
    await this.writeCatalog({ ...shipped, deleted: { ...shipped.deleted, [`${kind}:${id}`]: Date.now() } });
    return entry;
  }
  /**
   * Die Schlüssel, die mit einem Eintrag zusammen gehen müssen: Bilder hängen
   * an ihrer Vokabel (`vocabId`). Bliebe ein Bild ohne Vokabel zurück, würfe
   * der nächste Publish „Inhalt verletzt den images-Vertrag“ — für alles.
   */
  static abhaengigeSchluessel(kind, ids, entries) {
    if (kind !== 'vocabulary') return [];
    const weg = new Set(ids);
    return entries
      .filter((item) => item.kind === 'images' && weg.has(item.document?.vocabId || item.id))
      .map(keyOf);
  }
  /**
   * Löscht einen AUSLIEFERTEN Eintrag aus dem Katalog — und bewusst AUCH den
   * gleichnamigen Stage-Eintrag: publish() merged Stage nur HINZU, ein
   * überlebender Stage-Zwilling käme beim nächsten Export zurück (der
   * Fallstrick aus den Grundstock-Kürzungen). Regeneriert assets.ts mit
   * (writeCatalog) und entfernt die Asset-Datei, sobald kein anderer Eintrag
   * sie referenziert.
   */
  async deleteFromCatalog(kind, id) {
    if (!ContentPipeline.gueltigerSchluessel(kind, id)) throw Error('Ungültige Inhaltsart oder ID.');
    const key = `${kind}:${id}`;
    const shipped = await this.catalog();
    const entry = shipped.entries.find((item) => keyOf(item) === key);
    if (!entry) return null;
    const stageState = await readJson(this.stageFile, { version: 2, entries: [] });
    const schluessel = new Set([
      key,
      ...ContentPipeline.abhaengigeSchluessel(kind, [id], [...shipped.entries, ...stageState.entries]),
    ]);
    const weg = shipped.entries.filter((item) => schluessel.has(keyOf(item)));
    shipped.entries = shipped.entries.filter((item) => !schluessel.has(keyOf(item)));
    if (stageState.entries.some((item) => schluessel.has(keyOf(item)))) {
      stageState.entries = stageState.entries.filter((item) => !schluessel.has(keyOf(item)));
      await atomicJson(this.stageFile, stageState);
    }
    // Vermerk in `deleted`: sonst holt der nächste Export den Eintrag aus dem
    // Browser-Speicher zurück.
    const jetzt = Date.now();
    shipped.deleted = { ...shipped.deleted, ...Object.fromEntries([...schluessel].map((k) => [k, jetzt])) };
    const verbleibendeAssets = new Set(
      shipped.entries.flatMap((item) => (item.asset ? [item.asset] : []))
    );
    await this.writeCatalog(shipped);
    const entfernt = [];
    for (const item of weg) {
      if (!item.asset || verbleibendeAssets.has(item.asset)) continue;
      await fs.rm(path.join(this.root, 'assets/content', item.asset), { force: true });
      await fs.rm(path.join(this.work, item.asset), { force: true });
      await fs.rm(path.join(this.root, 'public/content', item.asset), { force: true });
      entfernt.push(item.asset);
    }
    tryWriteProtocol({
      script: 'content-pipeline',
      action: 'delete',
      items: schluessel.size,
      result: 'ok',
      notes: `${[...schluessel].join(', ')}${entfernt.length ? ` · Assets ${entfernt.join(', ')} entfernt` : ''}`,
    }, { root: this.root });
    return entry;
  }
  /**
   * Löscht eine Auswahl (Art × Sprachen) über die Studio-Route
   * /catalog/clear-selection. Der frühere Aufruf ohne Auswahl („alles
   * Generierte“, Wartungskarte) ist seit 26.09. entfernt: Seit der erzeugte
   * Wortschatz der Grundstock ist, traf sein Stichtag den ganzen Katalog.
   *
   * Ursprung, Nutzerwunsch 15.09.: „wo ist der Button, die gesamten generierten
   * Inhalte zu löschen" — alles, was NACH dem Grundstock-Abschluss erzeugt
   * wurde, aus Katalog UND Stage entfernen (dasselbe Provenienz-Urteil für
   * beide, damit publish() nichts zurückholen kann), verwaiste Asset-Dateien
   * mitlöschen, assets.ts über writeCatalog neu schreiben.
   *
   * STICHTAG: Der Grundstock wurde am 13.09.2026 eingefroren (d1a54ac/
   * 677cd7b); seine Clips, Bilder und Situationen tragen generatedAt vom
   * 06.–13.09. Alles mit generatedAt ab dem 14.09. gilt als „generiert".
   * KI-Vokabeln haben kein generatedAt — sie tragen ki--IDs. `preview`
   * zählt nur und ändert nichts.
   */
  async clearGenerated({ preview = false, kind, languages, includeBase = false } = {}) {
    if (kind !== undefined && !['vocabulary', 'situations', 'images', 'audio'].includes(kind)) throw Error('Ungültige Löschart.');
    if (languages !== undefined && (!Array.isArray(languages) || !languages.length || languages.some(lang => !LANGUAGE_CODES.includes(lang)))) throw Error('Ungültige Sprachauswahl.');
    const shipped = await this.catalog();
    const stageState = await readJson(this.stageFile, { version: 2, entries: [] });
    const vocab = [...this.extraVocabulary, ...[...shipped.entries, ...stageState.entries].filter(e => e.kind === 'vocabulary').map(e => e.document)];
    const stichtag = Date.parse('2026-09-14T00:00:00.000Z');
    const istGeneriert = (entry) => {
      if (kind && entry.kind !== kind) return false;
      const language = entry.kind === 'situations' ? entry.document.direction.split('_to_')[1] :
        entry.kind === 'images' ? vocab.find(word => word.id === entry.document.vocabId)?.language : entry.document.language;
      if (languages && !languages.includes(language)) return false;
      if (includeBase && ['situations','images','audio'].includes(entry.kind)) return true;
      if (entry.kind === 'vocabulary') return String(entry.id ?? '').startsWith('ki-');
      const zeit = entry.document?.generatedAt;
      if (typeof zeit === 'number') return zeit >= stichtag;
      if (typeof zeit === 'string') return Date.parse(zeit) >= stichtag;
      return false;
    };
    // Bilder gehen mit ihrer Vokabel — sonst scheitert jeder spätere Publish
    // am images-Vertrag (Bild ohne Vokabel).
    const vokabelWeg = [...shipped.entries, ...stageState.entries].filter(e => e.kind === 'vocabulary' && istGeneriert(e)).map(e => String(e.id));
    const mitBildern = new Set(ContentPipeline.abhaengigeSchluessel('vocabulary', vokabelWeg, [...shipped.entries, ...stageState.entries]));
    const istWeg = (entry) => istGeneriert(entry) || mitBildern.has(keyOf(entry));
    const katalogWeg = shipped.entries.filter(istWeg);
    const stageWeg = stageState.entries.filter(istWeg);
    const zahlen = {
      katalog: katalogWeg.length,
      stage: stageWeg.length,
      assets: new Set([...katalogWeg, ...stageWeg].filter((entry) => entry.asset).map(entry => entry.asset)).size,
    };
    if (preview) return zahlen;
    const behalten = new Set(
      [...shipped.entries, ...stageState.entries]
        .filter((entry) => !istWeg(entry))
        .flatMap((entry) => (entry.asset ? [entry.asset] : []))
    );
    for (const entry of [...katalogWeg, ...stageWeg]) {
      if (!entry.asset || behalten.has(entry.asset)) continue;
      if (!/^[a-f0-9]{64}\.(mp3|png|jpeg|webp)$/.test(entry.asset)) throw Error('Unsicherer Assetpfad.');
      await fs.rm(path.join(this.root, 'assets/content', entry.asset), { force: true });
      await fs.rm(path.join(this.work, entry.asset), { force: true });
      await fs.rm(path.join(this.root, 'public/content', entry.asset), { force: true });
    }
    const deleted = { ...shipped.deleted };
    for (const entry of [...katalogWeg, ...stageWeg]) deleted[keyOf(entry)] = Date.now();
    const clearedBefore = { ...shipped.clearedBefore };
    if (includeBase && kind) {
      for (const scope of languages ? languages.map(lang => `${kind}:${lang}`) : [kind]) clearedBefore[scope] = Date.now();
    }
    await this.writeCatalog({ ...shipped, deleted, clearedBefore, entries: shipped.entries.filter((entry) => !istWeg(entry)) });
    await atomicJson(this.stageFile, { version: 2, entries: stageState.entries.filter((entry) => !istWeg(entry)) });
    tryWriteProtocol({
      script: 'content-pipeline',
      action: 'clear-generated',
      items: zahlen.katalog + zahlen.stage,
      result: 'ok',
      notes: `katalog ${zahlen.katalog}, stage ${zahlen.stage}, assets ${zahlen.assets}`,
    }, { root: this.root });
    return zahlen;
  }
  async stage({ kind, document, base64 }) {
    const state = await this.state();
    assertDocument(kind, document, [...this.extraVocabulary, ...state.shipped.entries.filter(e => e.kind === 'vocabulary').map(e => e.document)]);
    const language = document.language ?? document.direction?.split('_to_')[1] ?? (kind === 'images' ? [...this.extraVocabulary, ...state.shipped.entries.filter(e => e.kind === 'vocabulary').map(e => e.document)].find(word => word.id === document.vocabId)?.language : undefined);
    const cutoff = Math.max(state.shipped.deleted?.[`${kind}:${document.id}`] ?? -1, state.shipped.clearedBefore?.[kind] ?? -1, state.shipped.clearedBefore?.[`${kind}:${language}`] ?? -1);
    if (cutoff >= 0 && (kind !== 'vocabulary' || document.id.startsWith('ki-')) && (document.generatedAt ?? 0) <= cutoff) throw Error('Dieser alte Entwurf wurde gelöscht. Bitte neu erzeugen.');
    let bytes = Buffer.alloc(0);
    let sourceBytes;
    const doc = { ...document };
    const media = kind === 'audio' || kind === 'images';
    await fs.mkdir(this.work, { recursive: true });
    if (media) {
      if (typeof base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64) || !base64) throw Error('Mediendatei fehlt oder Base64 ist beschädigt.');
      bytes = Buffer.from(base64, 'base64');
      sourceBytes = bytes.length;
      if (sourceBytes !== doc.byteSize) throw Error('Bytezahl stimmt nicht mit den Metadaten überein.');
      if (kind === 'audio') {
        const input = path.join(this.work, 'input.' + doc.format);
        const output = path.join(this.work, 'compressed.mp3');
        try {
          await fs.writeFile(input, bytes);
          await compressAudio(input, output);
          bytes = await fs.readFile(output);
        } finally {
          await fs.rm(input, { force: true });
          await fs.rm(output, { force: true });
        }
        doc.format = 'mp3';
      } else {
        const good = doc.format === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a','hex')) :
          doc.format === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 :
          bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!good) throw Error('Dateityp stimmt nicht mit dem Bildformat überein.');
      }
      doc.byteSize = bytes.length;
      doc.blobKey = sha(bytes) + '.' + doc.format;
    } else if (base64 !== undefined) throw Error('Textinhalt darf keine Binärdaten enthalten.');
    const digest = digestOf(kind, doc, bytes);
    const entry = { kind, id: doc.id, document: doc, digest,
      ...(media ? { asset: doc.blobKey, byteSize: bytes.length, sourceBytes } : {}) };
    if (media) await fs.writeFile(path.join(this.work, entry.asset), bytes);
    // 18.09.: Das Tontor liest die Solltöne aus dem Wortschatz — alles, was
    // im Bestand (shipped ∪ stage) an Vokabeln liegt. Ohne
    // diesen Kontext fände das Tor die erzeugten ki-*-Wörter nicht.
    const toneWortschatz = [
      ...this.extraVocabulary,
      ...state.shipped.entries.filter((item) => item.kind === 'vocabulary').map((item) => item.document),
      ...state.stage.entries.filter((item) => item.kind === 'vocabulary').map((item) => item.document)];
    entry.check = this.checkEntry(entry, media ? path.join(this.work, entry.asset) : undefined, toneWortschatz);
    state.stage.version = 2;
    state.stage.entries = [...state.stage.entries.filter((item) => keyOf(item) !== keyOf(entry)), entry];
    await atomicJson(this.stageFile, state.stage);
    return entry;
  }
  checkEntry(entry, file, toneWortschatz) {
    const check = { status: 'passed', label: 'automatisch geprüft', checkedAt: new Date().toISOString(), scope: 'schema-integrity-decode' };
    if (entry.kind === 'audio') {
      // 18.09. Abend: ffmpeg-Dekodierung + F0-Messung nur für Thai. Nicht-
      // thai-Clips sind tonal 'not-applicable' — der Publish miss sonst bei
      // JEDEM Lauf alle 11k+ Bestands-Clips neu (Minuten Wartezeit hinter
      // „Ergebnisse werden übernommen …"). Die Dekodierbarkeit nicht-thai
      // bleibt gewährleistet: das Stage erzwingt die mp3-Kompression durch
      // ffmpeg, und der Katalog-Check (check.cjs) dekodiert weiterhin alles.
      check.tone = entry.document.language === 'th'
        ? checkThaiTone(entry.document, decodeAudio(file), 24000,
            { woerter: toneWortschatz ?? [] })
        : { status: 'not-applicable', reason: 'Kein Thai-Ton; nur technische Integritätsprüfung.', version: TONE_GATE_VERSION };
      if (['failed', 'unchecked'].includes(check.tone.status)) check.status = check.tone.status;
    } else if (entry.kind === 'images') {
      decodeImage(file);
      // Phase 2, Schritt 7: Regelpruefung „kein Text im Bild" — der
      // GENERIERTE Prompt muss die Negativ-Regel tragen (buildImagePrompt
      // haengt sie an). Das ist die maschinenpruefbare Teilmenge; ob das
      // Bild zum Wort passt, bleibt der Vorschau-Blick der lernenden Person.
      const prompt = String(entry.document.prompt ?? '');
      if (!prompt.includes('no text')) {
        check.status = 'unchecked';
        check.reason = 'Prompt ohne „no text“-Regel — das Bild ist nicht als textfrei gebaut.';
      }
    }
    else if (entry.kind === 'vocabulary') {
      // Phase 2, Schritt 4: regelbasierte Basisprüfung (Schema hat
      // assertDocument schon geprüft; hier Schrift/Pflichtmerkmale/Länge).
      check.scope = 'schema-language';
      const regeln = pruefeVocabDoc(entry.document);
      if (!regeln.ok) {
        check.status = 'failed';
        check.reason = regeln.fehler.join(' | ');
      } else if (!entry.document.sourceVerified) {
        check.status = 'unchecked';
        check.reason = entry.document.verificationNote || 'KI-Erzeugung ohne Quellprüfung.';
      }
    }
    if (check.status === 'unchecked') check.label = 'ungeprüft';
    if (check.status === 'failed') check.label = 'aussortiert';
    return check;
  }
  async writeCatalog(catalog) {
    const assets = [...new Set(catalog.entries.flatMap((entry) => entry.asset ? [entry.asset] : []))].sort();
    const source = '// Generated by content:studio. Static requires are collected by Expo/Metro.\n' +
      'export const CONTENT_ASSETS: Record<string, number> = {\n' +
      assets.map((asset) => `  ${JSON.stringify(asset)}: require('../../assets/content/${asset}'),`).join('\n') + '\n};\n';
    await fs.mkdir(path.join(this.root, 'src/content'), { recursive: true });
    await atomicFile(path.join(this.root, 'src/content/assets.ts'), source);
    // Catalog is the last write: new entries only become visible after assets exist.
    await atomicJson(this.catalogFile, catalog);
  }
  async publish(options = {}) {
    const state = await this.state();
    const merged = new Map(state.shipped.entries.map((entry) => [keyOf(entry), entry]));
    const assetDir = path.join(this.root, 'assets/content');
    let staged = state.stage.entries;
    if (options.vocabularyIds !== undefined && options.imageIds !== undefined) throw Error('Nur eine Inhaltsauswahl pro Veröffentlichung.');
    const selectedKind = options.imageIds !== undefined ? 'images' : 'vocabulary';
    const selected = options.imageIds !== undefined ? options.imageIds : options.vocabularyIds;
    if (selected !== undefined) {
      if (!Array.isArray(selected) || !selected.length || selected.some(id => typeof id !== 'string')) throw Error('Inhaltsauswahl muss eine nichtleere ID-Liste sein.');
      const ids = new Set(selected);
      staged = staged.filter(entry => entry.kind === selectedKind && ids.has(entry.id));
      if (staged.length !== ids.size) throw Error('Nicht alle gewählten Inhalte sind im Stage.');
    }
    for (const entry of staged) merged.set(keyOf(entry), entry);
    const entries = [...merged.values()].sort((a,b) => keyOf(a).localeCompare(keyOf(b)));
    const budgetBytes = entries.reduce((sum, entry) => sum + shippingBytes(entry), 0);
    if (budgetBytes > BUDGET) throw Error(`Inhalt überschreitet das Budget von ${Math.round(BUDGET / 1024 / 1024)} MiB. Kein Teil wurde übernommen; Umfang ausdrücklich neu entscheiden.`);
    // Validate the entire set before changing any versioned files.
    const prepared = [];
    for (const entry of entries) {
      assertDocument(entry.kind, entry.document, [...this.extraVocabulary, ...entries.filter(e => e.kind === 'vocabulary').map(e => e.document)]);
      if (entry.id !== entry.document.id) throw Error('Abweichende ID.');
      if (entry.asset && !/^[a-f0-9]{64}\.(mp3|png|jpeg|webp)$/.test(entry.asset)) throw Error('Unsicherer Assetpfad.');
      if (['audio', 'images'].includes(entry.kind) && !entry.asset) throw Error('Mediendatei fehlt.');
      let bytes = Buffer.alloc(0);
      if (entry.asset) {
        try { bytes = await fs.readFile(path.join(this.work, entry.asset)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; bytes = await fs.readFile(path.join(assetDir, entry.asset)); }
      }
      if (digestOf(entry.kind, entry.document, bytes) !== entry.digest) throw Error('Prüfsumme stimmt nicht: ' + entry.id);
      if (entry.asset && (sha(bytes) + '.' + entry.document.format !== entry.asset || bytes.length !== entry.byteSize || bytes.length !== entry.document.byteSize)) throw Error('Asset-Hash oder Bytezahl stimmt nicht: ' + entry.id);
      if (entry.kind === 'audio' && entry.document.format !== 'mp3') throw Error('Unkomprimierter Clip im Export.');
      let file;
      if (entry.asset) {
        file = path.join(this.work, entry.asset);
        try { await fs.access(file); } catch { file = path.join(assetDir, entry.asset); }
      }
      delete entry.review;
      // 18.09.: Solltöne fürs Tor aus dem GEPLANTEN Gesamtbestand — dieselbe
      // Quelle wie assertDocument zwei Zeilen darüber.
      const toneWortschatz = [...this.extraVocabulary, ...entries.filter((item) => item.kind === 'vocabulary').map((item) => item.document)];
      entry.check = this.checkEntry(entry, file, toneWortschatz);
      prepared.push({ entry, bytes });
    }
    await fs.mkdir(assetDir, { recursive: true });
    const accepted = prepared.filter(({ entry }) => isDeliverableEntry(entry));
    // Publish complete files by rename. A watcher must never index a newly
    // created, still-empty MP3 before its bytes have finished writing.
    for (const { entry, bytes } of accepted) if (entry.asset) {
      await atomicFile(path.join(assetDir, entry.asset), bytes);
      await atomicFile(path.join(this.root, 'public/content', entry.asset), bytes);
    }
    const delivered = accepted.map(({ entry }) => {
      const copy = structuredClone(entry);
      if (copy.check.tone) delete copy.check.tone.track;
      return copy;
    });
    await atomicJson(this.reportFile, { checkedAt: new Date().toISOString(), limitations: TONE_GATE_LIMITS,
      entries: prepared.map(({ entry }) => ({ kind: entry.kind, id: entry.id, digest: entry.digest, text: entry.document.text, asset: entry.asset, ...entry.check })) });
    const report = {
      measuredAt: new Date().toISOString(), encoder: 'libmp3lame, 64 kbit/s, mono, 24000 Hz',
      entries: delivered.length, unchecked: prepared.filter(({ entry }) => entry.check.status === 'unchecked').length,
      uncheckedThaiDelivered: delivered.filter(entry => entry.kind === 'audio' && entry.document.language === 'th' && entry.check.tone?.status === 'unchecked').length,
      failed: prepared.filter(({ entry }) => entry.check.status === 'failed').length, contentBudgetBytes: BUDGET,
      budgetBytes: delivered.reduce((sum, entry) => sum + shippingBytes(entry), 0),
      audio: delivered.filter((entry) => entry.kind === 'audio').map((entry) => ({ id: entry.id, sourceBytes: entry.sourceBytes, compressedBytes: entry.byteSize })),
    };
    await atomicJson(path.join(this.root, 'pipeline/reports/size-report.json'), report);
    tryWriteProtocol({
      script: 'content-pipeline',
      action: 'publish',
      items: delivered.length,
      checks: { unchecked: report.unchecked, uncheckedThaiDelivered: report.uncheckedThaiDelivered, failed: report.failed, budgetBytes: report.budgetBytes },
      result: report.failed ? 'partial' : 'ok',
      notes: `übernommen ${delivered.length}, aussortiert ${report.failed}, Budget ${Math.round(report.budgetBytes / 1024 / 1024)} MiB`,
    }, { root: this.root });
    // Metro indiziert neue Dateien asynchron. Erscheint assets.ts im selben
    // Augenblick wie hunderte neue MP3s, baut Metro mit veraltetem Index und
    // meldet "Unable to resolve" fuer Dateien, die laengst da sind. Die kurze
    // Ruhepause laesst den Watcher aufholen — reiner Dev-Komfort, kein Vertrag.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await this.writeCatalog({ ...(await this.catalog()), version: 2, entries: delivered });
    await atomicJson(this.stageFile, { version: 2, entries: selected === undefined
      ? prepared.map(({ entry }) => entry)
      : state.stage.entries.map(entry => staged.some(item => keyOf(item) === keyOf(entry))
        ? prepared.find(item => keyOf(item.entry) === keyOf(entry)).entry : entry) });
    return report;
  }
}
module.exports = { ContentPipeline, compressAudio, digestOf, assertDocument, BUDGET, keyOf, shippingBytes };
