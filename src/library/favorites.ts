/**
 * Local favorites/library store.
 *
 * Persisted with AsyncStorage and exposed reactively via useSyncExternalStore so
 * the detail screen, Library, and Home all stay in sync. Identity of a manga is
 * always (sourceId, url) to match the engine contract.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MangaDto, MangaStatus } from '../engine/types';

const KEY = '@kagari/favorites/v1';

export interface FavoriteManga {
  sourceId: string;
  url: string;
  title: string;
  thumbnailUrl?: string;
  author?: string;
  addedAt: number;
}

let favorites: FavoriteManga[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  AsyncStorage.setItem(KEY, JSON.stringify(favorites)).catch(() => {});
}

export async function loadFavorites(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) favorites = parsed as FavoriteManga[];
    }
  } catch {
    // ignore — start with an empty library
  }
  emit();
}

export function isFavorited(sourceId: string, url: string): boolean {
  return favorites.some(f => f.sourceId === sourceId && f.url === url);
}

/** Adds or removes the manga from the library. Returns the new favorite state. */
export function toggleFavorite(m: MangaDto): boolean {
  const exists = isFavorited(m.sourceId, m.url);
  if (exists) {
    favorites = favorites.filter(f => !(f.sourceId === m.sourceId && f.url === m.url));
  } else {
    favorites = [
      {
        sourceId: m.sourceId,
        url: m.url,
        title: m.title,
        thumbnailUrl: m.thumbnailUrl,
        author: m.author,
        addedAt: Date.now(),
      },
      ...favorites,
    ];
  }
  emit();
  persist();
  return !exists;
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

// Kick off the initial load as soon as the store is imported.
void loadFavorites();
