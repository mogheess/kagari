# AGENTS.md: Kagari

Guidance for AI agents (and humans) working in this repo. Read this first.

**Kagari** is a from-scratch Android manga/manhwa reader: a **React Native +
TypeScript** UI on top of a **native Kotlin engine** that loads
Tachiyomi/Mihon-compatible extension APKs. It is *not* a Mihon fork; it reuses
the (Apache 2.0) extension *engine* concepts behind a brand-new, configurable UI.

> Branding note: the launcher label is **Kagari** (`strings.xml` / `app.json`
> `displayName`). The RN component id (`app.json` `name` = `Manhwa`,
> `MainActivity.getMainComponentName()`) and the Android package `com.manhwa`
> are intentionally left unchanged for build stability. Do **not** rename those
> unless you update all three in lockstep.

> **Extensions only: there is no demo/mock data.** Every list, detail and page
> comes from a real installed extension. (The old `mock` engine and the
> Profile "Data source" toggle were removed.) With no extensions installed the
> app shows empty states that route to **Extensions**, never fake content.

---

## Architecture in one screen

```
React Native UI (TypeScript)
        │  getEngine()  -> Engine interface (src/engine/types.ts)
        ▼
 ┌──────────────────────────────────────────────┐
 │ nativeEngine.ts  ->  ManhwaEngine (RN bridge) │
 │ (or a no-op "unavailable" engine if the        │
 │  native module isn't present - empty states)   │
 └───────────────────────┬──────────────────────┘
                         ▼
              EngineFacade (Kotlin, suspend API)
              ExtensionLoader + SignatureTrust + ChildFirstPathClassLoader
              RepoManager + ApkInstaller
                         ▼
        Vendored Tachiyomi runtime (Apache 2.0): source-api,
        extension-lib 1.4-1.6 (suspend API + Rx bridges), HttpSource,
        NetworkHelper (OkHttp + Cloudflare + cookies), Injekt DI,
        Jsoup, RxJava1, kotlinx.serialization
                         ▼
              Extension APKs (user-supplied)
```

- **One DTO contract.** `src/engine/types.ts` (TS) mirrors
  `android/.../engine/dto/Dtos.kt` (Kotlin). Everything crossing the bridge is a
  JSON-serializable DTO (the native side returns JSON strings; `nativeEngine.ts`
  parses them). Manga identity is always `(sourceId, url)`.
- **The UI never imports the engine directly**; always go through `getEngine()`
  from `src/engine/index.ts`.
