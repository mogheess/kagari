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
  if (stored && Array.isArray(stored) && entries.length === 0) {
    // Anything mid-flight when the app died goes back in the queue.
    entries = stored.map(e =>
      e.status === 'downloading' ? { ...e, status: 'queued' as const, downloaded: 0 } : e,
    );
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

/** Reactive list of all downloads (newest activity first). */
export function useDownloads(): DownloadEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot);
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
