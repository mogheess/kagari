import type { SourceDto } from '../engine/types';
import { languageRank } from './lang';

/**
 * Picks a sensible default browse source. Sources that recently errored sink to
 * the bottom (so we don't keep landing on a broken one), then we prefer English
 * and non-NSFW so the app doesn't open on an adult source out of the box. When a
 * block needs "latest", only sources that support it are considered.
 */
export function pickDefaultSource(
  sources: SourceDto[],
  opts?: { needsLatest?: boolean; unhealthy?: Set<string> },
): SourceDto | undefined {
  if (sources.length === 0) return undefined;
  const candidates = opts?.needsLatest ? sources.filter(s => s.supportsLatest) : sources;
  const pool = candidates.length > 0 ? candidates : sources;
  const unhealthy = opts?.unhealthy;
  const score = (s: SourceDto) =>
    (unhealthy?.has(s.id) ? 0 : 100) + (s.lang === 'en' ? 2 : 0) + (s.isNsfw ? 0 : 1);
  return [...pool].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
}

/**
 * Ordering for source pickers: the reader's languages first (`preferred`, from
 * `usePreferredLanguages`; English alone by default), non-NSFW next, then by
 * name.
 */
export function sortSourcesForPicker(
  sources: SourceDto[],
  preferred: readonly string[] = ['en'],
): SourceDto[] {
  return [...sources].sort(
    (a, b) =>
      languageRank(a.lang, preferred) - languageRank(b.lang, preferred) ||
      Number(!b.isNsfw) - Number(!a.isNsfw) ||
      a.name.localeCompare(b.name),
  );
}
