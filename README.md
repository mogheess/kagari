# Kagari

> _Kagari_ (篝) — a watchfire; the light you read by after dark.

A modern, custom manga/manhwa reader for Android with a premium UI and support
for **Tachiyomi/Mihon-compatible extensions**. Not a Mihon fork — a fresh app
that reuses the (Apache 2.0) extension *engine* concepts while building an
entirely new, configurable UI.

> The launcher label is **Kagari**. The internal RN component id and Android
> package (`com.manhwa`) are kept as-is for build stability; rename before a
> public release if desired.

> **Extensions only — no bundled/demo content.** Everything you see comes from
> extensions you install. With none installed, the app shows empty states that
> point you to the Extensions screen.

- **UI:** React Native + TypeScript (premium dark/light, cinematic covers,
  Notion-style configurable home, frosted-glass navigation, spring motion).
- **Engine:** native Kotlin module that loads extension APKs via Android package
  APIs + a child-first `PathClassLoader`, exposing a Tachiyomi-style source API
  with a real network stack (OkHttp + Cloudflare/cookie handling, Injekt, Jsoup,
  RxJava→suspend).

## Design direction

Cinematic cover art (Apple Music) + calm restrained chrome (Linear) + modular
configurable home blocks (Notion) + frosted-glass floating nav, in both light
and dark. See `assets/` for the locked mockups.

## Architecture

```
React Native UI (TypeScript)
        │  getEngine()  -> Engine interface (src/engine/types.ts)
        ▼
 ┌──────────────────────────────────────────────┐
 │ nativeEngine.ts -> ManhwaEngine (RN bridge)    │
 │ (or a no-op "unavailable" engine -> empty UI)  │
 └───────────────────────┬──────────────────────┘
                         ▼
              EngineFacade (Kotlin, suspend API)
              ExtensionLoader + SignatureTrust + ChildFirstClassLoader
                         ▼
        Vendored Tachiyomi runtime (Apache 2.0):
        source-api · HttpSource · NetworkHelper (OkHttp +
        Cloudflare + cookies) · Injekt DI · Jsoup · RxJava1 ·
        kotlinx.serialization · coroutines
                         ▼
              Extension APKs (user-supplied)
```

Key design choices:

- **One JSON DTO contract** (`src/engine/types.ts` ↔ `engine/dto/Dtos.kt`).
  Identity is always `(sourceId, url)`, mirroring Tachiyomi. The native side
  returns JSON strings; `nativeEngine.ts` parses them into typed DTOs.
- **Extensions resolve the host's classes at runtime.** APKs are compiled
  `compileOnly` against `extensions-lib` and load `eu.kanade.tachiyomi.*` from
  the host via a child-first classloader — so the host *vendors* that runtime
  under `eu.kanade.tachiyomi.*` (those exact package names are required).
- **Local state persists** (library, categories, home layout) via AsyncStorage,
  wrapped in small reactive stores (`src/store`, `src/library`).
- **Reader images load natively.** `fetchImage` downloads each page through the
  source's OkHttp client (headers + Cloudflare cookies), caches it to a local
  `file://`, and tiles very tall webtoon images — so the bridge never carries
  image bytes. Remaining gaps (filters, suspend 1.6 API, read history) are in
  Status.

## Features

- **Home** — configurable, reorderable blocks (featured / popular / latest /
  recommended) plus a "Continue" rail showing your library. Set one **universal
  source** for the whole home screen (or override individual sections); sensible
  default is English & non-NSFW. Layout + source choices persist.
- **Discover** — **Source** mode (grouped, searchable source picker with language
  + NSFW tags, debounced search) and **Global** mode that searches your chosen
  (pinned) sources at once, one result rail per source.
- **Library** — your favorites, with **categories**: create/rename/delete, filter
  by category, and assign manga from their detail page. Persisted, reactive.
- **Updates / History** — segmented tab; **History** records the chapters you
  open (grouped by day, resume, persisted). Updates is reserved for real
  new-chapter tracking.
- **Reader** — four modes: webtoon long-strip, vertical paged, left-to-right,
  right-to-left.

## Project layout

```
src/
  engine/        # Engine contract + native impl + selector (no mock)
  store/         # AsyncStorage wrapper (persist.ts)
  library/       # favorites.ts, categories.ts, history.ts (persisted, reactive)
  sources/       # pinned.ts (pinned sources for global search)
  reader/        # readerSettings.ts (reading modes)
  theme/         # Design tokens + ThemeProvider (dark/light)
  home/          # Configurable, persisted home-block model (Notion-style)
  utils/         # lang labels, default-source selection, color
  components/    # Cover, FeaturedHero, Icon, SourcePickerSheet, CategoryAssignSheet, ...
  navigation/    # Root stack + tabs + glass tab bar
  screens/       # Home, Library, Discover, Updates, Profile, MangaDetail,
                 # Reader, CustomizeHome, Extensions, Categories
android/app/src/main/java/
  eu/kanade/tachiyomi/   # Vendored runtime: source/, network/, util/ (Apache 2.0, see NOTICE)
  com/manhwa/engine/     # Loader, trust, facade, mappers, Injekt, RN bridge
```

## Running

You need the Android toolchain (this is an extensions-only app — there is no
JS-only demo mode). See **[BUILD.md](./BUILD.md)** for full setup (JDK 17,
Android SDK, and **Watchman on macOS**).

```sh
npm install
npm start          # Metro (one instance)
npm run android    # build + launch (needs Android SDK)
```

Then add a repo + install an extension from **Profile → Extensions & Repos**.

## Licensing & content

- This project reuses Mihon/Tachiyomi code under **Apache 2.0**. Attribution and
  the list of adapted files are in **[NOTICE](./NOTICE)**. Keep it intact and
  update it when you vendor more.
- **"Tachiyomi"/"Mihon" trademarks are not used** as branding here. Metadata keys
  (`tachiyomi.extension*`) and `eu.kanade.tachiyomi.*` package names are used
  only for functional extension compatibility.
- **No extensions or repositories ship with the app.** It is a neutral engine;
  users supply their own repo URLs / APKs.
- The app honors the extension **NSFW flag**.
- Google Play prohibits this category; plan for direct APK / your own repo
  distribution.

> This is not legal advice. For a shipping product, have a lawyer review the
> content and distribution model.

## Status

- [x] Premium RN UI (all core screens), teal theme, glass nav
- [x] Extensions-only engine (mock data removed); empty states everywhere
- [x] Native runtime that **runs** installed sources: `HttpSource`,
      `NetworkHelper` + Cloudflare/cookie/UA interceptors, Injekt, `FilterList`,
      RxJava1→suspend
- [x] Repo management (add/remove), real index parsing, Browse/Installed UI
- [x] APK install/uninstall (download + `FileProvider` + system installer)
- [x] Library favorites (persisted, merge-safe) + Categories
- [x] Global search across pinned sources (per-source rails)
- [x] Reading history (persisted) in a Updates | History tab
- [x] Configurable + persisted Home with universal source + per-section overrides
- [x] Reader modes (webtoon / vertical / ltr / rtl)
- [x] Native reader image loading via the source's OkHttp client (cached
      `file://` + webtoon tiling)
- [ ] Search filters wired (`FilterList` ⇄ `FilterDto`)
- [ ] Suspend (extension-lib 1.6) source API; per-chapter read-state + Updates feed
- [ ] Untrusted-extension trust prompt UI
```
