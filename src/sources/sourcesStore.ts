/**
 * The installed source list, shared by every screen that needs it.
 *
 * Each screen used to call `listSources()` once on mount. Tabs stay mounted,
 * so a source installed from the Extensions screen did not appear in Discover
 * (or Home, or a title's "source missing" check) until the app was restarted —
 * "I installed it but it's not showing" was the exact report. One store,
 * refreshed whenever the engine reloads, keeps every consumer current.
 */
import { useSyncExternalStore } from 'react';
import { getEngine } from '../engine';
import type { SourceDto } from '../engine/types';

let sources: SourceDto[] = [];
let loaded = false;
let inflight: Promise<SourceDto[]> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Re-reads the source list from the engine. Concurrent callers share one read. */
export function refreshSources(): Promise<SourceDto[]> {
  if (inflight) return inflight;
  inflight = getEngine()
    .listSources()
    .then(next => {
      sources = next;
      return next;
    })
    .catch(() => sources)
    .finally(() => {
      loaded = true;
      inflight = null;
      emit();
    });
  return inflight;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSources(): SourceDto[] {
  return useSyncExternalStore(subscribe, () => sources);
}

/** False until the first read completes; lets "not installed" checks wait. */
export function useSourcesLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded);
}

export function getSourcesSnapshot(): SourceDto[] {
  return sources;
}

void refreshSources();
