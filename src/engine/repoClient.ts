/**
 * Fetches and normalizes Mihon/Tachiyomi-style extension repo indexes
 * (`index.min.json`). Used by the engine to browse available extensions.
 *
 * Index entry shape (keiyoushi and compatible repos):
 *   { name, pkg, apk, lang, code, version, nsfw, sources: [{name,lang,id,baseUrl}] }
 *
 * APKs are served as siblings of the index under `apk/<apk>`.
 */
import type { AvailableExtensionDto, RepoDto } from './types';

interface RawRepoExtension {
  name: string;
  pkg: string;
  apk: string;
  lang: string;
  code: number;
  version: string;
  nsfw: number;
  sources?: { name: string; lang: string; id: string; baseUrl?: string }[];
}

/** Directory that contains the index file (and the `apk/` folder). */
function repoBaseDir(indexUrl: string): string {
  const idx = indexUrl.lastIndexOf('/');
  return idx >= 0 ? indexUrl.slice(0, idx + 1) : indexUrl;
}

export function repoNameFromUrl(url: string): string {
  const gh = url.match(/github(?:usercontent)?\.com\/([^/]+)/i);
  if (gh) return gh[1];
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function makeRepo(url: string): RepoDto {
  return { url: url.trim(), name: repoNameFromUrl(url.trim()) };
}

function cleanName(name: string): string {
  return name.replace(/^Tachiyomi:\s*/i, '').trim();
}

/** Fetches a single repo index and maps it to AvailableExtensionDto[]. */
export async function fetchRepoExtensions(
  repoUrl: string,
  isInstalled: (pkg: string) => boolean,
): Promise<AvailableExtensionDto[]> {
  const res = await fetch(repoUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Repo fetch failed (${res.status})`);
  }
  const raw = (await res.json()) as RawRepoExtension[];
  const apkDir = `${repoBaseDir(repoUrl)}apk/`;

  return raw.map<AvailableExtensionDto>(e => ({
    name: cleanName(e.name),
    pkg: e.pkg,
    apk: e.apk,
    apkUrl: `${apkDir}${e.apk}`,
    lang: e.lang,
    versionName: e.version,
    versionCode: e.code,
    isNsfw: e.nsfw === 1,
    sources: e.sources ?? [],
    repoUrl,
    installed: isInstalled(e.pkg),
  }));
}

/** Fetches and concatenates extensions from many repos (errors per-repo ignored). */
export async function fetchAllRepos(
  repos: RepoDto[],
  isInstalled: (pkg: string) => boolean,
): Promise<AvailableExtensionDto[]> {
  const results = await Promise.allSettled(
    repos.map(r => fetchRepoExtensions(r.url, isInstalled)),
  );
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}
