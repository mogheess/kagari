/**
 * Scan groups hidden on a title, per title.
 *
 * Some titles carry chapters from several groups, so each number is listed
 * more than once. Hiding a group takes its chapters out of the title page,
 * Resume, bulk downloads and the reader's chapter order. Keyed by
 * `(sourceId, mangaUrl)` and persisted; reactive via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { scanlatorOf } from '../utils/scanlator';
import type { ChapterDto } from '../engine/types';

type HiddenMap = Record<string, readonly string[]>;

const store = makePersistence<HiddenMap>('@kagari/hidden-scanlators/v1');

let hidden: HiddenMap = {};
let hydrated = false;
// Titles changed before the stored copy arrived keep the newer choice.
const touchedBeforeHydrate = new Set<string>();
const listeners = new Set<() => void>();
const NONE: readonly string[] = [];

const keyOf = (sourceId: string, mangaUrl: string) => `${sourceId}\u0000${mangaUrl}`;

function emit(): void {
  for (const l of listeners) l();
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && typeof stored === 'object') {
    const merged: HiddenMap = {};
    for (const [key, groups] of Object.entries(stored)) {
      if (Array.isArray(groups) && !touchedBeforeHydrate.has(key)) merged[key] = groups;
    }
    for (const key of touchedBeforeHydrate) {
      if (hidden[key]) merged[key] = hidden[key];
    }
    hidden = merged;
  }
  hydrated = true;
  emit();
  if (touchedBeforeHydrate.size > 0) store.save(hidden);
}
hydrate().catch(() => {});

/** Hides exactly these groups on a title; an empty list shows them all. */
export function setHiddenScanlators(
  sourceId: string,
  mangaUrl: string,
  groups: readonly string[],
): void {
  const key = keyOf(sourceId, mangaUrl);
  const next = { ...hidden };
  if (groups.length > 0) next[key] = [...groups];
  else delete next[key];
  hidden = next;
  emit();
  // Saving before the stored copy has loaded would overwrite it; hydrate
  // saves the merged result instead.
  if (hydrated) store.save(hidden);
  else touchedBeforeHydrate.add(key);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => hidden;

/** The groups hidden on a title (cleaned names, as `scanlatorOf` gives them). */
export function useHiddenScanlators(sourceId: string, mangaUrl: string): readonly string[] {
  const map = useSyncExternalStore(subscribe, getSnapshot);
  return map[keyOf(sourceId, mangaUrl)] ?? NONE;
}

export interface ScanlatorGroup {
  /** Cleaned name; empty for chapters with no group. */
  name: string;
  count: number;
}

/** A title's groups with their chapter counts, in the order the source lists them. */
export function scanlatorGroups(chapters: readonly ChapterDto[]): ScanlatorGroup[] {
  const counts = new Map<string, number>();
  for (const c of chapters) {
    const name = scanlatorOf(c);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

/**
 * The chapters left once hidden groups are taken out. A filter that would
 * leave nothing (the source renamed its groups, say) is ignored rather than
 * emptying the title.
 */
export function withoutHiddenScanlators(
  chapters: ChapterDto[],
  hiddenGroups: readonly string[],
): ChapterDto[] {
  if (hiddenGroups.length === 0) return chapters;
  const skip = new Set(hiddenGroups);
  const left = chapters.filter(c => !skip.has(scanlatorOf(c)));
  return left.length > 0 ? left : chapters;
}
