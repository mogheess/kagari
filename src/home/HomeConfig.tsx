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

interface HomeConfigValue {
  blocks: HomeBlock[];
  setBlocks: (b: HomeBlock[]) => void;
  toggle: (id: string) => void;
  move: (from: number, to: number) => void;
  remove: (id: string) => void;
  /** Assigns the source a browse block pulls from. */
  setSource: (id: string, sourceId: string, sourceName: string) => void;
}

const HomeConfigContext = createContext<HomeConfigValue | null>(null);

export function HomeConfigProvider({ children }: { children: React.ReactNode }) {
  const [blocks, setBlocksState] = useState<HomeBlock[]>(DEFAULT_BLOCKS);

  useEffect(() => {
    let cancelled = false;
    store.load().then(stored => {
      if (!cancelled && stored && Array.isArray(stored) && stored.length > 0) {
        setBlocksState(stored);
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

  const remove = useCallback((id: string) => update(prev => prev.filter(b => b.id !== id)), [update]);

  const setSource = useCallback(
    (id: string, sourceId: string, sourceName: string) =>
      update(prev => prev.map(b => (b.id === id ? { ...b, sourceId, sourceName } : b))),
    [update],
  );

  const value = useMemo(
    () => ({ blocks, setBlocks, toggle, move, remove, setSource }),
    [blocks, setBlocks, toggle, move, remove, setSource],
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
