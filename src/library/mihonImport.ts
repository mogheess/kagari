/**
 * Mihon / Tachiyomi backup import.
 *
 * The native engine decodes a `.tachibk` (gzipped protobuf) backup into a
 * {@link MihonBackupDto}; this module maps that into Kagari's local stores:
 * categories, favorites (with category membership), per-chapter read state and
 * reading history. It is intentionally additive — importing never deletes the
 * user's existing library, it only merges the backup on top.
 */
import type { Engine, MihonBackupDto } from '../engine/types';
import { importFavorites, type FavoriteManga } from './favorites';
import { getOrCreateCategoriesByName } from './categories';
import { importChapterProgress, type ChapterProgressImport } from './chapterProgress';
import { importHistory, type HistoryEntry } from './history';

export interface MihonImportSummary {
  /** Manga newly added to the library (existing ones are merged, not counted). */
  mangaAdded: number;
  /** Total favorited manga found in the backup. */
  mangaInBackup: number;
  /** Categories created or matched from the backup. */
  categories: number;
  /** Chapter read-state entries created or upgraded. */
  chapters: number;
  /** History entries added or refreshed. */
  history: number;
}

/** Maps a decoded backup into the local stores. Pure aside from store writes. */
export function applyMihonBackup(backup: MihonBackupDto): MihonImportSummary {
  const nameToId = getOrCreateCategoriesByName(backup.categories);
  // `getOrCreateCategoriesByName` matches categories case-insensitively and keys
  // its result by the trimmed name, so look up each manga's category names the
  // same way — otherwise stray whitespace or a case difference between the
  // category list and a manga's membership would silently drop the category.
  const normalize = (name: string) => name.trim().toLowerCase();
  const lookup = new Map<string, string>();
  for (const [name, id] of Object.entries(nameToId)) {
    lookup.set(normalize(name), id);
  }

  const favorites: FavoriteManga[] = [];
  const chapters: ChapterProgressImport[] = [];
  const history: HistoryEntry[] = [];

  for (const m of backup.manga) {
    const categoryIds = [
      ...new Set(
        m.categories
          .map(name => lookup.get(normalize(name)))
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    favorites.push({
      sourceId: m.sourceId,
      url: m.url,
      title: m.title,
      thumbnailUrl: m.thumbnailUrl,
      author: m.author,
      addedAt: m.dateAdded > 0 ? m.dateAdded : Date.now(),
      categoryIds,
    });

    for (const c of m.chapters) {
      chapters.push({
        sourceId: m.sourceId,
        chapterUrl: c.url,
        lastPage: c.lastPageRead,
        // Mihon doesn't store total page count in the backup; mark read chapters
        // as complete (lastPage acts as the floor) and leave others open-ended.
        pageCount: c.read ? Math.max(c.lastPageRead, 1) : 0,
        read: c.read,
        readAt: m.lastChapter?.readAt ?? m.dateAdded,
      });
    }

    if (m.lastChapter) {
      history.push({
        sourceId: m.sourceId,
        mangaUrl: m.url,
        title: m.title,
        thumbnailUrl: m.thumbnailUrl,
        chapterUrl: m.lastChapter.url,
        chapterName: m.lastChapter.name,
        readAt: m.lastChapter.readAt,
      });
    }
  }

  return {
    mangaAdded: importFavorites(favorites),
    mangaInBackup: backup.manga.length,
    categories: Object.keys(nameToId).length,
    chapters: importChapterProgress(chapters),
    history: importHistory(history),
  };
}

/**
 * Opens the system file picker, decodes the chosen backup and merges it into the
 * library. Resolves to `null` if the user cancelled the picker.
 */
export async function pickAndImportMihonBackup(
  engine: Engine,
): Promise<MihonImportSummary | null> {
  const uri = await engine.pickMihonBackup();
  if (!uri) return null;
  const backup = await engine.importMihonBackup(uri);
  return applyMihonBackup(backup);
}
