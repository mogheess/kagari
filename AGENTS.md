# AGENTS.md — Kagari

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

> **Extensions only — there is no demo/mock data.** Every list, detail and page
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
 │  native module isn't present — empty states)   │
 └───────────────────────┬──────────────────────┘
                         ▼
              EngineFacade (Kotlin, suspend API)
              ExtensionLoader + SignatureTrust + ChildFirstClassLoader
              RepoManager + ApkInstaller
                         ▼
        Vendored Tachiyomi runtime (Apache 2.0): source-api,
        HttpSource, NetworkHelper (OkHttp + Cloudflare + cookies),
        Injekt DI, Jsoup, RxJava1->suspend, kotlinx.serialization
                         ▼
              Extension APKs (user-supplied)
```

- **One DTO contract.** `src/engine/types.ts` (TS) mirrors
  `android/.../engine/dto/Dtos.kt` (Kotlin). Everything crossing the bridge is a
  JSON-serializable DTO (the native side returns JSON strings; `nativeEngine.ts`
  parses them). Manga identity is always `(sourceId, url)`.
- **The UI never imports the engine directly** — always go through `getEngine()`
  from `src/engine/index.ts`.
- **Image bytes stay native-side.** `fetchImage(sourceId, page)` downloads the
  page through the *source's own* OkHttp client (headers + Cloudflare cookies),
  caches it under `cacheDir/reader_images/<sourceId>/`, and returns a `file://`
  URI (plus dimensions and, for very tall webtoon images, pre-sliced JPEG
  **tiles** so the GPU texture limit isn't blown). The reader renders that local
  URI with `<Image>`. `resolveImage` (URL + headers only) still exists as a
  lighter seam.

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

- `source/` — `Source`, `CatalogueSource`, `ConfigurableSource`, `HttpSource`,
  the `model/` types (`SManga`, `SChapter`, `Page`, `FilterList`, …). RxJava1
  `Observable`-based `fetch*` methods (matching real extensions).
- `network/` — `NetworkHelper` (base OkHttp client), `AndroidCookieJar` (shares
  cookies with the system WebView), `interceptor/UserAgentInterceptor`,
  `interceptor/CloudflareInterceptor` (WebView-based challenge solver),
  `Requests.kt`, `OkHttpExtensions.kt` (RxJava bridge with crash-guarding).
- `util/JsoupExtensions`, `AppInfo`, etc.

`com/manhwa/engine/`:
- `EngineFacade.kt` — the single entry the bridge calls; loads sources, converts
  RxJava `Observable` → `suspend` (`RxBridge.kt` / `awaitSingle`), maps to DTOs.
- `EngineInjektModule.kt` — registers Injekt singletons (`Application`,
  `NetworkHelper`, `Json`) that extensions expect via `uy.kohesive.injekt`.
- `loader/` — `ExtensionLoader` (discovers/loads APKs, auto-trusts explicitly
  installed ones), `ChildFirstPathClassLoader`, `SignatureTrust`.
- `Mappers.kt` — DTO mapping. Uses a `safe { }` helper to tolerate extensions
  that leave `lateinit` fields (e.g. `SManga.url`) uninitialized.

Gotchas already paid for:
- Extensions need `kotlinx-serialization-json-okio` + `okio` (MangaFire decodes
  JSON from an Okio buffer). Both are in `android/app/build.gradle`.
- RxJava1 treats `LinkageError`/`NoClassDefFoundError` as **fatal**; downstream
  parser throws are caught in `OkHttpExtensions` so a missing "provided" lib
  reports a clean error instead of killing the process.
- `QUERY_ALL_PACKAGES` is required (Android 11+) to discover installed APKs.

---

## Persistence (AsyncStorage)

Local state persists via `@react-native-async-storage/async-storage`, wrapped by
`src/store/persist.ts` (`makePersistence<T>(key)` → `{ load, save }`, error-swallowing).

- **`src/library/favorites.ts`** — the library. Reactive via
  `useSyncExternalStore`. Identity `(sourceId, url)`. Hydration is **merge-safe**:
  a favorite toggled in the brief window before stored data loads is preserved
  (adds win; removals during the window aren't resurrected). Each favorite carries
  `categoryIds: string[]`.
- **`src/library/categories.ts`** — user categories (create/rename/delete,
  persisted, reactive). Deleting a category strips it from every favorite.
- **`src/home/HomeConfig.tsx`** — home block layout + per-block source choice are
  persisted here too.

When you add a new persisted store, follow the favorites pattern (in-memory state
+ listeners + `makePersistence`); don't sprinkle `AsyncStorage` calls in screens.

---

## Features wired to the engine

- **Home** (`HomeScreen` + `HomeBlockView`): configurable blocks
  (featured/popular/latest/recommended + a "Continue" rail that shows the
  **library**). Source resolution per browse block is **per-block override →
  universal source → `pickDefaultSource`** (English & non-NSFW first —
  `src/utils/sourceSelect.ts`), skipping any candidate that can't do "Latest".
  The **universal source** (set in **Customize Home**, persisted in `HomeConfig`)
  drives every section at once so you don't have to set each one; per-section
  pickers remain as optional overrides. Empty rails auto-hide.
  - **Featured** isn't curated — it's the source's **Popular** list. The block
    renders the top `FEATURED_COUNT` (6) entries that have cover art as an
    auto-rotating, swipeable `FeaturedCarousel` (genre-based taglines; pauses on
    drag; page dots). Browse stubs aren't `initialized`, so there's no
    description/rating to rank "editorially" by without extra detail fetches.
- **Discover**: a **Source | Global** segmented toggle.
  - **Source** mode: single-source picker (`SourcePickerSheet`, grouped by
    extension with language + NSFW tags), debounced search, popular browse,
    typed error/empty states.
  - **Global** mode: fans the query out to the user's **pinned sources**
    (`src/sources/pinned.ts`, persisted) and renders one horizontal rail per
    source, each loading independently (tap a rail header to jump into that
    source). Pinned set is chosen via `GlobalSourcesSheet`. Like Mihon, global
    search is curated (pinned) rather than literally all installed sources to
    avoid hammering every source.
- **Library**: grid of favorites with **category filter chips** (All / each
  category / Uncategorized).
- **MangaDetail**: bookmark toggles favorite; long-press (or the "Add to category"
  row) opens `CategoryAssignSheet` to assign categories.
- **Reader** (`ReaderScreen` + `src/reader/readerSettings.ts`): four modes —
  **webtoon** (continuous long strip), **vertical** (one page/swipe), **ltr**,
  **rtl** (paged). Mode is selectable from the reader's settings sheet. Pages
  load via the native `fetchImage` cache (queued, retried) and render tall
  webtoon images as stitched tiles. A failed page shows a **Retry** button and any
  page can be **long-pressed to refresh** it; retry passes `forceRefresh` to
  `EngineFacade.fetchImage`, which busts the disk cache and re-downloads.
  Freshly-downloaded files that don't decode are rejected (not cached) so a
  truncated download can't keep rendering black. Opening a chapter records history.
- **Updates tab** (`UpdatesScreen`): a **Updates | History** segmented screen.
  **History** is a real feed — opening a chapter records a last-read entry
  (`src/library/history.ts`, persisted), grouped by day with resume + per-item
  remove + clear-all. **Updates** stays an honest empty state until per-manga
  chapter snapshots exist. Per-chapter read state on MangaDetail is still TODO.

---

## Project layout

```
src/
  engine/        Engine contract (types.ts), nativeEngine, repoClient
                 (fetch/parse real index.min.json), index (selector)
  store/         persist.ts (AsyncStorage wrapper)
  library/       favorites.ts, categories.ts, history.ts (persisted, reactive)
  sources/       pinned.ts (pinned sources for global search; persisted, reactive)
  reader/        readerSettings.ts (reading modes)
  theme/         Design tokens (tokens.ts) + ThemeProvider (dark/light/system)
  home/          Configurable, persisted home-block model (HomeConfig + universal source)
  utils/         lang.ts (lang labels), sourceSelect.ts (default/sort), color.ts
  components/    Cover, FeaturedHero, CoverRail, SectionHeader, Icon, Skeleton,
                 HomeBlockView, SourcePickerSheet, GlobalSourcesSheet,
                 CategoryAssignSheet, ...
  navigation/    RootNavigator, TabsScreen (local-state tabs), GlassTabBar, types
  screens/       Home, Library, Discover, Updates, Profile, MangaDetail, Reader,
                 CustomizeHome, Extensions, Categories
android/app/src/main/java/
  eu/kanade/tachiyomi/   Vendored runtime: source/, network/, util/ (Apache 2.0)
  com/manhwa/engine/     loader/, repo/, bridge/, dto/, facade, mappers, injekt
```

---

## Conventions

- **Theme everything.** No hardcoded colors in screens/components. Pull from
  `useTheme()` (`theme.colors.*`, `theme.spacing.*`, `theme.typography.*`). The
  signature accent is **teal** (`#19B79E` dark / `#0C8E79` light) — *not* purple.
  Add/use a token in `src/theme/tokens.ts`.
- **TypeScript strict, no `any`.** Use the DTO types in `src/engine/types.ts`.
- **Engine access only via `getEngine()`.** Don't import `nativeEngine` from UI.
- **DTO changes are two-sided.** Editing `types.ts` usually means editing
  `Dtos.kt` (and the mappers) to match. Keep field names identical.
- **Persisted state goes through a store** in `src/store` / `src/library`, not
  inline `AsyncStorage`. Expose it with `useSyncExternalStore` hooks.
- **Icons** are inline SVG in `src/components/Icon.tsx`. Add a `case` to the
  union + switch rather than pulling an icon font.
- **`StyleSheet.absoluteFillObject` is not in this RN version's types** — use an
  explicit `{ position:'absolute', top/left/right/bottom:0 }` block.
- **Reader chrome must not overlay pages invisibly.** Don't wrap the page
  `FlatList` in an absolute `Pressable`, and don't gate page visibility on a
  Reanimated opacity — that caused the "white screen, pages glimpsed on back" bug.
  Tap-to-toggle lives on each page; bars are plain conditional views.
- **Comments** explain *why*, not *what*. No narration comments.
- **Empty states are required.** Zero-content screens render a friendly prompt
  that routes to **Extensions** (see `HomeScreen`/`DiscoverScreen`).

---

## Running

```sh
npm install
npm start                         # Metro (ONE instance only — see gotchas)
npm run android                   # build + launch (needs Android SDK + JDK 17)
```

With no extensions installed you'll see empty states. Install a repo + extension
(Profile → Extensions & Repos) to get content. See **BUILD.md** for toolchain setup.

### Gotchas (learned the hard way)

- **macOS needs Watchman**, or Metro dies with `EMFILE: too many open files,
  watch` (RN's fallback file watcher exhausts FDs, especially with other dev
  servers running). `brew install watchman`. A `.watchmanconfig` ignores
  `android/build`, `.gradle`, `.cxx`, etc. — **never** ignore `node_modules`
  (Metro must resolve deps from it; doing so caused a red 500 "Unable to resolve
  @babel/runtime").
- **Only ever run ONE Metro instance.** Multiple servers serve stale bundles and
  cause phantom `undefined is not a function`. If weird: kill all node/Metro, then
  `npx react-native start --reset-cache` once.
- **adb flakiness / "device offline":** `adb reconnect offline` (or
  `adb kill-server && adb start-server`), target `emulator-5554` explicitly.
- **`adb shell input tap` uses real device pixels** (e.g. 1080×2400), not
  screenshot pixels — scale coordinates accordingly.
- **Native (Kotlin/Gradle) changes need `npm run android`**, not Fast Refresh.
  Adding a native dep (e.g. AsyncStorage) requires a rebuild. JS-only changes
  hot-reload.

---

## Known gaps / next up

- **Suspend (extension-lib 1.6) source API not mirrored.** `ExtensionLoader`
  accepts lib versions up to `1.6`, but the vendored `Source`/`CatalogueSource`
  expose only the deprecated RxJava `fetch*` methods, and `EngineFacade` calls
  those. Most keiyoushi `ParsedHttpSource` extensions override request/parse so
  the Rx path works; sources that override *only* the suspend `getPopularManga`/
  `getPageList`/etc. will not. Fix: add the suspend methods (with Rx-bridging
  defaults) to the vendored API and call them preferentially — or cap
  `LIB_VERSION_MAX` lower and say so.
- **Search filters are declared but unused.** TS has the full `FilterDto` schema,
  but native `getFilters` returns `[]` and `search(...)` ignores `filtersJson`
  (`ManhwaEngineModule.kt`). Wire `FilterList` ⇄ `FilterDto` (de)serialization so
  sources with genre/sort/status filters work.
- **Read history exists; per-chapter read-state + real updates feed do not.**
  Reading history is now persisted (`src/library/history.ts`) and shown in the
  **History** tab. Still missing: per-chapter read/unread state on MangaDetail
  and a real **Updates** feed (needs per-manga chapter snapshots, following the
  `favorites`/`categories` store pattern). *Don't reintroduce faked read/update
  data* — the Updates tab stays an empty state until snapshots exist.
- **Per-source descramble interceptors.** `fetchImage` routes through the source
  OkHttp client, but a few sources (e.g. MangaFire/MangaPlus) need custom
  image-descramble interceptors; verify those render correctly.
- Untrusted-extension trust-prompt UI (we currently **auto-trust** explicitly
  installed extensions; `trustSignature` exists if you want Mihon's boundary).
- Pull-to-refresh on Updates/Library; theme/accent refresh.

---

## Status

- [x] Extensions-only engine (mock data fully removed); empty states everywhere
- [x] Native runtime that **actually runs** installed sources: `HttpSource`,
      `NetworkHelper` + Cloudflare/cookie/UA interceptors, Injekt, `FilterList`,
      RxJava1→suspend
- [x] Repo management (add/remove), real `index.min.json` parsing; APK
      install/uninstall (FileProvider + system installer)
- [x] Discover browse/search; grouped `SourcePickerSheet`
- [x] Global search across pinned sources (per-source rails; `GlobalSourcesSheet`)
- [x] Reading history (persisted) in a Updates | History segmented tab
- [x] Library favorites (persisted, merge-safe) + Categories (create/rename/delete,
      filter, assignment)
- [x] Configurable + persisted Home with universal source + per-section overrides
- [x] Reader modes (webtoon / vertical / ltr / rtl); white-screen overlay fixed
- [x] OkHttp-backed native reader image (`fetchImage` → cached `file://`, with
      webtoon tiling) routed through the source's client
- [ ] Suspend (extension-lib 1.6) source API mirrored + called preferentially
- [ ] Search filters wired (`FilterList` ⇄ `FilterDto`)
- [ ] Per-chapter read-state on MangaDetail + real Updates feed (chapter snapshots)
- [ ] Untrusted-extension trust prompt UI (auto-trust today)

---

## Licensing (don't break this)

- Reuses Mihon/Tachiyomi code under **Apache 2.0**. Attribution + adapted-file
  list live in **NOTICE** — keep it intact and update it when you vendor more.
- "Tachiyomi"/"Mihon" are **not** used as branding. `eu.kanade.tachiyomi.*`
  package names and `tachiyomi.extension*` metadata keys exist **only** for
  functional extension compatibility.
- **No extensions or repos ship with the app.** Users supply their own. Keep it
  a neutral engine.
- Honor the extension **NSFW flag**.
