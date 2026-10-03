// PHASE 16: `VOCABULARY` umfasst jetzt alle drei Sprachen. Was diese Datei
// zusichert, gilt dem Thai-Grundstock aus Phase 2 - deshalb hier
// ausdruecklich der. Unterhalb dieser Zeile hat sich nichts geaendert.
import { VOCABULARY_TH as VOCABULARY, VocabEntry } from '@/test-fixtures/legacy-vocabulary';

import {
  clearVocabImages,
  countVocabImages,
  loadVocabImage,
  loadVocabImageUri,
} from '../repository';
import { DataStore, MemoryDataStore } from '../storage';

import { runImageBatch } from './batch';
import { MemoryImageBlobStore } from './blob-memory';
import {
  buildImagePrompt,
  describeApiError,
  IMAGE_ASPECT_RATIO,
  IMAGE_FORMAT,
  IMAGE_MODEL,
  ImageGenerationClient,
  NEGATIVE_PROMPT,
} from './generator';
import { hasMotif, IMAGE_MOTIFS, motifFor } from './motifs';
import {
  assertConcreteSpec,
  canHaveImage,
  countImageCandidates,
  IMAGE_TEST_RUN,
  imageSpecFor,
  planImages,
} from './plan';
import { base64ByteLength, GeneratedImage, ImageBlobStore, ImageSpec } from './types';

const T0 = Date.UTC(2026, 7, 31);

/** Lang genug, dass die Formpruefung des Parsers greift. */
const FAKE_BASE64 = 'UklGRhYAAABXRUJQVlA4TAoAAAAvAAAAAAfQ//73v/+BiOh/AAA'.repeat(4);

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

function freshBlobs(): ImageBlobStore {
  return new MemoryImageBlobStore();
}

function abstractEntry(): VocabEntry {
  const entry = VOCABULARY.find((candidate) => !candidate.isConcrete);
  if (!entry) throw new Error('Testdaten erwarten mindestens einen abstrakten Eintrag.');
  return entry;
}

function concreteEntry(): VocabEntry {
  const entry = VOCABULARY.find((candidate) => candidate.isConcrete);
  if (!entry) throw new Error('Testdaten erwarten mindestens einen konkreten Eintrag.');
  return entry;
}

/**
 * Ein Auftrag fuer einen abstrakten Eintrag, wie ihn nur falscher oder alter
 * Code erzeugen koennte. Der Typ verbietet das (`isConcrete: true` ist ein
 * Literaltyp) - deshalb hier der bewusste Cast.
 */
function forgedSpec(entry: VocabEntry): ImageSpec {
  return {
    id: entry.id,
    vocabId: entry.id,
    thai: entry.term,
    romanization: entry.romanization,
    german: entry.german,
    partOfSpeech: entry.partOfSpeech,
    isConcrete: true,
  } as ImageSpec;
}

function clientThatFailsOn(failing: string[] = []): ImageGenerationClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async generate(spec): Promise<GeneratedImage> {
      calls.push(spec.id);
      if (failing.includes(spec.id)) {
        throw new Error(`Netzwerkfehler bei ${spec.id}`);
      }
      return {
        base64: FAKE_BASE64,
        format: IMAGE_FORMAT,
        model: IMAGE_MODEL,
        prompt: buildImagePrompt(spec),
      };
    },
  };
}

