/**
 * Fetches and normalizes Mihon/Tachiyomi-style extension repo indexes.
 *
 * Two index formats are in the wild:
 *
 *  - **index v2** (`index.pb`) — gzip-compressed protobuf, introduced by Mihon
 *    0.20.0. This is what keiyoushi serves now. See `repoIndexPb.ts`.
 *  - **legacy** (`index.min.json`) — plain JSON array. Still used by smaller
 *    third-party repos.
 *
 * keiyoushi kept the legacy path alive but replaced its contents with two
 * placeholder entries ("Outdated App", "Update to Mihon 0.20.1+"), so a client
 * that only reads JSON gets a successful response and an empty catalogue. We
 * therefore always prefer `index.pb` and fall back to JSON.
 *
 * A repo URL may point at the index directly, at a `repo.json` descriptor whose
 * `index_v2` field names the real index, or at the containing directory. All
 * three are accepted; the payload is sniffed rather than trusted by extension.
 *
 * APKs are addressed by the absolute URL carried in the index (v2) or as
 * siblings of the index under `apk/<apk>` (legacy).
 */
import { gunzipSync } from 'fflate';
import { decodeRepoExtensionListPb, decodeRepoIndexPb, ContentRating } from './repoIndexPb';
import type { PbExtension } from './repoIndexPb';
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

/** Descriptor file some repos publish alongside the index. */
interface RepoDescriptor {
  index_v2?: string;
  meta?: { name?: string; website?: string; signingKeyFingerprint?: string };
}

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/** Directory that contains the index file (and, for legacy repos, `apk/`). */
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

