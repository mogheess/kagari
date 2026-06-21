/**
 * Pinned sources for global search.
 *
 * Global search fans a query out to many sources at once, which is expensive, so
 * (like Mihon) we only query a curated set by default — the user's *pinned*
 * sources. This store persists that set and exposes it reactively via
 * useSyncExternalStore. A source is identified by its stable Tachiyomi id.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';

const store = makePersistence<string[]>('@kagari/pinned-sources/v1');

let pinned: string[] = [];
let hydrated = false;
const pinnedBeforeHydrate = new Set<string>();
const unpinnedBeforeHydrate = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  store.save(pinned);
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) {
    const set = new Set(stored);
    // Reconcile with toggles made before the stored copy arrived.
    for (const id of unpinnedBeforeHydrate) set.delete(id);
    for (const id of pinnedBeforeHydrate) set.add(id);
    pinned = [...set];
  }
  hydrated = true;
  emit();
  persist();
}

export function isPinned(sourceId: string): boolean {
  return pinned.includes(sourceId);
}

/** Toggles a source's pinned state. Returns the new pinned state. */
export function togglePinned(sourceId: string): boolean {
  const exists = pinned.includes(sourceId);
  if (exists) {
    pinned = pinned.filter(id => id !== sourceId);
    if (!hydrated) {
      unpinnedBeforeHydrate.add(sourceId);
      pinnedBeforeHydrate.delete(sourceId);
    }
  } else {
    pinned = [...pinned, sourceId];
    if (!hydrated) {
      pinnedBeforeHydrate.add(sourceId);
      unpinnedBeforeHydrate.delete(sourceId);
    }
  }
  emit();
  persist();
  return !exists;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): string[] {
  return pinned;
}

/** Reactive list of pinned source ids. */
export function usePinnedSources(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

void hydrate();
