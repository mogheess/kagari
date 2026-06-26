/**
 * Engine selector — extensions only.
 *
 * The app talks exclusively to the native Kotlin extension engine, which loads
 * installed extension APKs. There is no demo/mock data: every list, detail and
 * page comes from a real source. When the native module isn't present (e.g. a
 * JS-only dev environment) a no-op engine is returned so the UI degrades to
 * empty states instead of crashing.
 */
import { createNativeEngine } from './nativeEngine';
import type { Engine } from './types';

let instance: Engine | null = null;

/** Whether the real native Kotlin module is present on this build/device. */
export function isNativeAvailable(): boolean {
  return createNativeEngine() !== null;
}

const UNAVAILABLE = 'Extension engine unavailable on this build.';

function createUnavailableEngine(): Engine {
  const reject = () => Promise.reject(new Error(UNAVAILABLE));
  return {
    isNative: false,
    reload: () => Promise.resolve(),
    listExtensions: () => Promise.resolve([]),
    listSources: () => Promise.resolve([]),
    trustSignature: reject,
    listRepos: () => Promise.resolve([]),
    addRepo: reject,
    removeRepo: () => Promise.resolve(),
    getAvailableExtensions: () => Promise.resolve([]),
    installExtension: reject,
    uninstallExtension: () => Promise.resolve(),
    installApk: reject,
    getPopular: () => Promise.resolve({ manga: [], hasNextPage: false }),
    getLatest: () => Promise.resolve({ manga: [], hasNextPage: false }),
    search: () => Promise.resolve({ manga: [], hasNextPage: false }),
    getFilters: () => Promise.resolve([]),
    getMangaDetails: reject,
    getChapters: () => Promise.resolve([]),
    getPages: () => Promise.resolve([]),
    resolveImage: reject,
    fetchImage: reject,
    downloadPage: reject,
    fetchDownloadedImage: reject,
    deleteDownloadedChapter: () => Promise.resolve(),
    pickMihonBackup: () => Promise.resolve(null),
    importMihonBackup: reject,
    saveImageToGallery: reject,
    shareImage: reject,
  };
}

export function getEngine(): Engine {
  if (instance) return instance;
  instance = createNativeEngine() ?? createUnavailableEngine();
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[engine] ${instance.isNative ? 'native Kotlin engine' : 'NO native engine (empty)'}`);
  }
  return instance;
}

export * from './types';
