/**
 * How the user last arranged the Downloads screen (sort, status filter, source
 * filter), remembered across launches. The title search is deliberately not
 * persisted: coming back to a screen silently filtered by an old query reads
 * as "my downloads are gone".
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import type { DownloadSort, DownloadStatusFilter } from './downloadsArrange';

export interface DownloadsView {
  sort: DownloadSort;
  status: DownloadStatusFilter;
  sourceId: string | null;
}

const DEFAULT_VIEW: DownloadsView = { sort: 'recent', status: 'all', sourceId: null };
const store = makePersistence<DownloadsView>('@kagari/downloadsView/v1');

let view: DownloadsView = DEFAULT_VIEW;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function setDownloadsView(changes: Partial<DownloadsView>): void {
  view = { ...view, ...changes };
  emit();
  store.save(view);
}

export function resetDownloadsFilters(): void {
  setDownloadsView({ status: 'all', sourceId: null });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useDownloadsView(): DownloadsView {
  return useSyncExternalStore(subscribe, () => view);
}

void store.load().then(saved => {
  if (saved && typeof saved === 'object') {
    view = { ...DEFAULT_VIEW, ...saved };
    emit();
  }
});
