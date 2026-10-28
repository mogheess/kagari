/**
 * The JSON-serializable contract between the UI (TS) and the native Kotlin
 * extension engine. These DTOs intentionally mirror the Tachiyomi/Mihon
 * source model so results from real extension APKs map cleanly.
 *
 * Identity within a source is always `(sourceId, url)`.
 */

export interface ExtensionDto {
  /** Android package name, e.g. "eu.kanade.tachiyomi.extension.en.mangadex". */
  pkg: string;
  name: string;
  versionName: string;
  versionCode: number;
  /** Tachiyomi extension lib version this APK was built against, e.g. "1.4". */
  libVersion: string;
  lang: string;
  isNsfw: boolean;
  /**
   * Whether its code is loaded: its signer is one of the user's repos' keys,
   * or the user trusted it. Untrusted extensions contribute no sources.
   */
  trusted: boolean;
  /** Sources contributed by this extension (a SourceFactory can yield many). */
  sources: SourceDto[];
  iconUrl?: string;
  /** SHA-256 of the signing certificate; what trusting the extension records. */
  signatureHash?: string | null;
}

export interface SourceDto {
  /** Stable Tachiyomi source id (Long, passed as string to avoid JS precision loss). */
  id: string;
  name: string;
  lang: string;
  supportsLatest: boolean;
  isNsfw: boolean;
  /** Owning extension package. */
  extensionPkg: string;
  iconUrl?: string;
  /** Root URL of the source (e.g. "https://mangafire.to"). */
  baseUrl?: string;
}

export type MangaStatus =
  | 'unknown'
  | 'ongoing'
  | 'completed'
  | 'licensed'
  | 'publishing_finished'
  | 'cancelled'
  | 'on_hiatus';

export interface MangaDto {
  sourceId: string;
  /** Source-relative key; identity of the manga within its source. */
  url: string;
  title: string;
  thumbnailUrl?: string;
  author?: string;
  artist?: string;
  description?: string;
  genres: string[];
  status: MangaStatus;
  /** Whether full details have been fetched (vs. a browse stub). */
  initialized: boolean;
  /**
   * Source-private state as JSON text (extensions-lib 1.6+ `memo`). Opaque:
   * keep it with the manga and pass it back on details/chapter calls.
   */
  memo?: string;
}

export interface MangasPageDto {
  manga: MangaDto[];
  hasNextPage: boolean;
}

/** A new-chapters entry the background check found (same shape as the Updates feed). */
export interface BackgroundUpdateDto {
  sourceId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string | null;
  newCount: number;
  latestChapterName: string;
  latestChapterUrl: string;
  foundAt: number;
  kind?: 'new' | 'added';
}

/** What background checks found since the app last asked. */
export interface BackgroundInboxDto {
  updates: BackgroundUpdateDto[];
  /** New chapter urls per manga, keyed `sourceId\u0000mangaUrl`. */
  snapshots: Record<string, string[]>;
}

/** Titles related to one manga, as far as its source can tell. */
export interface RelatedMangaDto {
  /** The source's own related list, or null when it doesn't provide one. */
  mangas?: MangaDto[] | null;
  /** False when the source asks apps not to look for related titles by searching. */
  searchAllowed: boolean;
}

/** Names a download needs to land in Mihon's folder layout under a picked storage location. */
export interface DownloadMeta {
  mangaTitle: string;
  chapterName: string;
  scanlator?: string;
}

/** The system WebView, which every Cloudflare check runs in. */
export interface WebViewInfo {
  /** Null when there's no WebView provider, or Android is too old to say. */
  packageName?: string | null;
  version?: string | null;
  /** Older than Cloudflare's challenge script accepts. */
  outdated: boolean;
}

/** A user-picked storage folder (Storage Access Framework tree). */
export interface StorageLocation {
  uri: string;
  /** Human-readable, e.g. "Internal storage/Kagari". */
  displayPath: string;
  /** False when the grant was lost or the folder was removed. */
  writable: boolean;
}

