/**
 * Grouping, filtering and sorting for the Downloads screen, kept free of React
 * and the native engine so the rules are unit-testable.
 */
import type { DownloadEntry } from './downloads';

/** All downloaded/queued chapters of a single manga, grouped together. */
export interface DownloadGroup {
  key: string;
  sourceId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string;
  chapters: DownloadEntry[];
  done: number;
  /** Queued or downloading. */
  active: number;
  errored: number;
  /** Most recent time a chapter of this title was queued. */
  latest: number;
}

export type DownloadSort = 'recent' | 'title' | 'source' | 'chapters' | 'size';
export type DownloadStatusFilter = 'all' | 'active' | 'failed' | 'done';

export interface ArrangeOptions {
  sort: DownloadSort;
  status: DownloadStatusFilter;
  /** Only this source; null for every source. */
  sourceId: string | null;
  /** Case-insensitive title search; blank matches everything. */
  query: string;
  /** Source id → display name, for sorting by source. */
  sourceNames?: ReadonlyMap<string, string>;
  /** Group key → bytes on disk, when known. Unknown sizes sort last. */
  sizes?: ReadonlyMap<string, number>;
}

export function groupKey(sourceId: string, mangaUrl: string): string {
  return `${sourceId}:${mangaUrl}`;
}

export function groupByManga(entries: readonly DownloadEntry[]): DownloadGroup[] {
  const map = new Map<string, DownloadGroup>();
  for (const e of entries) {
    const key = groupKey(e.sourceId, e.mangaUrl);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        sourceId: e.sourceId,
        mangaUrl: e.mangaUrl,
        title: e.title,
        thumbnailUrl: e.thumbnailUrl,
        chapters: [],
        done: 0,
        active: 0,
        errored: 0,
        latest: 0,
      };
      map.set(key, g);
    }
    g.chapters.push(e);
    if (e.status === 'done') g.done += 1;
    else if (e.status === 'error') g.errored += 1;
    else g.active += 1;
    g.latest = Math.max(g.latest, e.createdAt);
  }
  return [...map.values()];
}

function matchesStatus(g: DownloadGroup, status: DownloadStatusFilter): boolean {
  switch (status) {
    case 'active':
      return g.active > 0;
    case 'failed':
      return g.errored > 0;
    case 'done':
      return g.done === g.chapters.length;
    default:
      return true;
  }
}

const byTitle = (a: DownloadGroup, b: DownloadGroup) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

export function arrangeGroups(groups: readonly DownloadGroup[], opts: ArrangeOptions): DownloadGroup[] {
  const q = opts.query.trim().toLowerCase();
  const filtered = groups.filter(
    g =>
      matchesStatus(g, opts.status) &&
      (opts.sourceId == null || g.sourceId === opts.sourceId) &&
      (q === '' || g.title.toLowerCase().includes(q)),
  );

  const sourceName = (id: string) => opts.sourceNames?.get(id) ?? id;
  const compare: (a: DownloadGroup, b: DownloadGroup) => number = (() => {
    switch (opts.sort) {
      case 'title':
        return byTitle;
      case 'source':
        return (a, b) =>
          sourceName(a.sourceId).localeCompare(sourceName(b.sourceId), undefined, { sensitivity: 'base' }) ||
          byTitle(a, b);
      case 'chapters':
        return (a, b) => b.chapters.length - a.chapters.length || byTitle(a, b);
      case 'size':
        return (a, b) => {
          const sa = opts.sizes?.get(a.key);
          const sb = opts.sizes?.get(b.key);
          if (sa == null && sb == null) return byTitle(a, b);
          if (sa == null) return 1;
          if (sb == null) return -1;
          return sb - sa || byTitle(a, b);
        };
      default:
        // Recent: anything still downloading stays on top so progress is visible.
        return (a, b) => b.active - a.active || b.latest - a.latest;
    }
  })();
  return filtered.sort(compare);
}

/** "84 MB", "1.2 GB", "640 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
  return `${shown} ${units[unit]}`;
}
