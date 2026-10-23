import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { makePersistence } from '../store/persist';

export type HomeBlockKind =
  | 'featured'
  /** The library (favorites). */
  | 'continue'
  /** Recently read titles, from reading history. */
  | 'history'
  /** New chapters in the library, from the Updates feed. */
  | 'updates'
  | 'popular'
  | 'latest'
  /** A saved search on one source. */
  | 'search'
  /** One rail per installed source, so a new library of sources shows up without setup. */
  | 'perSource'
  | 'recommended';

export interface HomeBlock {
  id: string;
  kind: HomeBlockKind;
  /** Source this block pulls from (for featured/popular/latest/search/recommended). */
  sourceId?: string;
  /** Friendly source name for the header suffix. */
  sourceName?: string;
  /** What a `search` block searches for. */
  query?: string;
  /** Added by the user in Customize Home; these can be removed, built-ins only hidden. */
  custom?: boolean;
  enabled: boolean;
}

const DEFAULT_BLOCKS: HomeBlock[] = [
  { id: 'b_featured', kind: 'featured', enabled: true },
  { id: 'b_history', kind: 'history', enabled: true },
  { id: 'b_updates', kind: 'updates', enabled: true },
  { id: 'b_continue', kind: 'continue', enabled: true },
  { id: 'b_popular', kind: 'popular', enabled: true },
  { id: 'b_latest', kind: 'latest', enabled: true },
  { id: 'b_sources', kind: 'perSource', enabled: true },
  { id: 'b_recommended', kind: 'recommended', enabled: false },
];

/**
 * Built-ins introduced after people already had a saved layout. They're new
 * rather than removed, so they arrive switched on in their default place.
 */
const ADDED_LATER = new Set(['b_history', 'b_updates', 'b_sources']);

const store = makePersistence<HomeBlock[]>('@kagari/home-blocks/v1');

/**
 * Guarantees every built-in section is present. Sections used to be permanently
 * removable, which dropped them from the persisted list for good. Now that the
 * only way to hide a section is to disable it, we merge any missing built-ins
 * back in (as disabled, so a previously-removed section reappears in Customize
 * Home for re-enabling without suddenly changing the home screen).
 */
export function mergeWithDefaults(stored: HomeBlock[]): HomeBlock[] {
  const seen = new Set(stored.map(b => b.id));
  let next = stored.slice();
  DEFAULT_BLOCKS.forEach((block, defaultIndex) => {
    if (seen.has(block.id)) return;
    if (ADDED_LATER.has(block.id)) {
      // Slot it in after the built-in that precedes it by default.
      const before = DEFAULT_BLOCKS.slice(0, defaultIndex).reverse().find(b => seen.has(b.id));
      const at = before ? next.findIndex(b => b.id === before.id) + 1 : 0;
      next = [...next.slice(0, at), block, ...next.slice(at)];
    } else {
      next = [...next, { ...block, enabled: false }];
    }
    seen.add(block.id);
  });
  return next;
}

/** The default source every browse section uses unless it has its own override. */
interface UniversalSource {
  id?: string;
  name?: string;
}
const universalStore = makePersistence<UniversalSource>('@kagari/home-universal-source/v1');

interface HomeConfigValue {
  blocks: HomeBlock[];
  setBlocks: (b: HomeBlock[]) => void;
  /** Adds a user section (enabled) at the end. */
  addBlock: (block: Omit<HomeBlock, 'id' | 'enabled' | 'custom'>) => void;
  /** Removes a user-added section; built-ins can only be hidden. */
  removeBlock: (id: string) => void;
  toggle: (id: string) => void;
  move: (from: number, to: number) => void;
  /** Assigns the source a browse block pulls from (a per-section override). */
  setSource: (id: string, sourceId: string, sourceName: string) => void;
  /** Clears a section's override so it falls back to the universal source. */
  clearSource: (id: string) => void;
  /** Clears every per-section override so all sections follow the universal source. */
  clearAllSources: () => void;
  /** Source applied to every section without its own override. */
  universalSourceId?: string;
  universalSourceName?: string;
  /** Sets (or clears, when passed undefined) the universal source. */
  setUniversalSource: (sourceId?: string, sourceName?: string) => void;
}

const HomeConfigContext = createContext<HomeConfigValue | null>(null);

