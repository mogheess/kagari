/**
 * One-time "What's new" gate.
 *
 * Remembers the last version whose notes the user has seen. On launch we surface
 * the changelog entries between that version and the current build, exactly once.
 * A fresh install is baselined silently (no notes); an upgrade from a build that
 * predates this feature is detected via existing on-device data.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makePersistence } from '../store/persist';
import { APP_VERSION, compareVersions } from './version';
import { CHANGELOG, type ChangelogEntry } from './changelog';

const store = makePersistence<{ version: string }>('@kagari/last-seen-version/v1');

/** The first public build (predates the changelog store). */
const FIRST_RELEASE = '0.1';

/**
 * Keys only written once the app has actually been used. If any exist while the
 * last-seen version is missing, this is an upgrade from a pre-changelog build
 * rather than a brand-new install.
 */
const USAGE_KEYS = [
  '@kagari/favorites/v1',
  '@kagari/history/v1',
  '@kagari/chapterProgress/v1',
  '@kagari/categories/v1',
  '@kagari/pinned-sources/v1',
  '@kagari/home-blocks/v1',
];

let pending: ChangelogEntry[] | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function notesSince(from: string): ChangelogEntry[] {
  return CHANGELOG.filter(
    e => compareVersions(e.version, from) > 0 && compareVersions(e.version, APP_VERSION) <= 0,
  );
}

async function hasPriorUsage(): Promise<boolean> {
  try {
    const values = await Promise.all(USAGE_KEYS.map(k => AsyncStorage.getItem(k)));
    return values.some(v => v != null);
  } catch {
    return false;
  }
}

/** Run once at launch to decide whether the "What's new" sheet should appear. */
export async function initWhatsNew(): Promise<void> {
  const seen = await store.load();
  let from = seen?.version ?? null;

  // Already on (or ahead of) the current build's notes.
  if (from && compareVersions(from, APP_VERSION) >= 0) return;

  if (!from) {
    const upgraded = await hasPriorUsage();
    if (!upgraded) {
      // Genuine fresh install: baseline silently so notes only show on real updates.
      store.save({ version: APP_VERSION });
      return;
    }
    // Upgrade from a build without the changelog store; treat as coming from 0.1.
    from = FIRST_RELEASE;
  }

  const notes = notesSince(from);
  if (notes.length === 0) {
    store.save({ version: APP_VERSION });
    return;
  }
  pending = notes;
  emit();
}

/** Marks the current version's notes as seen and hides the sheet. */
export function dismissWhatsNew(): void {
  pending = null;
  store.save({ version: APP_VERSION });
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ChangelogEntry[] | null {
  return pending;
}

export function useWhatsNew(): ChangelogEntry[] | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
