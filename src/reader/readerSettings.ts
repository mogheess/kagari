/**
 * Reader preferences.
 *
 * The reading mode is remembered per series (sourceId + mangaUrl) so a webtoon
 * keeps its long-strip layout while a paged manga keeps its own — switching one
 * never disturbs the other. Series you haven't set explicitly fall back to a
 * global default, which tracks the last mode you picked so brand-new titles
 * inherit your most recent preference. Both are persisted (AsyncStorage) so the
 * choice survives app restarts.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';

export type ReaderMode = 'webtoon' | 'vertical' | 'ltr' | 'rtl';

export interface ReaderModeOption {
  mode: ReaderMode;
  label: string;
  hint: string;
}

export const READER_MODES: ReaderModeOption[] = [
  { mode: 'webtoon', label: 'Webtoon', hint: 'Continuous long strip' },
  { mode: 'vertical', label: 'Vertical', hint: 'One page per swipe (up/down)' },
  { mode: 'ltr', label: 'Left to right', hint: 'Paged, western order' },
  { mode: 'rtl', label: 'Right to left', hint: 'Paged, manga order' },
];

const DEFAULT_MODE: ReaderMode = 'webtoon';

interface ReaderModeState {
  /** Fallback for series without an explicit choice (tracks the last pick). */
  default: ReaderMode;
  /** Per-series overrides, keyed by `${sourceId}\u0000${mangaUrl}`. */
  perManga: Record<string, ReaderMode>;
}

const store = makePersistence<ReaderModeState>('@kagari/readerMode/v1');

let state: ReaderModeState = { default: DEFAULT_MODE, perManga: {} };
const listeners = new Set<() => void>();

const keyOf = (sourceId: string, mangaUrl: string) => `${sourceId}\u0000${mangaUrl}`;

function emit(): void {
  for (const l of listeners) l();
}

async function hydrate(): Promise<void> {
  const saved = await store.load();
  if (saved && typeof saved === 'object') {
    state = {
      default: saved.default ?? DEFAULT_MODE,
      perManga: saved.perManga && typeof saved.perManga === 'object' ? saved.perManga : {},
    };
    emit();
  }
}
void hydrate();

/**
 * The effective mode for a series: its explicit override if set, otherwise the
 * global default. Called with no arguments it returns the global default.
 */
export function getReaderMode(sourceId?: string, mangaUrl?: string): ReaderMode {
  if (sourceId && mangaUrl) {
    const override = state.perManga[keyOf(sourceId, mangaUrl)];
    if (override) return override;
  }
  return state.default;
}

/**
 * Records the reading mode. With a series it sets that series' override and also
 * advances the global default (so the next new title inherits this pick); with
 * no series it only moves the global default.
 */
export function setReaderMode(next: ReaderMode, sourceId?: string, mangaUrl?: string): void {
  if (sourceId && mangaUrl) {
    state = {
      default: next,
      perManga: { ...state.perManga, [keyOf(sourceId, mangaUrl)]: next },
    };
  } else {
    if (state.default === next) return;
    state = { ...state, default: next };
  }
  store.save(state);
  emit();
}

export function isPaged(m: ReaderMode): boolean {
  return m !== 'webtoon';
}

export function isHorizontal(m: ReaderMode): boolean {
  return m === 'ltr' || m === 'rtl';
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive effective mode for a series (re-renders on hydrate and on change). */
export function useReaderMode(sourceId: string, mangaUrl: string): ReaderMode {
  return useSyncExternalStore(subscribe, () => getReaderMode(sourceId, mangaUrl));
}

/**
 * Global reader toggles (not per-series — these are habits, not layout
 * choices). Kept in their own store so a new toggle never has to migrate the
 * per-series reading-mode state.
 */
export interface ReaderToggles {
  /** Hold the screen awake while the reader is open. */
  keepScreenOn: boolean;
}

const DEFAULT_TOGGLES: ReaderToggles = { keepScreenOn: false };

const togglesStore = makePersistence<ReaderToggles>('@kagari/readerToggles/v1');

let toggles: ReaderToggles = DEFAULT_TOGGLES;
const toggleListeners = new Set<() => void>();

function emitToggles(): void {
  for (const l of toggleListeners) l();
}

async function hydrateToggles(): Promise<void> {
  const stored = await togglesStore.load();
  if (stored) toggles = { ...DEFAULT_TOGGLES, ...stored };
  emitToggles();
}

export function getReaderToggles(): ReaderToggles {
  return toggles;
}

export function setReaderToggle<K extends keyof ReaderToggles>(
  key: K,
  value: ReaderToggles[K],
): void {
  if (toggles[key] === value) return;
  toggles = { ...toggles, [key]: value };
  togglesStore.save(toggles);
  emitToggles();
}

function subscribeToggles(cb: () => void): () => void {
  toggleListeners.add(cb);
  return () => {
    toggleListeners.delete(cb);
  };
}

export function useReaderToggles(): ReaderToggles {
  return useSyncExternalStore(subscribeToggles, getReaderToggles);
}

void hydrateToggles();