describe('planImages - das isConcrete-Tor', () => {
  it('plant genau die konkreten Eintraege, keinen mehr', () => {
    const specs = planImages();
    expect(specs).toHaveLength(countImageCandidates());
    expect(specs).toHaveLength(VOCABULARY.filter((entry) => entry.isConcrete).length);
  });

  it('enthaelt keinen einzigen abstrakten Eintrag', () => {
    const planned = new Set(planImages().map((spec) => spec.vocabId));
    const abstractIds = VOCABULARY.filter((entry) => !entry.isConcrete).map((entry) => entry.id);
    for (const id of abstractIds) {
      expect(planned.has(id)).toBe(false);
    }
  });

  it('enthaelt keine Partikeln, Pronomen, Zahlwoerter oder Interjektionen', () => {
    // Doppelter Boden: selbst wenn ein solcher Eintrag faelschlich als konkret
    // markiert waere, faellt es hier auf.
    const wordClasses = planImages().map((spec) => spec.partOfSpeech);
    expect(wordClasses).not.toContain('particle');
    expect(wordClasses).not.toContain('pronoun');
    expect(wordClasses).not.toContain('numeral');
    expect(wordClasses).not.toContain('interjection');
    expect(wordClasses).not.toContain('adverb');
  });

  it('vergibt je Vokabel genau einen Auftrag', () => {
    const specs = planImages();
    expect(new Set(specs.map((spec) => spec.id)).size).toBe(specs.length);
  });

  it('ist deterministisch - zweimal derselbe Plan', () => {
    expect(planImages().map((spec) => spec.id)).toEqual(planImages().map((spec) => spec.id));
  });

  it('kuerzt den Probelauf auf die immer gleichen Eintraege', () => {
    const first = planImages({ limit: IMAGE_TEST_RUN });
    const second = planImages({ limit: IMAGE_TEST_RUN });
    expect(first).toHaveLength(IMAGE_TEST_RUN);
    expect(first.map((spec) => spec.id)).toEqual(second.map((spec) => spec.id));
    // Fortsetzen darf nichts doppelt bezahlen: der Probelauf ist der Anfang
    // des vollen Laufs, keine eigene Auswahl.
    expect(first.map((spec) => spec.id)).toEqual(
      planImages()
        .slice(0, IMAGE_TEST_RUN)
        .map((spec) => spec.id)
    );
  });

  it('lehnt einen Auftrag fuer einen abstrakten Eintrag ab', () => {
    expect(() => imageSpecFor(abstractEntry())).toThrow(/nicht konkret/);
  });

  it('erkennt bildfaehige Eintraege', () => {
    expect(canHaveImage(concreteEntry())).toBe(true);
    expect(canHaveImage(abstractEntry())).toBe(false);
  });

  it('durchschaut einen gefaelschten Auftrag', () => {
    expect(() => assertConcreteSpec(forgedSpec(abstractEntry()))).toThrow(/nicht konkret/);
  });

  it('lehnt einen Auftrag fuer eine unbekannte Vokabel ab', () => {
    const unknown = { ...forgedSpec(concreteEntry()), vocabId: 'gibtsnicht' };
    expect(() => assertConcreteSpec(unknown)).toThrow(/Unbekannte Vokabel/);
  });
});

describe('runImageBatch - das Tor haelt die Pipeline an', () => {
  it('fragt fuer einen abstrakten Eintrag gar nicht erst an', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const client = clientThatFailsOn();

    const result = await runImageBatch({
      specs: [forgedSpec(abstractEntry())],
      client,
      store,
      blobStore: blobs,
      now: () => T0,
    });

    // Kein Netzaufruf, kein Dokument, keine Datei - nur ein Fehlschlag.
    expect(client.calls).toHaveLength(0);
    expect(result.ok).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toMatch(/nicht konkret/);
    expect(await countVocabImages(store)).toBe(0);
  });

  it('laesst die konkreten Eintraege eines gemischten Laufs trotzdem durch', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const client = clientThatFailsOn();
    const specs = [...planImages({ limit: 4 }), forgedSpec(abstractEntry())];

    const result = await runImageBatch({
      specs,
      client,
      store,
      blobStore: blobs,
      now: () => T0,
    });

    expect(result.ok).toBe(4);
    expect(result.failed).toBe(1);
    expect(client.calls).toHaveLength(4);
    expect(client.calls).not.toContain(abstractEntry().id);
  });
});

