/**
 * User-defined library categories (Mihon-style). Persisted and reactive. A manga
 * can belong to zero or more categories (membership lives on the favorite itself,
 * see favorites.ts). Deleting a category also strips it from every manga.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { removeCategoryFromAll } from './favorites';

export interface Category {
  id: string;
  name: string;
  order: number;
}

const store = makePersistence<Category[]>('@kagari/categories/v1');

let categories: Category[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  store.save(categories);
}

function sortByOrder(list: Category[]): Category[] {
  return [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored) && categories.length === 0) {
    categories = sortByOrder(stored);
  }
  emit();
  persist();
}

function genId(): string {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function addCategory(name: string): Category | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return null;
  const cat: Category = {
    id: genId(),
    name: trimmed,
    order: categories.length,
  };
  categories = sortByOrder([...categories, cat]);
  emit();
  persist();
  return cat;
}

/**
 * Returns a name → id map for the given category names, creating any that don't
 * already exist (case-insensitive match). Used by the Mihon importer.
 */
export function getOrCreateCategoriesByName(names: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let changed = false;
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const existing = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      result[trimmed] = existing.id;
      continue;
    }
    const cat: Category = { id: genId(), name: trimmed, order: categories.length };
    categories = [...categories, cat];
    result[trimmed] = cat.id;
    changed = true;
  }
  if (changed) {
    categories = sortByOrder(categories);
    emit();
    persist();
  }
  return result;
}

export function renameCategory(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  categories = categories.map(c => (c.id === id ? { ...c, name: trimmed } : c));
  emit();
  persist();
}

export function deleteCategory(id: string): void {
  categories = categories.filter(c => c.id !== id).map((c, i) => ({ ...c, order: i }));
  emit();
  persist();
  removeCategoryFromAll(id);
}

/** Moves a category up (-1) or down (+1) in the ordering. */
export function moveCategory(id: string, direction: -1 | 1): void {
  const sorted = sortByOrder(categories);
  const idx = sorted.findIndex(c => c.id === id);
  if (idx === -1) return;
  const swapWith = idx + direction;
  if (swapWith < 0 || swapWith >= sorted.length) return;
  const next = sorted.slice();
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  categories = next.map((c, i) => ({ ...c, order: i }));
  emit();
  persist();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Category[] {
  return categories;
}

export function useCategories(): Category[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

void hydrate();
