/**
 * Size on disk per downloaded title, for the Downloads screen.
 *
 * Sizes come from the native side in batches and are cached per chapter for
 * the session. The cache key includes the chapter's status and page count, so
 * a chapter that finishes, fails or is re-downloaded is measured again.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getEngine } from '../engine';
import type { DownloadEntry } from './downloads';
import type { DownloadGroup } from './downloadsArrange';

const BATCH = 40;

const sizes = new Map<string, number>();
const pending = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function cacheKey(e: DownloadEntry): string {
  return `${e.sourceId}\u0000${e.chapterUrl}\u0000${e.status}\u0000${e.downloaded}`;
}

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

async function measure(entries: DownloadEntry[]): Promise<void> {
  const engine = getEngine();
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    try {
      const result = await engine.getDownloadedSizes(
        batch.map(e => ({ sourceId: e.sourceId, chapterUrl: e.chapterUrl })),
      );
      batch.forEach((e, idx) => sizes.set(cacheKey(e), result[idx] ?? 0));
    } catch {
      // Leave unknown; the row just shows no size.
    } finally {
      batch.forEach(e => pending.delete(cacheKey(e)));
    }
    emit();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Group key → bytes, for groups whose finished chapters have all been
 * measured. Groups still being measured are absent (they sort last by size).
 */
export function useGroupSizes(groups: readonly DownloadGroup[]): ReadonlyMap<string, number> {
  const tick = useSyncExternalStore(subscribe, () => version);

  useEffect(() => {
    const todo: DownloadEntry[] = [];
    for (const g of groups) {
      for (const c of g.chapters) {
        if (c.status !== 'done') continue;
        const k = cacheKey(c);
        if (!sizes.has(k) && !pending.has(k)) {
          pending.add(k);
          todo.push(c);
        }
      }
    }
    if (todo.length > 0) void measure(todo);
  }, [groups]);

  return useMemo(() => {
    const out = new Map<string, number>();
    for (const g of groups) {
      let total = 0;
      let complete = true;
      for (const c of g.chapters) {
        if (c.status !== 'done') continue;
        const s = sizes.get(cacheKey(c));
        if (s == null) {
          complete = false;
          break;
        }
        total += s;
      }
      if (complete && g.done > 0) out.set(g.key, total);
    }
    return out;
    // `tick` re-derives the map whenever a batch lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, tick]);
}
