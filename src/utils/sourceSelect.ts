import type { SourceDto } from '../engine/types';

/**
 * Picks a sensible default browse source. Prefers English and non-NSFW so the
 * app doesn't land on a broken or adult source out of the box. When a block
 * needs "latest", only sources that support it are considered.
 */
export function pickDefaultSource(
  sources: SourceDto[],
  opts?: { needsLatest?: boolean },
): SourceDto | undefined {
  if (sources.length === 0) return undefined;
  const candidates = opts?.needsLatest ? sources.filter(s => s.supportsLatest) : sources;
  const pool = candidates.length > 0 ? candidates : sources;
  const score = (s: SourceDto) => (s.lang === 'en' ? 2 : 0) + (s.isNsfw ? 0 : 1);
  return [...pool].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
}

/** Ordering for source pickers: English first, non-NSFW next, then by name. */
export function sortSourcesForPicker(sources: SourceDto[]): SourceDto[] {
  return [...sources].sort(
    (a, b) =>
      Number(b.lang === 'en') - Number(a.lang === 'en') ||
      Number(!b.isNsfw) - Number(!a.isNsfw) ||
      a.name.localeCompare(b.name),
  );
}
