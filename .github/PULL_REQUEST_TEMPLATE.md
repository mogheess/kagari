<!-- Thanks for contributing! See CONTRIBUTING.md for conventions and AGENTS.md
     for architecture. Keep the PR focused on one change. -->

## What & why

<!-- What does this PR change, and what problem does it solve?
     Link the issue it closes, e.g. "Closes #12". -->

## How it was tested

<!-- Device/emulator + Android version, and what you exercised manually.
     Screenshots or a recording for UI changes. -->

## Checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes (no new warnings)
- [ ] Tested on a device or emulator
- [ ] UI follows the theme tokens (no hardcoded colors) and handles empty states
- [ ] DTO changes (if any) updated both `src/engine/types.ts` and `Dtos.kt`
- [ ] User-facing change: version bump + `CHANGELOG` entry (or noted for release time)
