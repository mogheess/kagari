/**
 * Tracks library titles that were just manually added and haven't yet been
 * surfaced in the Updates feed.
 *
 * The updates scan consumes this set the first time it sees such a title, so the
 * user gets confirmation it landed — even for completed series with no recent
 * chapters. Bulk paths (Mihon import, migration) deliberately skip this to avoid
 * flooding the feed with hundreds of entries at once. Persisted so an add then
 * an app restart then a refresh still surfaces the title.
 */
import { makePersistence } from '../store/persist';

const store = makePersistence<string[]>('@kagari/recentlyAdded/v1');

let pending = new Set<string>();

const keyOf = (sourceId: string, url: string) => `${sourceId}\u0000${url}`;

async function hydrate(): Promise<void> {
  const saved = await store.load();
  if (Array.isArray(saved)) pending = new Set([...saved, ...pending]);
}
void hydrate();

function persist(): void {
  store.save([...pending]);
}

/** Flags a manually-added title to be surfaced on the next updates scan. */
export function markRecentlyAdded(sourceId: string, url: string): void {
  pending.add(keyOf(sourceId, url));
  persist();
}

/** Consumes the flag (returns true once) so a title is surfaced a single time. */
export function takeRecentlyAdded(sourceId: string, url: string): boolean {
  const key = keyOf(sourceId, url);
  if (!pending.has(key)) return false;
  pending.delete(key);
  persist();
  return true;
}

/** Drops the flag without surfacing (e.g. the title was removed again first). */
export function clearRecentlyAdded(sourceId: string, url: string): void {
  if (pending.delete(keyOf(sourceId, url))) persist();
}
