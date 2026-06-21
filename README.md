# Kagari

> _Kagari_ (篝) — a watchfire; the light you read by after dark.

A modern, custom manga/manhwa reader for Android with a premium UI and support
for **Tachiyomi/Mihon-compatible extensions**. Not a Mihon fork — a fresh app
that reuses the (Apache 2.0) extension *engine* concepts while building an
entirely new, configurable UI.

> The launcher label is **Kagari**. The internal RN component id and Android
> package (`com.manhwa`) are kept as-is for build stability; rename before a
> public release if desired.

- **UI:** React Native + TypeScript (premium dark/light, cinematic covers,
  Notion-style configurable home, frosted-glass navigation, spring motion).
- **Engine:** native Kotlin module that loads extension APKs via Android package
  APIs + a `PathClassLoader`, exposing a Tachiyomi-style source API.

## Design direction

Cinematic cover art (Apple Music) + calm restrained chrome (Linear) + modular
configurable home blocks (Notion) + frosted-glass floating nav, in both light
and dark. See `assets/` for the locked mockups.

## Architecture

```
React Native UI (TypeScript)
        │  getEngine()  -> Engine interface (src/engine/types.ts)
        ▼
 ┌──────────────────────────┐      ┌──────────────────────────────┐
 │ mockEngine.ts (dev)      │  OR  │ nativeEngine.ts -> ManhwaEngine│
 │ pure-JS sample data      │      │ (Kotlin TurboModule/bridge)    │
 └──────────────────────────┘      └───────────────┬───────────────┘
                                                    ▼
                                   EngineFacade (Kotlin, suspend API)
                                                    ▼
                                   ExtensionLoader + SignatureTrust
                                                    ▼
                          Vendored Tachiyomi source-api (Apache 2.0)
                          + runtime libs: OkHttp · Jsoup · RxJava ·
                            kotlinx.serialization · coroutines
                                                    ▼
                                   Extension APKs (user-supplied)
```

Key design choices:

- **One JSON-like DTO contract** (`src/engine/types.ts` ↔ `engine/dto/Dtos.kt`).
  Identity is always `(sourceId, url)`, mirroring Tachiyomi.
- **Engine selection is automatic**: native if the `ManhwaEngine` module is
  present, otherwise the mock — so the UI is always runnable.
- **Image bytes never cross the bridge.** The reader gets URL + headers from
  `resolveImage` and (in the native build) loads through the source's OkHttp
  client. This is the key to a smooth reader over a bridge.
- **Vendored source-api stays under `eu.kanade.tachiyomi.source.*`** because
  extension APKs are compiled against those exact class names and resolve them
  from the host at runtime.

## Project layout

```
src/
  engine/        # Engine contract, mock + native impls, selector
  theme/         # Design tokens + ThemeProvider (dark/light)
  home/          # Configurable home-block model (Notion-style)
  components/    # Cover, FeaturedHero, GlassTabBar bits, Icon, Skeleton, ...
  navigation/    # Root stack + tabs + glass tab bar
  screens/       # Home, Library, Discover, Updates, Profile,
                 # MangaDetail, Reader, CustomizeHome, Extensions
android/app/src/main/java/
  eu/kanade/tachiyomi/source/   # Vendored source-api (Apache 2.0, see NOTICE)
  com/manhwa/engine/            # Loader, trust, facade, mappers, RN bridge
```

## Running

The UI runs immediately on the **mock engine**. To load real extensions you
need the Android toolchain. See **[BUILD.md](./BUILD.md)** for full setup
(JDK 17, Android SDK) and run instructions.

```sh
npm install
npm start          # Metro
npm run android    # build + launch (needs Android SDK)
```

## Licensing & content

- This project reuses Mihon/Tachiyomi code under **Apache 2.0**. Attribution and
  the list of adapted files are in **[NOTICE](./NOTICE)**. Keep it intact.
- **"Tachiyomi"/"Mihon" trademarks are not used** as branding here. Metadata keys
  (`tachiyomi.extension*`) and `eu.kanade.tachiyomi.*` package names are used
  only for functional extension compatibility.
- **No extensions or repositories ship with the app.** It is a neutral engine;
  users supply their own repo URLs / APKs. This keeps the app a general-purpose
  tool rather than a distributor of third-party content.
- The app honors the extension **NSFW flag**.
- Google Play prohibits this category; plan for direct APK / your own repo
  distribution.

> This is not legal advice. For a shipping product, have a lawyer review the
> content and distribution model.

## Status

- [x] Premium RN UI (all core screens) on the mock engine
- [x] Native Kotlin engine skeleton (loader, trust, facade, bridge, vendored API)
- [x] Repo management (add/remove), real index parsing, Browse/Installed UI
- [x] APK installer flow (download + `FileProvider` + system installer)
- [x] Empty states (Home / Discover) when no sources are installed
- [ ] Native reader image component (OkHttp-backed)
- [ ] Full `HttpSource` port + `FilterList` serialization (run installed sources)
```
