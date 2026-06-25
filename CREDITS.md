# Credits & acknowledgments

Kagari builds on a lot of open-source work. This file lists the main projects it
depends on or adapts. For the precise, legally required attributions of adapted
source files, see **[NOTICE](./NOTICE)**; the project license is
**[Apache 2.0](./LICENSE)**.

## Source compatibility

- **[Mihon](https://github.com/mihonapp/mihon)** and the
  **[Tachiyomi](https://github.com/tachiyomiorg)** project it grew from. Kagari
  adapts parts of their Apache-2.0 source-API, networking, and extension-loading
  code so community sources can run (the adapted files are listed in
  [NOTICE](./NOTICE)). Kagari is **not** affiliated with or endorsed by these
  projects and does not use their names or logos as its own branding.
- The **[Keiyoushi](https://github.com/keiyoushi)** project, which maintains the
  community `extensions-lib` API and many of the sources readers use. Kagari
  keeps its source interface compatible with that Apache-2.0 API so those
  extensions can run, but **ships none of them** (you add the repositories and
  sources you choose) and is **not affiliated with or endorsed by** Keiyoushi or
  any source repository.

## Core open-source libraries

Kagari's native engine and UI build on, among others:

- **[React Native](https://reactnative.dev/)**: the cross-platform UI runtime.
- **[OkHttp](https://square.github.io/okhttp/)**: HTTP client for source
  networking.
- **[Jsoup](https://jsoup.org/)**: HTML parsing for sources.
- **Injekt-style DI** and **[RxJava](https://github.com/ReactiveX/RxJava)**
  interop, required by the source-API surface.
- **[kotlinx.serialization](https://github.com/Kotlin/kotlinx.serialization)**
  and **[Kotlin coroutines](https://github.com/Kotlin/kotlinx.coroutines)**.
- The React Native ecosystem packages used across the app (navigation,
  safe-area, gesture handling, blur, SVG, async storage, and more); see
  `package.json` for the full list.

Each of these is distributed under its own license; this list is gratitude, not
a substitute for those licenses.

## Artwork & content

All cover art, titles, and chapters shown in Kagari belong to their respective
creators and publishers and are served from the sources a user installs. Kagari
bundles no such content.

---

If you believe something here should be credited differently, or an attribution
is missing, please open an issue; corrections are welcome.
