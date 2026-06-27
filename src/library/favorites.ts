/**
 * Local favorites/library store.
 *
 * Persisted with AsyncStorage and exposed reactively via useSyncExternalStore so
 * the detail screen, Library and Home stay in sync. Identity of a manga is always
 * (sourceId, url) to match the engine contract.
 *
 * Hydration is merge-safe: if the user toggles a favorite in the brief window
 * before the stored data loads, those changes are preserved (adds win, and
 * removals done in the window are not resurrected by the stored copy).
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import type { MangaDto, MangaStatus } from '../engine/types';

export interface FavoriteManga {
  sourceId: string;
  url: string;
  title: string;
  thumbnailUrl?: string;
  author?: string;
  addedAt: number;
  /** Category ids this manga belongs to (empty = uncategorized). */
  categoryIds: string[];
}

const store = makePersistence<FavoriteManga[]>('@kagari/favorites/v1');

let favorites: FavoriteManga[] = [];
let hydrated = false;
const removedBeforeHydrate = new Set<string>();
const listeners = new Set<() => void>();

const keyOf = (sourceId: string, url: string) => `${sourceId}\u0000${url}`;

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  store.save(favorites);
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) {
    const map = new Map<string, FavoriteManga>();
    for (const f of stored) {
      const k = keyOf(f.sourceId, f.url);
      if (removedBeforeHydrate.has(k)) continue;
      map.set(k, { ...f, categoryIds: f.categoryIds ?? [] });
    }
    // In-memory entries (added before hydrate finished) win.
    for (const f of favorites) map.set(keyOf(f.sourceId, f.url), f);
    favorites = [...map.values()].sort((a, b) => b.addedAt - a.addedAt);
  }
  hydrated = true;
  emit();
  persist();
}

/** Re-reads favorites from storage (drives pull-to-refresh in the Library). */
export async function reloadFavorites(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) {
    favorites = stored
      .map(f => ({ ...f, categoryIds: f.categoryIds ?? [] }))
      .sort((a, b) => b.addedAt - a.addedAt);
  }
  emit();
}

export function isFavorited(sourceId: string, url: string): boolean {
  return favorites.some(f => f.sourceId === sourceId && f.url === url);
}

/** Non-reactive lookup (for migration and other imperative flows). */
export function getFavorite(sourceId: string, url: string): FavoriteManga | undefined {
  return favorites.find(f => f.sourceId === sourceId && f.url === url);
}

/** Non-reactive snapshot of the whole library (e.g. the library-updates scan). */
export function getFavorites(): FavoriteManga[] {
  return favorites;
}

/** Removes a manga from the library if present (idempotent). */
export function removeFavorite(sourceId: string, url: string): void {
  if (!isFavorited(sourceId, url)) return;
  favorites = favorites.filter(f => !(f.sourceId === sourceId && f.url === url));
  if (!hydrated) removedBeforeHydrate.add(keyOf(sourceId, url));
  emit();
  persist();
}

/** Adds or removes the manga from the library. Returns the new favorite state. */
export function toggleFavorite(m: MangaDto, categoryIds: string[] = []): boolean {
  const exists = isFavorited(m.sourceId, m.url);
  if (exists) {
    favorites = favorites.filter(f => !(f.sourceId === m.sourceId && f.url === m.url));
    if (!hydrated) removedBeforeHydrate.add(keyOf(m.sourceId, m.url));
  } else {
    favorites = [
      {
        sourceId: m.sourceId,
        url: m.url,
        title: m.title,
        thumbnailUrl: m.thumbnailUrl,
        author: m.author,
        addedAt: Date.now(),
        categoryIds,
      },
      ...favorites,
    ];
    removedBeforeHydrate.delete(keyOf(m.sourceId, m.url));
  }
  emit();
  persist();
  return !exists;
}

/**
 * Bulk-adds favorites (used by the Mihon importer). Existing entries are kept
 * but have the imported category ids merged in; new entries are inserted.
 * Returns the number of manga newly added to the library.
 */
export function importFavorites(entries: FavoriteManga[]): number {
  const map = new Map<string, FavoriteManga>();
  for (const f of favorites) map.set(keyOf(f.sourceId, f.url), f);
  let added = 0;
  for (const incoming of entries) {
    const k = keyOf(incoming.sourceId, incoming.url);
    const existing = map.get(k);
    if (existing) {
      const categoryIds = [...new Set([...existing.categoryIds, ...incoming.categoryIds])];
      map.set(k, {
        ...existing,
        categoryIds,
        // Backfill metadata we may not have had before.
        thumbnailUrl: existing.thumbnailUrl ?? incoming.thumbnailUrl,
        author: existing.author ?? incoming.author,
        addedAt: Math.min(existing.addedAt, incoming.addedAt),
      });
    } else {
      map.set(k, incoming);
      removedBeforeHydrate.delete(k);
      added += 1;
    }
  }
  favorites = [...map.values()].sort((a, b) => b.addedAt - a.addedAt);
  emit();
  persist();
  return added;
}

/** Sets the category membership for a favorited manga. */
export function setMangaCategories(sourceId: string, url: string, categoryIds: string[]): void {
  favorites = favorites.map(f =>
    f.sourceId === sourceId && f.url === url ? { ...f, categoryIds } : f,
  );
  emit();
  persist();
}

/** Drops a category id from every manga (used when a category is deleted). */
export function removeCategoryFromAll(categoryId: string): void {
  let changed = false;
  favorites = favorites.map(f => {
    if (!f.categoryIds.includes(categoryId)) return f;
    changed = true;
    return { ...f, categoryIds: f.categoryIds.filter(id => id !== categoryId) };
  });
  if (changed) {
    emit();
    persist();
  }
}

export function favoriteToManga(f: FavoriteManga): MangaDto {
  return {
    sourceId: f.sourceId,
    url: f.url,
    title: f.title,
    thumbnailUrl: f.thumbnailUrl,
    author: f.author,
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

function getSnapshot(): FavoriteManga[] {
  return favorites;
}

export function useFavorites(): FavoriteManga[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useIsFavorite(sourceId: string, url: string): boolean {
  const favs = useSyncExternalStore(subscribe, getSnapshot);
  return favs.some(f => f.sourceId === sourceId && f.url === url);
}

export function useFavorite(sourceId: string, url: string): FavoriteManga | undefined {
  const favs = useSyncExternalStore(subscribe, getSnapshot);
  return favs.find(f => f.sourceId === sourceId && f.url === url);
}

void hydrate();
