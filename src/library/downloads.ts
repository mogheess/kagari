/**
 * Offline chapter downloads (Mihon-style). A persisted, reactive store plus a
 * single-worker queue that pulls a chapter's pages through the native engine
 * into persistent storage. The reader reads those local files when a chapter is
 * downloaded, so reading works fully offline.
 *
 * Downloads have no screen of their own, as in Mihon: they show on their
 * titles in the Library and on the title page, and only what's still queued
 * or failed shows in the download queue.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { getEngine } from '../engine';
import { loadPages } from '../engine/pageCache';
import { syncDownloadService } from './downloadActivity';
import type { MangaDto, ChapterDto, DownloadMeta } from '../engine/types';

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error';

export interface DownloadEntry {
  sourceId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string;
  chapterUrl: string;
  chapterName: string;
  /** Kept so a title's downloads can be read in order without its source. */
  chapterNumber?: number;
  dateUpload?: number;
  /** Part of the folder name under a picked storage location (Mihon layout). */
  scanlator?: string;
  /** Source-private chapter state (`ChapterDto.memo`), passed back when fetching pages. */
  memo?: string;
  status: DownloadStatus;
  /** Total pages, known once the page list is fetched. */
  pageCount: number;
  /** Pages written so far. */
  downloaded: number;
  error?: string;
  createdAt: number;
}

const store = makePersistence<DownloadEntry[]>('@kagari/downloads/v1');
const pausedStore = makePersistence<boolean>('@kagari/downloads/paused/v1');

let entries: DownloadEntry[] = [];
let hydrated = false;
let running = false;
/** Queue paused by the user. Persisted: a paused queue stays paused after a restart. */
let paused = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
  // Keeps the app alive in the background while there's work (see downloadActivity).
  syncDownloadService(entries, paused);
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
  paused = (await pausedStore.load()) === true;
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
  // Pause on the download notification pauses the queue, as the button in the
  // app does. Registered here rather than at import, once the engine is up.
  // Ignored once the queue has emptied: a tap that lands just after the last
  // chapter would leave the next download waiting on a pause nobody sees.
  getEngine().onDownloadsPauseRequested(() => {
    if (entries.some(e => e.status === 'queued' || e.status === 'downloading')) pauseDownloads();
  });
  emit();
  persist();
  void pump();
}

function downloadMeta(entry: DownloadEntry): DownloadMeta {
  return { mangaTitle: entry.title, chapterName: entry.chapterName, scanlator: entry.scanlator };
}

/** Completed downloads still sitting in app storage can be moved to a picked folder. */
export function countMigratableDownloads(): number {
  return entries.filter(e => e.status === 'done').length;
}

/**
 * Moves finished downloads from app storage into the picked storage location,
 * one chapter at a time. Nothing is lost on failure: a chapter that could not
 * be moved stays where it was and remains readable from there.
 */
export async function migrateDownloadsToStorage(
  onProgress?: (done: number, total: number) => void,
): Promise<{ moved: number; failed: number }> {
  const engine = getEngine();
  const done = entries.filter(e => e.status === 'done');
  let moved = 0;
  let failed = 0;
  for (let i = 0; i < done.length; i += 1) {
    const e = done[i];
    try {
      await engine.migrateDownloadedChapter(e.sourceId, e.chapterUrl, downloadMeta(e));
      moved += 1;
    } catch {
      failed += 1;
    }
    onProgress?.(i + 1, done.length);
  }
  return { moved, failed };
}

