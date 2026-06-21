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
let hydrated = false;
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
  hydrated = true;
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
