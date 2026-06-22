/**
 * In-memory cache for manga details and chapter lists, keyed by (sourceId, url).
 *
 * Opening a manga fetches once and reuses the result on subsequent visits, so
 * navigating back and forth doesn't re-hit the source every time. Pull-to-refresh
 * on the detail screen calls `invalidateManga` to force a fresh fetch.
 *
 * The cache is process-lifetime only (cleared on app restart) — it's a speed/UX
 * cache, not offline storage (downloads handle offline).
 */
import { getEngine } from '.';
import type { MangaDto, ChapterDto } from './types';

interface CacheEntry {
  details?: MangaDto;
  chapters?: ChapterDto[];
}

const cache = new Map<string, CacheEntry>();

function keyFor(sourceId: string, mangaUrl: string): string {
  return `${sourceId}:${mangaUrl}`;
}

export async function loadMangaDetails(
  sourceId: string,
  mangaUrl: string,
): Promise<MangaDto> {
  const key = keyFor(sourceId, mangaUrl);
  const hit = cache.get(key);
  if (hit?.details) return hit.details;
  const details = await getEngine().getMangaDetails(sourceId, mangaUrl);
  cache.set(key, { ...cache.get(key), details });
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
  cache.set(key, { ...cache.get(key), chapters });
  return chapters;
}

/** Drops the cached details + chapters so the next load re-fetches from source. */
export function invalidateManga(sourceId: string, mangaUrl: string): void {
  cache.delete(keyFor(sourceId, mangaUrl));
}
