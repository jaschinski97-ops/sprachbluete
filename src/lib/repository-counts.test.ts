import { MemoryDataStore, DataStore } from './storage';

import {
  countAudioClipsByLanguage,
  countImagesByLanguage,
  countSituationsByDirection,
} from './repository';
import { vocabularyFor } from '@/test-fixtures/legacy-vocabulary';

/**
 * Die Zähler-Helfer des Grundstock-Panels (Studio-Startseite).
 *
 * Sie laufen über dieselben Lese-Wege wie die Screens — geprüft wird hier
 * also die Gruppierung, nicht der Speicher selbst. Ein frischer
 * MemoryDataStore genügt; der Katalog der mitgelieferten Inhalte ist im
 * Test leer (jest.setup.js), zählt also nirgends mit.
 */

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

const clip = (id: string, language: string) => ({
  id,
  language,
  text: 'x',
  format: 'wav',
  blobKey: `${id}.wav`,
  synthetic: true,
});

const bild = (vocabId: string) => ({
  id: vocabId,
  vocabId,
  format: 'png',
  byteSize: 1,
  blobKey: `${vocabId}.png`,
  prompt: '',
  model: '',
  generatedAt: 0,
});

const situation = (id: string, direction: string) => ({
  id,
  level: 'A1',
  topic: 'greeting',
  direction,
  title: 't',
  setting: 's',
  scriptTurns: [{ speaker: 'learner', thai: 'สวัสดี', roman: 'sawatdii', german: 'hallo' }],
  corrections: [{ issue: 'i', explanation: 'e' }],
  generatedAt: 0,
  modelUsed: 'm',
});

describe('countAudioClipsByLanguage', () => {
  it('zählt je Generator-Sprache, seitdem Deutsch dazu gehört (10.09.)', async () => {
    const store = await freshStore();
    await store.put('audio', 'th-1', clip('th-1', 'th'));
    await store.put('audio', 'th-2', clip('th-2', 'th'));
    await store.put('audio', 'en-1', clip('en-1', 'en'));
    await store.put('audio', 'de-1', clip('de-1', 'de'));

    // Deutsch ist Generator-Zielsprache (X_to_de-Rückseiten) — de-Clips
    // erscheinen in der eigenen Zeile, sobald sie abgelegt sind.
    expect(await countAudioClipsByLanguage(store)).toEqual({ th: 2, en: 1, es: 0, de: 1 });
  });
});

describe('countImagesByLanguage', () => {
  it('zählt über die Sprache der Vokabel; Deutsch zählt seine Konzeptbilder', async () => {
    const store = await freshStore();
    const thId = vocabularyFor('th')[0].id;
    const enId = vocabularyFor('en')[0].id;
    await store.put('images', thId, bild(thId));
    await store.put('images', enId, bild(enId));
    // Ein Bild ohne zugehörigen Grundstock-Eintrag wird ausgelassen statt
    // erraten — es wäre ohnehin nicht auffindbar.
    await store.put('images', 'unbekannt', bild('unbekannt'));

    // Seit dem Sprach-Umbau zählt jedes Bild genau in der Sprache seiner
    // Vokabel — Deutsch hat eigene Wörter und damit eigene Bilder.
    expect(await countImagesByLanguage(store)).toEqual({ th: 1, en: 1, es: 0, de: 0 });
  });
});

describe('countSituationsByDirection', () => {
  it('zählt je Lernrichtung der Brücke', async () => {
    const store = await freshStore();
    await store.put('situations', 'a', situation('a', 'de_to_th'));
    await store.put('situations', 'b', situation('b', 'de_to_th'));
    await store.put('situations', 'c', situation('c', 'th_to_de'));

    expect(await countSituationsByDirection(store)).toEqual({ de_to_th: 2, th_to_de: 1, de_to_en: 0, de_to_es: 0 });
  });
});

