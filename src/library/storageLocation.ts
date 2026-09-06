/**
 * The user-picked storage folder (Mihon-style). Null means downloads and
 * backups stay in app-private storage, which is the default: the folder is an
 * opt-in from Settings, never a gate.
 */
import { useSyncExternalStore } from 'react';
import { getEngine } from '../engine';
import type { StorageLocation } from '../engine/types';

let location: StorageLocation | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function set(next: StorageLocation | null): void {
  location = next;
  loaded = true;
  emit();
}

export async function refreshStorageLocation(): Promise<StorageLocation | null> {
  try {
    set(await getEngine().getStorageLocation());
  } catch {
    set(null);
  }
  return location;
}

/** Opens the system folder picker. Resolves with the new location, or null if cancelled. */
export async function pickStorageLocation(): Promise<StorageLocation | null> {
  const picked = await getEngine().pickStorageLocation();
  if (picked) set(picked);
  return picked;
}

export async function clearStorageLocation(): Promise<void> {
  await getEngine().clearStorageLocation();
  set(null);
}

/** One line for settings rows: where downloads go right now. */
export function describeStorageLocation(current: StorageLocation | null): string {
  if (!current) return 'App storage · private to Kagari, removed on uninstall';
  if (!current.writable) return `${current.displayPath} · no longer accessible, tap to fix`;
  return `${current.displayPath}/downloads`;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useStorageLocation(): StorageLocation | null {
  return useSyncExternalStore(subscribe, () => location);
}

export function isStorageLocationLoaded(): boolean {
  return loaded;
}

void refreshStorageLocation();
