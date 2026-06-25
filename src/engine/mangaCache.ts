/**
 * Persistent cache for manga details and chapter lists, keyed by (sourceId, url).
 *
 * Opening a manga fetches once, then reuses the stored result on later visits —
 * within a session and across app restarts — so navigating back doesn't re-hit
 * the source. Pull-to-refresh on the detail screen calls `invalidateManga` to
 * force a fresh fetch, matching Mihon's "cached until you refresh" behaviour.
 *
 * Backed by an in-memory Map (fast, synchronous reads via `peekManga`) that is
 * mirrored to AsyncStorage. The store is an LRU bounded by recency so it can't
 * grow without limit. This is a speed cache, not offline storage (downloads
 * handle offline reading).
 */
import { getEngine } from '.';
import { makePersistence } from '../store/persist';
import type { MangaDto, ChapterDto } from './types';

interface CacheEntry {
  details?: MangaDto;
  chapters?: ChapterDto[];
  cachedAt: number;
}

/** Keep the most recent N manga; older ones are pruned on persist. */
const MAX_ENTRIES = 100;
const store = makePersistence<Record<string, CacheEntry>>('@kagari/mangaCache/v1');
const cache = new Map<string, CacheEntry>();

function keyFor(sourceId: string, mangaUrl: string): string {
  return `${sourceId}\u0000${mangaUrl}`;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const recent = [...cache.entries()]
      .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      .slice(0, MAX_ENTRIES);
    cache.clear();
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of recent) {
      cache.set(k, v);
      obj[k] = v;
    }
    store.save(obj);
  }, 800);
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored)) {
      // In-memory entries written before hydrate finished take precedence.
      if (!cache.has(k)) cache.set(k, v);
    }
  }
}

/** Synchronous read of whatever is cached right now (for instant first render). */
export function peekManga(
  sourceId: string,
  mangaUrl: string,
): { details?: MangaDto; chapters?: ChapterDto[] } {
  const hit = cache.get(keyFor(sourceId, mangaUrl));
  return { details: hit?.details, chapters: hit?.chapters };
}

export async function loadMangaDetails(
  sourceId: string,
  mangaUrl: string,
): Promise<MangaDto> {
  const key = keyFor(sourceId, mangaUrl);
  const hit = cache.get(key);
  if (hit?.details) return hit.details;
  const details = await getEngine().getMangaDetails(sourceId, mangaUrl);
  cache.set(key, { ...cache.get(key), details, cachedAt: Date.now() });
  schedulePersist();
  return details;
}

export async function loadChapters(
  sourceId: string,
  mangaUrl: string,
): Promise<ChapterDto[]> {
  const key = keyFor(sourceId, mangaUrl);
  const hit = cache.get(key);
  if (hit?.chapters) return hit.chapters;
  const chapters = await getEngine().getChapters(sourceId, mangaUrl);
  cache.set(key, { ...cache.get(key), chapters, cachedAt: Date.now() });
  schedulePersist();
  return chapters;
}

/** Drops the cached details + chapters so the next load re-fetches from source. */
export function invalidateManga(sourceId: string, mangaUrl: string): void {
  cache.delete(keyFor(sourceId, mangaUrl));
  schedulePersist();
}

void hydrate();