export interface ChapterDto {
  sourceId: string;
  mangaUrl: string;
  url: string;
  name: string;
  /** -1 when unknown. */
  chapterNumber: number;
  scanlator?: string;
  /** Epoch millis, 0 when unknown. */
  dateUpload: number;
  /** Source-private state as JSON text; see `MangaDto.memo`. */
  memo?: string;
}

export interface PageDto {
  index: number;
  /** Direct image URL, may be absent until resolved via `resolveImage`. */
  imageUrl?: string;
  /** Page URL to resolve when `imageUrl` is absent. */
  url?: string;
}

/** URL + headers needed to fetch an image through the source's HTTP client. */
export interface ImageRequestDto {
  url: string;
  headers: Record<string, string>;
}

/** Local cached image fetched through the source's native HTTP client. */
export interface ImageFileDto {
  uri: string;
  sourceUrl?: string;
  bytes?: number;
  cached?: boolean;
  width?: number;
  height?: number;
  contentType?: string;
  tiles?: ImageTileDto[];
}

export interface ImageTileDto {
  uri: string;
  width: number;
  height: number;
  index: number;
}

export type TierListExportOrientation = 'landscape' | 'vertical';

export interface TierListExportDto {
  title: string;
  orientation: TierListExportOrientation;
  rows: TierListExportRowDto[];
}

export interface TierListExportRowDto {
  name: string;
  color: string;
  items: TierListExportItemDto[];
}

export interface TierListExportItemDto {
  title: string;
  coverUri?: string;
}

/** A configured extension repository (Mihon-style index URL). */
export interface RepoDto {
  url: string;
  name: string;
}

/** An extension available in a repo's index (not necessarily installed). */
export interface AvailableExtensionDto {
  name: string;
  pkg: string;
  apk: string;
  apkUrl: string;
  lang: string;
  versionName: string;
  versionCode: number;
  isNsfw: boolean;
  /**
   * Content rating from an index v2 repo: 1 safe, 2 suggestive, 3 NSFW.
   * 0 when the repo's index doesn't carry one.
   */
  contentRating: number;
  /** Extension-lib version the APK was built against, e.g. "1.4" or "1.6". */
  extensionLib: string;
  iconUrl?: string;
  sources: { name: string; lang: string; id: string; baseUrl?: string }[];
  repoUrl: string;
  /** Fingerprint of the key the repo signs its extensions with, when it publishes one. */
  repoSigningKey?: string;
  installed: boolean;
}

/** A Mihon/Tachiyomi backup decoded into the bits Kagari can import. */
export interface MihonBackupDto {
  /** Category names, in their original order. */
  categories: string[];
  manga: MihonBackupMangaDto[];
}

export interface MihonBackupMangaDto {
  sourceId: string;
  url: string;
  title: string;
  thumbnailUrl?: string;
  author?: string;
  dateAdded: number;
  /** Category names this manga belongs to. */
  categories: string[];
  /** Chapters with read state worth importing (read or partially read). */
  chapters: { url: string; name: string; read: boolean; lastPageRead: number }[];
  /** Most recent read, for the history/continue feed. */
  lastChapter?: { url: string; name: string; readAt: number };
}

/**
 * Dynamic filter schema a source exposes (Tachiyomi FilterList) serialized to
 * JSON so the UI can render it generically and pass selections back.
 */
export type FilterDto =
  | { type: 'header'; name: string }
  | { type: 'separator' }
  | { type: 'text'; name: string; state: string }
  | { type: 'checkbox'; name: string; state: boolean }
  | {
      type: 'select';
      name: string;
      values: string[];
      state: number;
    }
  | {
      type: 'tristate';
      name: string;
      /** 0 = ignore, 1 = include, 2 = exclude */
      state: number;
    }
  | {
      type: 'sort';
      name: string;
      values: string[];
      state: { index: number; ascending: boolean } | null;
    }
  | { type: 'group'; name: string; filters: FilterDto[] };