describe('runImageBatch - Ablage', () => {
  it('uebergibt neue Bilder direkt an den Helper ohne Browser-Metadaten oder Blobablage', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const put = jest.spyOn(store, 'put').mockRejectedValue(Error('browser quota'));
    const blobPut = jest.spyOn(blobs, 'put').mockRejectedValue(Error('browser quota'));
    const onProduced = jest.fn(async () => {});
    const specs = planImages({ limit: 1 });
    const result = await runImageBatch({ specs, client: clientThatFailsOn(), store, blobStore: blobs, onProduced, now: () => T0 });
    expect(result.ok).toBe(1);
    expect(onProduced).toHaveBeenCalledWith(expect.objectContaining({ id: specs[0].id, generatedAt: T0 }), FAKE_BASE64);
    expect(put).not.toHaveBeenCalled();
    expect(blobPut).not.toHaveBeenCalled();
  });
  it('legt Metadaten und Bilddaten getrennt, aber vollstaendig ab', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planImages({ limit: IMAGE_TEST_RUN });

    const result = await runImageBatch({
      specs,
      client: clientThatFailsOn(),
      store,
      blobStore: blobs,
      now: () => T0,
    });

    expect(result.ok).toBe(IMAGE_TEST_RUN);
    expect(await countVocabImages(store)).toBe(IMAGE_TEST_RUN);

    const doc = await loadVocabImage(specs[0].vocabId, store);
    expect(doc).not.toBeNull();
    expect(doc!.format).toBe(IMAGE_FORMAT);
    expect(doc!.model).toBe(IMAGE_MODEL);
    expect(doc!.blobKey).toBe(`${specs[0].vocabId}.${IMAGE_FORMAT}`);
    expect(doc!.generatedAt).toBe(T0);
    expect(doc!.byteSize).toBe(base64ByteLength(FAKE_BASE64));
    // Der Prompt wandert mit, damit ein Bild nachvollziehbar bleibt.
    expect(doc!.prompt).toContain(specs[0].motif);

    // Und die Datei ist wirklich da - abrufbar ohne Schluessel und ohne Netz.
    const uri = await loadVocabImageUri(specs[0].vocabId, store, blobs);
    expect(uri).toContain('data:image/webp;base64,');
    expect(uri).toContain(FAKE_BASE64);
  });

  it('bricht bei einem Fehler mitten im Lauf nicht ab', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planImages({ limit: 5 });
    const client = clientThatFailsOn([specs[1].id, specs[3].id]);

    const result = await runImageBatch({ specs, client, store, blobStore: blobs, now: () => T0 });

    expect(result.ok).toBe(3);
    expect(result.failed).toBe(2);
    expect(result.processed).toBe(5);
    expect(client.calls).toHaveLength(5);
    expect(await countVocabImages(store)).toBe(3);
  });

  it('ueberspringt beim zweiten Lauf, was schon da ist', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planImages({ limit: 5 });
    await runImageBatch({
      specs,
      client: clientThatFailsOn([specs[0].id]),
      store,
      blobStore: blobs,
      now: () => T0,
    });

    const second = clientThatFailsOn();
    const result = await runImageBatch({
      specs,
      client: second,
      store,
      blobStore: blobs,
      now: () => T0,
    });

    expect(result.skipped).toBe(4);
    expect(result.ok).toBe(1);
    expect(second.calls).toEqual([specs[0].id]);
  });

  it('erkennt ein Dokument ohne Bilddatei als fehlend', async () => {
    // Karteileiche: das Dokument ist da, die Datei nicht (geloescht, Speicher
    // geleert, Uebertragung abgebrochen). Ein Lauf, der das ueberspringt,
    // wuerde eine leere Karte fuer immer leer lassen.
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planImages({ limit: 2 });
    await runImageBatch({
      specs,
      client: clientThatFailsOn(),
      store,
      blobStore: blobs,
      now: () => T0,
    });

    const doc = await loadVocabImage(specs[0].vocabId, store);
    await blobs.remove(doc!.blobKey);
    expect(await loadVocabImageUri(specs[0].vocabId, store, blobs)).toBeNull();

    const again = clientThatFailsOn();
    const result = await runImageBatch({
      specs,
      client: again,
      store,
      blobStore: blobs,
      now: () => T0,
    });

    expect(again.calls).toEqual([specs[0].id]);
    expect(result.ok).toBe(1);
    expect(result.skipped).toBe(1);
    expect(await loadVocabImageUri(specs[0].vocabId, store, blobs)).not.toBeNull();
  });

  it('haelt an und behaelt das bereits Erzeugte', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planImages({ limit: 8 });
    const client = clientThatFailsOn();

    let processed = 0;
    const result = await runImageBatch({
      specs,
      client,
      store,
      blobStore: blobs,
      now: () => T0,
      shouldCancel: () => processed >= 3,
      onProgress: (progress) => {
        processed = progress.processed;
      },
    });

    expect(result.cancelled).toBe(true);
    expect(result.ok).toBe(3);
    expect(await countVocabImages(store)).toBe(3);
    expect(client.calls).toHaveLength(3);
  });

  it('speichert nichts Halbes, wenn die Antwort unbrauchbar ist', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planImages({ limit: 2 });
    const client: ImageGenerationClient = {
      async generate() {
        // So verhaelt sich der echte Client bei einer Antwort ohne Bilddaten:
        // benannter Fehlschlag statt halber Eintrag.
        throw new Error('Antwort enthielt kein Bild.');
      },
    };

    const result = await runImageBatch({ specs, client, store, blobStore: blobs, now: () => T0 });

    expect(result.failed).toBe(2);
    expect(await countVocabImages(store)).toBe(0);
    expect(await blobs.has(`${specs[0].vocabId}.${IMAGE_FORMAT}`)).toBe(false);
  });

  it('laesst einen Eintrag als fehlend gelten, wenn nur die Datei geschrieben wurde', async () => {
    // Die Reihenfolge ist Absicht: erst Datei, dann Dokument. Scheitert das
    // Dokument, darf der Eintrag nicht als fertig gelten.
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planImages({ limit: 1 });
    const brokenStore: DataStore = {
      ...store,
      get: store.get.bind(store),
      getAll: store.getAll.bind(store),
      putMany: store.putMany.bind(store),
      remove: store.remove.bind(store),
      clear: store.clear.bind(store),
      init: store.init.bind(store),
      async put() {
        throw new Error('Speicher voll');
      },
    };

    const result = await runImageBatch({
      specs,
      client: clientThatFailsOn(),
      store: brokenStore,
      blobStore: blobs,
      now: () => T0,
    });

    expect(result.failed).toBe(1);
    expect(await loadVocabImage(specs[0].vocabId, store)).toBeNull();
    // Die verwaiste Datei stoert nicht: der naechste Lauf ueberschreibt sie.
    expect(await countVocabImages(store)).toBe(0);
  });
});

