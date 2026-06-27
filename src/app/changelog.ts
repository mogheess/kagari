/**
 * Release notes shown once in the "What's new" sheet after the app updates.
 *
 * Keep this newest-first and in sync with APP_VERSION. Each entry is surfaced a
 * single time, when the installed build first reaches (or passes) that version.
 */
export interface ChangelogEntry {
  version: string;
  date?: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.4',
    date: '2026-06-27',
    highlights: [
      'Fixed a crash that could close the app when opening the Library on some devices.',
      'New reader page slider: drag (or tap) to jump to any page, with previous/next chapter controls.',
      'Reader opens distraction-free, tap once to reveal the top and bottom controls.',
      'Each series remembers its own reading mode (webtoon, vertical, or left/right paged).',
      'Library updates: the Updates tab tracks new chapters for the manga you follow, and titles you add show up on refresh so you know they landed.',
      'Browsing a source flags titles already in your library; adding one you follow on another source offers to migrate or keep both copies.',
      'Discover keeps loading more as you scroll Popular and Latest, and remembers your last source.',
      'Cloudflare-protected sources now load inside the app, not just in the WebView.',
      'Fixed broken cover art: covers are fetched through the source and cached, so gated CDNs work.',
      'Manga page shows which source a title came from, with Resume and chapter sort (newest/oldest).',
      "Clear guidance when a source isn't installed or a load fails: Retry, open in WebView, or Migrate.",
      'Migrate a title to another source and carry over your reading history.',
      'Import from Mihon (beta): restore a .tachibk backup — library, categories, and history.',
      'Smoother pinch and double-tap zoom in the reader; save a page to a separate gallery album.',
    ],
  },
  {
    version: '0.3',
    date: '2026-06-27',
    highlights: [
      'New reader page slider: drag (or tap) to jump to any page, with previous/next chapter controls.',
      'Reader opens distraction-free, tap once to reveal the top and bottom controls.',
      'Each series remembers its own reading mode (webtoon, vertical, or left/right paged).',
      'Library updates: the Updates tab tracks new chapters for the manga you follow, and titles you add show up on refresh so you know they landed.',
      'Browsing a source flags titles already in your library; adding one you follow on another source offers to migrate or keep both copies.',
      'Discover keeps loading more as you scroll Popular and Latest, and remembers your last source.',
      'Cloudflare-protected sources now load inside the app, not just in the WebView.',
      'Fixed broken cover art: covers are fetched through the source and cached, so gated CDNs work.',
      'Manga page shows which source a title came from, with Resume and chapter sort (newest/oldest).',
      "Clear guidance when a source isn't installed or a load fails: Retry, open in WebView, or Migrate.",
      'Migrate a title to another source and carry over your reading history.',
      'Import from Mihon (beta): restore a .tachibk backup — library, categories, and history.',
      'Smoother pinch and double-tap zoom in the reader; save a page to a separate gallery album.',
    ],
  },
  {
    version: '0.2',
    date: '2026-06-26',
    highlights: [
      'Swipe between tabs: slide across Library categories, Discover, and Activity.',
      'Pull to refresh on Library, Discover, and Updates.',
      'Discover now has Popular and Latest, plus single-source and global search.',
      '"See all" on the home rails opens that source in Discover.',
      'Refreshed featured spotlight and cleaner empty states.',
      'New ember accent, and a confirm step before clearing history.',
    ],
  },
  {
    version: '0.1',
    highlights: ['First beta release.'],
  },
];
