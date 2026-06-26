/**
 * One-shot "open this in Discover" request.
 *
 * Home rails can't navigate to the Discover tab with route params (tabs are kept
 * mounted, not pushed), so a "See all" tap parks the target here and switches
 * tabs; the Discover screen reads it and applies the source + browse mode.
 */
import { useSyncExternalStore } from 'react';

export type BrowseMode = 'popular' | 'latest';

export interface DiscoverIntent {
  sourceId: string;
  browse: BrowseMode;
  /** Bumped on every request so repeat taps re-trigger application. */
  nonce: number;
}

let intent: DiscoverIntent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Asks the Discover tab to open a specific source in the given browse mode. */
export function requestDiscover(sourceId: string, browse: BrowseMode = 'popular'): void {
  intent = { sourceId, browse, nonce: (intent?.nonce ?? 0) + 1 };
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): DiscoverIntent | null {
  return intent;
}

export function useDiscoverIntent(): DiscoverIntent | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
