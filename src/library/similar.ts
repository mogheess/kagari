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
 * a title with no relatives on its source shows no rail rather than noise.
 * At most two searches per title, run after the chapter list has loaded, and
 * results are cached for the session so revisiting a title costs nothing.
 */
import { useEffect, useState } from 'react';
import { getEngine } from '../engine';
import type { MangaDto } from '../engine/types';

const MAX_RESULTS = 20;
/** With fewer hits than this from the first query, try the single best word. */
const ENOUGH_RESULTS = 4;

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

const cache = new Map<string, MangaDto[]>();
const inFlight = new Map<string, Promise<MangaDto[]>>();

function keyOf(manga: Pick<MangaDto, 'sourceId' | 'url'>): string {
  return `${manga.sourceId}\u0000${manga.url}`;
}

/** Similar titles for `manga` on its own source. Never throws; empty on failure. */
export async function loadSimilar(manga: MangaDto): Promise<MangaDto[]> {
  const key = keyOf(manga);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const engine = getEngine();
    let result: MangaDto[] = [];
    try {
      const related = await engine.getRelatedManga(
        manga.sourceId,
        manga.url,
        manga.title,
        manga.memo,
      );
      if (related.mangas && related.mangas.length > 0) {
        result = rankSimilar(manga, [related.mangas]);
      } else if (related.searchAllowed) {
        const keywords = titleKeywords(manga.title);
        const batches: MangaDto[][] = [];
        for (const query of similarQueries(manga.title)) {
          const page = await engine.search(manga.sourceId, query, 1);
          batches.push(page.manga.filter(m => sharesKeywords(m.title, keywords)));
          if (rankSimilar(manga, batches).length >= ENOUGH_RESULTS) break;
        }
        result = rankSimilar(manga, batches);
      }
    } catch {
      result = [];
    }
    cache.set(key, result);
    inFlight.delete(key);
    return result;
  })();
  inFlight.set(key, task);
  return task;
}

/**
 * Similar titles for the title page. Waits for `enabled` (the chapter list
 * having loaded) so the extra searches never compete with what the user
 * opened the page for.
 */
export function useSimilarTitles(
  manga: MangaDto | undefined,
  enabled: boolean,
): { items: MangaDto[]; loading: boolean } {
  const key = manga ? keyOf(manga) : '';
  const [state, setState] = useState<{ key: string; items: MangaDto[]; loading: boolean }>(() => ({
    key,
    items: manga ? cache.get(key) ?? [] : [],
    loading: false,
  }));

  useEffect(() => {
    if (!manga || !enabled || !manga.title) return;
    const hit = cache.get(key);
    if (hit) {
      setState({ key, items: hit, loading: false });
      return;
    }
    let live = true;
    setState({ key, items: [], loading: true });
    loadSimilar(manga).then(items => {
      if (live) setState({ key, items, loading: false });
    });
    return () => {
      live = false;
    };
    // `manga` is keyed by `key`; its other fields don't change the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, manga?.title]);

  return state.key === key ? { items: state.items, loading: state.loading } : { items: [], loading: false };
}