function basename(url: string): string {
  const path = url.split(/[?#]/)[0];
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Language of an extension, taken from the package name the way Mihon does it:
 * `eu.kanade.tachiyomi.extension.<lang>.<name>`. Falls back to the sources when
 * the package doesn't follow the convention.
 */
function langFromPkg(pkg: string, sources: { lang: string }[]): string {
  const parts = pkg.split('.');
  const marker = parts.indexOf('extension');
  if (marker >= 0 && parts.length > marker + 1) return parts[marker + 1];
  const langs = new Set(sources.map(s => s.lang));
  return langs.size === 1 ? [...langs][0] : 'all';
}

/**
 * Index URLs to try, in order, for a configured repo URL. Covers a direct
 * index URL, a `repo.json` descriptor, and a bare directory.
 */
function indexCandidates(repoUrl: string): string[] {
  const url = repoUrl.trim().replace(/[?#].*$/, '');
  const file = basename(url);

  if (file.endsWith('.pb')) return [url];
  if (file === 'repo.json') return [url];
  // Legacy JSON path: prefer the v2 index sitting next to it.
  if (file.endsWith('.json')) return [`${repoBaseDir(url)}index.pb`, url];
  // Bare repo/directory URL.
  const dir = url.endsWith('/') ? url : `${url}/`;
  return [`${dir}index.pb`, `${dir}index.min.json`];
}

/**
 * Fetches a URL as bytes.
 *
 * `Response.arrayBuffer()` needs RN's Blob module, which isn't guaranteed on
 * every build, so go through XHR (always available) and fall back to `fetch`.
 */
async function fetchBinary(url: string): Promise<Uint8Array> {
  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise<Uint8Array>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Repo fetch failed (${xhr.status})`));
          return;
        }
        resolve(new Uint8Array(xhr.response as ArrayBuffer));
      };
      xhr.onerror = () => reject(new Error('Repo fetch failed (network)'));
      xhr.send();
    });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Repo fetch failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
}

/** First non-whitespace byte, or -1 for an empty payload. */
function firstByte(bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return b;
  }
  return -1;
}

function decodeText(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return decodeURIComponent(escape(out));
}

function resolveIndexUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function fromPb(ext: PbExtension, repoUrl: string): AvailableExtensionDto {
  return {
    name: cleanName(ext.name),
    pkg: ext.pkg,
    apk: basename(ext.apkUrl),
    apkUrl: ext.apkUrl,
    lang: langFromPkg(ext.pkg, ext.sources),
    versionName: ext.versionName,
    versionCode: ext.versionCode,
    isNsfw: ext.contentRating >= ContentRating.Nsfw,
    contentRating: ext.contentRating,
    extensionLib: ext.extensionLib,
    iconUrl: ext.iconUrl,
    sources: ext.sources.map(s => ({
      name: s.name,
      lang: s.lang,
      id: s.id,
      baseUrl: s.baseUrl,
    })),
    repoUrl,
    installed: false,
  };
}

function fromLegacyJson(
  raw: RawRepoExtension,
  indexUrl: string,
  repoUrl: string,
): AvailableExtensionDto {
  return {
    name: cleanName(raw.name),
    pkg: raw.pkg,
    apk: raw.apk,
    apkUrl: `${repoBaseDir(indexUrl)}apk/${raw.apk}`,
    lang: raw.lang,
    versionName: raw.version,
    versionCode: raw.code,
    isNsfw: raw.nsfw === 1,
    contentRating: raw.nsfw === 1 ? ContentRating.Nsfw : ContentRating.Safe,
    extensionLib: raw.version.split('.').slice(0, 2).join('.'),
    sources: raw.sources ?? [],
    repoUrl,
    installed: false,
  };
}

/**
 * Loads one index URL and maps it. `repoUrl` is the URL the user configured and
 * is echoed onto every entry so repo removal still matches.
 */
async function loadIndex(
  indexUrl: string,
  repoUrl: string,
  depth = 0,
): Promise<AvailableExtensionDto[]> {
  let bytes = await fetchBinary(indexUrl);
  if (isGzip(bytes)) bytes = gunzipSync(bytes);

  const head = firstByte(bytes);
  if (head === -1) throw new Error('Repo index is empty');

  // `{` — a repo.json descriptor pointing at the real index.
  if (head === 0x7b) {
    if (depth > 2) throw new Error('Repo descriptor redirects too many times');
    const descriptor = JSON.parse(decodeText(bytes)) as RepoDescriptor;
    const next = descriptor.index_v2;
    if (!next) throw new Error('Repo descriptor has no index_v2');
    return loadIndex(resolveIndexUrl(next, indexUrl), repoUrl, depth + 1);
  }

  // `[` — legacy JSON index.
  if (head === 0x5b) {
    const raw = JSON.parse(decodeText(bytes)) as RawRepoExtension[];
    return raw.map(e => fromLegacyJson(e, indexUrl, repoUrl));
  }

  const decoded = decodeRepoIndexPb(bytes);
  if (decoded.extensionListUrl) {
    if (depth > 2) throw new Error('Repo index redirects too many times');
    let listBytes = await fetchBinary(resolveIndexUrl(decoded.extensionListUrl, indexUrl));
    if (isGzip(listBytes)) listBytes = gunzipSync(listBytes);
    return decodeRepoExtensionListPb(listBytes).map(e => fromPb(e, repoUrl));
  }
  return decoded.extensions.map(e => fromPb(e, repoUrl));
}

/** Fetches a single repo index and maps it to AvailableExtensionDto[]. */
export async function fetchRepoExtensions(
  repoUrl: string,
  isInstalled: (pkg: string) => boolean,
): Promise<AvailableExtensionDto[]> {
  const candidates = indexCandidates(repoUrl);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const extensions = await loadIndex(candidate, repoUrl);
      // A repo that resolves to nothing is more likely a stale path than a
      // genuinely empty catalogue — keep trying the remaining candidates.
      if (extensions.length === 0 && candidate !== candidates[candidates.length - 1]) {
        continue;
      }
      return extensions.map(e => ({ ...e, installed: isInstalled(e.pkg) }));
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Repo fetch failed');
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