describe('clearVocabImages', () => {
  it('raeumt Dokumente und Dateien gemeinsam ab', async () => {
    const store = await freshStore();
    const blobs = freshBlobs();
    const specs = planImages({ limit: 3 });
    await runImageBatch({
      specs,
      client: clientThatFailsOn(),
      store,
      blobStore: blobs,
      now: () => T0,
    });

    await clearVocabImages(store, blobs);

    expect(await countVocabImages(store)).toBe(0);
    expect(await blobs.has(`${specs[0].vocabId}.${IMAGE_FORMAT}`)).toBe(false);
    expect(await loadVocabImageUri(specs[0].vocabId, store, blobs)).toBeNull();
  });
});

describe('describeApiError', () => {
  it('kommt mit einer Antwort klar, die kein JSON ist', () => {
    expect(describeApiError(502, 'Bad Gateway')).toContain('HTTP 502: Bad Gateway');
  });
});

describe('buildImagePrompt und die Motivliste', () => {
  const spec = planImages({ limit: 1 })[0];

  it('baut den Prompt um das hinterlegte Motiv', () => {
    expect(buildImagePrompt(spec)).toContain(spec.motif);
  });

  it('verbietet Schrift im Bild', () => {
    // Ein Modell, das Buchstaben malt, malt falsche - bei Thai-Schrift erst
    // recht. Eine erfundene Schreibung neben geprueften Vokabeln waere
    // schaedlicher als gar kein Bild.
    expect(buildImagePrompt(spec)).toMatch(/no text and no letters/);
    expect(NEGATIVE_PROMPT).toMatch(/letters/);
  });

  it('haelt den Bildausschnitt quadratisch wie den Rahmen auf der Karte', () => {
    expect(IMAGE_ASPECT_RATIO).toBe('1:1');
  });

  it('hat fuer jede konkrete Vokabel ein Motiv', () => {
    const fehlend = VOCABULARY.filter((entry) => entry.isConcrete && !hasMotif(entry.id));
    expect(fehlend.map((entry) => entry.id)).toEqual([]);
  });

  it('fuehrt kein Motiv, zu dem es keine konkrete Vokabel gibt', () => {
    const konkret = new Set(VOCABULARY.filter((entry) => entry.isConcrete).map((e) => e.id));
    const verwaist = Object.keys(IMAGE_MOTIFS).filter((id) => !konkret.has(id));
    expect(verwaist).toEqual([]);
  });

  it('haelt die Motive auf Englisch', () => {
    // Bildmodelle sind englisch trainiert. Ein deutsches Motiv faellt hier
    // spaetestens ueber Umlaute und Eszett auf.
    for (const [id, motif] of Object.entries(IMAGE_MOTIFS)) {
      expect(`${id}: ${motif}`).toMatch(/^[ -~]+$/);
    }
  });

  it('meldet ein fehlendes Motiv, statt eines zu erfinden', () => {
    expect(() => motifFor('gibtsnicht')).toThrow(/kein Bildmotiv/);
  });
});

