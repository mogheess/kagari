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
