import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type HomeBlockKind = 'featured' | 'continue' | 'popular' | 'latest' | 'recommended';

export interface HomeBlock {
  id: string;
  kind: HomeBlockKind;
  /** Source this block pulls from (for popular/latest). */
  sourceId?: string;
  /** Friendly source name for the header suffix. */
  sourceName?: string;
  enabled: boolean;
}

const DEFAULT_BLOCKS: HomeBlock[] = [
  { id: 'b_featured', kind: 'featured', enabled: true },
  { id: 'b_continue', kind: 'continue', enabled: true },
  { id: 'b_popular_mdex', kind: 'popular', sourceId: '1001', sourceName: 'MangaDex', enabled: true },
  {
    id: 'b_latest_weeb',
    kind: 'latest',
    sourceId: '1002',
    sourceName: 'Weeb Central',
    enabled: true,
  },
  { id: 'b_recommended', kind: 'recommended', enabled: false },
];

interface HomeConfigValue {
  blocks: HomeBlock[];
  setBlocks: (b: HomeBlock[]) => void;
  toggle: (id: string) => void;
  move: (from: number, to: number) => void;
  remove: (id: string) => void;
}

const HomeConfigContext = createContext<HomeConfigValue | null>(null);

export function HomeConfigProvider({ children }: { children: React.ReactNode }) {
  const [blocks, setBlocks] = useState<HomeBlock[]>(DEFAULT_BLOCKS);

  const toggle = useCallback((id: string) => {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, enabled: !b.enabled } : b)));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setBlocks(prev => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  }, []);

  const value = useMemo(
    () => ({ blocks, setBlocks, toggle, move, remove }),
    [blocks, toggle, move, remove],
  );

  return <HomeConfigContext.Provider value={value}>{children}</HomeConfigContext.Provider>;
}

export function useHomeConfig(): HomeConfigValue {
  const ctx = useContext(HomeConfigContext);
  if (!ctx) throw new Error('useHomeConfig must be used within HomeConfigProvider');
  return ctx;
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
