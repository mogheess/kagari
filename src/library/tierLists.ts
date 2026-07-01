/**
 * Local tier-list store. A tier row owns an ordered list of library manga keys
 * (`sourceId + url`), while the title/cover data continues to live in favorites.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { favoriteKey } from './favorites';
import type { FavoriteManga } from './favorites';

export interface TierRow {
  id: string;
  name: string;
  color: string;
  mangaKeys: string[];
}

interface TierListState {
  rows: TierRow[];
}

const DEFAULT_ROWS: TierRow[] = [
  { id: 's', name: 'S Tier', color: '#F87171', mangaKeys: [] },
  { id: 'a', name: 'A Tier', color: '#F59E0B', mangaKeys: [] },
  { id: 'b', name: 'B Tier', color: '#34D399', mangaKeys: [] },
  { id: 'c', name: 'C Tier', color: '#60A5FA', mangaKeys: [] },
  { id: 'd', name: 'D Tier', color: '#A78BFA', mangaKeys: [] },
];

const store = makePersistence<TierListState>('@kagari/tierLists/v1');
let state: TierListState = { rows: DEFAULT_ROWS };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  store.save(state);
}

function normalizeRows(rows: TierRow[] | undefined): TierRow[] {
  if (!rows || rows.length === 0) return DEFAULT_ROWS;
  return rows.map((row, index) => ({
    id: row.id || `tier-${Date.now()}-${index}`,
    name: row.name?.trim() || `Tier ${index + 1}`,
    color: row.color || DEFAULT_ROWS[index]?.color || '#9CA3AF',
    mangaKeys: Array.isArray(row.mangaKeys) ? [...new Set(row.mangaKeys)] : [],
  }));
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored.rows)) {
    state = { rows: normalizeRows(stored.rows) };
  }
  emit();
  persist();
}

function updateRows(updater: (rows: TierRow[]) => TierRow[]): void {
  state = { rows: updater(state.rows) };
  emit();
  persist();
}

export function addTierRow(): void {
  updateRows(rows => [
    ...rows,
    {
      id: `tier-${Date.now()}`,
      name: 'New Tier',
      color: '#9CA3AF',
      mangaKeys: [],
    },
  ]);
}

export function updateTierRow(id: string, patch: Pick<TierRow, 'name' | 'color'>): void {
  updateRows(rows =>
    rows.map(row =>
      row.id === id
        ? {
            ...row,
            name: patch.name.trim() || row.name,
            color: patch.color,
          }
        : row,
    ),
  );
}

export function deleteTierRow(id: string): void {
  updateRows(rows => (rows.length <= 1 ? rows : rows.filter(row => row.id !== id)));
}

export function moveTierRow(id: string, delta: -1 | 1): void {
  updateRows(rows => {
    const index = rows.findIndex(row => row.id === id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return rows;
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    return next;
  });
}

export function addMangaToTier(rowId: string, manga: FavoriteManga): void {
  const key = favoriteKey(manga.sourceId, manga.url);
  updateRows(rows =>
    rows.map(row =>
      row.id === rowId
        ? { ...row, mangaKeys: row.mangaKeys.includes(key) ? row.mangaKeys : [...row.mangaKeys, key] }
        : { ...row, mangaKeys: row.mangaKeys.filter(k => k !== key) },
    ),
  );
}

export function moveMangaToTier(key: string, rowId: string): void {
  updateRows(rows =>
    rows.map(row =>
      row.id === rowId
        ? { ...row, mangaKeys: row.mangaKeys.includes(key) ? row.mangaKeys : [...row.mangaKeys, key] }
        : { ...row, mangaKeys: row.mangaKeys.filter(k => k !== key) },
    ),
  );
}

export function removeMangaFromTiers(key: string): void {
  updateRows(rows => rows.map(row => ({ ...row, mangaKeys: row.mangaKeys.filter(k => k !== key) })));
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): TierRow[] {
  return state.rows;
}

export function useTierRows(): TierRow[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

void hydrate();
