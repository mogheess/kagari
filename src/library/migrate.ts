/**
 * Cross-source migration.
 *
 * Moves a title's local reading state from one source to another when an
 * extension breaks or a better source is available. Chapters are matched by
 * `chapterNumber` (URLs differ across sources), and the library entry (with its
 * categories), the continue-reading history, and per-chapter read state are all
 * carried over. Optionally removes the original ("replace") or keeps it
 * ("keep both") when the target is a duplicate.
 */
import type { ChapterDto, MangaDto } from '../engine/types';
import {
  getFavorite,
  importFavorites,
  isFavorited,
  removeFavorite,
  type FavoriteManga,
} from './favorites';
import {
  chapterKey,
  getChapterProgressSnapshot,
  importChapterProgress,
  type ChapterProgressImport,
} from './chapterProgress';
import {
  getHistoryEntry,
  importHistory,
  removeFromHistory,
  type HistoryEntry,
} from './history';

export interface MigrationPlan {
  /** The source title is in the library. */
  fromFavorited: boolean;
  /** The target title is already in the library (a duplicate). */
  targetDuplicate: boolean;
  /** There's local state worth carrying over (favorite, history or progress). */
  hasData: boolean;
}

export interface MigrationSummary {
  favoriteMoved: boolean;
  categoriesCopied: number;
  chaptersMatched: number;
  historyMoved: boolean;
}

/** Builds a chapterNumber → chapter lookup, ignoring unknown (-1) numbers. */
function byNumber(chapters: ChapterDto[]): Map<number, ChapterDto> {
  const map = new Map<number, ChapterDto>();
  for (const ch of chapters) {
    if (ch.chapterNumber >= 0 && !map.has(ch.chapterNumber)) {
      map.set(ch.chapterNumber, ch);
    }
  }
  return map;
}

/** Inspects local state to decide what a migration would do (drives the prompt). */
export function planMigration(from: MangaDto, fromChapters: ChapterDto[], to: MangaDto): MigrationPlan {
  const fromFavorited = isFavorited(from.sourceId, from.url);
  const targetDuplicate = isFavorited(to.sourceId, to.url);
  const hasHistory = getHistoryEntry(from.sourceId, from.url) != null;
  const snapshot = getChapterProgressSnapshot();
  const hasProgress = fromChapters.some(c => snapshot[chapterKey(from.sourceId, c.url)] != null);
  return {
    fromFavorited,
    targetDuplicate,
    hasData: fromFavorited || hasHistory || hasProgress,
  };
}

export function migrateManga(opts: {
  from: MangaDto;
  to: MangaDto;
  fromChapters: ChapterDto[];
  toChapters: ChapterDto[];
  /** Remove the source entry from the library/history after copying. */
  replace: boolean;
}): MigrationSummary {
  const { from, to, fromChapters, toChapters, replace } = opts;
  const toByNum = byNumber(toChapters);

  // 1) Per-chapter read state — match by chapter number.
  const snapshot = getChapterProgressSnapshot();
  const progressImports: ChapterProgressImport[] = [];
  for (const fromCh of fromChapters) {
    const prog = snapshot[chapterKey(from.sourceId, fromCh.url)];
    if (!prog) continue;
    const toCh = toByNum.get(fromCh.chapterNumber);
    if (!toCh) continue;
    progressImports.push({
      sourceId: to.sourceId,
      chapterUrl: toCh.url,
      lastPage: prog.lastPage,
      pageCount: prog.pageCount,
      read: prog.read,
      readAt: prog.readAt,
    });
  }
  const chaptersMatched = importChapterProgress(progressImports);

  // 2) Library entry + categories.
  const fromFav = getFavorite(from.sourceId, from.url);
  let favoriteMoved = false;
  let categoriesCopied = 0;
  if (fromFav) {
    const toFav: FavoriteManga = {
      sourceId: to.sourceId,
      url: to.url,
      title: to.title || fromFav.title,
      thumbnailUrl: to.thumbnailUrl ?? fromFav.thumbnailUrl,
      author: to.author ?? fromFav.author,
      addedAt: fromFav.addedAt,
      categoryIds: [...fromFav.categoryIds],
    };
    importFavorites([toFav]);
    favoriteMoved = true;
    categoriesCopied = fromFav.categoryIds.length;
  }

  // 3) Continue-reading history — re-point the last-read chapter when matchable.
  const fromHist = getHistoryEntry(from.sourceId, from.url);
  let historyMoved = false;
  if (fromHist) {
    const fromCh = fromChapters.find(c => c.url === fromHist.chapterUrl);
    const toCh = fromCh ? toByNum.get(fromCh.chapterNumber) : undefined;
    const entry: HistoryEntry = {
      sourceId: to.sourceId,
      mangaUrl: to.url,
      title: to.title || fromHist.title,
      thumbnailUrl: to.thumbnailUrl ?? fromHist.thumbnailUrl,
      chapterUrl: toCh?.url ?? fromHist.chapterUrl,
      chapterName: toCh?.name ?? fromHist.chapterName,
      lastPage: toCh ? fromHist.lastPage : undefined,
      pageCount: toCh ? fromHist.pageCount : undefined,
      readAt: fromHist.readAt,
    };
    importHistory([entry]);
    historyMoved = true;
  }

  // 4) Replace: drop the original from the library and history.
  if (replace) {
    removeFavorite(from.sourceId, from.url);
    removeFromHistory(from.sourceId, from.url);
  }

  return { favoriteMoved, categoriesCopied, chaptersMatched, historyMoved };
}
