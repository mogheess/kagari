/**
 * The webtoon strip's layout, worked out rather than measured.
 *
 * Pages differ wildly in height (one webtoon page can be ten screens tall), so
 * FlatList's own estimates for cells it hasn't rendered swing every time a page
 * loads, and keeping the reader's place against those swings made the strip
 * drift. Every cell's height comes from here instead, and cells render at
 * exactly that height.
 */
import type { ReaderItem } from './chapterWindow';

/** Shape (height / width) for a page when nothing in its series is measured. */
export const PLACEHOLDER_RATIO = 1.5;
/** Measured pages a series needs before its typical shape stands in for the rest. */
const MIN_SAMPLES = 3;

/**
 * Shape of every strip page measured this session, by page. A page that
 * scrolls out of the render window is unmounted; without this it would come
 * back at the placeholder height and grow again, moving everything below it.
 */
const pageShapes = new Map<string, number>();
/** The same shapes grouped by series, for the typical shape. */
const seriesShapes = new Map<string, Map<string, number>>();

export function pageShapeKey(sourceId: string, chapterUrl: string, pageIndex: number): string {
  return `${sourceId}|${chapterUrl}|${pageIndex}`;
}

export function hasPageShape(key: string): boolean {
  return pageShapes.has(key);
}

/**
 * Shape to draw an unmeasured page of a series at: the median of the pages
 * measured so far. Webtoon pages in one series are nearly always the same
 * size, so a page sized like its neighbours barely moves when it loads. A page
 * that grows above the reader is what the list has to compensate for, and
 * large changes there are what made the strip jump.
 */
export function typicalShape(series: string): number {
  const shapes = seriesShapes.get(series);
  if (!shapes || shapes.size < MIN_SAMPLES) return PLACEHOLDER_RATIO;
  const sorted = [...shapes.values()].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The page's shape if it's been measured, else its series' typical shape. */
export function pageShape(key: string, series: string): number {
  return pageShapes.get(key) ?? typicalShape(series);
}

/** Records a page's pixel size. Returns true when that changes its shape. */
export function rememberPageShape(
  key: string,
  series: string,
  width?: number,
  height?: number,
): boolean {
  if (!width || !height || width <= 0 || height <= 0) return false;
  const shape = height / width;
  if (pageShapes.get(key) === shape) return false;
  pageShapes.set(key, shape);
  let shapes = seriesShapes.get(series);
  if (!shapes) {
    shapes = new Map();
    seriesShapes.set(series, shapes);
  }
  shapes.set(key, shape);
  return true;
}

export interface StripLayout {
  /** Height of each item, in list order. */
  lengths: number[];
  /** Distance from the top of the list to each item. */
  offsets: number[];
}

/**
 * Lays out the strip: transitions are `transitionHeight` tall, pages are the
 * screen width times their shape.
 */
export function buildStripLayout(
  items: readonly ReaderItem[],
  sourceId: string,
  series: string,
  width: number,
  transitionHeight: number,
): StripLayout {
  const lengths: number[] = [];
  const offsets: number[] = [];
  const placeholder = typicalShape(series);
  let y = 0;
  for (const item of items) {
    const length =
      item.kind === 'transition'
        ? transitionHeight
        : width *
          (pageShapes.get(pageShapeKey(sourceId, item.chapter.url, item.page.index)) ??
            placeholder);
    offsets.push(y);
    lengths.push(length);
    y += length;
  }
  return { lengths, offsets };
}
