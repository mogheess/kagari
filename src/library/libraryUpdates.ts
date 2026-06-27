/**
 * Library updates: detect new chapters for followed titles.
 *
 * Chapters are never stored in a backup — they're live-fetched per source — so
 * "what's new in my library" needs an active scan. For each favorite we fetch the
 * current chapter list, diff it against the last-seen set (a per-manga snapshot of
 * chapter urls), and record any genuinely new chapters into a feed the Updates tab
 * renders. The first time a manga is seen it's baselined silently so the backlog
 * doesn't flood the feed.
 *
 * In-app only: the scan runs on launch/foreground/hourly via `UpdateBootstrap`
 * (throttled here) and on manual pull-to-refresh (`force`). It does not run while
 * the app is closed — that would need a native WorkManager job.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { getFavorites, subscribeFavorites, favoritesHydrated } from './favorites';
import { takeRecentlyAdded } from './recentlyAdded';
import type { ChapterDto, Engine, MangaDto, MangaStatus } from '../engine/types';

export interface LibraryUpdate {
  sourceId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string;
  /** How many new chapters were found in the detection that created this entry. */
  newCount: number;
  /** The newest new chapter (what a tap should head toward). */
  latestChapterName: string;
  latestChapterUrl: string;
  /** Epoch millis the new chapter(s) were detected. */
  foundAt: number;
  /**
   * 'new' = freshly published chapters for a followed title (default when
   * absent, for back-compat with already-stored feeds); 'added' = a title the
   * user just added to the library, surfaced once so they know it's there.
   */
  kind?: 'new' | 'added';
}

interface UpdatesMeta {
  /** Last scan time (throttles automatic checks). */
  lastChecked: number;
  /** Last time the user viewed the Updates tab (drives the unseen badge). */
  lastSeen: number;
}

const feedStore = makePersistence<LibraryUpdate[]>('@kagari/libraryUpdates/v1');
const snapStore = makePersistence<Record<string, string[]>>('@kagari/librarySnapshots/v1');
const metaStore = makePersistence<UpdatesMeta>('@kagari/libraryUpdates-meta/v1');

/** Don't auto-rescan more than once per this window (manual checks pass force). */
const CHECK_TTL_MS = 6 * 60 * 60 * 1000;
/** Cap the feed so the store stays small. */
const MAX_FEED = 300;
/** Cap stored urls per manga (effectively "all" for normal series). */
const MAX_SNAPSHOT_PER_MANGA = 4000;
/** Bound concurrent per-manga chapter fetches during a scan. */
const SCAN_CONCURRENCY = 3;

let feed: LibraryUpdate[] = [];
let snapshots: Record<string, string[]> = {};
let meta: UpdatesMeta = { lastChecked: 0, lastSeen: 0 };
let checking = false;
const listeners = new Set<() => void>();

const keyOf = (sourceId: string, url: string) => `${sourceId}\u0000${url}`;
const detKey = (u: LibraryUpdate) => `${u.sourceId}\u0000${u.mangaUrl}\u0000${u.latestChapterUrl}`;

function emit(): void {
  for (const l of listeners) l();
}

async function hydrate(): Promise<void> {
  const [f, s, m] = await Promise.all([feedStore.load(), snapStore.load(), metaStore.load()]);
  if (Array.isArray(f)) feed = f;
  if (s && typeof s === 'object') snapshots = s;
  if (m && typeof m === 'object') meta = { lastChecked: m.lastChecked ?? 0, lastSeen: m.lastSeen ?? 0 };
  emit();
  // Clean up anything left over from a title removed in a previous session.
  pruneRemovedFavorites();
}
void hydrate();

/**
 * Drops feed entries and tracking snapshots for titles no longer in the library.
 * Removing a manga should also remove it from Updates and stop tracking it — the
 * scan already only looks at current favorites, this clears the stale leftovers.
 *
 * Guarded on favorites hydration so the brief empty window at startup (library
 * not loaded yet) can't wipe a real feed.
 */
function pruneRemovedFavorites(): void {
  if (!favoritesHydrated()) return;
  const live = new Set(getFavorites().map(f => keyOf(f.sourceId, f.url)));

  const nextFeed = feed.filter(u => live.has(keyOf(u.sourceId, u.mangaUrl)));
  const feedChanged = nextFeed.length !== feed.length;
  if (feedChanged) {
    feed = nextFeed;
    feedStore.save(feed);
  }

  // Drop snapshots for removed titles so a later re-add baselines fresh.
  let snapChanged = false;
  for (const key of Object.keys(snapshots)) {
    if (!live.has(key)) {
      delete snapshots[key];
      snapChanged = true;
    }
  }
  if (snapChanged) snapStore.save(snapshots);

  if (feedChanged) emit();
}

// Removing a title from the library prunes it from Updates immediately.
subscribeFavorites(pruneRemovedFavorites);

/** Newest-first: by chapter number when known, else by upload date. */
function byNewest(a: ChapterDto, b: ChapterDto): number {
  if (a.chapterNumber >= 0 && b.chapterNumber >= 0 && a.chapterNumber !== b.chapterNumber) {
    return b.chapterNumber - a.chapterNumber;
  }
  return (b.dateUpload || 0) - (a.dateUpload || 0);
}

/** Capped, newest-first url snapshot of a manga's current chapter list. */
function snapshotUrls(chapters: ChapterDto[]): string[] {
  const urls = chapters.slice().sort(byNewest).map(c => c.url);
  return urls.length > MAX_SNAPSHOT_PER_MANGA ? urls.slice(0, MAX_SNAPSHOT_PER_MANGA) : urls;
}

