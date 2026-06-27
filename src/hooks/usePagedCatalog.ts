/**
 * Cursor-style pagination for source catalogs (popular / latest / search).
 *
 * Fetches page 1 whenever `deps` change, then appends successive pages via
 * `loadMore` (wired to a list's onEndReached) for endless scrolling. Results are
 * de-duplicated by (sourceId, url) since some sources repeat entries across
 * pages, and an in-flight request is discarded when `deps` change so pages from
 * two different queries never interleave.
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import type { MangaDto, MangasPageDto } from '../engine/types';

export interface PagedCatalog {
  items: MangaDto[];
  /** Initial page-1 load. */
  loading: boolean;
  /** Appending a further page. */
  loadingMore: boolean;
  refreshing: boolean;
  error: Error | null;
  hasNext: boolean;
  reload: () => void;
  loadMore: () => void;
}

function dedupe(list: MangaDto[], seen: Set<string>): MangaDto[] {
  const out: MangaDto[] = [];
  for (const m of list) {
    const k = `${m.sourceId}\u0000${m.url}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

export function usePagedCatalog(
  fetchPage: (page: number) => Promise<MangasPageDto>,
  deps: DependencyList,
): PagedCatalog {
  const [items, setItems] = useState<MangaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasNext, setHasNext] = useState(false);

  const pageRef = useRef(1);
  const seen = useRef<Set<string>>(new Set());
  // Bumped on every fresh load so a slow page-1 from a previous query can't
  // clobber the results of the query the user has since switched to.
  const reqId = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const loadFirst = useCallback(async (isRefresh: boolean) => {
    const id = ++reqId.current;
    seen.current = new Set();
    pageRef.current = 1;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchRef.current(1);
      if (id !== reqId.current) return;
      setItems(dedupe(res.manga, seen.current));
      setHasNext(res.hasNextPage);
    } catch (e) {
      if (id !== reqId.current) return;
      setItems([]);
      setHasNext(false);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadFirst(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || refreshing || !hasNext) return;
    const id = reqId.current;
    const next = pageRef.current + 1;
    setLoadingMore(true);
    try {
      const res = await fetchRef.current(next);
      if (id !== reqId.current) return;
      const fresh = dedupe(res.manga, seen.current);
      pageRef.current = next;
      setItems(prev => [...prev, ...fresh]);
      // Stop if the source says there's no more, or a page added nothing new
      // (guards against sources that loop forever on out-of-range pages).
      setHasNext(res.hasNextPage && fresh.length > 0);
    } catch {
      if (id !== reqId.current) return;
      setHasNext(false);
    } finally {
      if (id === reqId.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, refreshing, hasNext]);

  const reload = useCallback(() => {
    loadFirst(true);
  }, [loadFirst]);

  return { items, loading, loadingMore, refreshing, error, hasNext, reload, loadMore };
}
