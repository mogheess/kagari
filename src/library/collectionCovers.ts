/**
 * Per-collection custom cover overrides. A small persisted map of
 * `collectionId -> image uri` so a user can pick which artwork represents a
 * library folder instead of the default auto collage. Reactive via
 * useSyncExternalStore so cards update the moment a cover is chosen.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';

type CoverMap = Record<string, string>;

const store = makePersistence<CoverMap>('@kagari/collectionCovers/v1');
let covers: CoverMap = {};
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function setCollectionCover(id: string, uri: string): void {
  covers = { ...covers, [id]: uri };
  emit();
  store.save(covers);
}

export function clearCollectionCover(id: string): void {
  if (!(id in covers)) return;
  const next = { ...covers };
  delete next[id];
  covers = next;
  emit();
  store.save(covers);
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && typeof stored === 'object' && Object.keys(covers).length === 0) {
    covers = stored;
  }
  hydrated = true;
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive map of collection id -> custom cover uri. */
export function useCollectionCovers(): CoverMap {
  return useSyncExternalStore(subscribe, () => covers);
}

/** Whether the persisted covers have loaded (avoids a flash of defaults). */
export function useCollectionCoversHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => hydrated);
}

void hydrate();