export function HomeConfigProvider({ children }: { children: React.ReactNode }) {
  const [blocks, setBlocksState] = useState<HomeBlock[]>(DEFAULT_BLOCKS);
  const [universal, setUniversalState] = useState<UniversalSource>({});
  // Edits made before the persisted config finishes loading must win over the
  // late-arriving load.
  const blocksDirty = useRef(false);
  const universalDirty = useRef(false);

  useEffect(() => {
    let cancelled = false;
    store.load().then(stored => {
      if (!cancelled && !blocksDirty.current && stored && Array.isArray(stored) && stored.length > 0) {
        setBlocksState(mergeWithDefaults(stored));
      }
    });
    universalStore.load().then(stored => {
      if (!cancelled && !universalDirty.current && stored && typeof stored === 'object') {
        setUniversalState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setBlocks = useCallback((next: HomeBlock[]) => {
    blocksDirty.current = true;
    setBlocksState(next);
    store.save(next);
  }, []);

  const update = useCallback(
    (fn: (prev: HomeBlock[]) => HomeBlock[]) => {
      blocksDirty.current = true;
      setBlocksState(prev => {
        const next = fn(prev);
        store.save(next);
        return next;
      });
    },
    [],
  );

  const addBlock = useCallback(
    (block: Omit<HomeBlock, 'id' | 'enabled' | 'custom'>) =>
      update(prev => [
        ...prev,
        {
          ...block,
          id: `c_${block.kind}_${Date.now().toString(36)}`,
          enabled: true,
          custom: true,
        },
      ]),
    [update],
  );

  const removeBlock = useCallback(
    (id: string) => update(prev => prev.filter(b => !(b.id === id && b.custom))),
    [update],
  );

  const toggle = useCallback(
    (id: string) => update(prev => prev.map(b => (b.id === id ? { ...b, enabled: !b.enabled } : b))),
    [update],
  );

  const move = useCallback(
    (from: number, to: number) =>
      update(prev => {
        if (to < 0 || to >= prev.length) return prev;
        const next = prev.slice();
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      }),
    [update],
  );

  const setSource = useCallback(
    (id: string, sourceId: string, sourceName: string) =>
      update(prev => prev.map(b => (b.id === id ? { ...b, sourceId, sourceName } : b))),
    [update],
  );

  const clearSource = useCallback(
    (id: string) =>
      update(prev =>
        prev.map(b =>
          b.id === id ? { ...b, sourceId: undefined, sourceName: undefined } : b,
        ),
      ),
    [update],
  );

  const clearAllSources = useCallback(
    () => update(prev => prev.map(b => ({ ...b, sourceId: undefined, sourceName: undefined }))),
    [update],
  );

  const setUniversalSource = useCallback((sourceId?: string, sourceName?: string) => {
    universalDirty.current = true;
    const next: UniversalSource = { id: sourceId, name: sourceName };
    setUniversalState(next);
    universalStore.save(next);
  }, []);

  const value = useMemo(
    () => ({
      blocks,
      setBlocks,
      addBlock,
      removeBlock,
      toggle,
      move,
      setSource,
      clearSource,
      clearAllSources,
      universalSourceId: universal.id,
      universalSourceName: universal.name,
      setUniversalSource,
    }),
    [
      blocks,
      setBlocks,
      addBlock,
      removeBlock,
      toggle,
      move,
      setSource,
      clearSource,
      clearAllSources,
      universal,
      setUniversalSource,
    ],
  );

  return <HomeConfigContext.Provider value={value}>{children}</HomeConfigContext.Provider>;
}

export function useHomeConfig(): HomeConfigValue {
  const ctx = useContext(HomeConfigContext);
  if (!ctx) throw new Error('useHomeConfig must be used within HomeConfigProvider');
  return ctx;
}

/** Whether this block browses one source (and therefore needs a source picker). */
export function isBrowseBlock(block: HomeBlock): boolean {
  return (
    block.kind === 'featured' ||
    block.kind === 'popular' ||
    block.kind === 'latest' ||
    block.kind === 'search' ||
    block.kind === 'recommended'
  );
}

export function blockLabel(block: HomeBlock): string {
  switch (block.kind) {
    case 'featured':
      return 'Featured';
    case 'continue':
      return 'Library';
    case 'history':
      return 'Continue reading';
    case 'updates':
      return 'New chapters';
    case 'perSource':
      return 'From your sources';
    case 'search':
      return block.query ? `\u201C${block.query}\u201D` : 'Saved search';
    case 'popular':
      return `Popular${block.sourceName ? ` \u00B7 ${block.sourceName}` : ''}`;
    case 'latest':
      return `Latest${block.sourceName ? ` \u00B7 ${block.sourceName}` : ''}`;
    case 'recommended':
      return 'Recommended';
    default:
      return 'Section';
  }
}
