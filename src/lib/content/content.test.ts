import { MemoryDataStore } from '../storage/memory-store';
import { runGenerationBatch } from '../conversation/batch';
import { planSituations } from '../conversation/plan';
import { runClipBatch } from '../clips/batch';
import { runImageBatch } from '../images/batch';
import { planImages } from '../images/plan';
import { MemoryBlobStore } from '../blobs/memory';
import { AUDIO_BLOB_CONFIG, clipIdFor, isValidAudioClip } from '../clips/types';
import { IMAGE_BLOB_CONFIG } from '../images/types';
import { planDeliveryAudio } from './audio-plan';
import { VOCABULARY } from '@/test-fixtures/legacy-vocabulary';

test('obsolete rejection markers cannot suppress any of the four provider clients', async () => {
  const db = new MemoryDataStore();
  await db.init();
  const situation = planSituations({ variantsPerCombo: 1 })[0];
  const image = planImages({ limit: 1 })[0];
  const audio = planDeliveryAudio()[0];
  for (const [kind, spec] of [['situations', situation], ['images', image], ['audio', audio]] as const) {
    await db.put('meta', `content-rejected:${kind}:${spec.id}`, true);
  }
  const generate = jest.fn().mockRejectedValue(new Error('Provider must not be called'));
  const outcomes = [
    await runGenerationBatch({ specs: [situation], client: { generate }, store: db }),
    await runImageBatch({ specs: [image], client: { generate }, store: db, blobStore: new MemoryBlobStore(IMAGE_BLOB_CONFIG) }),
    await runClipBatch({ specs: [audio], client: { generate }, store: db, blobStore: new MemoryBlobStore(AUDIO_BLOB_CONFIG) }),
  ];
  for (const outcome of outcomes) expect(outcome).toMatchObject({ skipped: 0, ok: 0, failed: 1 });
  expect(generate).toHaveBeenCalledTimes(3);
});

test('delivery audio covers every card, example and German meaning', () => {
  const plan = planDeliveryAudio();
  const ids = new Set(plan.map((spec) => spec.id));
  expect(ids.size).toBe(plan.length);
  for (const word of VOCABULARY) {
    expect(ids.has(clipIdFor(word.language, word.term))).toBe(true);
    expect(ids.has(clipIdFor('de', word.german))).toBe(true);
    if (word.exampleTerm) expect(ids.has(clipIdFor(word.language, word.exampleTerm))).toBe(true);
  }
});

test.each(['th', 'de', 'en', 'es'])('stored and bundled clips accept %s', (language) => {
  expect(isValidAudioClip({ id: 'valid', language, text: 'test', format: 'mp3', blobKey: 'valid.mp3', synthetic: true })).toBe(true);
});
