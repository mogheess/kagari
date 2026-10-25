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
    version: '0.7.1',
    date: '2026-10-25',
    highlights: [
      'Titles with chapters from more than one scan group no longer read on into another copy of the same chapter. Reading continues with the group of the chapter you opened, or a downloaded copy.',
      'Hide a scan group on a title: when its chapters come from more than one group, tap a group under Chapters to hide its chapters from the list, Resume, downloads and the reader. Kagari remembers it for that title.',
      'With a title showing only downloaded chapters, the reader keeps to downloaded chapters as you read on.',
    ],
  },
  {
    version: '0.7',
    date: '2026-10-24',
    highlights: [
      'Home is now a feed: pick up where you left off, see which titles have new chapters, and browse a rail from each of your sources instead of just one or two.',
      'New chapters are found in the background, even when Kagari is closed, and a notification tells you when they land.',
      'Downloads live with their titles. Library covers show how many chapters are downloaded, a Downloaded collection gathers them, and a title page can show only its downloaded chapters or delete them. They still read in order when you are offline or the source is gone.',
      'The download queue can be paused, and stays paused after a restart. Failed chapters say why and can be retried, and anything still waiting can be cancelled.',
      'Search filters: sources that offer genre, status, type or sort filters can now use them in Discover.',
      'Similar titles: a section on the title page finds titles like the one you are viewing. It only searches when you open it, and tells you when nothing turns up or the source fails.',
      'Reader zoom was rebuilt. Pinch follows your fingers and stays where you leave it, double-tap zooms in on that spot and double-tap again zooms out, and pinching no longer turns the page. A zoomed webtoon keeps scrolling.',
      'In the page-by-page modes, a page between chapters shows the one you finished and the one coming next.',
      'The webtoon strip keeps its place while pages load and when earlier chapters unload. The page counter moves through very tall pages, and switching reading mode stays on the same page.',
      'Previous and next chapter buttons always jump, and each reader page now loads with one request instead of two.',
      'A new look: artwork behind the main tabs, with colours to match. Ink is on by default. Pick Screentone, Neon rain, Sakura dusk or None in Profile → Theme.',
      'A glass tab bar, with a pill that slides to the tab you pick and filled icons for the active tab.',
      'Bottom sheets close with a swipe down, and the dim behind them fades instead of sliding away with them.',
      'Extensions and sources show their real icons.',
      'Safer extensions: an extension only runs when one of your repos signed it, or after you tap Trust on it in Extensions → Installed. Extensions you sideloaded wait for that tap.',
      'Extensions built with the newest keiyoushi toolchain work, and MANGA Plus no longer closes the app.',
      'After you pass a Cloudflare check in the WebView, the list reloads on its own. No need to tap Retry.',
      'Long chapter lists open and scroll faster, and the fast-scroll thumb can be dragged.',
      'Fixed taps taking seconds to register while loading placeholders were on screen, a frozen screen after closing a dialog with Esc on a keyboard, and a crash in the Home carousel.',
    ],
  },
  {
    version: '0.6.1',
    date: '2026-09-16',
    highlights: [
      'Fixed the screen flashing when pressing back on Android. The screen you had just left was drawn for one extra frame after the transition finished.',
      'Home sections no longer vanish when their source fails or is slow: they stay in place, say which source is having trouble, and offer a Retry.',
      'Extensions: one "Update all" button installs every pending update in turn, outdated extensions are listed first, and the Installed tab opens by default when updates are waiting.',
      'Covers show a shimmer while they load instead of a blank box.',
      'Smoother scrolling and transitions: the bottom bar no longer redraws the whole screen every frame for its blur effect.',
      'Storage location (Settings → Data): pick a folder and downloads and backups are saved there in Mihon\'s own layout — browsable in any file manager, kept when the app is uninstalled, and readable by Mihon from the same folder. Existing downloads can be moved over. App storage stays the default.',
      'Extensions built against the newest keiyoushi toolchain (August 2026 onward) work again. They check the app for several network components and refuse to run without them, and their parsers need a newer serialization runtime than the app shipped — every list came back empty or never finished. Kagari now provides all of it.',
      'A source that fails while parsing now shows an error with Retry instead of loading forever.',
      'Cloudflare handling follows Cloudflare\'s own challenge header, like Mihon: a plain block or rate limit fails fast instead of spending up to 40 seconds trying to solve a challenge that is not there.',
      'When Cloudflare asks for a human check, the app now says so within a second and offers to open the site in the WebView, instead of spinning for 40 seconds and reporting "didn\'t respond". An outdated Android System WebView is called out too.',
      'A newly installed extension shows up in Discover immediately instead of after a restart.',
      'Installed extensions that no longer exist in any of your repos are marked Orphaned, so it is clear why they get no updates and may stop working.',
    ],
  },
  {
    version: '0.6',
    date: '2026-08-01',
    highlights: [
      'Extensions work again. Keiyoushi moved its catalogue to a new format and left the old address serving a placeholder, which is why the list had gone empty — Kagari now reads the new one, so all 1,300+ extensions are browsable and installable again.',
      'Added support for the newer extension API, so the latest extensions (Asura Scans, MangaFire, MANGA Plus, VIZ and others) load and run instead of failing silently.',
      'Bulk downloads: grab a whole series, or only the chapters you have not read yet.',
      'Select chapters with a long press, then mark them read or unread, or queue them for download. Long-press again to extend the selection over a run of chapters.',
      'Keep reading without leaving the page: scrolling past the end of a chapter moves to the next one, and scrolling back past the start returns to the previous one.',
      'Long chapter lists get a draggable scrollbar, so a few thousand chapters is one gesture instead of a minute of swiping.',
      'The back button now steps back through tabs instead of closing the app.',
      'Fixed "next chapter" going backwards on sources that do not number their chapters.',
      'Adult-content labels are accurate again, instead of flagging most of the catalogue.',
      'New versions now announce themselves: when an update is available you get a prompt on opening the app, with that release\'s notes, once per version rather than every launch.',
      'Browse release notes any time from Settings.',
    ],
  },
  {
    version: '0.5',
    date: '2026-07-19',
    highlights: [
      'Create visual tier lists from your library, customize their rows, and export them as shareable images.',
      'Discover now shows live search feedback and offers Retry or Open in WebView when a source is blocked.',
      'Reader progress is more accurate at the end of long-strip chapters, with smoother pinch zoom and steadier tab switching.',
      'Downloaded chapters reliably open offline after a cold start, without racing local storage hydration.',
      'Long chapters and large cover grids use less memory by keeping a tighter render window.',
      'Manual update checks now stay active until a queued scan really finishes.',
      'Hardened cover loading, native module cleanup, and tier-list export memory limits to prevent stale images and avoidable crashes.',
    ],
  },
  {
    version: '0.4',
    date: '2026-06-27',
    highlights: [
      'Fixed a crash that could close the app when opening the Library on some devices.',
      'New reader page slider: drag (or tap) to jump to any page, with previous/next chapter controls.',
      'Reader opens distraction-free, tap once to reveal the top and bottom controls.',
      'Each series remembers its own reading mode (webtoon, vertical, or left/right paged).',
      'Library updates: the Updates tab tracks new chapters for the manga you follow, and titles you add show up on refresh (even completed ones) so you know they landed.',
      'Browsing a source flags titles already in your library; adding one you already follow lets you pick which copy to migrate from, or keep both.',
      'Discover keeps loading more as you scroll Popular and Latest, and remembers your last source.',
      'Cloudflare-protected sources now load inside the app, not just in the WebView.',
      'Fixed broken cover art: covers are fetched through the source and cached, so gated CDNs work.',
      'Manga page shows which source a title came from, with Resume and chapter sort (newest/oldest).',
      "Clear guidance when a source isn't installed or a load fails: Retry, open in WebView, or Migrate.",
      'Migrate a title to another source: search the source and pick the right match, carrying over your reading history.',
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
