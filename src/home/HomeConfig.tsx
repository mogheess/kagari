import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { makePersistence } from '../store/persist';

export type HomeBlockKind = 'featured' | 'continue' | 'popular' | 'latest' | 'recommended';

export interface HomeBlock {
  id: string;
  kind: HomeBlockKind;
  /** Source this block pulls from (for featured/popular/latest/recommended). */
  sourceId?: string;
  /** Friendly source name for the header suffix. */
  sourceName?: string;
  enabled: boolean;
}

const DEFAULT_BLOCKS: HomeBlock[] = [
  { id: 'b_featured', kind: 'featured', enabled: true },
  { id: 'b_continue', kind: 'continue', enabled: true },
  { id: 'b_popular', kind: 'popular', enabled: true },
  { id: 'b_latest', kind: 'latest', enabled: true },
  { id: 'b_recommended', kind: 'recommended', enabled: false },
];

const store = makePersistence<HomeBlock[]>('@kagari/home-blocks/v1');

/**
 * Guarantees every built-in section is present. Sections used to be permanently
 * removable, which dropped them from the persisted list for good. Now that the
 * only way to hide a section is to disable it, we merge any missing built-ins
 * back in (as disabled, so a previously-removed section reappears in Customize
 * Home for re-enabling without suddenly changing the home screen).
 */
function mergeWithDefaults(stored: HomeBlock[]): HomeBlock[] {
  const seen = new Set(stored.map(b => b.id));
  const missing = DEFAULT_BLOCKS.filter(b => !seen.has(b.id)).map(b => ({
    ...b,
    enabled: false,
  }));
  return missing.length > 0 ? [...stored, ...missing] : stored;
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

  useEffect(() => {
    let cancelled = false;
    store.load().then(stored => {
      if (!cancelled && stored && Array.isArray(stored) && stored.length > 0) {
        setBlocksState(mergeWithDefaults(stored));
      }
    });
    universalStore.load().then(stored => {
      if (!cancelled && stored && typeof stored === 'object') {
        setUniversalState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setBlocks = useCallback((next: HomeBlock[]) => {
    setBlocksState(next);
    store.save(next);
  }, []);

  const update = useCallback(
    (fn: (prev: HomeBlock[]) => HomeBlock[]) => {
      setBlocksState(prev => {
        const next = fn(prev);
        store.save(next);
        return next;
      });
    },
    [],
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
    const next: UniversalSource = { id: sourceId, name: sourceName };
    setUniversalState(next);
    universalStore.save(next);
  }, []);

  const value = useMemo(
    () => ({
      blocks,
      setBlocks,
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

/** Whether this block browses a source (and therefore needs a source picker). */
export function isBrowseBlock(block: HomeBlock): boolean {
  return block.kind !== 'continue';
}

export function blockLabel(block: HomeBlock): string {
  switch (block.kind) {
    case 'featured':
      return 'Featured';
    case 'continue':
      return 'Continue Reading';
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
