/**
 * The reader's chapter window.
 *
 * A seamless reader can't rebuild itself at every chapter boundary — that's a
 * remount and a loading spinner. Instead it keeps several chapters loaded at
 * once and flattens their pages into a single list, so crossing a boundary is
 * ordinary scrolling and only the "which chapter am I in" state changes.
 *
 * This mirrors Mihon's `WebtoonAdapter.setChapters`, including the part that
 * makes it feel seamless: a transition panel is inserted **only** where the
 * neighbouring chapter isn't loaded yet. Once it is, the pages run straight
 * into each other with nothing in between.
 */
import type { ChapterDto, PageDto } from '../engine/types';

/** A chapter whose pages have been resolved and can be rendered. */
export interface LoadedChapter {
  chapter: ChapterDto;
  pages: PageDto[];
  /** Pages come from local storage rather than the network. */
  offline: boolean;
}

/** Keep a Mihon-sized neighbourhood rather than retaining a whole reading session. */
export const MAX_LOADED_CHAPTERS = 5;

export type ReaderItem =
  | {
      kind: 'page';
      key: string;
      chapter: ChapterDto;
      page: PageDto;
      offline: boolean;
      /** 0-based position within its own chapter. */
      pageIndex: number;
      /** Total pages in its own chapter. */
      pageCount: number;
    }
  | {
      kind: 'transition';
      key: string;
      direction: 'prev' | 'next';
      from: ChapterDto;
      /** Absent at the ends of the series. */
      to?: ChapterDto;
      /** `to` is loaded and its pages follow straight after. */
      ready?: boolean;
    };

/**
 * Reading order for a chapter list.
 *
 * Sources hand back chapters newest-first. When they populate `chapter_number`
 * we sort on it; plenty don't (it defaults to -1 in the source API, and
 * Madara-style sources never set it), and there reading order is simply the
 * reverse of what the source gave us.
 */
export function toReadingOrder(list: readonly ChapterDto[]): ChapterDto[] {
  if (!list.some(c => c.chapterNumber >= 0)) return list.slice().reverse();
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.chapterNumber - b.c.chapterNumber || a.i - b.i)
    .map(x => x.c);
}

/** Neighbour lookup over the reading-ordered chapter list. */
export function neighboursOf(
  ordered: readonly ChapterDto[],
  url: string,
): { prev?: ChapterDto; next?: ChapterDto } {
  const i = ordered.findIndex(c => c.url === url);
  if (i < 0) return {};
  return { prev: ordered[i - 1], next: ordered[i + 1] };
}

/**
 * Flattens the loaded window into a render list.
 *
 * `loaded` must already be in reading order and contiguous. A transition is
 * emitted before the first chapter and after the last one; between two loaded
 * chapters nothing is emitted, which is what makes the boundary invisible in
 * the webtoon strip.
 *
 * Paged modes pass `transitionsBetween`: a page flip gives no sense of where a
 * chapter ends, so, like Mihon's pager, a transition page ("finished X, next
 * Y") sits between chapters even when both are loaded. It keeps the key the
 * end-of-window transition had (`next:<url>`), so loading the next chapter
 * doesn't move the reader off it.
 */
export function buildReaderItems(
  loaded: readonly LoadedChapter[],
  ordered: readonly ChapterDto[],
  options: { transitionsBetween?: boolean } = {},
): ReaderItem[] {
  if (loaded.length === 0) return [];
  const items: ReaderItem[] = [];

  const first = loaded[0].chapter;
  const before = neighboursOf(ordered, first.url).prev;
  items.push({
    kind: 'transition',
    key: `prev:${first.url}`,
    direction: 'prev',
    from: first,
    to: before,
  });

  loaded.forEach((entry, i) => {
    if (options.transitionsBetween && i > 0) {
      const previous = loaded[i - 1].chapter;
      items.push({
        kind: 'transition',
        key: `next:${previous.url}`,
        direction: 'next',
        from: previous,
        to: entry.chapter,
        ready: true,
      });
    }
    const pageCount = entry.pages.length;
    entry.pages.forEach((page, pageIndex) => {
      items.push({
        kind: 'page',
        key: `${entry.chapter.url}:${page.index}`,
        chapter: entry.chapter,
        page,
        offline: entry.offline,
        pageIndex,
        pageCount,
      });
    });
  });

  const last = loaded[loaded.length - 1].chapter;
  const after = neighboursOf(ordered, last.url).next;
  items.push({
    kind: 'transition',
    key: `next:${last.url}`,
    direction: 'next',
    from: last,
    to: after,
  });

  return items;
}

/** Index of a chapter's page within the flattened list, or -1. */
export function indexOfPage(
  items: readonly ReaderItem[],
  chapterUrl: string,
  pageIndex: number,
): number {
  return items.findIndex(
    it => it.kind === 'page' && it.chapter.url === chapterUrl && it.pageIndex === pageIndex,
  );
}

/**
 * Inserts a chapter into the window, keeping reading order.
 *
 * The window is bounded around the active chapter. This limits retained page
 * metadata and component keys during long continuous-reading sessions.
 *
 * With `keepEarlier` (the webtoon strip), chapters before the active one are
 * never dropped; only those after it are trimmed, keeping the next one. The
 * strip is a FlatList without fixed item sizes, and removing items above the
 * viewport moved the reader forward by roughly the dropped chapter's length:
 * `maintainVisibleContentPosition` tracks the item at `minIndexForVisible`,
 * and that item is the one being removed. Earlier chapters cost little to
 * keep — the list already unmounts off-screen pages — so they stay.
 */
export function insertChapter(
  loaded: readonly LoadedChapter[],
  entry: LoadedChapter,
  ordered: readonly ChapterDto[],
  activeUrl = entry.chapter.url,
  maxChapters = MAX_LOADED_CHAPTERS,
  keepEarlier = false,
): LoadedChapter[] {
  if (loaded.some(l => l.chapter.url === entry.chapter.url)) return loaded as LoadedChapter[];
  const rank = (url: string) => ordered.findIndex(c => c.url === url);
  const sorted = [...loaded, entry].sort((a, b) => rank(a.chapter.url) - rank(b.chapter.url));
  if (sorted.length <= maxChapters) return sorted;

  const activeIndex = sorted.findIndex(item => item.chapter.url === activeUrl);
  const center = activeIndex >= 0 ? activeIndex : sorted.findIndex(item => item === entry);
  if (keepEarlier) {
    const after = Math.max(1, maxChapters - center - 1);
    return sorted.slice(0, center + 1 + after);
  }
  const half = Math.floor(maxChapters / 2);
  const start = Math.max(0, Math.min(center - half, sorted.length - maxChapters));
  return sorted.slice(start, start + maxChapters);
}
