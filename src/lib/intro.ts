import { useSyncExternalStore } from 'react';

import { readMeta, writeMeta } from './repository';
import type { DataStore } from './storage';

/**
 * Einführung (24.10.2026): beim ersten Start einmal zeigen, danach jederzeit
 * aus den Einstellungen. Ob sie gesehen wurde, steht unter `meta/intro-seen`.
 */
export const INTRO_SEEN_KEY = 'intro-seen';

let visible = false;
const listeners = new Set<() => void>();

function setVisible(next: boolean): void {
  if (visible === next) return;
  visible = next;
  for (const listener of listeners) listener();
}

export function introVisible(): boolean {
  return visible;
}

export function subscribeIntro(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openIntro(): void {
  setVisible(true);
}

/** Schließen und merken; ein Speicherfehler darf die App nicht blockieren. */
export async function closeIntro(store?: DataStore): Promise<void> {
  setVisible(false);
  await writeMeta(INTRO_SEEN_KEY, true, store).catch(() => {});
}

/** Beim Start: noch nie gesehen → zeigen. Gibt zurück, ob sie aufging. */
export async function showIntroOnFirstStart(store?: DataStore): Promise<boolean> {
  const seen = await readMeta<boolean>(INTRO_SEEN_KEY, false, store).catch(() => true);
  if (!seen) setVisible(true);
  return !seen;
}

export function useIntroVisible(): boolean {
  return useSyncExternalStore(subscribeIntro, introVisible, introVisible);
}
