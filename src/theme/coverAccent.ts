/**
 * Per-title accent, pulled from the cover being viewed.
 *
 * This is where the app's colour is supposed to come from: rather than asking
 * the user to pick a hue, a title's screens take their accent from that title's
 * artwork.
 *
 * The accent deliberately lives in a module store rather than React context.
 * Context would put it in the ThemeProvider's value, and every `useTheme()`
 * caller in the app re-renders when that value changes — which is every mounted
 * tab, on every entry to and exit from a title screen, in the middle of the
 * navigation animation. Here only `useTitleTheme` subscribes.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getEngine } from '../engine';
import { makePersistence } from '../store/persist';
import { useTheme, useAppearance, type Theme } from './ThemeProvider';
import { applyAccent } from './themes';

// --- extracted accents, remembered across launches -------------------------
//
// Extraction is a bitmap decode. Doing it once per cover per install is fine;
// doing it on every visit is not, and it's what made the colour arrive late.

const cacheStore = makePersistence<Record<string, string>>('@kagari/cover-accent/v1');
/** `null` records "this cover has no usable colour", so we stop retrying it. */
let cache: Record<string, string | null> = {};
const inFlight = new Map<string, Promise<string | null>>();

function keyFor(coverUrl: string, dark: boolean): string {
  return `${dark ? 'd' : 'l'}:${coverUrl}`;
}

void cacheStore.load().then(stored => {
  if (stored) cache = { ...stored, ...cache };
});

function persist(): void {
  const plain: Record<string, string> = {};
  for (const [k, v] of Object.entries(cache)) if (v) plain[k] = v;
  cacheStore.save(plain);
}

// --- the accent currently on screen ----------------------------------------

let titleAccent: string | null = null;
const listeners = new Set<() => void>();

function setTitleAccent(next: string | null): void {
  if (titleAccent === next) return;
  titleAccent = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): string | null {
  return titleAccent;
}

/**
 * Resolves the accent for one cover. Returns null when the artwork has no
 * usable colour, or when the cover isn't cached locally yet — the native side
 * never downloads just to pick a colour, so a first visit falls back to the
 * app accent and the next one is instant.
 */
export async function coverAccent(
  sourceId: string,
  coverUrl: string,
  forDark: boolean,
): Promise<string | null> {
  const key = keyFor(coverUrl, forDark);
  if (key in cache) return cache[key];

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = getEngine()
    .coverAccent(sourceId, coverUrl, forDark)
    .then(value => (value ? value : null))
    .catch(() => null)
    .then(value => {
      inFlight.delete(key);
      // A miss because the cover wasn't downloaded yet must not be cached as
      // "no colour" — that would make it never resolve.
      if (value) {
        cache[key] = value;
        persist();
      }
      return value;
    });
  inFlight.set(key, task);
  return task;
}

/**
 * Publishes the accent for the title a screen is showing.
 *
 * Not cleared on unmount: only title screens read it, so a stale value is
 * invisible, and clearing would add a second store update (accent → null →
 * next accent) during navigation for no benefit.
 */
export function useCoverAccent(
  sourceId: string | undefined,
  coverUrl: string | undefined,
  forDark: boolean,
): void {
  useEffect(() => {
    if (!sourceId || !coverUrl) return;
    const key = keyFor(coverUrl, forDark);
    // Apply a known accent synchronously so the screen's first paint already
    // has it, instead of visibly changing colour a moment later.
    if (key in cache) {
      setTitleAccent(cache[key]);
      return;
    }
    let active = true;
    void coverAccent(sourceId, coverUrl, forDark).then(value => {
      if (active) setTitleAccent(value);
    });
    return () => {
      active = false;
    };
  }, [sourceId, coverUrl, forDark]);
}

/**
 * The theme with the current title's cover accent applied, for screens about
 * one manga. Falls back to the base theme when the setting is off or the cover
 * has no usable colour.
 */
export function useTitleTheme(): Theme {
  const theme = useTheme();
  const { appearance } = useAppearance();
  const accent = useSyncExternalStore(subscribe, getSnapshot);

  const enabled = appearance.coverAccent && !!accent;
  const build = useCallback(
    () => (enabled ? { ...theme, colors: applyAccent(theme.colors, accent) } : theme),
    [enabled, theme, accent],
  );
  return build();
}
