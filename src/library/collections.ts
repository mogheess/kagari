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

export type CollectionKind = 'all' | 'category' | 'uncategorized';

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
}

/** Pure: builds the folder list from the library stores. */
export function buildCollections(
  favorites: FavoriteManga[],
  categories: Category[],
): LibraryCollections {
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

  return { all, manual };
}

/** Reactive collections built from the favorites + categories stores. */
export function useLibraryCollections(): LibraryCollections {
  const favorites = useFavorites();
  const categories = useCategories();
  return useMemo(
    () => buildCollections(favorites, categories),
    [favorites, categories],
  );
}

// --- Library view-mode preference (persisted) -------------------------------

export type LibraryViewMode = 'folders' | 'shelf';

const viewStore = makePersistence<LibraryViewMode>('@kagari/libraryView/v1');
// Default to the shelf/tags view: it shows the user's own categories (tags) only,
// without the derived "smart" folders, which is the simpler mental model.
let viewMode: LibraryViewMode = 'shelf';
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

// --- "All" collection visibility preference (persisted) --------------------
// When off, the "All" folder/tab is hidden once the user has real categories to
// fall back on (it stays visible while there are none, so the library is never
// left empty).

const showAllStore = makePersistence<boolean>('@kagari/showAll/v1');
let showAll = true;
const showAllListeners = new Set<() => void>();

function emitShowAll(): void {
  for (const l of showAllListeners) l();
}

export function setShowAllCollection(next: boolean): void {
  if (next === showAll) return;
  showAll = next;
  emitShowAll();
  showAllStore.save(next);
}

async function hydrateShowAll(): Promise<void> {
  const stored = await showAllStore.load();
  if (typeof stored === 'boolean') {
    showAll = stored;
    emitShowAll();
  }
}

export function useShowAllCollection(): boolean {
  return useSyncExternalStore(
    cb => {
      showAllListeners.add(cb);
      return () => {
        showAllListeners.delete(cb);
      };
    },
    () => showAll,
  );
}

void hydrateView();
void hydrateShowAll();
