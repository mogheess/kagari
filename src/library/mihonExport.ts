/**
 * Exports the library as a Mihon/Tachiyomi `.tachibk` backup.
 *
 * Deliberately their format rather than one of our own: a backup only Kagari
 * can read is lock-in, and the importer already speaks this schema, so a round
 * trip works in either direction.
 *
 * Kagari state with no Mihon equivalent (tier lists, home layout, pinned
 * sources) is left out — those fields don't exist in the schema, and inventing
 * them would break the compatibility this is for.
 */
import { getEngine } from '../engine';
import { peekManga } from '../engine/mangaCache';
import { getFavorites } from './favorites';
import { getCategoriesSnapshot } from './categories';
import { getChapterProgressSnapshot, chapterKey } from './chapterProgress';
import { getHistoryEntry } from './history';

export interface BackupExportResult {
  uri: string;
  fileName: string;
  bytes: number;
  mangaCount: number;
}

export interface BackupChapter {
  url: string;
  name: string;
  read: boolean;
  lastPageRead: number;
}

export interface BackupManga {
  sourceId: string;
  url: string;
  title: string;
  author?: string;
  thumbnailUrl?: string;
  dateAdded: number;
  categories: string[];
  chapters: BackupChapter[];
  lastReadChapterUrl?: string;
  lastReadAt: number;
}

export interface BackupRequest {
  categories: string[];
  manga: BackupManga[];
}

/** `kagari-backup-2026-08-01.tachibk` */
function defaultFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `kagari-backup-${stamp}.tachibk`;
}

/**
 * Read state is stored per `(sourceId, chapterUrl)` with no manga attached, so
 * chapters can only be attributed to a manga through its known chapter list.
 * That list comes from the manga cache, which is populated whenever a title's
 * page has been opened.
 *
 * Guessing instead — matching chapter urls against the manga url — would
 * silently file one title's progress under another whenever a source nests urls
 * differently, and a backup is the worst place to find that out. So a manga
 * whose chapters aren't cached exports without per-chapter state rather than
 * with wrong state; `mangaMissingChapters` reports how many.
 */
export function buildBackupRequest(now: Date = new Date()): {
  fileName: string;
  request: BackupRequest;
  /** Favourites exported without per-chapter read state. */
  mangaMissingChapters: number;
} {
  const categories = getCategoriesSnapshot();
  const categoryNameById = new Map(categories.map(c => [c.id, c.name]));
  const progress = getChapterProgressSnapshot();

  let mangaMissingChapters = 0;

  const manga: BackupManga[] = getFavorites().map(fav => {
    const known = peekManga(fav.sourceId, fav.url).chapters ?? [];
    if (known.length === 0) mangaMissingChapters += 1;

    const chapters: BackupChapter[] = [];
    for (const ch of known) {
      const entry = progress[chapterKey(fav.sourceId, ch.url)];
      // Only chapters with something worth restoring.
      if (!entry || (!entry.read && entry.lastPage <= 0)) continue;
      chapters.push({
        url: ch.url,
        name: ch.name,
        read: entry.read,
        lastPageRead: entry.lastPage,
      });
    }

    const history = getHistoryEntry(fav.sourceId, fav.url);
    return {
      sourceId: fav.sourceId,
      url: fav.url,
      title: fav.title,
      author: fav.author,
      thumbnailUrl: fav.thumbnailUrl,
      dateAdded: fav.addedAt,
      categories: fav.categoryIds
        .map(id => categoryNameById.get(id))
        .filter((n): n is string => !!n),
      chapters,
      lastReadChapterUrl: history?.chapterUrl,
      lastReadAt: history?.readAt ?? 0,
    };
  });

  return {
    fileName: defaultFileName(now),
    request: { categories: categories.map(c => c.name), manga },
    mangaMissingChapters,
  };
}

/** Writes the backup and hands it to the system share sheet. */
export async function exportMihonBackup(): Promise<BackupExportResult> {
  const { fileName, request } = buildBackupRequest();
  const engine = getEngine();
  const result = await engine.exportMihonBackup(request, fileName);
  await engine.shareBackup(result.uri, result.fileName);
  return result;
}
