# Building & Running Kagari

Kagari is a React Native (UI) app with a native Kotlin extension engine that
loads Tachiyomi/Mihon-compatible extension APKs.

> **Extensions only.** There is no demo/mock data. A successful run shows empty
> states until you add a repo and install an extension; all content comes from
> real installed sources. Running the app therefore requires the native Android
> build (the `ManhwaEngine` module); a JS-only run degrades to empty states.

## Prerequisites

1. **JDK 17** (required by React Native 0.86 / AGP)
   - macOS: `brew install --cask zulu@17` (or Temurin 17)
   - Verify: `java -version` shows `17.x`
   - Set `JAVA_HOME`, e.g. in `~/.zshrc`:
     ```sh
     export JAVA_HOME=$(/usr/libexec/java_home -v 17)
     ```

2. **Android SDK** (via Android Studio, or command-line tools)
   - In SDK Manager install:
     - Android SDK Platform **36**
     - Android SDK Build-Tools **36.0.0**
     - Android SDK Platform-Tools (adb)
     - NDK **27.1.12297006**
   - Set env vars in `~/.zshrc`:
     ```sh
     export ANDROID_HOME=$HOME/Library/Android/sdk
     export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
     ```

3. **An emulator or device**
   - Create an AVD (API 34+ recommended), or
   - Connect a physical device with USB debugging (`adb devices`).

4. **Watchman (macOS — strongly recommended)**
   - `brew install watchman`
   - Without it, Metro can crash on startup with
     `EMFILE: too many open files, watch` because RN's fallback file watcher
     exhausts file descriptors (worse when other dev servers are running).
   - A `.watchmanconfig` is committed; it ignores `android/build`, `.gradle`,
     `.cxx`, `ios/build`. **It must never ignore `node_modules`** — Metro resolves
     dependencies from there.

## Install JS dependencies

```sh
npm install
```

Notable native dependency: **`@react-native-async-storage/async-storage`** (local
library/categories/home persistence). Adding/updating it requires a native
rebuild, not just Fast Refresh.

## Run (development)

Start Metro in one terminal (only ever **one** instance):

```sh
npm start
# if Metro behaves oddly or serves a stale bundle:
npx react-native start --reset-cache
```

Build & launch the Android app in another:

```sh
npm run android
```

On first launch the app logs which engine it resolved:

```
[engine] native Kotlin engine        # ManhwaEngine present (normal)
[engine] NO native engine (empty)    # JS-only env -> empty states
```

## Trying real extensions

1. Build & install the app on a device/emulator.
2. **Profile → Extensions & Repos → add a repo** (a Mihon-style
   `index.min.json` URL). Browse the repo's extensions and install one
   (download → `FileProvider` → system installer). Explicitly-installed
   extensions are auto-trusted.
   - Or sideload an APK directly: `adb install ext.apk`.
3. Pick the source in **Discover** (or set it per Home section in
   **Customize Home**) and start browsing/reading.

> The app ships with **no default extensions or repos** by design (see the
> licensing/content notes in `README.md`). You supply your own.

## Troubleshooting

- **Metro: `EMFILE: too many open files, watch`** → install Watchman (above).
  If Watchman wedges on first crawl, pre-warm it:
  `watchman watch-project "$(pwd)"`, then start Metro.
- **Red box "Unable to resolve @babel/runtime…"** → something is hiding
  `node_modules` from Metro (e.g. a bad `.watchmanconfig`). Never ignore
  `node_modules`.
- **`adb: device offline` / "waiting for device"** → `adb reconnect offline`
  (or `adb kill-server && adb start-server`); target `emulator-5554`.
- **Stray Gradle daemons eating FDs** → `cd android && ./gradlew --stop`.
- **A chapter/page fails to load on some sources** → known gap: the reader loads
  page URLs with RN `<Image>` rather than the source's OkHttp client, so
  scrambled/Cloudflare-gated images may not render. See "Known gaps" in
  `AGENTS.md`.

## Native engine notes

The native runtime that lets installed sources actually return data lives under
`android/app/src/main/java/eu/kanade/tachiyomi/` (vendored source-api +
`HttpSource`, `NetworkHelper` with Cloudflare/cookie/UA interceptors, Injekt DI)
and `com/manhwa/engine/` (`EngineFacade`, loaders, mappers, bridge). See
**AGENTS.md → The engine** for the full breakdown and the remaining TODOs
(OkHttp-backed reader image component; untrusted-extension trust prompt).
