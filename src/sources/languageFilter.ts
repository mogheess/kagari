/**
 * Enabled-language filter for the source lists.
 *
 * Extension repos expose the same source in many languages, which makes the
 * picker overwhelming. Like Mihon's "enabled languages" setting, this lets the
 * user narrow the lists to the languages they actually read. An empty set means
 * "show all" (the default), so nothing is hidden until the user opts in.
 * Persisted with AsyncStorage and exposed reactively via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import type { SourceDto } from '../engine/types';

const store = makePersistence<string[]>('@kagari/enabled-languages/v1');

let enabled: string[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) enabled = stored;
  emit();
}

/** Toggles a language code in/out of the enabled set. */
export function toggleLanguage(code: string): void {
  enabled = enabled.includes(code)
    ? enabled.filter(c => c !== code)
    : [...enabled, code];
  emit();
  store.save(enabled);
}

/** Clears the filter (show all languages). */
export function clearLanguages(): void {
  enabled = [];
  emit();
  store.save(enabled);
}

/** Keeps only sources in the enabled languages; empty set = all. */
export function filterByLanguages(sources: SourceDto[], languages: string[]): SourceDto[] {
  if (languages.length === 0) return sources;
  const set = new Set(languages);
  return sources.filter(s => set.has(s.lang));
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): string[] {
  return enabled;
}

export function useEnabledLanguages(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

void hydrate();
