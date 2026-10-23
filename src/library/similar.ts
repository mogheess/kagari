/**
 * "Similar titles" for the title page.
 *
 * A source can list related titles itself (a Komikku extension hook, rarely
 * implemented); otherwise we search the same source with the title's key
 * words, the way Komikku falls back. That surfaces sequels, spin-offs and
 * same-named works, which is what readers usually mean by "more like this".
 * Plain-text searching on a genre name was the other idea, but most sources
 * only match it against titles, so it returns noise.
 *
 * Search hits must share key words with the title (see sharesKeywords), so
 * a title with no relatives on its source finds nothing rather than noise.
 * At most two searches per title, only once the section is opened. Answers are
 * cached for the session so revisiting a title costs nothing; failures aren't,
 * so a dropped connection doesn't hide the section until the app restarts.
 */
import { useCallback, useEffect, useState } from 'react';
import { getEngine } from '../engine';
import type { MangaDto, RelatedMangaDto } from '../engine/types';

const MAX_RESULTS = 20;
/** With fewer hits than this from the first query, try the single best word. */
const ENOUGH_RESULTS = 4;
/** How long one request to the source may take before it counts as failed. */
export const REQUEST_TIMEOUT_MS = 15_000;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'are', 'was', 'not',
  'you', 'your', 'his', 'her', 'its', 'our', 'their', 'who', 'how', 'why', 'what',
  'when', 'all', 'but', 'has', 'had', 'have', 'only', 'after', 'over', 'under',
  'about', 'than', 'then', 'became', 'become', 'being', 'just', 'will', 'can',
  'chapter', 'season', 'part', 'vol', 'volume', 'manga', 'manhwa', 'manhua',
  'novel', 'webtoon', 'comic', 'official', 'colored',
]);

/**
 * The words worth searching for: the main title (before a subtitle
 * separator), lower-cased, without stopwords and very short words.
 */
