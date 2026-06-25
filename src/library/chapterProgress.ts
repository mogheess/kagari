/**
 * Per-chapter read progress, keyed by (sourceId, chapterUrl).
 *
 * Mirrors Mihon's chapter read-state: each chapter tracks the furthest page
 * reached and whether it's fully read, independent of whether the manga is in
 * the library. The detail screen uses this to dim read chapters and show a
 * "Page X / Y" hint on partially-read ones. Persisted with AsyncStorage and
 * exposed reactively via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';

export interface ChapterProgress {
  /** Furthest page reached (1-based). */
  lastPage: number;
  /** Total pages in the chapter, when known. */
  pageCount: number;
  /** Whether the chapter has been read to the end. */
  read: boolean;
  /** Epoch millis of the last update. */
  readAt: number;
}

/** Cap entries so the store stays small. */
const MAX_ENTRIES = 5000;
const store = makePersistence<Record<string, ChapterProgress>>('@kagari/chapterProgress/v1');

let progress: Record<string, ChapterProgress> = {};
const listeners = new Set<() => void>();

export function chapterKey(sourceId: string, chapterUrl: string): string {
  return `${sourceId}\u0000${chapterUrl}`;
}

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  store.save(progress);
}

/** Drops the oldest entries if the store grows past the cap. */
function prune(): void {
  const keys = Object.keys(progress);
  if (keys.length <= MAX_ENTRIES) return;
  const sorted = keys
    .map(k => [k, progress[k].readAt] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES);
  const next: Record<string, ChapterProgress> = {};
  for (const [k] of sorted) next[k] = progress[k];
  progress = next;
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && typeof stored === 'object') {
    // In-memory updates recorded before hydrate finished win.
    progress = { ...stored, ...progress };
  }
  emit();
  persist();
}

/**
 * Records reading progress for a chapter. `page` and `pageCount` are 1-based /
 * total. A chapter is marked read once the last page is reached. No-ops if
 * nothing meaningful changed so the reader can call this freely.
 */
export function recordChapterProgress(
  sourceId: string,
  chapterUrl: string,
  page: number,
  pageCount: number,
): void {
  if (pageCount <= 0) return;
  const key = chapterKey(sourceId, chapterUrl);
  const prev = progress[key];
  const lastPage = Math.max(prev?.lastPage ?? 0, page);
  const read = (prev?.read ?? false) || page >= pageCount;
  if (prev && prev.lastPage === lastPage && prev.read === read && prev.pageCount === pageCount) {
    return;
  }
  progress = {
    ...progress,
    [key]: { lastPage, pageCount, read, readAt: Date.now() },
  };
  prune();
  emit();
  persist();
}

/** Explicitly sets the read flag for a chapter (e.g. a manual toggle). */
export function setChapterRead(sourceId: string, chapterUrl: string, read: boolean): void {
  const key = chapterKey(sourceId, chapterUrl);
  const prev = progress[key];
  progress = {
    ...progress,
    [key]: {
      lastPage: read ? Math.max(prev?.lastPage ?? 0, prev?.pageCount ?? 0) : prev?.lastPage ?? 0,
      pageCount: prev?.pageCount ?? 0,
      read,
      readAt: Date.now(),
    },
  };
  emit();
  persist();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Record<string, ChapterProgress> {
  return progress;
}

/** Reactive map of all chapter progress, keyed by `chapterKey`. */
export function useChapterProgress(): Record<string, ChapterProgress> {
  return useSyncExternalStore(subscribe, getSnapshot);
}

void hydrate();
