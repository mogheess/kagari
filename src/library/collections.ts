/**
 * Library collections — folder-style grouping layered over the flat favorites
 * list. Two flavors:
 *
 *  - Manual categories (the existing tag system) surfaced as folders.
 *  - Smart auto-collections derived for free from data we already keep — the
 *    owning source and whether you've started reading — so titles get organised
 *    without anyone having to tag anything.
 *
 * Everything here is reactive (composed from the favorites/categories/history
 * stores) plus a small persisted preference for the Library's view mode.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { useFavorites, type FavoriteManga } from './favorites';
import { useCategories, type Category } from './categories';
import { useHistory, type HistoryEntry } from './history';
import type { SourceDto } from '../engine/types';

export type CollectionKind = 'all' | 'category' | 'uncategorized' | 'status' | 'source';

export interface LibraryCollection {
  id: string;
  label: string;
  kind: CollectionKind;
  items: FavoriteManga[];
}

export interface LibraryCollections {
  /** Always-present "All" folder. */
  all: LibraryCollection;
  /** Manual categories (+ Uncategorized), in user order. */
  manual: LibraryCollection[];
  /** Derived folders (reading status, per source). */
  smart: LibraryCollection[];
}

const keyOf = (sourceId: string, url: string) => `${sourceId}\u0000${url}`;

/** Pure: builds the folder list from the library stores. */
export function buildCollections(
  favorites: FavoriteManga[],
  categories: Category[],
  history: HistoryEntry[],
  sources: SourceDto[],
): LibraryCollections {
  const started = new Set(history.map(h => keyOf(h.sourceId, h.mangaUrl)));

  const all: LibraryCollection = {
    id: 'all',
    label: 'All',
    kind: 'all',
    items: favorites,
  };

  // Manual categories keep their user order and stay visible even when empty so
  // the structure the user set up is always reflected.
  const manual: LibraryCollection[] = categories.map(c => ({
    id: `cat:${c.id}`,
    label: c.name,
    kind: 'category' as const,
    items: favorites.filter(f => f.categoryIds.includes(c.id)),
  }));
  const uncategorized = favorites.filter(f => f.categoryIds.length === 0);
  if (uncategorized.length > 0 && categories.length > 0) {
    manual.push({
      id: 'uncat',
      label: 'Uncategorized',
      kind: 'uncategorized',
      items: uncategorized,
    });
  }

  // Smart folders — only surfaced when they'd actually hold something.
  const smart: LibraryCollection[] = [];
  const reading = favorites.filter(f => started.has(keyOf(f.sourceId, f.url)));
  const notStarted = favorites.filter(f => !started.has(keyOf(f.sourceId, f.url)));
  if (reading.length > 0) {
    smart.push({ id: 'st:reading', label: 'Reading', kind: 'status', items: reading });
  }
  if (notStarted.length > 0) {
    smart.push({ id: 'st:unread', label: 'Not started', kind: 'status', items: notStarted });
  }

  const nameBySource = new Map(sources.map(s => [s.id, s.name] as const));
  const bySource = new Map<string, FavoriteManga[]>();
  for (const f of favorites) {
    const arr = bySource.get(f.sourceId);
    if (arr) arr.push(f);
    else bySource.set(f.sourceId, [f]);
  }
  const sourceCollections = [...bySource.entries()]
    .filter(([sourceId]) => nameBySource.has(sourceId))
    .map(([sourceId, items]) => ({
      id: `src:${sourceId}`,
      label: nameBySource.get(sourceId) as string,
      kind: 'source' as const,
      items,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Per-source folders only earn their place when titles span >1 known source.
  if (sourceCollections.length > 1) smart.push(...sourceCollections);

  return { all, manual, smart };
}

/** Reactive collections, given the (async-loaded) source list for labels. */
export function useLibraryCollections(sources: SourceDto[]): LibraryCollections {
  const favorites = useFavorites();
  const categories = useCategories();
  const history = useHistory();
  return useMemo(
    () => buildCollections(favorites, categories, history, sources),
    [favorites, categories, history, sources],
  );
}

// --- Library view-mode preference (persisted) -------------------------------

export type LibraryViewMode = 'folders' | 'shelf';

const viewStore = makePersistence<LibraryViewMode>('@kagari/libraryView/v1');
let viewMode: LibraryViewMode = 'folders';
const viewListeners = new Set<() => void>();

function emitView(): void {
  for (const l of viewListeners) l();
}

export function setLibraryViewMode(mode: LibraryViewMode): void {
  if (mode === viewMode) return;
  viewMode = mode;
  emitView();
  viewStore.save(mode);
}

async function hydrateView(): Promise<void> {
  const stored = await viewStore.load();
  if (stored === 'folders' || stored === 'shelf') {
    viewMode = stored;
    emitView();
  }
}

export function useLibraryViewMode(): LibraryViewMode {
  return useSyncExternalStore(
    cb => {
      viewListeners.add(cb);
      return () => {
        viewListeners.delete(cb);
      };
    },
    () => viewMode,
  );
}

void hydrateView();