describe('base64ByteLength', () => {
  it('rechnet ohne zu dekodieren richtig', () => {
    // "abc" -> "YWJj" (kein Fuellzeichen), "ab" -> "YWI=" (eines).
    expect(base64ByteLength('YWJj')).toBe(3);
    expect(base64ByteLength('YWI=')).toBe(2);
    expect(base64ByteLength('YQ==')).toBe(1);
    expect(base64ByteLength('')).toBe(0);
  });
});

describe('MemoryImageBlobStore - Vertrag der Bildablage', () => {
  it('legt ab, findet wieder, loescht', async () => {
    const blobs = freshBlobs();
    await blobs.init();

    expect(await blobs.has('haus.webp')).toBe(false);
    expect(await blobs.uri('haus.webp')).toBeNull();

    await blobs.put('haus.webp', FAKE_BASE64);
    expect(await blobs.has('haus.webp')).toBe(true);
    expect(await blobs.uri('haus.webp')).toBe(`data:image/webp;base64,${FAKE_BASE64}`);

    await blobs.remove('haus.webp');
    expect(await blobs.has('haus.webp')).toBe(false);
  });

  it('leitet den Medientyp aus der Endung ab', async () => {
    const blobs = freshBlobs();
    await blobs.put('a.png', FAKE_BASE64);
    expect(await blobs.uri('a.png')).toContain('data:image/png;base64,');
  });

  it('leert alles auf einmal', async () => {
    const blobs = freshBlobs();
    await blobs.put('a.webp', FAKE_BASE64);
    await blobs.put('b.webp', FAKE_BASE64);
    await blobs.clear();
    expect(await blobs.has('a.webp')).toBe(false);
    expect(await blobs.has('b.webp')).toBe(false);
  });
});
