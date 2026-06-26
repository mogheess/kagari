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
  /** True once the signing cert is trusted by the user. */
  trusted: boolean;
  /** Sources contributed by this extension (a SourceFactory can yield many). */
  sources: SourceDto[];
  iconUrl?: string;
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
}

export interface MangasPageDto {
  manga: MangaDto[];
  hasNextPage: boolean;
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
  sources: { name: string; lang: string; id: string; baseUrl?: string }[];
  repoUrl: string;
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
  getMangaDetails(sourceId: string, mangaUrl: string): Promise<MangaDto>;
  getChapters(sourceId: string, mangaUrl: string): Promise<ChapterDto[]>;
  getPages(sourceId: string, chapterUrl: string): Promise<PageDto[]>;
  resolveImage(sourceId: string, page: PageDto): Promise<ImageRequestDto>;
  fetchImage(sourceId: string, page: PageDto, forceRefresh?: boolean): Promise<ImageFileDto>;

  // offline downloads
  /** Downloads one page to persistent storage; resolves with its file:// uri. */
  downloadPage(sourceId: string, chapterUrl: string, page: PageDto): Promise<string>;
  /** Reads a previously downloaded page (offline, no network). */
  fetchDownloadedImage(
    sourceId: string,
    chapterUrl: string,
    pageIndex: number,
  ): Promise<ImageFileDto>;
  /** Deletes all downloaded pages for a chapter. */
  deleteDownloadedChapter(sourceId: string, chapterUrl: string): Promise<void>;
  /**
   * Opens the system file picker for a Mihon/Tachiyomi backup. Resolves with a
   * content URI, or null if the user cancelled.
   */
  pickMihonBackup(): Promise<string | null>;
  /** Decodes a Mihon/Tachiyomi backup at the given content URI. */
  importMihonBackup(uri: string): Promise<MihonBackupDto>;

  // save / share
  /** Saves a local image (file:// uri) to the device gallery; resolves with the saved file name. */
  saveImageToGallery(uri: string): Promise<string>;
  /** Opens the system share sheet for a local image (file:// uri). */
  shareImage(uri: string): Promise<void>;
}
