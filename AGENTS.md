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

---

## Architecture in one screen

```
React Native UI (TypeScript)
        │  getEngine()  -> Engine interface (src/engine/types.ts)
        ▼
 ┌──────────────────────────┐      ┌──────────────────────────────┐
 │ mockEngine.ts ("Demo")   │  OR  │ nativeEngine.ts -> ManhwaEngine│
 │ pure-JS sample data      │      │ (Kotlin RN bridge module)      │
 └──────────────────────────┘      └───────────────┬───────────────┘
                                                    ▼
                                   EngineFacade (Kotlin)
                                   ExtensionLoader + SignatureTrust
                                   RepoManager + ApkInstaller
                                                    ▼
                          Vendored Tachiyomi source-api (Apache 2.0)
                                                    ▼
                                   Extension APKs (user-supplied)
```

- **One DTO contract.** `src/engine/types.ts` (TS) mirrors
  `android/.../engine/dto/Dtos.kt` (Kotlin). Everything crossing the bridge is a
  JSON-serializable DTO. Manga identity is always `(sourceId, url)`.
- **Two engines, one interface.** Both `mockEngine` and `nativeEngine` implement
  the `Engine` interface. The UI never imports an engine directly — always go
  through `getEngine()` from `src/engine/index.ts`.
- **Image bytes never cross the bridge.** The reader gets a URL + headers from
  `resolveImage`; the native build loads them through the source's OkHttp client.

---

## Engine modes (important)

There are two runtime modes, selectable in **Profile → Data source**:

| Mode | `getEngine()` returns | Use it for |
| --- | --- | --- |
| **Demo** (`mock`) | `mockEngine` | Full, working UX with sample content. Repos/Browse/Install all *visibly* work; installed sources show content in Discover/Home. |
| **Extensions** (`native`) | `nativeEngine` | Real repos + real APK installs. Repo add/remove and APK install/uninstall are wired; **running** installed sources is not finished yet (see Status). |

- Default mode is **`mock`** (`src/engine/index.ts`) so the app is never blank
  on first launch.
- Switching modes remounts the navigator via an `epoch` counter
  (`EngineModeProvider` + `NavigatorWithEngineRemount` in `App.tsx`). If you add
  state that must reset on mode change, hang it off that remount.
- `nativeEngine.ts` is **defensive**: it checks `typeof Native.method ==='function'`
  before calling, so an out-of-date native build degrades gracefully instead of
  throwing `undefined is not a function`. Keep new native methods guarded the
  same way.

---

## Project layout

```
src/
  engine/        Engine contract (types.ts), mockEngine, nativeEngine,
                 repoClient (fetch/parse real index.min.json), index (selector),
                 EngineModeProvider
  theme/         Design tokens (tokens.ts) + ThemeProvider (dark/light/system)
  home/          Configurable home-block model (HomeConfig)
  components/    Cover, FeaturedHero, CoverRail, SectionHeader, Icon, Skeleton,
                 HomeBlockView, ...
  navigation/    RootNavigator, TabsScreen (local-state tabs), GlassTabBar, types
  screens/       Home, Library, Discover, Updates, Profile, MangaDetail, Reader,
                 CustomizeHome, Extensions
android/app/src/main/java/
  eu/kanade/tachiyomi/source/   Vendored source-api (Apache 2.0 — see NOTICE)
  com/manhwa/engine/            loader/, repo/, bridge/, dto/, facade, mappers
```

---

## Conventions

- **Theme everything.** No hardcoded colors in screens/components. Pull from
  `useTheme()` (`theme.colors.*`, `theme.spacing.*`, `theme.typography.*`). The
  signature accent is **teal** (`#19B79E` dark / `#0C8E79` light) — *not* purple.
  If you need a color, add/use a token in `src/theme/tokens.ts`.
- **TypeScript strict, no `any`.** Use the DTO types in `src/engine/types.ts`.
- **Engine access only via `getEngine()`.** Don't import `mockEngine` /
  `nativeEngine` from UI code.
- **DTO changes are two-sided.** Editing `types.ts` usually means editing
  `Dtos.kt` (and the mappers) to match. Keep field names identical.
- **Icons** are inline SVG in `src/components/Icon.tsx`. Add a new `case` to the
  union + switch rather than pulling an icon font.
- **Comments** explain *why*, not *what*. No narration comments.
- **Lists that change on action need `extraData`.** `FlatList` rows are memoized;
  if a row's appearance depends on external state (e.g. install status), pass
  that state via `extraData` or rows won't re-render. (This bit us on the
  Extensions Browse list.)
- **Empty states are required.** When a screen can have zero content (no sources
  installed), render a friendly prompt that routes to **Extensions**, not a blank
  view. See `HomeScreen` `HomeEmptyState` and `DiscoverScreen` `ListEmptyComponent`.

---

## Running

```sh
npm install
npm start                         # Metro (ONE instance only — see gotchas)
npm run android                   # build + launch (needs Android SDK + JDK 17)
```

The UI runs immediately on the Demo engine. Real extensions need the Android
toolchain — see **BUILD.md** for SDK/JDK setup.

### Gotchas (learned the hard way)

- **Only ever run ONE Metro instance.** Multiple Metro servers serve stale
  bundles and cause phantom `undefined is not a function` crashes after Fast
  Refresh. If things get weird: kill all node/Metro, then
  `npm start --reset-cache` once.
- **adb flakiness:** if you see "waiting for device", run
  `adb kill-server && adb start-server` and target the emulator explicitly
  (e.g. `emulator-5554`).
- **Native changes need a real rebuild** (`npm run android`), not just Fast
  Refresh. JS-only changes hot-reload.
- After installing an extension in **native** mode, the OS install dialog is
  async — the source won't appear until the install completes (and until the
  runtime gap below is closed).

---

## Native extension support — current reality

Installing an APK works (download → `FileProvider` → system installer). **Running**
an installed extension to fetch real manga does **not** work yet: the vendored
`eu.kanade.tachiyomi.source.*` library is a minimal subset. Real extensions
compile against more of the runtime than we currently provide.

To make installed sources actually return data, the remaining work is:

- Port the full **`HttpSource`** (request builders, page/image fetch, rate limit).
- Provide the runtime extensions expect: **Injekt** DI, network helpers,
  `ConfigurableSource`, and the complete **`FilterList`** model + serialization.
- Add a **native image component** that loads page images through the source's
  OkHttpClient (URL + headers from `resolveImage`).
- Wire the **untrusted-extension** prompt to `trustSignature`.

Until then, use **Demo mode** to exercise the full UX.

---

## Status

- [x] Premium RN UI (all core screens), teal theme, glass nav
- [x] Mock + native engines behind one interface; safe mode switching
- [x] Repo management (add/remove), real `index.min.json` parsing
- [x] Extensions screen: Browse (search + language filter) + Installed tabs
- [x] APK install/uninstall (FileProvider + system installer) in native mode
- [x] Empty states on Home + Discover routing to Extensions
- [ ] Full `HttpSource` + `FilterList` so installed sources return real data
- [ ] OkHttp-backed native reader image component
- [ ] Untrusted-extension trust prompt UI

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
