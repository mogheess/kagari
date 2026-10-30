/**
 * What the download notification shows, sent to the native foreground service
 * that keeps Kagari alive while the queue runs. The queue lives in the app, and
 * Android kills a backgrounded app to free memory, which stopped every
 * download until Kagari was opened again.
 */
import { getEngine } from '../engine';
import type { DownloadActivity } from '../engine/types';
import type { DownloadEntry } from './downloads';

/** The chapter in progress (or next up) and how many are left; null when idle or paused. */
export function downloadActivity(
  entries: readonly DownloadEntry[],
  paused: boolean,
): DownloadActivity | null {
  if (paused) return null;
  const pending = entries.filter(e => e.status === 'queued' || e.status === 'downloading');
  if (pending.length === 0) return null;
  const current = pending.find(e => e.status === 'downloading') ?? pending[0];
  return {
    title: current.title,
    chapterName: current.chapterName,
    downloaded: current.downloaded,
    pageCount: current.pageCount,
    remaining: pending.length,
  };
}

// Undefined until the first send, which always goes through: it also takes
// down a notification left from before a crash.
let sent: string | undefined;

/** Tells the service what the queue is doing, only when that changed. */
export function syncDownloadService(entries: readonly DownloadEntry[], paused: boolean): void {
  const activity = downloadActivity(entries, paused);
  const key = activity ? JSON.stringify(activity) : '';
  if (key === sent) return;
  sent = key;
  getEngine()
    .setDownloadActivity(activity)
    .catch(() => {});
}
