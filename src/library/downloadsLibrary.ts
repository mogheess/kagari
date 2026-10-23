/**
 * Keeps downloads with their titles in the library, as Mihon does. There's no
 * screen listing downloaded chapters any more, so a title has to be in the
 * library for its downloads to be easy to get back to.
 */
import { Alert } from 'react-native';
import { makePersistence } from '../store/persist';
import {
  favoritesHydrated,
  getFavorites,
  importFavorites,
  isFavorited,
  subscribeFavorites,
  toggleFavorite,
  type FavoriteManga,
} from './favorites';
import { getDownloads, whenDownloadsHydrated, type DownloadEntry } from './downloads';
import type { MangaDto } from '../engine/types';

/** Titles already asked about this session, so the question comes once. */
const asked = new Set<string>();

/**
 * Asks once per title whether to add it to the library when the reader starts
 * downloading from it. Like Mihon, it only offers; the download goes ahead
 * either way.
 */
export function offerToAddToLibrary(manga: MangaDto, onAdded?: () => void): void {
  if (isFavorited(manga.sourceId, manga.url)) return;
  const key = `${manga.sourceId}\u0000${manga.url}`;
  if (asked.has(key)) return;
  asked.add(key);
  Alert.alert(
    'Add to library?',
    `Downloaded chapters show on their titles in your library. Add "${manga.title}" so these are easy to find?`,
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Add',
        onPress: () => {
          if (!isFavorited(manga.sourceId, manga.url)) toggleFavorite(manga);
          onAdded?.();
        },
      },
    ],
  );
}

const adoptedStore = makePersistence<boolean>('@kagari/downloadsAdopted/v1');

function whenFavoritesHydrated(): Promise<void> {
  if (favoritesHydrated()) return Promise.resolve();
  return new Promise(resolve => {
    const unsubscribe = subscribeFavorites(() => {
      if (!favoritesHydrated()) return;
      unsubscribe();
      resolve();
    });
  });
}

/** Titles with a finished download that aren't in `library`, oldest download first. */
export function downloadedTitlesOutside(
  downloads: readonly DownloadEntry[],
  library: readonly Pick<FavoriteManga, 'sourceId' | 'url'>[],
): FavoriteManga[] {
  const inLibrary = new Set(library.map(f => `${f.sourceId}\u0000${f.url}`));
  const found = new Map<string, FavoriteManga>();
  for (const e of downloads) {
    if (e.status !== 'done') continue;
    const key = `${e.sourceId}\u0000${e.mangaUrl}`;
    if (inLibrary.has(key) || found.has(key)) continue;
    found.set(key, {
      sourceId: e.sourceId,
      url: e.mangaUrl,
      title: e.title,
      thumbnailUrl: e.thumbnailUrl,
      addedAt: e.createdAt,
      categoryIds: [],
    });
  }
  return [...found.values()];
}

/**
 * Once, after the Downloads screen went away: titles that have finished
 * downloads but aren't in the library are added to it, so nothing that was
 * reachable there goes missing. Returns how many were added.
 */
export async function adoptDownloadedTitles(): Promise<number> {
  if ((await adoptedStore.load()) === true) return 0;
  await Promise.all([whenDownloadsHydrated(), whenFavoritesHydrated()]);
  const outside = downloadedTitlesOutside(getDownloads(), getFavorites());
  const added = outside.length > 0 ? importFavorites(outside) : 0;
  adoptedStore.save(true);
  return added;
}
