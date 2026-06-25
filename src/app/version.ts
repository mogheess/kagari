/**
 * App version + release source of truth for the in-app update checker.
 *
 * Keep APP_VERSION / APP_VERSION_CODE in sync with
 * android/app/build.gradle (versionName / versionCode). The app is distributed
 * via GitHub Releases, so the update check compares the current version against
 * the latest published release tag.
 */
export const APP_VERSION = '0.2';
export const APP_VERSION_CODE = 2;

export const GITHUB_OWNER = 'mogheess';
export const GITHUB_REPO = 'kagari';

export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/** Splits a tag/version like "v1.2.0-beta" into numeric segments [1,2,0]. */
function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map(n => parseInt(n, 10))
    .filter(n => !Number.isNaN(n));
}

/**
 * Compares two version strings numerically, segment by segment.
 * Returns > 0 when a is newer, < 0 when a is older, 0 when equal.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}
