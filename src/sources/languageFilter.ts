/**
 * Enabled-language filter for the source lists.
 *
 * Extension repos expose the same source in many languages, which makes the
 * picker overwhelming. Like Mihon's "enabled languages" setting, this lets the
 * user narrow the lists to the languages they actually read. On first launch we
 * default to the phone's language and English so the picker isn't flooded with
 * every localization; the user can add languages or clear the filter (empty
 * set = "show all") and that choice is respected from then on.
 * Persisted with AsyncStorage and exposed reactively via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { baseLanguage } from '../utils/lang';
import type { SourceDto } from '../engine/types';

const store = makePersistence<string[]>('@kagari/enabled-languages/v1');

/**
 * Seeded once on first run; an explicit (even empty) saved value wins after.
 * The phone's language and English: English alone hid everything from someone
 * who only installed extensions in their own language.
 */
function defaultLanguages(): string[] {
  let phone = '';
  try {
    phone = baseLanguage(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // No Intl: English alone, and the filter below still never hides everything.
  }
  return [...new Set([phone, 'en'].filter(Boolean))];
}

const DEFAULT_LANGUAGES = defaultLanguages();

let enabled: string[] = DEFAULT_LANGUAGES;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) {
    enabled = stored;
  } else {
    // No prior preference: persist the English-only default so it sticks.
    store.save(enabled);
  }
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

/**
 * Keeps only sources in the enabled languages; empty set = all. A set that
 * matches none of them is ignored: with English enabled and only Spanish
 * extensions installed, every source list came up empty, and the chips to
 * change it only show when there are two languages or more.
 */
export function filterByLanguages(sources: SourceDto[], languages: string[]): SourceDto[] {
  if (languages.length === 0) return sources;
  const set = new Set(languages);
  const kept = sources.filter(s => set.has(s.lang));
  return kept.length > 0 ? kept : sources;
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
