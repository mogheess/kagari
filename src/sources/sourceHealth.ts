/**
 * Source health tracker.
 *
 * We can't know ahead of time whether a source's site is up, but once a browse
 * or search call fails (or succeeds) we remember it. Default-source selection
 * then de-prioritizes sources that recently errored, so the app self-heals away
 * from broken sources (e.g. a Cloudflare-blocked one) instead of stubbornly
 * landing on them. A later success immediately restores a source.
 * Persisted with AsyncStorage and exposed reactively via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';

export interface SourceHealth {
  ok: boolean;
  at: number;
}

const store = makePersistence<Record<string, SourceHealth>>('@kagari/source-health/v1');

let health: Record<string, SourceHealth> = {};
let snapshot: Record<string, SourceHealth> = {};
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { ...health };
  for (const l of listeners) l();
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && typeof stored === 'object') {
    health = stored;
    emit();
  }
}

/**
 * Records the outcome of a network call for a source. Only emits when the
 * ok/failed state actually flips, so steady-state success doesn't churn renders.
 */
export function recordSourceResult(sourceId: string, ok: boolean): void {
  if (!sourceId) return;
  const prev = health[sourceId];
  if (prev && prev.ok === ok) return;
  health = { ...health, [sourceId]: { ok, at: Date.now() } };
  emit();
  store.save(health);
}

/** Set of source ids that most recently failed. */
export function unhealthyIds(map: Record<string, SourceHealth>): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(map)) {
    if (!map[id].ok) out.add(id);
  }
  return out;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Record<string, SourceHealth> {
  return snapshot;
}

export function useSourceHealth(): Record<string, SourceHealth> {
  return useSyncExternalStore(subscribe, getSnapshot);
}

void hydrate();
