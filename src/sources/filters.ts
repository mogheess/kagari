/**
 * Helpers for a source's search filters (`FilterDto`), kept free of React so
 * they're unit-testable. The UI edits a copy of the defaults; the native side
 * writes that state back onto the source's own filter objects.
 */
import type { FilterDto } from '../engine/types';

/** Index path into nested filters: [3] is the 4th filter, [3, 1] the 2nd inside group 3. */
export type FilterPath = readonly number[];

export function updateFilterAt(
  filters: readonly FilterDto[],
  path: FilterPath,
  update: (f: FilterDto) => FilterDto,
): FilterDto[] {
  const [head, ...rest] = path;
  return filters.map((f, i) => {
    if (i !== head) return f;
    if (rest.length === 0) return update(f);
    if (f.type !== 'group') return f;
    return { ...f, filters: updateFilterAt(f.filters, rest, update) };
  });
}

function sameState(a: FilterDto, b: FilterDto): boolean {
  if (a.type === 'group' && b.type === 'group') return countChanged(a.filters, b.filters) === 0;
  if (!('state' in a) || !('state' in b)) return true;
  return JSON.stringify(a.state) === JSON.stringify(b.state);
}

/** How many filters (counting inside groups) differ from the defaults. */
export function countChanged(current: readonly FilterDto[], defaults: readonly FilterDto[]): number {
  let n = 0;
  current.forEach((f, i) => {
    const d = defaults[i];
    if (!d || d.type !== f.type) return;
    if (f.type === 'group' && d.type === 'group') n += countChanged(f.filters, d.filters);
    else if (!sameState(f, d)) n += 1;
  });
  return n;
}

/** Cycles a tri-state filter: ignore → include → exclude → ignore. */
export function nextTriState(state: number): number {
  return (state + 1) % 3;
}
