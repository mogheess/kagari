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
import { getEngine } from '../engine';
import { languageKeys } from '../utils/lang';
import type { SourceDto } from '../engine/types';

const store = makePersistence<string[]>('@kagari/enabled-languages/v1');

/**
 * The first-run set: each of the phone's languages, as itself and its base
 * (`pt-BR` → `pt-br`, `pt`, so a `pt-BR` source matches), and English.
 * English alone hid everything from someone who only installed extensions in
 * their own language.
 */
export function defaultLanguagesFor(phoneTags: readonly string[]): string[] {
  return [...new Set([...phoneTags.flatMap(languageKeys), 'en'])];
}

function intlTags(): string[] {
  try {
    return [Intl.DateTimeFormat().resolvedOptions().locale];
  } catch {
    return [];
  }
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Whether `code` is in `languages`, ignoring case (`pt-BR` and `pt-br`). */
export function isLanguageEnabled(code: string, languages: readonly string[]): boolean {
  return languages.some(l => same(l, code));
}

// Until the stored set loads. Intl knows only the phone's first language.
let enabled: string[] = defaultLanguagesFor(intlTags());
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

async function hydrate(): Promise<void> {
  const stored = await store.load();
  if (stored && Array.isArray(stored)) {
    enabled = stored;
  } else {
    // First run: seed from every language in the phone's settings, which only
    // the native list has, and persist it so it sticks.
    const phone = await getEngine()
      .getDeviceLanguages()
      .catch(() => []);
    if (phone.length > 0) enabled = defaultLanguagesFor(phone);
    store.save(enabled);
  }
  emit();
}

/** Toggles a language code in/out of the enabled set. */
export function toggleLanguage(code: string): void {
  enabled = isLanguageEnabled(code, enabled)
    ? enabled.filter(c => !same(c, code))
    : [...enabled, code];
  emit();
  store.save(enabled);
}

/** Enables exactly these languages. */
export function setLanguages(codes: string[]): void {
  enabled = codes;
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
 * change it only show when there are two languages or more. The set itself
 * stays, so it applies again once a source in one of its languages is back.
 */
export function filterByLanguages(sources: SourceDto[], languages: string[]): SourceDto[] {
  if (languages.length === 0) return sources;
  const set = new Set(languages.map(l => l.toLowerCase()));
  const kept = sources.filter(s => set.has(s.lang.toLowerCase()));
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
