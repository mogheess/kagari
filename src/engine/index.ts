/**
 * Engine selector.
 *
 * - `mock`   : pure-JS demo data. Default, so the UI is always populated even
 *              with no extensions installed.
 * - `native` : the real Kotlin extension engine (loads installed APKs). Empty
 *              until the user installs/trusts extensions.
 *
 * The mode is switchable at runtime (see EngineModeProvider + Profile toggle).
 */
import { createNativeEngine } from './nativeEngine';
import { createMockEngine } from './mockEngine';
import type { Engine } from './types';

export type EngineMode = 'mock' | 'native';

let mode: EngineMode = 'mock';
let instance: Engine | null = null;
let nativeAvailable: boolean | null = null;

/** Whether the native Kotlin module is present on this build/device. */
export function isNativeAvailable(): boolean {
  if (nativeAvailable === null) {
    nativeAvailable = createNativeEngine() !== null;
  }
  return nativeAvailable;
}

export function getEngineMode(): EngineMode {
  return mode;
}

export function setEngineMode(next: EngineMode): void {
  if (next === mode) return;
  mode = next;
  instance = null; // force re-create on next getEngine()
}

export function getEngine(): Engine {
  if (instance) return instance;
  instance =
    mode === 'native' ? createNativeEngine() ?? createMockEngine() : createMockEngine();
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[engine] using ${instance.isNative ? 'native Kotlin' : 'mock'} engine`);
  }
  return instance;
}

export * from './types';
