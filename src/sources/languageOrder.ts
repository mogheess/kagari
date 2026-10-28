/**
 * The order languages are listed in: the phone's languages, then English, then
 * the languages the user enabled, then the rest by label.
 *
 * Extensions come in dozens of languages, and lists used to put English first
 * and everything else alphabetically, so anyone reading in another language
 * scrolled past a long run of others to reach theirs. Codes are matched on
 * their base language, so a regional or script variant (`pt-BR`, `zh-Hans`)
 * sits with the plain code, just after it.
 *
 * The phone's languages come from the native locale list (every language in
 * the phone's settings, preferred first), with `Intl` as a stand-in until that
 * answers or on builds without it.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { getEngine } from '../engine';
import { preferredLanguages } from '../utils/lang';
import { useEnabledLanguages } from './languageFilter';

function unique(codes: string[]): string[] {
  return [...new Set(codes.filter(Boolean))];
}

function intlLanguages(): string[] {
  try {
    return [Intl.DateTimeFormat().resolvedOptions().locale];
  } catch {
    return [];
  }
}

let device: string[] = intlLanguages();
const listeners = new Set<() => void>();

function loadDeviceLanguages(): void {
  getEngine()
    .getDeviceLanguages()
    .then(tags => {
      const next = unique(tags);
      if (next.length === 0 || next.join() === device.join()) return;
      device = next;
      for (const l of listeners) l();
    })
    .catch(() => {});
}
loadDeviceLanguages();
// The JS side outlives the Activity a language change recreates.
AppState.addEventListener('change', state => {
  if (state === 'active') loadDeviceLanguages();
});

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => device;

/** Language codes in the order lists should show them. */
export function usePreferredLanguages(): string[] {
  const phone = useSyncExternalStore(subscribe, getSnapshot);
  const enabled = useEnabledLanguages();
  return useMemo(() => preferredLanguages(phone, enabled), [phone, enabled]);
}

/**
 * The phone's languages and English, without the enabled ones: for the row of
 * chips that toggles them, which would otherwise reorder under the finger.
 */
export function usePhoneLanguages(): string[] {
  const phone = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => preferredLanguages(phone, []), [phone]);
}
