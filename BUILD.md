# Building & Running Manhwa

Manhwa is a React Native (UI) app with a native Kotlin extension engine that
loads Tachiyomi/Mihon-compatible extension APKs. The app runs out of the box on
a **mock engine** (no native build required for UI work) and switches to the
**native Kotlin engine** automatically once the Android app is built and the
`ManhwaEngine` native module is present.

## Prerequisites

The current machine has **Node** but is missing the Android toolchain. Install:

1. **JDK 17** (required by React Native 0.86 / AGP)
   - macOS: `brew install --cask zulu@17` (or Temurin 17)
   - Verify: `java -version` shows `17.x`
   - Set `JAVA_HOME`, e.g. add to `~/.zshrc`:
     ```sh
     export JAVA_HOME=$(/usr/libexec/java_home -v 17)
     ```

2. **Android SDK** (via Android Studio, or command-line tools)
   - Install Android Studio, then in SDK Manager install:
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
   - Create an AVD in Android Studio (API 34+ recommended), or
   - Connect a physical device with USB debugging enabled (`adb devices`).

## Install JS dependencies

```sh
npm install
```

## Run (development)

Start Metro in one terminal:

```sh
npm start
```

Build & launch the Android app in another:

```sh
npm run android
```

On first launch the app logs which engine it is using:

```
[engine] using mock engine          # native module not built yet
[engine] using native Kotlin engine # ManhwaEngine present
```

## Engine modes

- **Mock engine** (`src/engine/mockEngine.ts`): pure JS, sample data and cover
  images. Lets you iterate on the entire UI without the Android toolchain.
- **Native engine** (`src/engine/nativeEngine.ts` -> `ManhwaEngine` Kotlin
  module): loads real extension APKs. Selected automatically when present.

## Trying real extensions (native engine)

1. Build & install the app on a device.
2. Sideload a Tachiyomi/Mihon-compatible extension APK (`adb install ext.apk`),
   or use the in-app **Install APK** flow once wired to the document picker.
3. Open **Profile -> Extensions & Repos**, then **Trust** the extension's
   signature (required before its code is loaded).
4. Browse it from **Discover**.

> The app ships with **no default extensions or repos** by design (see the
> licensing/content notes in `README.md`). You supply your own.

## Engine TODOs (native)

The native engine is a faithful skeleton. To make it production-grade:

- Implement repo index download in `ManhwaEngineModule.addRepo`.
- Implement the APK document-picker + installer in `installApk`.
- Serialize `FilterList` -> `FilterDto` in `getFilters`.
- Flesh out `HttpSource` (request builders, page/image fetch, rate limiting)
  to match Mihon's full `source-api`.
- Add a native image component that loads page images through the source's
  OkHttpClient (URL + headers from `resolveImage`) instead of `<Image>` so
  per-source headers/Cloudflare handling work in the reader.
- Wire the untrusted-extension prompt UI to `trustSignature`.
```
