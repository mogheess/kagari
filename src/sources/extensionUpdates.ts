/**
 * Extension update tracker.
 *
 * Compares installed extensions against the versions advertised by the
 * configured repos (Mihon-style: an update exists when the repo's versionCode is
 * higher than the installed one). Exposed reactively so the Extensions screen can
 * show per-row "Update" buttons and other surfaces (Profile/Home) can show a
 * badge without opening the Extensions screen.
 */
import { useSyncExternalStore } from 'react';
import type { AvailableExtensionDto, Engine, ExtensionDto } from '../engine/types';

export interface ExtensionUpdate {
  pkg: string;
  name: string;
  installedVersionName: string;
  availableVersionName: string;
  /** The repo entry to (re)install in order to update. */
  ext: AvailableExtensionDto;
}

let updates: ExtensionUpdate[] = [];
let lastChecked = 0;
let checking = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Pure: installed extensions that have a newer version available in a repo. */
export function computeExtensionUpdates(
  installed: ExtensionDto[],
  available: AvailableExtensionDto[],
): ExtensionUpdate[] {
  const bestByPkg = new Map<string, AvailableExtensionDto>();
  for (const a of available) {
    const cur = bestByPkg.get(a.pkg);
    if (!cur || a.versionCode > cur.versionCode) bestByPkg.set(a.pkg, a);
  }

  const out: ExtensionUpdate[] = [];
  for (const e of installed) {
    const a = bestByPkg.get(e.pkg);
    if (a && a.versionCode > e.versionCode) {
      out.push({
        pkg: e.pkg,
        name: e.name,
        installedVersionName: e.versionName,
        availableVersionName: a.versionName,
        ext: a,
      });
    }
  }
  out.sort((x, y) => x.name.localeCompare(y.name));
  return out;
}

/** Replaces the tracked update list (e.g. after the Extensions screen refreshes). */
export function setExtensionUpdates(list: ExtensionUpdate[]): void {
  updates = list;
  lastChecked = Date.now();
  emit();
}

/** Drops one package from the list after it has been updated. */
export function markExtensionUpdated(pkg: string): void {
  const next = updates.filter(u => u.pkg !== pkg);
  if (next.length !== updates.length) {
    updates = next;
    emit();
  }
}

/** Throttle automatic background checks (manual checks pass force). */
const CHECK_TTL_MS = 30 * 60 * 1000;

/** Fetches installed + available and recomputes updates. Best-effort. */
export async function checkExtensionUpdates(
  engine: Engine,
  opts?: { force?: boolean },
): Promise<void> {
  if (checking) return;
  if (!opts?.force && lastChecked && Date.now() - lastChecked < CHECK_TTL_MS) return;
  checking = true;
  try {
    const [installed, available] = await Promise.all([
      engine.listExtensions(),
      engine.getAvailableExtensions(),
    ]);
    setExtensionUpdates(computeExtensionUpdates(installed, available));
  } catch {
    // Offline or repo down — keep whatever we had.
  } finally {
    checking = false;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ExtensionUpdate[] {
  return updates;
}

export function useExtensionUpdates(): ExtensionUpdate[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
