/**
 * Whether the title page's "Similar titles" section is open. One setting for
 * every title: someone who likes it open keeps it open, and someone who never
 * opens it never pays for the searches behind it.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';

const store = makePersistence<boolean>('@kagari/similarExpanded/v1');

let expanded = false;
/** Set once the user toggles, so a slow load can't undo their choice. */
let touched = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

store.load().then(saved => {
  if (touched || typeof saved !== 'boolean' || saved === expanded) return;
  expanded = saved;
  emit();
});

export function setSimilarExpanded(value: boolean): void {
  touched = true;
  if (value === expanded) return;
  expanded = value;
  store.save(value);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSimilarExpanded(): boolean {
  return useSyncExternalStore(subscribe, () => expanded);
}
