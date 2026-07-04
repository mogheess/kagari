# Contributing to Kagari

Thanks for wanting to help! Kagari is a React Native (TypeScript) manga/manhwa
reader over a native Kotlin engine that runs Tachiyomi/Mihon-compatible
extensions. This guide covers how to report issues, propose changes, and get a
pull request merged.

- **Build & run from source:** [BUILD.md](./BUILD.md)
- **Architecture & conventions (read before writing code):** [AGENTS.md](./AGENTS.md)
- **License & attribution:** [LICENSE](./LICENSE), [NOTICE](./NOTICE), [CREDITS.md](./CREDITS.md)

---

## Reporting issues

Use the issue forms on the
[New Issue page](https://github.com/mogheess/kagari/issues/new/choose) — they
ask for everything we need to reproduce a problem. A few ground rules:

1. **Search first.** Check [open issues](https://github.com/mogheess/kagari/issues)
   and the README FAQ before filing; add a 👍 or a comment to an existing issue
   instead of duplicating it.
2. **One problem per issue.** Three small issues are much easier to fix (and
   close) than one issue with three problems.
3. **Update first.** Confirm the bug still happens on the
   [latest release](https://github.com/mogheess/kagari/releases/latest).
4. **Source problems usually aren't Kagari bugs.** If one specific source fails
   (wrong chapters, broken images, Cloudflare loops) but others work, the issue
   most likely lives in that extension, which Kagari does not develop or
   maintain. Report it to wherever that extension is maintained. File it here
   only if it works in Mihon but not in Kagari — that points at our engine.
5. **Don't request sources, extensions, or repos.** Kagari ships none and never
   will; users supply their own. Issues asking us to add, host, or recommend
   sources/repos will be closed.

### What makes a great bug report

- **Exact steps to reproduce**, starting from app launch. "Reader is broken"
  can't be fixed; "open a webtoon chapter, scroll to the last page, go back —
  the chapter isn't marked read" can.
- **Expected vs. actual behavior**, in one line each.
- **Environment:** app version (Profile screen), Android version, device model,
  and the source involved (if any).
- **Evidence:** a screenshot or screen recording for visual bugs; for crashes,
  a logcat capture if you can get one:

  ```sh
  adb logcat -d > kagari-log.txt   # after reproducing the crash
  ```

## Suggesting features

Open a feature request issue. Describe the **problem** you're trying to solve,
not only the solution you have in mind — there may be a simpler design that
fits the existing app. Mockups and examples from other readers (e.g. Mihon)
help a lot. Note that anything requiring bundled content or default sources is
out of scope by design.

---

## Contributing code

### Setup

Follow [BUILD.md](./BUILD.md) (JDK 17, Android SDK, Watchman on macOS). In
short:

```sh
npm install
npm start          # Metro — only ever ONE instance
npm run android    # build + launch on a device/emulator
```

With no extensions installed the app shows empty states; add a repo and install
an extension (Profile → Extensions & Repos) to test with real content.

### Before you start

- **Read [AGENTS.md](./AGENTS.md).** It documents the architecture, the
  conventions, and a long list of gotchas that were paid for the hard way.
- For anything non-trivial, **open an issue first** to discuss the approach —
  it avoids wasted work on a design that won't be merged.

### Conventions that will come up in review

These are the short versions; AGENTS.md has the full list.

- **TypeScript strict, no `any`.** Use the DTO types in `src/engine/types.ts`.
- **Theme everything.** No hardcoded colors; pull from `useTheme()` and add
  tokens to `src/theme/tokens.ts` when needed.
- **Engine access only via `getEngine()`** — never import `nativeEngine`
  directly from UI code.
- **DTO changes are two-sided.** Editing `src/engine/types.ts` usually means
  editing `android/.../engine/dto/Dtos.kt` (and the mappers) to match.
- **Persisted state goes through a store** (`src/store`, `src/library`) exposed
  with `useSyncExternalStore` — no inline `AsyncStorage` calls in screens. New
  stores must hydrate **merge-safely** (see `favorites.ts`).
- **Comments explain *why*, not *what*.** No narration comments.
- **Empty states are required** for zero-content screens, routing the user to
  Extensions.
- **Icons** are inline SVG in `src/components/Icon.tsx`; add a case rather than
  pulling in an icon font.

### Checks

Run these before pushing — they're the review baseline:

```sh
npx tsc --noEmit    # type-check (must be clean)
npm run lint        # eslint (no errors; don't add new warnings)
npm test            # jest
```

JS-only changes hot-reload via Metro; **Kotlin/Gradle changes need a full
`npm run android` rebuild.**

### Pull requests

- Branch from `main`, using the existing naming style: `fix/…`, `feat/…`,
  `release/…`.
- Keep PRs focused; unrelated refactors belong in their own PR.
- Describe **what** changed and **why**, and include how you tested it on a
  device or emulator. Screenshots/recordings for UI changes.
- For user-facing changes, bump `src/app/version.ts` **and**
  `android/app/build.gradle` together and add a `CHANGELOG` entry in
  `src/app/changelog.ts` (newest-first) — maintainers can also handle this at
  release time, so ask if unsure.

### Licensing rules (don't break these)

- Kagari adapts Mihon/Tachiyomi code under **Apache 2.0**. If you vendor more
  of it, update [NOTICE](./NOTICE) with the adapted files.
- "Tachiyomi"/"Mihon" must never appear as Kagari branding; the
  `eu.kanade.tachiyomi.*` package names exist only for extension compatibility.
- **Never bundle or default to any extension, repo, or content source.** Kagari
  stays a neutral engine; users supply their own sources.
- Honor the extension **NSFW flag**.

---

## Questions?

Open an issue with the question label, or start from the README's
[FAQ](./README.md#faq). Thanks for contributing!
