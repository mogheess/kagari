/**
 * App update checker.
 *
 * Polls the project's latest GitHub Release and compares its tag against the
 * bundled APP_VERSION. Result is cached (persisted) and throttled so launches
 * don't spam the API. Exposed reactively via useSyncExternalStore so any screen
 * can show an "update available" banner. Best-effort: network/none/404 (no
 * releases yet) simply means "you're up to date" rather than an error.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { APP_VERSION, LATEST_RELEASE_API, RELEASES_PAGE_URL, compareVersions } from './version';

export interface AppUpdateInfo {
  /** Latest version without a leading "v". */
  version: string;
  /** Direct APK asset URL when present, otherwise the release page. */
  url: string;
  notes?: string;
  publishedAt?: string;
}

export interface AppUpdateState {
  checking: boolean;
  available: boolean;
  latest?: AppUpdateInfo;
  checkedAt?: number;
  error?: string;
}

/** Don't re-poll GitHub more than once per this window on automatic checks. */
const CHECK_TTL_MS = 6 * 60 * 60 * 1000;

interface PersistedUpdate {
  latest?: AppUpdateInfo;
  available: boolean;
  checkedAt: number;
}

const store = makePersistence<PersistedUpdate>('@kagari/app-update/v1');

let state: AppUpdateState = { checking: false, available: false };
const listeners = new Set<() => void>();

function emit(): void {
  state = { ...state };
  for (const l of listeners) l();
}

async function hydrate(): Promise<void> {
  const s = await store.load();
  if (s) {
    state = {
      ...state,
      latest: s.latest,
      available: s.available,
      checkedAt: s.checkedAt,
    };
    emit();
  }
}

interface GhAsset {
  name: string;
  browser_download_url: string;
}

interface GhRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GhAsset[];
}

/**
 * Checks GitHub for a newer release. Skips the network call when a recent
 * result is cached, unless `force` is set (the manual "Check for updates" tap).
 */
export async function checkForAppUpdate(opts?: { force?: boolean }): Promise<void> {
  if (state.checking) return;
  if (!opts?.force && state.checkedAt && Date.now() - state.checkedAt < CHECK_TTL_MS) return;

  state = { ...state, checking: true, error: undefined };
  emit();

  try {
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    // 404 = repo has no published releases yet -> treat as up to date.
    if (res.status === 404) {
      const checkedAt = Date.now();
      state = { ...state, checking: false, available: false, checkedAt };
      emit();
      store.save({ latest: state.latest, available: false, checkedAt });
      return;
    }
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);

    const rel = (await res.json()) as GhRelease;
    const tag = (rel.tag_name ?? rel.name ?? '').trim();
    const checkedAt = Date.now();

    if (!tag || rel.draft) {
      state = { ...state, checking: false, available: false, checkedAt };
      emit();
      store.save({ latest: state.latest, available: false, checkedAt });
      return;
    }

    const apk = rel.assets?.find(a => a.name.toLowerCase().endsWith('.apk'));
    const latest: AppUpdateInfo = {
      version: tag.replace(/^v/i, ''),
      url: apk?.browser_download_url ?? rel.html_url ?? RELEASES_PAGE_URL,
      notes: rel.body,
      publishedAt: rel.published_at,
    };
    const available = compareVersions(tag, APP_VERSION) > 0;

    state = { ...state, checking: false, available, latest, checkedAt };
    emit();
    store.save({ latest, available, checkedAt });
  } catch (e) {
    state = {
      ...state,
      checking: false,
      error: e instanceof Error ? e.message : 'Update check failed',
    };
    emit();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): AppUpdateState {
  return state;
}

export function useAppUpdate(): AppUpdateState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

void hydrate();
