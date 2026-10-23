/**
 * Settings for the closed-app new-chapters check (native WorkManager job, see
 * `LibraryUpdateWorker`). Persisted here and pushed to native on launch and on
 * every change, so the schedule survives reinstalls and follows the setting.
 */
import { useSyncExternalStore } from 'react';
import { makePersistence } from '../store/persist';
import { getEngine } from '../engine';

export type BackgroundInterval = 0 | 6 | 12 | 24;

export interface BackgroundUpdateSettings {
  /** Hours between checks; 0 is off. */
  intervalHours: BackgroundInterval;
  wifiOnly: boolean;
  chargingOnly: boolean;
}

export const BACKGROUND_INTERVALS: { value: BackgroundInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 6, label: 'Every 6 h' },
  { value: 12, label: 'Every 12 h' },
  { value: 24, label: 'Daily' },
];

const DEFAULTS: BackgroundUpdateSettings = { intervalHours: 24, wifiOnly: false, chargingOnly: false };

const store = makePersistence<BackgroundUpdateSettings>('@kagari/backgroundUpdates/v1');
let settings: BackgroundUpdateSettings = DEFAULTS;
const listeners = new Set<() => void>();

function apply(): void {
  getEngine()
    .setBackgroundUpdates(settings.intervalHours, settings.wifiOnly, settings.chargingOnly)
    .catch(() => {});
}

async function hydrate(): Promise<void> {
  const saved = await store.load();
  if (saved && typeof saved === 'object') settings = { ...DEFAULTS, ...saved };
  for (const l of listeners) l();
  apply();
}

let started = false;

/**
 * Loads the setting and (re)schedules the job. Called at app start: Metro
 * inlines requires, so this module wouldn't otherwise load until something
 * first reads the setting, and a fresh install would never get scheduled.
 */
export function initBackgroundUpdates(): void {
  if (started) return;
  started = true;
  hydrate().catch(() => {});
}

export function getBackgroundUpdateSettings(): BackgroundUpdateSettings {
  initBackgroundUpdates();
  return settings;
}

export function setBackgroundUpdateSettings(patch: Partial<BackgroundUpdateSettings>): void {
  settings = { ...settings, ...patch };
  store.save(settings);
  for (const l of listeners) l();
  apply();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useBackgroundUpdateSettings(): BackgroundUpdateSettings {
  return useSyncExternalStore(subscribe, getBackgroundUpdateSettings, getBackgroundUpdateSettings);
}
