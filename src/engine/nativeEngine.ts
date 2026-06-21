/**
 * Thin wrapper over the native Kotlin module `ManhwaEngine`.
 *
 * The native side returns JSON strings (keeps the bridge contract simple and
 * mirrors the "JSON-like data" design); this layer parses them into typed DTOs.
 * Returns `null` when the native module is unavailable so the app can fall back
 * to the mock engine during development.
 */
import { NativeModules } from 'react-native';
import type {
  Engine,
  ExtensionDto,
  SourceDto,
  MangaDto,
  MangasPageDto,
  ChapterDto,
  PageDto,
  ImageRequestDto,
  FilterDto,
  RepoDto,
  AvailableExtensionDto,
} from './types';
import { fetchAllRepos } from './repoClient';

interface ManhwaEngineNative {
  reload(): Promise<void>;
  listExtensions(): Promise<string>;
  listSources(): Promise<string>;
  listRepos(): Promise<string>;
  addRepo(url: string): Promise<void>;
  removeRepo(url: string): Promise<void>;
  installExtension(apkUrl: string, pkg: string): Promise<void>;
  uninstallExtension(pkg: string): Promise<void>;
  installApk(uri: string): Promise<void>;
  trustSignature(pkg: string, certSha256: string): Promise<void>;
  getPopular(sourceId: string, page: number): Promise<string>;
  getLatest(sourceId: string, page: number): Promise<string>;
  search(sourceId: string, query: string, page: number, filtersJson: string): Promise<string>;
  getFilters(sourceId: string): Promise<string>;
  getMangaDetails(sourceId: string, mangaUrl: string): Promise<string>;
  getChapters(sourceId: string, mangaUrl: string): Promise<string>;
  getPages(sourceId: string, chapterUrl: string): Promise<string>;
  resolveImage(sourceId: string, pageJson: string): Promise<string>;
}

const Native = NativeModules.ManhwaEngine as ManhwaEngineNative | undefined;

function parse<T>(json: string): T {
  return JSON.parse(json) as T;
}

export function createNativeEngine(): Engine | null {
  if (!Native) return null;

  return {
    isNative: true,

    async reload() {
      if (typeof Native.reload !== 'function') return;
      await Native.reload();
    },
    async listExtensions() {
      return parse<ExtensionDto[]>(await Native.listExtensions());
    },
    async listSources() {
      return parse<SourceDto[]>(await Native.listSources());
    },
    async listRepos() {
      if (typeof Native.listRepos !== 'function') return [];
      return parse<RepoDto[]>(await Native.listRepos());
    },
    addRepo(url: string) {
      return Native.addRepo(url);
    },
    removeRepo(url: string) {
      if (typeof Native.removeRepo !== 'function') return Promise.resolve();
      return Native.removeRepo(url);
    },
    async getAvailableExtensions() {
      if (typeof Native.listRepos !== 'function') return [];
      // Repos are owned by native; fetch their indexes here (fetch + parse in JS).
      const repos = parse<RepoDto[]>(await Native.listRepos());
      const installed = new Set(
        parse<ExtensionDto[]>(await Native.listExtensions()).map(e => e.pkg),
      );
      return fetchAllRepos(repos, pkg => installed.has(pkg));
    },
    installExtension(ext: AvailableExtensionDto) {
      if (typeof Native.installExtension !== 'function') return Promise.resolve();
      return Native.installExtension(ext.apkUrl, ext.pkg);
    },
    uninstallExtension(pkg: string) {
      if (typeof Native.uninstallExtension !== 'function') return Promise.resolve();
      return Native.uninstallExtension(pkg);
    },
    installApk(uri: string) {
      return Native.installApk(uri);
    },
    trustSignature(pkg: string, certSha256: string) {
      return Native.trustSignature(pkg, certSha256);
    },
    async getPopular(sourceId, page) {
      return parse<MangasPageDto>(await Native.getPopular(sourceId, page));
    },
    async getLatest(sourceId, page) {
      return parse<MangasPageDto>(await Native.getLatest(sourceId, page));
    },
    async search(sourceId, query, page, filters?: FilterDto[]) {
      return parse<MangasPageDto>(
        await Native.search(sourceId, query, page, JSON.stringify(filters ?? [])),
      );
    },
    async getFilters(sourceId) {
      return parse<FilterDto[]>(await Native.getFilters(sourceId));
    },
    async getMangaDetails(sourceId, mangaUrl) {
      return parse<MangaDto>(await Native.getMangaDetails(sourceId, mangaUrl));
    },
    async getChapters(sourceId, mangaUrl) {
      return parse<ChapterDto[]>(await Native.getChapters(sourceId, mangaUrl));
    },
    async getPages(sourceId, chapterUrl) {
      return parse<PageDto[]>(await Native.getPages(sourceId, chapterUrl));
    },
    async resolveImage(sourceId, page: PageDto) {
      return parse<ImageRequestDto>(
        await Native.resolveImage(sourceId, JSON.stringify(page)),
      );
    },
  };
}
