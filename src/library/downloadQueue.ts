/**
 * The download queue, grouped by title. Kept free of React and the native
 * engine so the ordering is unit-testable. Finished downloads aren't part of
 * it: they show on their titles in the library and on the title page.
 */
import type { DownloadEntry } from './downloads';

export interface QueueGroup {
  key: string;
  sourceId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string;
  /** Waiting or downloading, in queue order. */
  active: DownloadEntry[];
  failed: DownloadEntry[];
}

/**
 * Titles with chapters still to download come first, in the order the queue
 * will reach them; titles with only failures follow, most recent first.
 */
export function queueGroups(entries: readonly DownloadEntry[]): QueueGroup[] {
  const groups = new Map<string, QueueGroup & { firstActive: number; lastFailed: number }>();
  entries.forEach((e, position) => {
    if (e.status === 'done') return;
    const key = `${e.sourceId}\u0000${e.mangaUrl}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        sourceId: e.sourceId,
        mangaUrl: e.mangaUrl,
        title: e.title,
        thumbnailUrl: e.thumbnailUrl,
        active: [],
        failed: [],
        firstActive: Infinity,
        lastFailed: -Infinity,
      };
      groups.set(key, group);
    }
    if (e.status === 'error') {
      group.failed.push(e);
      group.lastFailed = Math.max(group.lastFailed, e.createdAt);
    } else {
      group.active.push(e);
      group.firstActive = Math.min(group.firstActive, position);
    }
  });
  return [...groups.values()]
    .sort((a, b) => {
      const aActive = a.active.length > 0;
      const bActive = b.active.length > 0;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return aActive ? a.firstActive - b.firstActive : b.lastFailed - a.lastFailed;
    })
    .map(({ firstActive: _first, lastFailed: _last, ...group }) => group);
}
