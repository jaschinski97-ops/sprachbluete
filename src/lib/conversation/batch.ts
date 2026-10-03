import { BatchProgress, missingFrom, runBatch } from '../generation/batch';
import { BatchTask } from '../generation/types';
import { DataStore, getStore } from '../storage';
import { bundledDocuments, isDeletedDraft } from '../content/bundled';

import { GenerationClient } from './generator';
import { ConversationSituation, SituationSpec } from './types';

/**
 * Der Lauf für Sprachsituationen.
 *
 * Die Robustheitsregeln (sofort speichern, Fehler überleben, fortsetzbar,
 * abbrechbar) stehen seit Phase 5 einmalig in `lib/generation/batch.ts` und
 * gelten dort für jeden Lauf. Hier bleibt nur, was wirklich mit
 * Sprachsituationen zu tun hat: die Sammlung `situations` und der
 * Generierungs-Client.
 */

export type { BatchProgress };

export type RunOptions = {
  specs: SituationSpec[];
  client: GenerationClient;
  store?: DataStore;
  onProgress?: (progress: BatchProgress) => void;
  shouldCancel?: () => boolean;
  delayMs?: number;
  onProduced?: (document: ConversationSituation) => Promise<void>;
};

function situationExists(db: DataStore) {
  return {
    async exists(spec: SituationSpec) {
      if (bundledDocuments('situations').some(item => item.id === spec.id)) return true;
      const doc = await db.get<ConversationSituation>('situations', spec.id);
      return doc !== null && !isDeletedDraft('situations', doc);
    },
  };
}

function situationTask(client: GenerationClient, db: DataStore, onProduced?: RunOptions['onProduced']): BatchTask<SituationSpec> {
  return {
    ...situationExists(db),
    async produce(spec) {
      const situation = await client.generate(spec);
      if (onProduced) { await onProduced(situation); return; }
      await db.put('situations', spec.id, situation);
    },
  };
}

export async function runGenerationBatch(options: RunOptions): Promise<BatchProgress> {
  const db = options.store ?? (await getStore());
  return runBatch({
    specs: options.specs,
    task: situationTask(options.client, db, options.onProduced),
    onProgress: options.onProgress,
    shouldCancel: options.shouldCancel,
    delayMs: options.delayMs,
  });
}

/** Welche Situationen aus dem Plan noch fehlen. */
export async function missingSpecs(
  specs: SituationSpec[],
  store?: DataStore
): Promise<SituationSpec[]> {
  const db = store ?? (await getStore());
  return missingFrom(specs, situationExists(db));
}
