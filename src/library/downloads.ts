/**
 * Offline chapter downloads (Mihon-style). A persisted, reactive store plus a
 * single-worker queue that pulls a chapter's pages through the native engine
 * into persistent storage. The reader reads those local files when a chapter is
 * downloaded, so reading works fully offline.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { getEngine } from '../engine';
import type { MangaDto, ChapterDto } from '../engine/types';

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error';

export interface DownloadEntry {
  sourceId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string;
  chapterUrl: string;
  chapterName: string;
  status: DownloadStatus;
  /** Total pages, known once the page list is fetched. */
  pageCount: number;
  /** Pages written so far. */
  downloaded: number;
  error?: string;
  createdAt: number;
}

const store = makePersistence<DownloadEntry[]>('@kagari/downloads/v1');

let entries: DownloadEntry[] = [];
let hydrated = false;
let running = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  store.save(entries);
}

function sameChapter(e: DownloadEntry, sourceId: string, chapterUrl: string): boolean {
  return e.sourceId === sourceId && e.chapterUrl === chapterUrl;
}

function patch(sourceId: string, chapterUrl: string, changes: Partial<DownloadEntry>): void {
  entries = entries.map(e =>
    sameChapter(e, sourceId, chapterUrl) ? { ...e, ...changes } : e,
  );
  emit();
  persist();
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) {
    // Anything mid-flight when the app died goes back in the queue. Merge-safe:
    // a chapter enqueued before hydration finishes wins over its stored entry.
    const byKey = new Map<string, DownloadEntry>();
    for (const e of stored) {
      byKey.set(
        `${e.sourceId}\u0000${e.chapterUrl}`,
        e.status === 'downloading' ? { ...e, status: 'queued' as const, downloaded: 0 } : e,
      );
    }
    for (const e of entries) byKey.set(`${e.sourceId}\u0000${e.chapterUrl}`, e);
    entries = [...byKey.values()];
  }
  hydrated = true;
  emit();
  persist();
  void pump();
}

/** Processes queued chapters one at a time. */
async function pump(): Promise<void> {
  if (running || !hydrated) return;
  const next = entries.find(e => e.status === 'queued');
  if (!next) return;
  running = true;
  const { sourceId, chapterUrl } = next;
  patch(sourceId, chapterUrl, { status: 'downloading', downloaded: 0, error: undefined });
  try {
    const engine = getEngine();
    const pages = await engine.getPages(sourceId, chapterUrl);
    if (!entries.some(e => sameChapter(e, sourceId, chapterUrl))) return; // cancelled
    if (pages.length === 0) {
      // A "done" download with zero pages is useless and can't be re-queued
      // (enqueueDownload skips non-error entries), so surface it as a failure.
      patch(sourceId, chapterUrl, { status: 'error', error: 'The source returned no pages' });
      return;
    }
    patch(sourceId, chapterUrl, { pageCount: pages.length });
    for (let i = 0; i < pages.length; i += 1) {
      if (!entries.some(e => sameChapter(e, sourceId, chapterUrl))) return; // cancelled mid-run
      await engine.downloadPage(sourceId, chapterUrl, pages[i]);
      patch(sourceId, chapterUrl, { downloaded: i + 1 });
    }
    if (entries.some(e => sameChapter(e, sourceId, chapterUrl))) {
      patch(sourceId, chapterUrl, { status: 'done' });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (entries.some(e2 => sameChapter(e2, sourceId, chapterUrl))) {
      patch(sourceId, chapterUrl, { status: 'error', error: message });
    }
  } finally {
    running = false;
    void pump();
  }
}

/** Queues a chapter for download. No-op if already queued/downloading/done. */
export function enqueueDownload(manga: MangaDto, chapter: ChapterDto): void {
  const existing = entries.find(e => sameChapter(e, manga.sourceId, chapter.url));
  if (existing && existing.status !== 'error') return;
  const entry: DownloadEntry = {
    sourceId: manga.sourceId,
    mangaUrl: manga.url,
    title: manga.title,
    thumbnailUrl: manga.thumbnailUrl,
    chapterUrl: chapter.url,
    chapterName: chapter.name,
    status: 'queued',
    pageCount: 0,
    downloaded: 0,
    createdAt: Date.now(),
  };
  entries = [...entries.filter(e => !sameChapter(e, manga.sourceId, chapter.url)), entry];
  emit();
  persist();
  void pump();
}

/**
 * Queues many chapters at once, skipping any already queued, downloading or
 * done (a failed one is retried). One store write and one notification for the
 * batch — [enqueueDownload] in a loop re-serializes the whole queue per
 * chapter, which stalls the UI when adding a few hundred.
 *
 * Returns the number of chapters actually added.
 */
export function enqueueDownloads(manga: MangaDto, chapters: readonly ChapterDto[]): number {
  const skip = new Set(
    entries
      .filter(e => e.sourceId === manga.sourceId && e.status !== 'error')
      .map(e => e.chapterUrl),
  );
  const now = Date.now();
  const added: DownloadEntry[] = [];
  const seen = new Set<string>();
  for (const chapter of chapters) {
    if (skip.has(chapter.url) || seen.has(chapter.url)) continue;
    seen.add(chapter.url);
    added.push({
      sourceId: manga.sourceId,
      mangaUrl: manga.url,
      title: manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      chapterUrl: chapter.url,
      chapterName: chapter.name,
      status: 'queued',
      pageCount: 0,
      downloaded: 0,
      createdAt: now,
    });
  }
  if (added.length === 0) return 0;
  // Drop any failed entries being requeued, then append in the given order.
  entries = [
    ...entries.filter(e => !(e.sourceId === manga.sourceId && seen.has(e.chapterUrl))),
    ...added,
  ];
  emit();
  persist();
  void pump();
  return added.length;
}

/** Removes a chapter from the queue/library and deletes its files. */
export function removeDownload(sourceId: string, chapterUrl: string): void {
  entries = entries.filter(e => !sameChapter(e, sourceId, chapterUrl));
  emit();
  persist();
  void getEngine().deleteDownloadedChapter(sourceId, chapterUrl).catch(() => {});
}

/** Retries a failed download. */
export function retryDownload(sourceId: string, chapterUrl: string): void {
  patch(sourceId, chapterUrl, { status: 'queued', error: undefined, downloaded: 0 });
  void pump();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): DownloadEntry[] {
  return entries;
}

function getHydratedSnapshot(): boolean {
  return hydrated;
}

/** Reactive list of all downloads (newest activity first). */
export function useDownloads(): DownloadEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** True once the persisted queue has been merged into memory. */
export function useDownloadsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getHydratedSnapshot);
}

/**
 * Non-reactive download lookup, for callers outside React (the reader loads
 * chapters on demand as you scroll, not from a hook).
 */
export function getDownloadEntry(
  sourceId: string,
  chapterUrl: string,
): DownloadEntry | undefined {
  return entries.find(e => sameChapter(e, sourceId, chapterUrl));
}

/** Whether the persisted queue has been merged into memory yet. */
export function isDownloadsHydrated(): boolean {
  return hydrated;
}

/** Reactive single-chapter download state for a chapter row. */
export function useDownloadEntry(
  sourceId: string,
  chapterUrl: string,
): DownloadEntry | undefined {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  return all.find(e => sameChapter(e, sourceId, chapterUrl));
}

void hydrate();