export function titleKeywords(title: string): string[] {
  const main = title.split(/\s*[:|~–—([]\s*|\s+-\s+/)[0] ?? title;
  const words = main
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .map(w => w.replace(/^'+|'+$/g, ''))
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  // Titles in scripts without spaces (Japanese, Chinese) come through as one
  // long "word"; that's still the right thing to search for.
  return out.length > 0 ? out : [main.trim()].filter(Boolean);
}

/** Up to two queries: the first few key words together, then the longest one alone. */
export function similarQueries(title: string): string[] {
  const words = titleKeywords(title);
  if (words.length === 0) return [];
  const phrase = words.slice(0, 4).join(' ');
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  return longest && longest !== phrase ? [phrase, longest] : [phrase];
}

/**
 * Whether a search hit is plausibly related rather than a loose word match:
 * its title must contain at least two of the key words (or the only one).
 * A title with nothing related on the source then shows no rail at all,
 * which beats a row of strangers that happen to share "the" or "end".
 */
export function sharesKeywords(candidate: string, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return false;
  const words = new Set(titleKeywords(candidate));
  const haystack = candidate.toLowerCase();
  const needed = Math.min(2, keywords.length);
  let found = 0;
  for (const k of keywords) {
    // Unspaced scripts arrive as one long "word"; match those as substrings.
    if (words.has(k) || (k.length >= 2 && !/\s/.test(k) && /\P{ASCII}/u.test(k) && haystack.includes(k))) {
      found += 1;
      if (found >= needed) return true;
    }
  }
  return false;
}

function normTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Merges search batches: titles found by more queries rank first, then by
 * first appearance. Drops the title itself (by url, or by an identical name,
 * since some sources list the same work twice).
 */
export function rankSimilar(
  self: Pick<MangaDto, 'url' | 'title'>,
  batches: readonly (readonly MangaDto[])[],
  limit = MAX_RESULTS,
): MangaDto[] {
  const selfTitle = normTitle(self.title);
  const hits = new Map<string, { manga: MangaDto; count: number; order: number }>();
  let order = 0;
  for (const batch of batches) {
    for (const manga of batch) {
      if (manga.url === self.url) continue;
      if (selfTitle && normTitle(manga.title) === selfTitle) continue;
      const hit = hits.get(manga.url);
      if (hit) hit.count += 1;
      else hits.set(manga.url, { manga, count: 1, order: order++ });
    }
  }
  return [...hits.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map(h => h.manga);
}

/**
 * - `ok`: looked; `items` may be empty when nothing related turned up.
 * - `unsupported`: the source lists nothing itself and asks apps not to search.
 * - `failed`: the source couldn't be reached or took too long.
 */
export type SimilarStatus = 'ok' | 'unsupported' | 'failed';

export interface SimilarResult {
  status: SimilarStatus;
  items: MangaDto[];
}

/** Settled answers only; see loadSimilar. */
const cache = new Map<string, SimilarResult>();
const inFlight = new Map<string, Promise<SimilarResult>>();

function keyOf(manga: Pick<MangaDto, 'sourceId' | 'url'>): string {
  return `${manga.sourceId}\u0000${manga.url}`;
}

function withTimeout<T>(task: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The source took too long to answer')),
      REQUEST_TIMEOUT_MS,
    );
    task.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** What a search turned up, and whether every request it needed got answered. */
async function findSimilar(manga: MangaDto): Promise<{ result: SimilarResult; complete: boolean }> {
  const engine = getEngine();
  let related: RelatedMangaDto;
  try {
    related = await withTimeout(
      engine.getRelatedManga(manga.sourceId, manga.url, manga.title, manga.memo),
    );
  } catch {
    return { result: { status: 'failed', items: [] }, complete: false };
  }
  if (related.mangas && related.mangas.length > 0) {
    return { result: { status: 'ok', items: rankSimilar(manga, [related.mangas]) }, complete: true };
  }
  if (!related.searchAllowed) {
    return { result: { status: 'unsupported', items: [] }, complete: true };
  }

  const keywords = titleKeywords(manga.title);
  const batches: MangaDto[][] = [];
  let failed = false;
  for (const query of similarQueries(manga.title)) {
    try {
      const page = await withTimeout(engine.search(manga.sourceId, query, 1));
      batches.push(page.manga.filter(m => sharesKeywords(m.title, keywords)));
    } catch {
      failed = true;
      break;
    }
    if (rankSimilar(manga, batches).length >= ENOUGH_RESULTS) break;
  }
  const items = rankSimilar(manga, batches);
  // Hits from a search that did answer are still worth showing when a later
  // one failed; with none at all, it's a failure the reader can retry.
  if (failed && items.length === 0) return { result: { status: 'failed', items }, complete: false };
  return { result: { status: 'ok', items }, complete: !failed };
}

/**
 * Similar titles for `manga` on its own source. Never throws. Complete
 * answers are cached for the session; failures and partial answers are not,
 * so the next try asks the source again.
 */
export function loadSimilar(manga: MangaDto): Promise<SimilarResult> {
  const key = keyOf(manga);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = findSimilar(manga).then(({ result, complete }) => {
    if (complete) cache.set(key, result);
    inFlight.delete(key);
    return result;
  });
  inFlight.set(key, task);
  return task;
}

export interface SimilarTitlesState {
  /** `idle` until asked for, then `loading` until the source answers. */
  status: 'idle' | 'loading' | SimilarStatus;
  items: MangaDto[];
  /** Asks the source again (after a failure). */
  retry: () => void;
}

/**
 * Similar titles for the title page, looked up once `active` (the section is
 * open and the chapter list has loaded, so the extra searches never compete
 * with what the user opened the page for). A cached answer shows straight
 * away even while inactive.
 */
export function useSimilarTitles(manga: MangaDto | undefined, active: boolean): SimilarTitlesState {
  const key = manga ? keyOf(manga) : '';
  const [state, setState] = useState<{ key: string; result: SimilarResult | null; loading: boolean }>(
    () => ({ key, result: manga ? cache.get(key) ?? null : null, loading: false }),
  );
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => {
    if (!manga) return;
    const hit = cache.get(key);
    if (hit) {
      setState({ key, result: hit, loading: false });
      return;
    }
    if (!active || !manga.title) return;
    let live = true;
    setState({ key, result: null, loading: true });
    loadSimilar(manga).then(result => {
      if (live) setState({ key, result, loading: false });
    });
    return () => {
      live = false;
    };
    // `manga` is keyed by `key`; its other fields don't change the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, manga?.title, attempt]);

  if (state.key !== key) return { status: 'idle', items: [], retry };
  if (state.loading) return { status: 'loading', items: [], retry };
  if (!state.result) return { status: 'idle', items: [], retry };
  return { status: state.result.status, items: state.result.items, retry };
}
