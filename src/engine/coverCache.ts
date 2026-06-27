/**
 * Cover image cache.
 *
 * Covers from many sources sit behind a Referer check, Cloudflare, or a
 * fingerprint-gated CDN, so React Native's plain `<Image>` loader (which sends
 * no source headers and doesn't share the engine's cookie jar) fails to load
 * them — even when chapters work, since those go through the native OkHttp
 * pipeline. This module routes a failing cover through the native engine
 * (`fetchCover`), which downloads it with the source's client and returns a
 * local `file://` uri, and remembers the result so repeat views skip the round
 * trip. See `RemoteImage` for the component that consumes this.
 */
import { getEngine } from '.';
import { makePersistence } from '../store/persist';

const store = makePersistence<Record<string, string>>('@kagari/coverCache/v1');

/** original remote url -> resolved local file uri */
const resolved = new Map<string, string>();
/** in-flight resolutions, de-duplicated by url */
const inflight = new Map<string, Promise<string>>();

/** Cap the persisted map so it can't grow without bound. */
const MAX_ENTRIES = 800;

export function isLocalUri(uri: string): boolean {
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('data:')
  );
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored)) {
      if (typeof v === 'string') resolved.set(k, v);
    }
  }
}
void hydrate();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    // Keep the most-recently inserted entries (Map preserves insertion order).
    const entries = [...resolved.entries()];
    const kept = entries.slice(Math.max(0, entries.length - MAX_ENTRIES));
    if (kept.length !== entries.length) {
      resolved.clear();
      for (const [k, v] of kept) resolved.set(k, v);
    }
    store.save(Object.fromEntries(kept));
  }, 1000);
}

// Fetching covers natively goes over the network (and may solve a Cloudflare
// challenge), so bound concurrency to keep a fast grid scroll from spawning a
// burst of solves at once.
const MAX_CONCURRENT = 4;
let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>(res => {
    waiters.push(() => {
      active += 1;
      res();
    });
  });
}

function release(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

/** Synchronous read of a previously resolved local cover, if any. */
export function peekCover(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  return resolved.get(url);
}

/**
 * Resolves a cover url to a local file uri via the native engine, caching the
 * result. Returns the original url if it can't be fetched natively (so the
 * caller can fall back to loading it directly, or show a placeholder).
 */
export function resolveCover(sourceId: string, url: string): Promise<string> {
  if (!url || isLocalUri(url)) return Promise.resolve(url);
  const have = resolved.get(url);
  if (have) return Promise.resolve(have);
  const existing = inflight.get(url);
  if (existing) return existing;

  const task = (async () => {
    await acquire();
    try {
      const local = await getEngine().fetchCover(sourceId, url);
      if (local && isLocalUri(local)) {
        resolved.set(url, local);
        schedulePersist();
        return local;
      }
      return url;
    } catch {
      return url;
    } finally {
      release();
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return task;
}

/** Drops a cached mapping (e.g. when the local file was evicted by the OS). */
export function invalidateCover(url: string | undefined | null): void {
  if (!url) return;
  if (resolved.delete(url)) schedulePersist();
}