/** Prepends freshly-found updates, de-duplicated by manga+chapter, capped. */
function mergeFeed(found: LibraryUpdate[]): void {
  const seen = new Set(feed.map(detKey));
  const fresh = found.filter(u => !seen.has(detKey(u)));
  if (fresh.length === 0) return;
  feed = [...fresh, ...feed].slice(0, MAX_FEED);
}

/**
 * Scans the library for new chapters. Best-effort: a source that's offline, not
 * installed, or errors is skipped without disturbing its snapshot. Throttled
 * unless `force` (manual pull-to-refresh).
 */
export async function checkLibraryUpdates(engine: Engine, opts?: { force?: boolean }): Promise<void> {
  if (checking) return;
  if (!opts?.force && meta.lastChecked && Date.now() - meta.lastChecked < CHECK_TTL_MS) return;

  const favs = getFavorites();
  if (favs.length === 0) {
    meta = { ...meta, lastChecked: Date.now() };
    metaStore.save(meta);
    return;
  }

  checking = true;
  emit();

  const found: LibraryUpdate[] = [];
  let snapChanged = false;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < favs.length) {
      const f = favs[cursor++];
      const key = keyOf(f.sourceId, f.url);
      let chapters: ChapterDto[] | null = null;
      try {
        chapters = await engine.getChapters(f.sourceId, f.url);
      } catch {
        chapters = null; // source down / not installed
      }
      const hasChapters = !!chapters && chapters.length > 0;

      // If the user just manually added this title, surface it once so they can
      // confirm it's in the library — even for completed series and even when
      // the source can't return chapters right now (offline, blocked, not
      // installed). This is checked *before* the empty/baseline early-returns and
      // *regardless* of whether a snapshot exists: a non-forced launch scan can
      // baseline a title before the recentlyAdded set finishes hydrating, so the
      // flag must still win on a later scan instead of being swallowed forever.
      if (takeRecentlyAdded(f.sourceId, f.url)) {
        const newest = hasChapters ? chapters!.slice().sort(byNewest)[0] : undefined;
        found.push({
          sourceId: f.sourceId,
          mangaUrl: f.url,
          title: f.title,
          thumbnailUrl: f.thumbnailUrl,
          newCount: hasChapters ? chapters!.length : 0,
          latestChapterName: newest?.name ?? '',
          latestChapterUrl: newest?.url ?? `kagari:added\u0000${key}`,
          foundAt: Date.now(),
          kind: 'added',
        });
        // Baseline so the (now-known) backlog doesn't re-flood as "new" later.
        if (hasChapters) {
          snapshots[key] = snapshotUrls(chapters!);
          snapChanged = true;
        }
        continue;
      }

      // Nothing fetched and not a manual add — leave the snapshot untouched.
      if (!hasChapters) continue;

      const prev = snapshots[key];
      snapshots[key] = snapshotUrls(chapters!);
      snapChanged = true;

      // First time we've seen this manga and it wasn't a manual add: baseline
      // silently so the backlog doesn't flood the feed.
      if (!prev) continue;

      const known = new Set(prev);
      const newChapters = chapters!.filter(c => !known.has(c.url));
      if (newChapters.length === 0) continue;

      const newest = newChapters.slice().sort(byNewest)[0];
      found.push({
        sourceId: f.sourceId,
        mangaUrl: f.url,
        title: f.title,
        thumbnailUrl: f.thumbnailUrl,
        newCount: newChapters.length,
        latestChapterName: newest.name,
        latestChapterUrl: newest.url,
        foundAt: Date.now(),
      });
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(SCAN_CONCURRENCY, favs.length) }, () => worker()),
    );
    if (found.length > 0) {
      mergeFeed(found);
      feedStore.save(feed);
    }
    if (snapChanged) snapStore.save(snapshots);
    meta = { ...meta, lastChecked: Date.now() };
    metaStore.save(meta);
  } finally {
    checking = false;
    emit();
  }
}

/** Removes one entry from the feed (the per-row dismiss). */
export function removeLibraryUpdate(sourceId: string, mangaUrl: string, latestChapterUrl: string): void {
  const next = feed.filter(
    u => !(u.sourceId === sourceId && u.mangaUrl === mangaUrl && u.latestChapterUrl === latestChapterUrl),
  );
  if (next.length === feed.length) return;
  feed = next;
  feedStore.save(feed);
  emit();
}

/** Clears the whole feed. Snapshots are kept so cleared chapters don't re-appear. */
export function clearLibraryUpdates(): void {
  if (feed.length === 0) return;
  feed = [];
  feedStore.save(feed);
  emit();
}

/** Marks the feed as seen up to now (clears the tab badge). */
export function markUpdatesSeen(): void {
  const newest = feed.length > 0 ? feed[0].foundAt : Date.now();
  if (meta.lastSeen >= newest) return;
  meta = { ...meta, lastSeen: newest };
  metaStore.save(meta);
  emit();
}

export function updateToManga(u: LibraryUpdate): MangaDto {
  return {
    sourceId: u.sourceId,
    url: u.mangaUrl,
    title: u.title,
    thumbnailUrl: u.thumbnailUrl,
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

function getFeed(): LibraryUpdate[] {
  return feed;
}

export function useLibraryUpdates(): LibraryUpdate[] {
  return useSyncExternalStore(subscribe, getFeed);
}

function getChecking(): boolean {
  return checking;
}

export function useLibraryUpdatesChecking(): boolean {
  return useSyncExternalStore(subscribe, getChecking);
}

let unseenCount = 0;
function getUnseen(): number {
  // Recompute only when the snapshot changes (cheap: feed is small and capped).
  unseenCount = feed.reduce((n, u) => (u.foundAt > meta.lastSeen ? n + 1 : n), 0);
  return unseenCount;
}

export function useUnseenUpdateCount(): number {
  return useSyncExternalStore(subscribe, getUnseen);
}