- **Image bytes stay native-side.** `fetchImage(sourceId, page)` downloads the
  page through the *source's own* OkHttp client (headers + Cloudflare cookies),
  caches it under `cacheDir/reader_images/<sourceId>/`, and returns a `file://`
  URI (plus dimensions and, for very tall webtoon images, pre-sliced JPEG
  **tiles** so the GPU texture limit isn't blown). The reader renders that local
  URI with `<Image>`. `resolveImage` (URL + headers only) still exists as a
  lighter seam.
- **Covers go through the same native client when needed.** Plain `<Image>`
  sends no `Referer`/UA and doesn't share the engine cookie jar, so covers on
  Referer- or Cloudflare-gated CDNs fail to load even when chapters work. Always
  render covers with **`RemoteImage`** (`src/components/RemoteImage.tsx`), passing
  `uri` + `sourceId`. It loads the url directly first (fast path) and only on
  error re-fetches via `fetchCover(sourceId, url)` — which downloads with the
  source's OkHttp client (headers + Cloudflare clearance) and caches a local
  `file://`. Resolved covers are remembered by `src/engine/coverCache.ts`
  (persisted url→file map, concurrency-gated). Don't use bare `<Image>` for
  remote covers.

---

## The engine (extensions only)

`src/engine/index.ts` is now a thin selector:

- If the `ManhwaEngine` native module is present → `nativeEngine` (real sources).
- Otherwise → a **no-op engine** whose list calls resolve empty and whose
  fetch calls reject, so a JS-only environment degrades to empty states instead
  of crashing. There is no sample data anywhere.

`nativeEngine.ts` is **defensive**: it checks `typeof Native.method === 'function'`
before calling, so an out-of-date native build degrades gracefully instead of
throwing `undefined is not a function`. Keep new native methods guarded the same way.

### Native runtime (this is the part that took the work)

Extensions are APKs compiled `compileOnly` against Tachiyomi's `extensions-lib`
and resolve `eu.kanade.tachiyomi.*` from the **host** at runtime (child-first
classloader). So the host must *provide* that runtime. We vendor it under
`android/app/src/main/java/eu/kanade/tachiyomi/`:

- `source/`: `Source`, `CatalogueSource`, `ConfigurableSource`, `HttpSource`,
  the `model/` types (`SManga`, `SChapter`, `SMangaUpdate`, `Page`,
  `FilterList`, …). This is the **extension-lib 1.6** surface: suspend
  `getPopularManga` / `getLatestUpdates` / `getSearchManga` /
  `getMangaUpdate` / `getPageList` / `getImageUrl`, with default bodies that
  bridge to the older RxJava1 `fetch*` methods. 1.6 has no separate
  details/chapter-list calls; both go through `getMangaUpdate`. Request/parse
  methods are `open`, not abstract, so 1.6-only extensions still link.
  `android/app/build.gradle` compiles with `-Xjvm-default=all-compatibility` so
  extensions inherit those interface default bodies.
- `network/`: `NetworkHelper` (base OkHttp client), `AndroidCookieJar` (shares
  cookies with the system WebView), `interceptor/` (`UncaughtExceptionInterceptor`,
  `UserAgentInterceptor`, `CloudflareInterceptor`, `WebViewActivityHolder`),
  `Requests.kt`, `OkHttpExtensions.kt` (RxJava bridge with crash-guarding).
  `JavaScriptEngine` is a stub that throws.
- `util/JsoupExtensions`, `AppInfo`, etc.

`com/manhwa/engine/`:
- `EngineFacade.kt`: the single entry the bridge calls. It calls **only the
  suspend API** (some current sources ship no Rx `fetchPopularManga` at all)
  and maps results to DTOs. Images still go through the source's
  `fetchImage(page)`, which is Rx.
- `EngineInjektModule.kt`: registers Injekt singletons (`Application`,
  `NetworkHelper`, `Json`, `ProtoBuf`) that extensions expect via
  `uy.kohesive.injekt`.
- `loader/`: `ExtensionLoader` (discovers/loads APKs, accepts lib versions
  `1.4` to `1.6`, reads `tachiyomix.contentWarning` before the legacy `nsfw`
  flag, loads only trusted ones), `ChildFirstPathClassLoader`,
  `SignatureTrust` (see *Extension trust*).
- `storage/`: `StorageManager` (the user-picked SAF folder) and
  `DownloadNaming` (Mihon's folder layout). See *Downloads and storage*.
- `backup/`: `MihonBackup` (import) and `MihonBackupExporter` (export).
- `Mappers.kt`: DTO mapping. Uses a `safe { }` helper to tolerate extensions
  that leave `lateinit` fields (e.g. `SManga.url`) uninitialized.

### What current keiyoushi extensions require of the host

Extensions built on keiyoushi's `KeiSource` base check the host at their first
request and fail every call if something is missing. Each of these was a
separate outage; diff against KeiSource before blaming a site.

- **Interceptors, by simple class name.** `NetworkHelper.client` must contain
  `UncaughtExceptionInterceptor`, `UserAgentInterceptor` and
  `CloudflareInterceptor` (in that order today). Don't rename or wrap them.
  `cloudflareClient` is an alias of `client`.
- **App-provided libraries** (extensions compile against them `compileOnly`;
  versions in `android/app/build.gradle`): OkHttp 5.4.0 with `okhttp-brotli`
  and `okhttp-zstd`, `zstd-kmp-okio`, `quickjs-android`, Okio 3.17.0,
  kotlinx-serialization `json` / `json-okio` / `protobuf`, kotlinx-coroutines,
  Jsoup, RxJava 1.3.8, Injekt. A `resolutionStrategy` pins every OkHttp module
  to 5.4.0 and Okio to 3.17.0; mixed 4.x/5.x crashes at runtime.
- **Kotlin and kotlinx at least keiyoushi's.** Extensions are compiled with
  keiyoushi's Kotlin (2.4.10 today) and link against the app's stdlib,
  kotlinx-serialization and coroutines (1.11.0) at runtime. An older runtime
  fails at call time: serialization 1.7.x made every `@Serializable` parse
  throw `AbstractMethodError`. React Native 0.86 ships Kotlin 2.1.20, so
  `android/build.gradle` overrides `kotlinVersion` for every module, and sets
  `kspVersion` because AsyncStorage's KSP table stops at Kotlin 2.2. A
  kotlinx runtime built with Kotlin 2.x needs a compiler of at least 2.(x-1).
  When keiyoushi's `gradle/libs.versions.toml` moves, move these with it.
- **`memo`.** `SManga.memo` / `SChapter.memo` are `JsonObject`s that extensions
  read back on later calls. They cross the bridge as JSON text
  (`MangaDto.memo` / `ChapterDto.memo`), are persisted on favorites and
  download entries, and are passed back to details, chapters and pages.
- **Injekt singletons, keyed by class.** Extensions `injectLazy()` the
  `Application`, `NetworkHelper`, `Json` and `ProtoBuf` (MANGA Plus). A missing
  one throws inside the extension's class initialiser, often on a coroutine
  the extension launched, which kills the whole app. Register by the exact
  class: `ProtoBuf` used as a value is `ProtoBuf.Default`, so it needs
  `addSingletonFactory<ProtoBuf>`.
- **No concurrent `getMangaUpdate` for one title.** KeiSource throws if it
  happens. `EngineFacade` serializes both calls per `sourceId|mangaUrl`.
- **Fatal errors must still surface.** RxJava 1 treats `LinkageError` and
  friends as fatal and never delivers them to `onError`, so the awaiting
  coroutine would hang forever. `OkHttpExtensions.asReportable()` turns them
  into `IllegalStateException("Extension is incompatible with this app build: …")`.

Other gotchas already paid for:
- MangaFire decodes JSON from an Okio buffer, hence `json-okio` + `okio`.
- `QUERY_ALL_PACKAGES` is required (Android 11+) to discover installed APKs.

### Cloudflare

`CloudflareInterceptor` treats a response as a challenge when the `Server` is
Cloudflare and either `cf-mitigated: challenge` is set or an **image** request
got a 403/503. A plain 403 on a page is returned as-is. For a challenge it:

1. retries if a `cf_clearance` cookie already exists;
2. otherwise expires every Cloudflare cookie for the host (`cf_clearance`,
   `cf_chl*`, `__cf*`, `_cfuvid`; `AndroidCookieJar.removeMatching`, on `/` and
   each parent domain, since a cookie only goes when its domain and path
   match), loads the host in an invisible in-app WebView and polls for a *new*
   `cf_clearance` (20 s timeout, at most once per host per 15 s), then retries
   with that cookie **and the WebView's User-Agent**. A stale clearance or a
   flagged `__cf_bm` used to survive and fail every attempt; the site's own
   cookies (a login) stay;
3. if the page starts an **interactive** check (Turnstile posts
   `interactiveBegin`), gives up at once with
   `CloudflareBypassException(interactive = true)`, as Mihon does;
4. otherwise falls back to fetching the bytes through the WebView itself.

The bridge maps these to error codes `cloudflare_interactive` / `cloudflare`.
`src/engine/errors.ts` (`engineErrorKind`, `needsHumanCheck`) lets Discover and
MangaDetail lead with "Open in WebView" when a person has to solve it. A toast
warns when Android System WebView is older than 118.

### Repositories

`src/engine/repoClient.ts` reads **`index.pb` first** (Mihon's protobuf index,
decoded in `repoIndexPb.ts`), and falls back to `index.min.json`. A repo URL
ending in `.json` or a bare directory is tried as `<dir>/index.pb` before the
JSON. The payload is sniffed, not trusted by its extension: gzip, a `repo.json`
descriptor (followed to `index_v2`), a legacy JSON array, or protobuf (with an
optional external extension list). keiyoushi's `index.min.json` is now a
tombstone of placeholder entries for old apps; reading `index.pb` first keeps
it out of the UI (`repoClient.test.ts` guards this). Repo URLs themselves live
natively in `RepoManager`.

### Extension trust

Extensions run arbitrary code in the app, so `ExtensionLoader` loads one only
when its signing key is trusted (`SignatureTrust`):

- **Repo-signed:** a repo the user added publishes its signing key
  (`signingKeyFingerprint`). `src/sources/repoTrust.ts` syncs those keys to
  native whenever the catalogue is fetched, and an extension signed with one
  loads without a prompt.
- **Trusted by hand:** anything else (an APK installed from a file, another
  repo's build) shows as **Untrusted** on Extensions → Installed and loads
  nothing until the user taps **Trust**, which records `pkg:signatureHash`
  via `trustSignature`. A different signer for the same package needs it again.
- **Upgrades:** builds before the check recorded every extension as trusted
  when first seen, so extensions that already loaded keep loading.

### Downloads and storage

- **Queue:** `src/library/downloads.ts` is a persisted single-worker queue
  (re-queues anything mid-download on launch). MangaDetail multi-select and the
  bulk sheet (All / Unread) enqueue in batches. `DownloadQueueScreen` (Profile →
  Download queue, or the pill in the Library header while it runs) shows only
  what's waiting or failed.
- **Downloads live with their titles (Mihon-style):** there's no screen of
  downloaded chapters. Library covers carry a download badge and a virtual
  "Downloaded" collection (folders card / shelf chip) lists library titles with
  downloads. The title page marks downloaded chapters, can filter to them, and
  deletes them from multi-select. When the source can't list chapters
  (offline, blocked, extension not installed) the title page falls back to its
  downloaded chapters (`downloadedChapterList`), so they read on in order
  without it. Downloading from a title outside the library offers to add it
  (`downloadsLibrary.ts`); removing a title with downloads asks whether to
  delete them. Entries keep `chapterNumber`/`dateUpload` for that ordering;
  older ones fall back to parsing the chapter name.
- **Default location:** app-private `filesDir/downloads/<sourceId>/<sha256(chapterUrl)>/<page>.<ext>`.
  Removed on uninstall.
- **Storage location (opt-in):** Profile → Storage location picks a folder via
  SAF (`StorageManager`, persisted tree URI). Downloads then use Mihon's
  layout from `DownloadNaming`:
  `<root>/downloads/<Source (LANG)>/<Title>/<[scanlator_]Chapter_<md5(url):6>>/001.jpg`,
  with the same FAT-safe names and length cap, plus `.nomedia`. Exported
  backups are also copied to `<root>/backups/`. Pages are staged in
  `cacheDir/download_tmp` and verified before they're committed. Reads check
  the folder first, then app storage; existing app-storage downloads can be
  moved over from the same row.
- **Other locations:** gallery saves go to MediaStore `Pictures/Kagari`; caches
  under `cacheDir` (`reader_images/`, `covers/`, `shared/`, `tier_exports/`,
  `network_cache`).

---

## Persistence (AsyncStorage)

Local state persists via `@react-native-async-storage/async-storage`, wrapped by
`src/store/persist.ts` (`makePersistence<T>(key)` → `{ load, save }`, error-swallowing).

- **`src/library/favorites.ts`**: the library. Reactive via
  `useSyncExternalStore`. Identity `(sourceId, url)`. Hydration is **merge-safe**:
  a favorite toggled in the brief window before stored data loads is preserved
  (adds win; removals during the window aren't resurrected). Each favorite carries
  `categoryIds: string[]`.
- **`src/library/categories.ts`**: user categories (create/rename/delete,
  persisted, reactive). Deleting a category strips it from every favorite.
- **`src/home/HomeConfig.tsx`**: home block layout + per-block source choice are
  persisted here too.
- Others follow the same pattern: `history.ts`, `chapterProgress.ts` (per-chapter
  read flag + last page), `downloads.ts`, `libraryUpdates.ts`, `tierLists.ts`,
  `collections.ts` (library view), `recentlyAdded.ts`, `storageLocation.ts`,
  `scanlatorFilters.ts` (hidden scan groups per title),
  `src/sources/` (`pinned`, `languageFilter`, `sourceHealth`), `src/reader/readerSettings.ts`,
  and the theme/appearance prefs in `ThemeProvider`. `src/engine/mangaCache.ts`
  is a persisted LRU of recent details + chapter lists so revisits open instantly.

When you add a new persisted store, follow the favorites pattern (in-memory state
+ listeners + `makePersistence`); don't sprinkle `AsyncStorage` calls in screens.

---

## Features wired to the engine

- **Home** (`HomeScreen` + `HomeBlockView`): configurable blocks
  (featured/popular/latest/recommended + a "Continue" rail that shows the
  **library**). Source resolution per browse block is **per-block override →
  universal source → `pickDefaultSource`** (English & non-NSFW first,
  `src/utils/sourceSelect.ts`), skipping any candidate that can't do "Latest".
  The **universal source** (set in **Customize Home**, persisted in `HomeConfig`)
  drives every section at once so you don't have to set each one; per-section
  pickers remain as optional overrides. Empty rails auto-hide.
  - **Featured** isn't curated; it's the source's **Popular** list. The block
    renders the top `FEATURED_COUNT` (6) entries that have cover art as an
    auto-rotating, swipeable `FeaturedCarousel` (genre-based taglines; pauses on
    drag; page dots). Browse stubs aren't `initialized`, so there's no
    description/rating to rank "editorially" by without extra detail fetches.
- **Discover**: a **Source | Global** segmented toggle.
  - **Source** mode: single-source picker (`SourcePickerSheet`, grouped by
    extension with language + NSFW tags, filtered by the enabled languages in
    `languageFilter.ts`), debounced search, a **Popular | Latest** toggle (Latest
    hidden when the source can't), infinite scroll, typed error/empty states.
    A **Filters** button appears when the source declares filters
    (`FilterSheet`; edits stay a draft until Apply). Native writes the edited
    state onto a fresh `getFilterList()` position by position, keeping a
    position only when its type and name still match (`FilterSerializer`).
    The chosen source + browse mode persist; Home's "See all" opens a source
    here via `discoverIntent.ts`. Default-source picking skips sources that
    recently failed (`sourceHealth.ts`).
  - **Global** mode: fans the query out to the user's **pinned sources**
    (`src/sources/pinned.ts`, persisted) and renders one horizontal rail per
    source, each loading independently (tap a rail header to jump into that
    source). Pinned set is chosen via `GlobalSourcesSheet`. Like Mihon, global
    search is curated (pinned) rather than literally all installed sources to
    avoid hammering every source.
- **Library**: grid of favorites with **category filter chips** (All / each
  category / Uncategorized). Defaults to the tag/category view; the layout toggle
  sits on the right. The **All** chip can be hidden when you have categories
  (option in Library), and home sections can be **disabled rather than deleted**.
  Custom collection covers are supported (`src/library/collectionCovers.ts`).
- **MangaDetail**: bookmark toggles favorite; long-press (or the "Add to category"
  row) opens `CategoryAssignSheet` to assign categories. Shows the **source the
  title came from** with a **Migrate** action (`src/library/migrate.ts` — moves a
  title to another source and carries over history; prompts on a duplicate).
  **Resume** jumps to where you left off (`src/library/chapterProgress.ts`), and
  chapters can be sorted **newest/oldest first**. When the chapters come from
  more than one scan group, a row of group chips (name + count) under the
  header hides or shows each group, saved per title
  (`src/library/scanlatorFilters.ts`); hidden groups leave the list, Resume,
  bulk download, the reader's order and both new-chapter checks (the
  closed-app worker reads the stored key), but not migration. At least one
  group stays shown. Read chapters are dimmed and a
  half-read one shows its page. Long-press starts **multi-select** (a second
  long-press selects the range) with Read / Unread / Download; the download
  icon in the header queues All or Unread. A fast-scroll thumb sits on the
  right edge for long lists. When the source isn't installed
  or a live fetch fails, a notice offers **Retry / Open in WebView / Migrate**
  instead of a silent empty list (covers + chapters are live-fetched, never stored
  in a backup, so a missing extension means no chapters).
- **Reader** (`ReaderScreen` + `src/reader/readerSettings.ts`): four modes,
  **webtoon** (continuous long strip), **vertical** (one page/swipe), **ltr**,
  **rtl** (paged). Mode is per series, with the last pick as the default, and
  is selectable from the reader's settings sheet. **Continuous reading**
  (`src/reader/chapterWindow.ts`): neighbouring chapters are preloaded and
  flattened into one list, so scrolling past the end of a chapter runs straight
  into the next; at most `MAX_LOADED_CHAPTERS` (5) stay loaded around the
  current one, and scrolling past a chapter marks it read. The order keeps one
  chapter per number (`skipDuplicateChapters`): titles with chapters from
  several scan groups list a number more than once, so the reader keeps the
  opened chapter, else its group's copy, else a downloaded one. MangaDetail
  hands the reader only the chapters its filters leave. Downloaded chapters
  read from storage. An optional **keep screen on** toggle holds the display
  awake while reading. Pages
  load via the native `fetchImage` cache (queued, retried) and render tall
  webtoon images as stitched tiles. A failed page shows a **Retry** button and any
  page can be **long-pressed to refresh** it; retry passes `forceRefresh` to
  `EngineFacade.fetchImage`, which busts the disk cache and re-downloads.
  Freshly-downloaded files that don't decode are rejected (not cached) so a
  truncated download can't keep rendering black. Opening a chapter records history.
  Supports **pinch / double-tap zoom** (double-tap again to zoom out; pan while
  zoomed; the webtoon strip still scrolls while zoomed, paged modes lock page
  swipes until you zoom back out) and a per-page **actions menu** (e.g. save
  the image to a separate phone-gallery album, distinct from chapter downloads).
  The bottom chrome carries a themed **page slider** (`src/components/PageSlider.tsx`):
  a draggable thumb over a filled track flanked by the current/total page numbers
  and previous/next **chapter** controls. Drag or tap to scrub to any page — paged
  modes jump live per page via `FlatList.scrollToIndex`; the webtoon strip (no
  `getItemLayout`) commits on release and relies on `onScrollToIndexFailed` to land
  the exact index. The slider mirrors itself in **rtl** mode, and the chapter
  buttons walk true reading order (chapters sorted ascending by number).
- **Mihon backup** (`src/library/mihonImport.ts` ⇄ native `backup/MihonBackup.kt`,
  `mihonExport.ts` ⇄ `MihonBackupExporter.kt`): **Import** restores a `.tachibk`
  (gzipped protobuf) backup — favorites, categories, read history and
  per-chapter read state — merged non-destructively into the local stores.
  **Export** writes a `.tachibk` Mihon can restore (favorites, categories,
  per-chapter progress from cached chapter lists, history) and opens the share
  sheet; a copy also goes to the storage folder when one is set. Both are in
  Profile. Category names are matched
  trim+case-insensitively so they aren't silently dropped, and an imported cover
  is kept when live details omit one. Chapters are **not** in the backup; they're
  live-fetched, so a title from a not-installed source shows the MangaDetail
  notice above until you install/migrate the source.
- **Updates tab** (`UpdatesScreen`): a **Updates | History** segmented screen.
  **History** is a real feed: opening a chapter records a last-read entry
  (`src/library/history.ts`, persisted), grouped by day with resume + per-item
  remove + clear-all. **Updates** is a real new-chapters feed driven by
  `src/library/libraryUpdates.ts` (see *Update checks*): each favorite's chapter
  list is snapshotted per source, diffed on scan, and new chapters land here
  (grouped by day, per-row dismiss, clear-all, pull-to-refresh to force a scan).
  A first-seen manga is baselined silently so the backlog doesn't flood (a title
  you just added by hand is the exception, via `recentlyAdded.ts`). The Updates
  tab shows an unseen badge on the bottom nav. Read chapters don't drop off the
  feed yet.
- **Update checks** (`App.tsx` `UpdateBootstrap`): two checkers run on launch
  (+2.5s), on return to foreground (`AppState`), and hourly — both internally
  throttled, plus a manual **Check** in Profile (`force: true`):
  - **App version** (`src/app/appUpdate.ts`): polls the latest GitHub Release and
    compares its tag to `APP_VERSION` (`src/app/version.ts`); 6h TTL. Surfaces an
    "update available" banner reactively, and `updatePrompt.ts` shows a sheet
    once per new version.
  - **Extensions** (`src/sources/extensionUpdates.ts`): diffs installed vs repo
    `versionCode`; 30m TTL. Drives per-row Update buttons and badges.
  - **What's new** (`src/app/whatsNew.ts` + `changelog.ts`): shows release notes
    once after an upgrade; `ChangelogScreen` (Profile → What's new) lists every
    version. Bump `version.ts` **and** `build.gradle` together and
    add a `CHANGELOG` entry when shipping user-facing changes.
  - **Library new chapters** (`src/library/libraryUpdates.ts`): scans each
    favorite via `engine.getChapters`, diffs against a persisted per-manga url
    snapshot, and records new chapters into the Updates feed; 6h TTL, concurrency
    3, best-effort (a not-installed/offline source is skipped).
  - **Closed-app checks** (`src/library/backgroundUpdates.ts` ⇄ native
    `com/manhwa/updates/`): a WorkManager job (`LibraryUpdateWorker`) runs the
    same diff while the app is closed, reading the library and snapshots
    straight from AsyncStorage (`AsyncStorageReader`). Daily by default; Off,
    6 h, 12 h, Wi-Fi only and charging only are in Profile, and it never runs
    on low battery. The settings are pushed to native on launch and on each
    change. Finds go to a native inbox and a notification that opens the
    Updates tab (`kagari://updates`); `mergeBackgroundUpdates` folds the inbox
    into the feed and snapshots when the app next runs. Notification
    permission: `src/app/notificationPermission.ts`.
- **Extensions** (`ExtensionsScreen`): Browse (repo catalogue, language chips,
  search, install with per-package error + retry) and Installed (update badges,
  **Update all**, uninstall, **Trust** for extensions no repo signed; see
  *Extension trust*). An installed extension no repo offers any more is
  flagged **Orphaned** (only once some repo has answered), since it won't get
  updates. Installed sources reach every screen through `sourcesStore.ts`
  without a restart.
- **Downloads**: see *Downloads and storage* above. They show in the Library
  and on title pages; Profile → Download queue holds what's still to download.
- **Theming** (`src/theme/`): two looks, **Ink** (default, neutral so cover art
  leads) and **Paper** (warmer, higher contrast), each with dark and light
  palettes, plus Pure black (dark only), Density (comfortable/compact) and
  Corners (soft/sharp). Mode defaults to dark. Chosen in `AppearanceScreen`
  (Profile → Theme); there's deliberately no hue picker. **Backdrops**
  (`theme/backdrops.ts`): original artwork (bundled WebPs; **Ink** by default,
  None turns it off) drawn once
  by `ScreenBackdrop` in TabsScreen as a fixed wallpaper behind every main tab,
  under an even scrim of the background colour. Tab roots use
  `useScreenCanvas()` (transparent while a backdrop is on) instead of
  `colors.bg`; a new main tab must do the same. Each backdrop also carries
  curated colours (accent + tinted bg/surface/elevated/glass, dark and light)
  that ThemeProvider lays over the look's palette, before pure black. Check
  contrast when adding one: on-accent on accent ≥ 4.5, accent on bg ≈ 4.5+.
- **Tier lists** (`tierLists.ts` + `TierListsScreen`): S–D rows of library
  titles, exported as an image (rendered natively) to save or share.

---

## Project layout

```
src/
  engine/        Engine contract (types.ts), nativeEngine, index (selector),
                 repoClient + repoIndexPb (index.pb first, JSON fallback),
                 errors (Cloudflare error kinds), mangaCache (persisted LRU),
                 pageCache, coverCache (url->file cover cache for RemoteImage)
  store/         persist.ts (AsyncStorage wrapper)
  hooks/         useAsync, usePagedCatalog (infinite scroll)
  library/       favorites, categories, collections (library view), history,
                 chapterProgress (read flags + resume), libraryUpdates
                 (new-chapters scan/feed), backgroundUpdates (closed-app
                 check settings), scanlatorFilters (hidden scan groups),
                 recentlyAdded, downloads (queue),
                 downloadQueue (queue grouping), downloadsLibrary (library
                 side of downloads),
                 storageLocation, collectionCovers, migrate (cross-source +
                 history transfer), mihonImport / mihonExport (.tachibk),
                 tierLists
  sources/       sourcesStore (installed sources), pinned (global search),
                 languageFilter, sourceHealth, discoverIntent,
                 extensionUpdates (repo version diff)
  app/           version, appUpdate (GitHub release check), updatePrompt,
                 changelog + whatsNew (one-time release-notes sheet), community
  reader/        readerSettings (modes, keep screen on), chapterWindow
                 (continuous reading)
  theme/         tokens.ts, themes.ts (Ink / Paper), ThemeProvider
  home/          Configurable, persisted home-block model (HomeConfig + universal source)
  utils/         lang.ts (lang labels), sourceSelect.ts (default/sort), color.ts
  components/    Cover, RemoteImage (cover loader w/ native fallback), FeaturedHero,
                 FeaturedCarousel, CoverRail, SectionHeader, Icon, Skeleton,
                 HomeBlockView, SourcePickerSheet, GlobalSourcesSheet,
                 CategoryAssignSheet, BottomSheet (shared sheet shell),
                 FastScroller, PageSlider, SwipeTabs,
                 WhatsNewSheet, UpdateAvailableSheet, ConfirmDialog, ...
  navigation/    RootNavigator (native stack), TabsScreen (local-state tabs,
                 kept alive), TabNav, GlassTabBar, types
  screens/       Home, Library, Discover, Updates, Profile, MangaDetail, Reader,
                 CustomizeHome, Extensions, Categories, DownloadQueue, Appearance,
                 Changelog, TierLists
android/app/src/main/java/
  eu/kanade/tachiyomi/   Vendored runtime: source/ (extension-lib 1.6 API),
                         network/ (interceptors, Cloudflare WebView solver),
                         util/ (Apache 2.0)
  com/manhwa/engine/     loader/, repo/, bridge/, dto/, storage/, backup/,
                         web/ (SourceWebViewActivity), EngineFacade, Mappers,
                         FilterSerializer, EngineInjektModule
  com/manhwa/updates/    LibraryUpdateWorker (closed-app new-chapters check),
                         BackgroundUpdates (schedule, inbox, notification),
                         AsyncStorageReader
android/app/src/androidTest/   On-device tests (see Testing)
android/app/src/debug/         Debug-only test host (BlankActivity)
patches/                       patch-package patches (react-native-screens)
```

---

## Conventions

- **Theme everything.** No hardcoded colors in screens/components. Pull from
  `useTheme()` (`theme.colors.*`, `theme.spacing.*`, `theme.typography.*`). The
  accent is a restrained **brass** (`#E0A548` dark / `#A96410` light in the Ink
  look; Paper has its own), used sparingly. Add/use a token in
  `src/theme/tokens.ts` and give it a value in every palette in `themes.ts`.
- **TypeScript strict, no `any`.** Use the DTO types in `src/engine/types.ts`.
- **Engine access only via `getEngine()`.** Don't import `nativeEngine` from UI.
- **DTO changes are two-sided.** Editing `types.ts` usually means editing
  `Dtos.kt` (and the mappers) to match. Keep field names identical.
- **Persisted state goes through a store** in `src/store` / `src/library`, not
  inline `AsyncStorage`. Expose it with `useSyncExternalStore` hooks.
- **Icons** are inline SVG in `src/components/Icon.tsx`. Add a `case` to the
  union + switch rather than pulling an icon font.
- **`StyleSheet.absoluteFillObject` is not in this RN version's types**: use an
  explicit `{ position:'absolute', top/left/right/bottom:0 }` block.
- **Reader chrome must not overlay pages invisibly.** Don't wrap the page
  `FlatList` in an absolute `Pressable`, and don't gate page visibility on a
  Reanimated opacity; that caused the "white screen, pages glimpsed on back" bug.
  Tap-to-toggle lives on each page; bars are plain conditional views.
- **Reader zoom uses core `Animated` (native driver), not Reanimated.** On this
  RN / Reanimated / Gesture Handler combination, Reanimated transform updates
  didn't reliably reach the screen (the zoom lagged a gesture behind or stuck
  at 1x). Gesture handlers run as plain JS (`runOnJS(true)`, passed as
  `useCallback` refs so Babel doesn't turn them into worklets). The page list
  scrolls through `GestureScrollView`, a plain `ScrollView` wrapped in
  `Gesture.Native().disallowInterruption(false)`: a bare `ScrollView` makes
  Gesture Handler cancel the pinch as soon as it drags (paged modes turned the
  page instead), and Gesture Handler's own `FlatList` can't be interrupted at
  all. Give every `Gesture.Tap()` a `maxDistance`; it has no movement limit by
  default, so flicks counted as taps.
- **Bottom sheets use `BottomSheet`** (`src/components/BottomSheet.tsx`), not
  a bare `Modal`. It slides the panel while the backdrop fades (a `Modal`'s own
  `slide` moved the dimmed backdrop with it), and closes on backdrop tap, back,
  or a drag down. Pass `scrollable` when the sheet holds a list, so only drags
  from its top move it. It uses `PanResponder`, not Gesture Handler: a `Modal`
  is its own window on Android, outside the gesture root.
- **Comments** explain *why*, not *what*. No narration comments.
- **Empty states are required.** Zero-content screens render a friendly prompt
  that routes to **Extensions** (see `HomeScreen`/`DiscoverScreen`).

---

## Running

```sh
npm install
npm start                         # Metro (ONE instance only, see gotchas)
npm run android                   # build + launch (needs Android SDK + JDK 17 or 21)
```

Use JDK 17 or 21; Android Studio's bundled JBR 21 works. Newer JDKs fail in an
unrelated-looking module. Debug builds for every ABI are huge; pass
`-PreactNativeArchitectures=arm64-v8a` (or `x86_64`) to build just the one you
run on.

With no extensions installed you'll see empty states. Install a repo + extension
(Profile → Extensions & Repos) to get content. See **BUILD.md** for toolchain setup.

### Gotchas (learned the hard way)

- **macOS needs Watchman**, or Metro dies with `EMFILE: too many open files,
  watch` (RN's fallback file watcher exhausts FDs, especially with other dev
  servers running). `brew install watchman`. A `.watchmanconfig` ignores
  `android/build`, `.gradle`, `.cxx`, etc.; **never** ignore `node_modules`
  (Metro must resolve deps from it; doing so caused a red 500 "Unable to resolve
  @babel/runtime").
- **Only ever run ONE Metro instance.** Multiple servers serve stale bundles and
  cause phantom `undefined is not a function`. If weird: kill all node/Metro, then
  `npx react-native start --reset-cache` once.
- **adb flakiness / "device offline":** `adb reconnect offline` (or
  `adb kill-server && adb start-server`), target `emulator-5554` explicitly.
- **`adb shell input tap` uses real device pixels** (e.g. 1080×2400), not
  screenshot pixels; scale coordinates accordingly.
- **Native (Kotlin/Gradle) changes need `npm run android`**, not Fast Refresh.
  Adding a native dep (e.g. AsyncStorage) requires a rebuild. JS-only changes
  hot-reload.
- **Keep the react-native-screens patch** (`patches/react-native-screens+*.patch`,
  applied by `postinstall`). The fragment framework keeps a dismissed screen as
  a "disappearing child" after its exit animation, and any extra draw pass
  painted it for a frame, so pressing back flashed the screen you'd just left.
  The patch skips drawing a removing screen whose animation has ended. Re-check
  it when bumping react-native-screens. For the same reason the tab bar uses no
  BlurView on Android: its glass is faked (`AndroidGlass` in GlassTabBar), a
  blurred thumbnail of the fixed backdrop cut to the bar's position, plus a
  frost, sheen, rim streak and depth gradient. No per-frame cost.
- **Release vs debug installs:** they're signed with different keys, so one
  won't install over the other (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
  Uninstalling wipes app data, including the repo list.

## Testing

- **JS:** `npm test` (jest). Suites live in `__tests__/` next to the code in
  `src/engine`, `src/library`, `src/reader`, `src/app`, `src/components`,
  `src/sources` and `src/theme`. Also run `npx tsc --noEmit` and `npm run lint` (warnings are
  tolerated; don't add new ones).
- **On-device:** `android/app/src/androidTest` runs on a device or emulator
  against a `MockWebServer` (`mockwebserver3`). Today it covers the Cloudflare
  interceptor: interactive challenge fails fast, an issued clearance is retried
  with the cookie, a plain 403 isn't a challenge, a clean root stops the solve
  early, stale site-wide Cloudflare cookies are cleared before a solve. Run:
  ```sh
  cd android && ./gradlew :app:connectedDebugAndroidTest -PreactNativeArchitectures=arm64-v8a
  ```
  Results land in `android/app/build/outputs/androidTest-results/connected/`.
  A test that needs a live Activity window launches `BlankActivity`
  (`android/app/src/debug/`), never `MainActivity`: that starts React Native,
  which without Metro fails to load the JS bundle and crashes the run. It lives
  in the debug source set because an androidTest manifest's activities run in
  the test APK's own process.

---

## Known gaps / next up

- **Read chapters stay on the Updates feed.** New-chapter entries are only
  removed by dismiss or clear-all, not by reading them. *Don't reintroduce
  faked update data.*
- **Per-source descramble interceptors.** `fetchImage` goes through the source's
  own client (and the HTTP/1.1 fallback builds from it), so sources that
  unscramble images in an interceptor (MangaFire, MANGA Plus) should work, but
  reading them end to end hasn't been checked.
- **Continuous reading in paged modes.** Crossing into the next chapter by
  scrolling works in webtoon mode; vertical/LTR/RTL still use the chapter
  buttons.

---

## Status

- [x] Extensions-only engine (mock data fully removed); empty states everywhere
- [x] Native runtime that **actually runs** installed sources: `HttpSource`,
      `NetworkHelper` + Cloudflare/cookie/UA interceptors, Injekt, `FilterList`,
      extension-lib 1.6 suspend API (called directly, with Rx bridges)
- [x] keiyoushi `KeiSource` host requirements (interceptor names, app-provided
      libs, kotlinx at keiyoushi's versions, `memo`, serialized `getMangaUpdate`)
- [x] Repo management (add/remove), `index.pb` with JSON fallback; APK
      install/uninstall (FileProvider + system installer), Update all, Orphaned
      state
- [x] Extension trust: repo signing keys, **Trust** on the Installed tab
- [x] Discover browse/search; grouped `SourcePickerSheet`
- [x] Global search across pinned sources (per-source rails; `GlobalSourcesSheet`)
- [x] Reading history (persisted) in a Updates | History segmented tab
- [x] Library favorites (persisted, merge-safe) + Categories (create/rename/delete,
      filter, assignment)
- [x] Configurable + persisted Home with universal source + per-section overrides
- [x] Reader modes (webtoon / vertical / ltr / rtl); white-screen overlay fixed
- [x] OkHttp-backed native reader image (`fetchImage` → cached `file://`, with
      webtoon tiling) routed through the source's client
- [x] In-app Cloudflare solver: WebView clearance cookie + UA reused on OkHttp,
      so protected sources load in-app; interactive checks fail fast and send
      the user to the WebView
- [x] Robust covers: `RemoteImage`/`coverCache` + native `fetchCover` for
      Referer/Cloudflare-gated cover CDNs
- [x] MangaDetail: source attribution, Resume (`chapterProgress`), chapter sort,
      source-missing/error notices (Retry / WebView / Migrate)
- [x] Source migration (cross-source + history transfer) with duplicate prompt
- [x] Mihon `.tachibk` import and export (favorites, categories, history,
      per-chapter read state)
- [x] Reader pinch/double-tap zoom + per-page actions (save to gallery album)
- [x] App + extension update checks (launch/foreground/hourly, throttled) +
      "What's new" release notes
- [x] In-app **library updates** feed: per-favorite chapter snapshot + diff scan,
      grouped feed with unseen tab badge (`libraryUpdates.ts`)
- [x] Per-chapter read state, multi-select (mark read/unread, download, delete
      download), bulk download, download queue
- [x] Downloads live with their titles: library badges + Downloaded collection,
      offline chapter list from downloads
- [x] Continuous reading across chapters in webtoon mode (5-chapter window)
- [x] Storage location (SAF folder, Mihon's download layout)
- [x] Theming: Ink / Paper looks, light/dark/system, pure black, density, corners
- [x] On-device Cloudflare interceptor tests
- [x] Kotlin 2.4 toolchain; stdlib, kotlinx and OkHttp at keiyoushi's versions
- [x] Search filters (`FilterList` ⇄ `FilterDto`, `FilterSheet`)
- [x] Closed-app library updates (WorkManager) with new-chapter notifications
- [ ] Read chapters dropping off the Updates feed
- [ ] Continuous chapter transitions in paged modes

---

## Licensing (don't break this)

- Reuses Mihon/Tachiyomi code under **Apache 2.0**. Attribution + adapted-file
  list live in **NOTICE**; keep it intact and update it when you vendor more.
- "Tachiyomi"/"Mihon" are **not** used as branding. `eu.kanade.tachiyomi.*`
  package names and `tachiyomi.extension*` metadata keys exist **only** for
  functional extension compatibility.
- **No extensions or repos ship with the app.** Users supply their own. Keep it
  a neutral engine.
- Honor the extension **NSFW flag**.
