/**
 * Reading history (last-read) store.
 *
 * Records the most recent chapter opened per manga so the History tab can show
 * a "continue where you left off" feed. Persisted with AsyncStorage and exposed
 * reactively via useSyncExternalStore. One entry per manga `(sourceId, url)` —
 * re-reading updates the existing entry's chapter + timestamp.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import type { ChapterDto, MangaDto, MangaStatus } from '../engine/types';

export interface HistoryEntry {
  sourceId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string;
  /** The chapter most recently opened. */
  chapterUrl: string;
  chapterName: string;
  /** Furthest page reached in that chapter (1-based). */
  lastPage?: number;
  /** Total pages in that chapter, when known. */
  pageCount?: number;
  /** Epoch millis of the last read. */
  readAt: number;
}

/** Cap history so the store stays small. */
const MAX_ENTRIES = 200;
const store = makePersistence<HistoryEntry[]>('@kagari/history/v1');

let history: HistoryEntry[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

const keyOf = (sourceId: string, url: string) => `${sourceId}\u0000${url}`;

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  store.save(history);
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) {
    const map = new Map<string, HistoryEntry>();
    for (const e of stored) map.set(keyOf(e.sourceId, e.mangaUrl), e);
    // In-memory entries recorded before hydrate finished win.
    for (const e of history) map.set(keyOf(e.sourceId, e.mangaUrl), e);
    history = [...map.values()].sort((a, b) => b.readAt - a.readAt).slice(0, MAX_ENTRIES);
  }
  hydrated = true;
  emit();
  persist();
}

/** Re-reads history from storage (drives pull-to-refresh in the Activity tab). */
export async function reloadHistory(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) {
    history = stored.sort((a, b) => b.readAt - a.readAt).slice(0, MAX_ENTRIES);
  }
  emit();
}

/** Records (or refreshes) the last-read chapter for a manga. */
export function recordRead(manga: MangaDto, chapter: ChapterDto): void {
  const existing = history.find(
    e => e.sourceId === manga.sourceId && e.mangaUrl === manga.url,
  );
  // Re-opening the same chapter keeps its page progress; a new chapter resets it.
  const sameChapter = existing?.chapterUrl === chapter.url;
  const rest = history.filter(
    e => !(e.sourceId === manga.sourceId && e.mangaUrl === manga.url),
  );
  history = [
    {
      sourceId: manga.sourceId,
      mangaUrl: manga.url,
      title: manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      chapterUrl: chapter.url,
      chapterName: chapter.name,
      lastPage: sameChapter ? existing?.lastPage : undefined,
      pageCount: sameChapter ? existing?.pageCount : undefined,
      readAt: Date.now(),
    },
    ...rest,
  ].slice(0, MAX_ENTRIES);
  emit();
  persist();
}

/**
 * Updates page progress for the manga's current history entry. Throttle calls
 * from the reader; this no-ops if nothing changed or there's no entry yet (the
 * entry is created when the chapter is opened from the detail screen).
 */
export function recordProgress(
  sourceId: string,
  mangaUrl: string,
  page: number,
  pageCount: number,
): void {
  const idx = history.findIndex(e => e.sourceId === sourceId && e.mangaUrl === mangaUrl);
  if (idx === -1) return;
  const entry = history[idx];
  const lastPage = Math.max(entry.lastPage ?? 0, page);
  if (entry.lastPage === lastPage && entry.pageCount === pageCount) return;
  const updated: HistoryEntry = { ...entry, lastPage, pageCount, readAt: Date.now() };
  history = [updated, ...history.filter((_, i) => i !== idx)];
  emit();
  persist();
}

/** Removes a single manga from history. */
export function removeFromHistory(sourceId: string, mangaUrl: string): void {
  history = history.filter(e => !(e.sourceId === sourceId && e.mangaUrl === mangaUrl));
  emit();
  persist();
}

/** Clears the entire history. */
export function clearHistory(): void {
  history = [];
  if (hydrated) persist();
  else void store.save([]);
  emit();
}

export function historyToManga(e: HistoryEntry): MangaDto {
  return {
    sourceId: e.sourceId,
    url: e.mangaUrl,
    title: e.title,
    thumbnailUrl: e.thumbnailUrl,
    genres: [],
    status: 'unknown' as MangaStatus,
    initialized: false,
  };
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): HistoryEntry[] {
  return history;
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

void hydrate();
