const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { BUDGET, shippingBytes, keyOf, digestOf, assertDocument } = require('./pipeline.cjs');
const domain = require('./domain.cjs');
const { isDeliverableEntry } = domain.load('src/lib/content/audio-policy');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Live delivery is durable in the ignored workspace. Build files change only
// when the run ends, so Metro cannot reload the browser halfway through a run.
class AutomaticDelivery {
  constructor(pipeline) {
    this.pipeline = pipeline;
    this.file = path.join(pipeline.work, 'automatic-delivery.json');
    this.active = null;
  }
  async readCheckpoint() {
    try { return JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async recover() {
    if (this.active) return;
    const saved = await this.readCheckpoint();
    if (!saved) return;
    const catalog = await this.pipeline.catalog();
    if (hash(catalog) === saved.finalDigest) { await fs.unlink(this.file); return; }
    if (hash(catalog) !== saved.baselineDigest) throw Error('Katalog wurde während der automatischen Übernahme extern geändert. Gesicherte Inhalte bleiben erhalten.');
    const vocabulary = [...catalog.entries, ...saved.entries].filter(e => e.kind === 'vocabulary').map(e => e.document);
    for (const entry of saved.entries) {
      assertDocument(entry.kind, entry.document, [...this.pipeline.extraVocabulary, ...vocabulary]);
      const bytes = entry.asset ? await fs.readFile(path.join(this.pipeline.root, 'assets/content', entry.asset)) : Buffer.alloc(0);
      if (digestOf(entry.kind, entry.document, bytes) !== entry.digest) throw Error('Gesicherte Inhaltsprüfsumme stimmt nicht.');
      entry.check = this.pipeline.checkEntry(entry, entry.asset ? path.join(this.pipeline.root, 'assets/content', entry.asset) : undefined, vocabulary);
      if (!isDeliverableEntry(entry)) throw Error('Gesicherter Inhalt hat die erneute Prüfung nicht bestanden.');
      if (entry.check.tone) delete entry.check.tone.track;
      if (entry.asset) {
        const target = path.join(this.pipeline.root, 'public/content', entry.asset);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, bytes);
      }
    }
    this.active = { token: crypto.randomUUID(), catalog, baselineDigest: saved.baselineDigest, entries: new Map(saved.entries.map(e => [keyOf(e), e])), touched: Date.now() };
    await this.finish(this.active.token);
  }
  async begin() {
    if (this.active) throw Error('Eine automatische Inhaltsübernahme läuft bereits.');
    await this.recover();
    const catalog = await this.pipeline.catalog();
    this.active = { token: crypto.randomUUID(), catalog, baselineDigest: hash(catalog), entries: new Map(),
      budgetBytes: catalog.entries.reduce((sum, entry) => sum + shippingBytes(entry), 0), touched: Date.now() };
    return { token: this.active.token };
  }
  require(token) {
    if (!this.active || this.active.token !== token) throw Error('Inhaltslauf nicht mehr aktiv.');
    this.active.touched = Date.now();
    return this.active;
  }
  touch(token) { this.require(token); return { active: true }; }
  catalog() {
    if (!this.active) return null;
    const merged = new Map(this.active.catalog.entries.map(e => [keyOf(e), e]));
    for (const entry of this.active.entries.values()) merged.set(keyOf(entry), entry);
    return { ...this.active.catalog, entries: [...merged.values()] };
  }
  async accept(token, payload) {
    const run = this.require(token);
    const entry = await this.pipeline.stage(payload);
    if (!isDeliverableEntry(entry)) throw Error(entry.check.reason ?? entry.check.tone?.reason ?? 'Inhaltsprüfung fehlgeschlagen.');
    const candidate = new Map(run.entries); candidate.set(keyOf(entry), entry);
    const previous = run.entries.get(keyOf(entry)) ?? run.catalog.entries.find(item => keyOf(item) === keyOf(entry));
    const budgetBytes = run.budgetBytes - (previous ? shippingBytes(previous) : 0) + shippingBytes(entry);
    if (budgetBytes > BUDGET) throw Error('Inhaltsbudget überschritten; dieser Eintrag bleibt im Stage.');
    if (entry.asset) {
      const bytes = await fs.readFile(path.join(this.pipeline.work, entry.asset));
      for (const directory of ['assets/content', 'public/content']) {
        const target = path.join(this.pipeline.root, directory, entry.asset);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target + '.tmp', bytes); await fs.rename(target + '.tmp', target);
      }
    }
    const delivered = structuredClone(entry);
    if (delivered.check.tone) delete delivered.check.tone.track;
    candidate.set(keyOf(delivered), delivered);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file + '.tmp', JSON.stringify({ baselineDigest: run.baselineDigest, entries: [...candidate.values()] }));
    await fs.rename(this.file + '.tmp', this.file);
    run.entries = candidate; run.budgetBytes = budgetBytes; run.touched = Date.now();
    return delivered;
  }
  async finish(token) {
    const run = this.require(token);
    const catalog = this.catalog();
    const currentDigest = hash(await this.pipeline.catalog());
    if (currentDigest !== run.baselineDigest && currentDigest !== hash(catalog)) throw Error('Katalog wurde extern geändert; die automatische Sicherung bleibt erhalten.');
    if (catalog.entries.reduce((sum, entry) => sum + shippingBytes(entry), 0) > BUDGET) throw Error('Inhaltsbudget überschritten.');
    if (run.entries.size) {
      // Record the final identity before the last write, allowing recovery if
      // the helper exits immediately after the catalog rename.
      await fs.writeFile(this.file + '.tmp', JSON.stringify({ baselineDigest: run.baselineDigest, finalDigest: hash(catalog), entries: [...run.entries.values()] }));
      await fs.rename(this.file + '.tmp', this.file);
      if (currentDigest !== hash(catalog)) await this.pipeline.writeCatalog(catalog);
      await fs.rm(this.file, { force: true });
    }
    const count = run.entries.size; this.active = null;
    return { count };
  }
}
module.exports = { AutomaticDelivery };