/** Processes queued chapters one at a time. */
async function pump(): Promise<void> {
  if (running || !hydrated || paused) return;
  const next = entries.find(e => e.status === 'queued');
  if (!next) return;
  running = true;
  const { sourceId, chapterUrl } = next;
  patch(sourceId, chapterUrl, { status: 'downloading', downloaded: 0, error: undefined });
  try {
    const engine = getEngine();
    const pages = await loadPages(sourceId, chapterUrl, next.memo);
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
      if (paused) {
        // Stop after the page in flight. Pages already saved are skipped on
        // resume (downloadPage is idempotent), so nothing is fetched twice.
        patch(sourceId, chapterUrl, { status: 'queued' });
        return;
      }
      await engine.downloadPage(sourceId, chapterUrl, pages[i], downloadMeta(next));
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
    chapterNumber: chapter.chapterNumber,
    dateUpload: chapter.dateUpload,
    scanlator: chapter.scanlator,
    memo: chapter.memo,
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
      chapterNumber: chapter.chapterNumber,
      dateUpload: chapter.dateUpload,
      scanlator: chapter.scanlator,
      memo: chapter.memo,
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

const sameTitle = (e: DownloadEntry, sourceId: string, mangaUrl: string) =>
  e.sourceId === sourceId && e.mangaUrl === mangaUrl;

/**
 * Requeues failed chapters — every one, or only one title's. Finished and
 * queued chapters are left alone. Returns how many were requeued.
 */
export function retryFailed(title?: { sourceId: string; mangaUrl: string }): number {
  let count = 0;
  entries = entries.map(e => {
    if (e.status !== 'error') return e;
    if (title && !sameTitle(e, title.sourceId, title.mangaUrl)) return e;
    count += 1;
    return { ...e, status: 'queued' as const, error: undefined, downloaded: 0 };
  });
  if (count === 0) return 0;
  emit();
  persist();
  void pump();
  return count;
}

/**
 * Drops a title's queued and in-progress chapters (and any pages already
 * written for them). Finished chapters stay downloaded and readable.
 */
export function cancelQueued(sourceId: string, mangaUrl: string): number {
  const cancelled = entries.filter(
    e => sameTitle(e, sourceId, mangaUrl) && (e.status === 'queued' || e.status === 'downloading'),
  );
  for (const e of cancelled) removeDownload(e.sourceId, e.chapterUrl);
  return cancelled.length;
}

export function pauseDownloads(): void {
  if (paused) return;
  paused = true;
  pausedStore.save(true);
  emit();
}

export function resumeDownloads(): void {
  if (!paused) return;
  paused = false;
  pausedStore.save(false);
  emit();
  void pump();
}

function getPausedSnapshot(): boolean {
  return paused;
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

/** Whether the user paused the download queue. */
export function useDownloadsPaused(): boolean {
  return useSyncExternalStore(subscribe, getPausedSnapshot);
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

/** Identity of a title in the maps below. */
export function downloadTitleKey(sourceId: string, mangaUrl: string): string {
  return `${sourceId}\u0000${mangaUrl}`;
}

/** Finished chapters per title, keyed by downloadTitleKey. */
export function useDownloadCounts(): ReadonlyMap<string, number> {
  const all = useDownloads();
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of all) {
      if (e.status !== 'done') continue;
      const key = downloadTitleKey(e.sourceId, e.mangaUrl);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [all]);
}

/** What the download queue holds: chapters waiting or downloading, and failed ones. */
export function useQueueCounts(): { active: number; failed: number } {
  const all = useDownloads();
  return useMemo(() => {
    let active = 0;
    let failed = 0;
    for (const e of all) {
      if (e.status === 'queued' || e.status === 'downloading') active += 1;
      else if (e.status === 'error') failed += 1;
    }
    return { active, failed };
  }, [all]);
}

/**
 * Best guess at a chapter number from its name, for downloads saved before
 * the number was kept: "Chapter 152 - Season 5" and "Ch. 223.9" both work.
 */
export function chapterNumberFromName(name: string): number {
  const labelled = /\b(?:ch(?:apter)?|ep(?:isode)?)\.?\s*(\d+(?:\.\d+)?)/i.exec(name);
  const match = labelled ?? /(\d+(?:\.\d+)?)/.exec(name);
  return match ? Number(match[1]) : -1;
}

/**
 * A title's finished downloads as a chapter list, newest first like a
 * source's. Lets the title page and reader work without the source.
 */
export function downloadedChapterList(
  all: readonly DownloadEntry[],
  sourceId: string,
  mangaUrl: string,
): ChapterDto[] {
  return all
    .filter(e => e.status === 'done' && e.sourceId === sourceId && e.mangaUrl === mangaUrl)
    .map(e => ({
      sourceId: e.sourceId,
      mangaUrl: e.mangaUrl,
      url: e.chapterUrl,
      name: e.chapterName,
      chapterNumber:
        e.chapterNumber != null && e.chapterNumber >= 0
          ? e.chapterNumber
          : chapterNumberFromName(e.chapterName),
      scanlator: e.scanlator,
      dateUpload: e.dateUpload ?? 0,
      memo: e.memo,
    }))
    .sort((a, b) => b.chapterNumber - a.chapterNumber || b.dateUpload - a.dateUpload);
}

/** Resolves once the persisted downloads have loaded. */
export function whenDownloadsHydrated(): Promise<void> {
  if (hydrated) return Promise.resolve();
  return new Promise(resolve => {
    const check = () => {
      if (!hydrated) return;
      listeners.delete(check);
      resolve();
    };
    listeners.add(check);
  });
}

/** Snapshot of every download, for callers outside React. */
export function getDownloads(): readonly DownloadEntry[] {
  return entries;
}

void hydrate();
