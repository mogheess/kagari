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

/** Page progress alone goes out at most this often; Android drops notification updates past a few a second. */
export const PROGRESS_INTERVAL_MS = 1000;

// Undefined until the first send, which always goes through: it also takes
// down a notification left from before a crash.
let sent: DownloadActivity | null | undefined;
let sentAt = 0;

/** Same chapter and queue, only the page count moved. */
function onlyProgress(a: DownloadActivity | null, b: DownloadActivity | null | undefined): boolean {
  return (
    a != null &&
    b != null &&
    a.title === b.title &&
    a.chapterName === b.chapterName &&
    a.pageCount === b.pageCount &&
    a.remaining === b.remaining
  );
}

/**
 * Tells the service what the queue is doing, only when that changed. Timed with
 * Date.now() rather than a timer: React Native pauses timers in the background.
 */
export function syncDownloadService(
  entries: readonly DownloadEntry[],
  paused: boolean,
  now: number = Date.now(),
): void {
  const activity = downloadActivity(entries, paused);
  if (sent !== undefined && JSON.stringify(activity) === JSON.stringify(sent)) return;
  if (onlyProgress(activity, sent) && now - sentAt < PROGRESS_INTERVAL_MS) return;
  sent = activity;
  sentAt = now;
  getEngine()
    .setDownloadActivity(activity)
    .catch(() => {});
}