/** Typed result envelope so the UI can distinguish failure kinds. */
export type EngineErrorKind =
  | 'untrusted_extension'
  | 'unsupported_lib_version'
  | 'network'
  | 'cloudflare'
  | 'parse'
  | 'not_found'
  | 'unknown';

export interface EngineError {
  kind: EngineErrorKind;
  message: string;
}

/**
 * The full facade surface the native module must implement and the UI calls.
 */
export interface Engine {
  /** Whether the real native engine is backing this facade. */
  isNative: boolean;

  // discovery / lifecycle
  /** Re-scan installed extension APKs (call after returning from the installer). */
  reload(): Promise<void>;
  listExtensions(): Promise<ExtensionDto[]>;
  listSources(): Promise<SourceDto[]>;
  trustSignature(pkg: string, certSha256: string): Promise<void>;
  /**
   * Records repos' signing keys (`{ repoUrl: fingerprint }`, from the repos just
   * fetched) so extensions they sign load without a prompt. Resolves true when
   * that changed which extensions are trusted (they've been reloaded).
   */
  setRepoSigningKeys(keys: Record<string, string>): Promise<boolean>;

  // repos & extension installation
  listRepos(): Promise<RepoDto[]>;
  addRepo(url: string): Promise<void>;
  removeRepo(url: string): Promise<void>;
  /** Available extensions across all configured repos (fetched from indexes). */
  getAvailableExtensions(): Promise<AvailableExtensionDto[]>;
  installExtension(ext: AvailableExtensionDto): Promise<void>;
  uninstallExtension(pkg: string): Promise<void>;
  installApk(uri: string): Promise<void>;

  // browsing
  getPopular(sourceId: string, page: number): Promise<MangasPageDto>;
  getLatest(sourceId: string, page: number): Promise<MangasPageDto>;
  search(
    sourceId: string,
    query: string,
    page: number,
    filters?: FilterDto[],
  ): Promise<MangasPageDto>;
  getFilters(sourceId: string): Promise<FilterDto[]>;

  // detail / reading
  /**
   * `memo` is the source-private state the manga arrived with (`MangaDto.memo`);
   * some sources cannot resolve details or chapters without it.
   */
  getMangaDetails(sourceId: string, mangaUrl: string, memo?: string): Promise<MangaDto>;
  /** Absolute, browser-openable URL for a manga (source baseUrl + path). */
  getMangaWebUrl(sourceId: string, mangaUrl: string): Promise<string>;
  /** The source's own related titles for a manga; see `src/library/similar.ts`. */
  getRelatedManga(
    sourceId: string,
    mangaUrl: string,
    title: string,
    memo?: string,
  ): Promise<RelatedMangaDto>;
  getChapters(sourceId: string, mangaUrl: string, memo?: string): Promise<ChapterDto[]>;
  getPages(sourceId: string, chapterUrl: string, memo?: string): Promise<PageDto[]>;
  resolveImage(sourceId: string, page: PageDto): Promise<ImageRequestDto>;
  fetchImage(sourceId: string, page: PageDto, forceRefresh?: boolean): Promise<ImageFileDto>;
  /**
   * Fetches a manga cover through the source's HTTP client (so Referer/headers
   * and Cloudflare clearance apply) and caches it to disk. Resolves to a local
   * `file://` uri, or the original `url` unchanged when it can't be fetched
   * natively (no installed source, non-http url, or failure).
   */
  fetchCover(sourceId: string, url: string): Promise<string>;

