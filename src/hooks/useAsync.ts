import { useEffect, useRef, useState, useCallback, DependencyList } from 'react';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Minimal data-fetching hook with loading/error state and manual reload.
 *
 * Pass `initialData` (e.g. a synchronous cache hit) to render immediately
 * without a loading flash; the fetcher still runs to refresh.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList,
  initialData?: T | null,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(initialData ?? null);
  const [loading, setLoading] = useState(initialData == null);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const firstRun = useRef(true);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let active = true;
    // Keep the seeded data visible (no loading flash) on the first run; later
    // runs (deps change / reload) show the loading state as usual.
    if (!(firstRun.current && initialData != null)) {
      setLoading(true);
    }
    firstRun.current = false;
    setError(null);
    fn()
      .then(res => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}
