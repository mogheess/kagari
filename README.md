# Kagari

> _Kagari_ (篝): a watchfire, the light you read by after dark.

A modern manga & manhwa reader for Android. Add the sources you want, shape a
home screen that's yours, and read in a clean, fast, premium interface, light
or dark.

---

## What it is

Kagari is a **reader, not a content library**. It ships with **no manga and no
sources** of its own. Instead, you add the sources you want, and Kagari gives you
a beautiful place to browse, search, follow, download, and read them, with your
library and reading history kept entirely on your device.

If you've used a Tachiyomi/Mihon-style reader before, Kagari works with the same
kind of community sources, just wrapped in a new, more polished interface.

## Features

- **A home screen that's yours.** Reorderable blocks (Featured, Popular, Latest,
  your Library) you can arrange however you like, with one source powering the
  whole home or a different source per section.
- **Discover & search.** Browse a clean, grouped source picker, or run a global
  search across your favorite sources at once.
- **Library & categories.** Follow titles, then organize them into categories you
  create, rename, and filter.
- **A great reader.** Webtoon long-strip, vertical paged, and left-to-right or
  right-to-left modes, with pinch-to-zoom and tap-to-retry on any page that
  fails to load.
- **Downloads & offline reading.** Save chapters and read them with no
  connection.
- **History.** Picks up where you left off, with per-chapter read progress.
- **Update notifications.** Tells you when a new app version or a newer version
  of one of your installed sources is available.
- **Premium look & feel.** Cinematic cover art, frosted-glass navigation, smooth
  spring motion, and a polished dark theme by default.

## Getting started

1. **Install Kagari.** Download the latest APK from the
   [Releases page](https://github.com/mogheess/kagari/releases/latest) and open
   it on your Android device (you may need to allow installs from your browser /
   file manager).
2. **Add a source.** Open **Profile → Extensions & Repos**, add a source
   repository, and install a source you want.
3. **Read.** Head to **Discover** or **Home**, tap a title to open it, tap the
   heart to follow it, and tap a chapter to start reading.

## FAQ

**Is it on the Google Play Store?**
No. This category of app isn't permitted on Google Play, so Kagari is distributed
as a direct APK through GitHub Releases.

**Does it come with any manga?**
No. Kagari is just the reader. All content comes from sources you choose to
install; nothing is bundled.

**Does it track me or need an account?**
No account, no analytics, no tracking. Your library, categories, downloads, and
history live on your device. The app only talks to the sources you install (to
fetch what you read) and to GitHub (to check for updates).

**Is it free and open source?**
Yes. See [Credits & license](#credits--license) below.

## For developers

Kagari is a React Native (TypeScript) app over a native Android engine that runs
community sources. To build from source, see **[BUILD.md](./BUILD.md)**; for an
overview of the architecture and conventions, see **[AGENTS.md](./AGENTS.md)**.

## Credits & license

Kagari is released under the **Apache License 2.0**. To run community sources, it
adapts parts of the Mihon/Tachiyomi source-API and networking code, which is also
Apache 2.0.

- **[LICENSE](./LICENSE)**: the full Apache 2.0 license text.
- **[NOTICE](./NOTICE)**: the required attributions and the list of adapted files.
- **[CREDITS.md](./CREDITS.md)**: the wider set of open-source projects Kagari
  builds on.

Kagari does not use the "Tachiyomi" or "Mihon" names or logos as its own
branding; those references exist only so the app stays compatible with the
existing source ecosystem.

## Disclaimer

Kagari does not host, store, or distribute any manga, comics, or other content,
and it ships with no sources or repositories built in. Everything you browse and
read comes from sources **you** choose to add. The developers of Kagari have **no
affiliation** with any content provider, source, or repository reachable through
those sources, and do not endorse any of them.

You are responsible for the sources you add and the content you access through
them, including compliance with the copyright laws and regulations of your
country. Kagari is provided as-is, without warranty.