  // offline downloads
  /**
   * Downloads one page to persistent storage; resolves with its uri (`file://`
   * in app storage, `content://` under a user-picked folder). `meta` names the
   * Mihon-style folder when a storage location is set.
   */
  downloadPage(
    sourceId: string,
    chapterUrl: string,
    page: PageDto,
    meta?: DownloadMeta,
  ): Promise<string>;
  /**
   * Moves a chapter downloaded into app storage to the picked folder. Resolves
   * with the number of pages moved (0 when nothing to move or no folder set).
   */
  migrateDownloadedChapter(sourceId: string, chapterUrl: string, meta: DownloadMeta): Promise<number>;
  /** Reads a previously downloaded page (offline, no network). */
  fetchDownloadedImage(
    sourceId: string,
    chapterUrl: string,
    pageIndex: number,
  ): Promise<ImageFileDto>;
  /**
   * Bytes on disk for each chapter's download, in the order given (0 when
   * nothing is saved). Slow under a picked folder; batch and cache.
   */
  getDownloadedSizes(keys: readonly { sourceId: string; chapterUrl: string }[]): Promise<number[]>;
  /** Deletes all downloaded pages for a chapter. */
  deleteDownloadedChapter(sourceId: string, chapterUrl: string): Promise<void>;
  /**
   * Opens the system file picker for a Mihon/Tachiyomi backup. Resolves with a
   * content URI, or null if the user cancelled.
   */
  pickMihonBackup(): Promise<string | null>;
  /** Decodes a Mihon/Tachiyomi backup at the given content URI. */
  importMihonBackup(uri: string): Promise<MihonBackupDto>;

  // storage location (Mihon-style user-picked folder)
  /** The picked folder, or null when downloads live in app storage. */
  getStorageLocation(): Promise<StorageLocation | null>;
  /** Opens the system folder picker; resolves with the new location, or null if cancelled. */
  pickStorageLocation(): Promise<StorageLocation | null>;
  /** Back to app storage. Files already in the folder stay readable. */
  clearStorageLocation(): Promise<void>;

  // save / share
  /** Renders a high-resolution tier-list image and returns a local file:// uri. */
  renderTierListImage(exportData: TierListExportDto): Promise<string>;
  /** Saves a local image (file:// uri) to the device gallery; resolves with the saved file name. */
  saveImageToGallery(uri: string): Promise<string>;
  /** Opens the system share sheet for a local image (file:// uri). */
  shareImage(uri: string): Promise<void>;

  // backup
  /** Writes a Mihon-compatible `.tachibk`; returns a shareable content URI. */
  exportMihonBackup(request: unknown, fileName: string): Promise<{
    uri: string;
    fileName: string;
    bytes: number;
    mangaCount: number;
    /** Display path of the copy kept under the storage location, when one is set. */
    savedTo?: string | null;
  }>;
  /** Opens the system share sheet for an exported backup. */
  shareBackup(uri: string, fileName: string): Promise<void>;

  // background updates
  /** Schedules the closed-app new-chapters check; `intervalHours` 0 turns it off. */
  setBackgroundUpdates(intervalHours: number, wifiOnly: boolean, chargingOnly: boolean): Promise<void>;
  /** What background checks found since last asked; empties it. */
  takeBackgroundUpdates(): Promise<BackgroundInboxDto>;

  // device
  /** Device ABIs, preferred first (e.g. `["arm64-v8a", "armeabi-v7a"]`). Empty when unknown. */
  getSupportedAbis(): Promise<string[]>;
  /** Holds the screen awake (reader). Best-effort; no-ops without an Activity. */
  setKeepScreenOn(enabled: boolean): Promise<void>;

  // advanced
  /** Clears every cookie and the Cloudflare solver's per-site memory. Signs out of sites. */
  clearCookies(): Promise<void>;
  /** Cookies plus the WebView's cache, site storage and form data. */
  clearWebViewData(): Promise<void>;
  /** Null when the native build can't report it. */
  getWebViewInfo(): Promise<WebViewInfo | null>;

  // web view
  /**
   * Opens `url` in the in-app WebView, which shares the engine's cookie jar so
   * a Cloudflare check passed there is reused by the source's HTTP client.
   * Resolves when the user closes it: `true` when they came back with a new
   * Cloudflare clearance for that site (worth retrying), `false` otherwise.
   */
  openInWebView(url: string): Promise<boolean>;
}
