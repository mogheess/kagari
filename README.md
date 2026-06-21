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
- **Reader image loading is the one remaining gap** — see Status. The reader
  currently renders page URLs with `<Image>` instead of fetching through the
  source's OkHttp client, so scrambled/Cloudflare sources may not render.

## Features

- **Home** — configurable, reorderable blocks (featured / popular / latest /
  recommended) plus a "Continue" rail showing your library. Each browse block
  pulls from a source you pick in **Customize Home**; sensible default is
  English & non-NSFW. Layout + source choices persist.
- **Discover** — grouped, searchable source picker (language + NSFW tags),
  debounced search, typed error/empty states.
- **Library** — your favorites, with **categories**: create/rename/delete, filter
  by category, and assign manga from their detail page. Persisted, reactive.
- **Reader** — four modes: webtoon long-strip, vertical paged, left-to-right,
  right-to-left.

## Project layout

```
src/
  engine/        # Engine contract + native impl + selector (no mock)
  store/         # AsyncStorage wrapper (persist.ts)
  library/       # favorites.ts, categories.ts (persisted, reactive)
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
- [x] Configurable + persisted Home with per-section source picker
- [x] Reader modes (webtoon / vertical / ltr / rtl)
- [ ] Native reader image loading via the source's OkHttp client (scrambled /
      Cloudflare-gated pages)
- [ ] Untrusted-extension trust prompt UI
```
