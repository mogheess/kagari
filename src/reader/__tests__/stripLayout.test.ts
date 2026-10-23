import { buildReaderItems, type LoadedChapter } from '../chapterWindow';
import {
  buildStripLayout,
  hasPageShape,
  pageShape,
  pageShapeKey,
  PLACEHOLDER_RATIO,
  rememberPageShape,
  typicalShape,
} from '../stripLayout';
import type { ChapterDto } from '../../engine/types';

function chapter(n: number): ChapterDto {
  return {
    sourceId: 's',
    mangaUrl: '/m',
    url: `/m/ch-${n}`,
    name: `Chapter ${n}`,
    chapterNumber: n,
    dateUpload: 0,
  };
}

function loaded(n: number, pageCount: number): LoadedChapter {
  return {
    chapter: chapter(n),
    pages: Array.from({ length: pageCount }, (_, i) => ({ index: i })),
    offline: false,
  };
}

describe('page shapes', () => {
  test('unmeasured pages of an unmeasured series use the placeholder', () => {
    const key = pageShapeKey('s', '/unmeasured', 0);
    expect(hasPageShape(key)).toBe(false);
    expect(pageShape(key, 'fresh-series')).toBe(PLACEHOLDER_RATIO);
  });

  test('remembers a shape and reports only real changes', () => {
    const key = pageShapeKey('s', '/remember', 3);
    expect(rememberPageShape(key, 'remember', 800, 12000)).toBe(true);
    expect(pageShape(key, 'remember')).toBe(15);
    expect(rememberPageShape(key, 'remember', 800, 12000)).toBe(false);
    expect(rememberPageShape(key, 'remember', 400, 6000)).toBe(false);
    expect(rememberPageShape(key, 'remember', 800, 1000)).toBe(true);
    expect(pageShape(key, 'remember')).toBe(1.25);
  });

  test('ignores missing or empty sizes', () => {
    const key = pageShapeKey('s', '/empty', 0);
    expect(rememberPageShape(key, 'empty', undefined, 100)).toBe(false);
    expect(rememberPageShape(key, 'empty', 0, 100)).toBe(false);
    expect(rememberPageShape(key, 'empty', 100, 0)).toBe(false);
    expect(hasPageShape(key)).toBe(false);
  });

  test('a series stands in its typical shape once three pages are measured', () => {
    const series = 'typical';
    const at = (i: number) => pageShapeKey('s', '/typical', i);
    rememberPageShape(at(0), series, 1500, 1000); // a wide cover
    rememberPageShape(at(1), series, 800, 14000);
    expect(typicalShape(series)).toBe(PLACEHOLDER_RATIO);

    rememberPageShape(at(2), series, 800, 14400);
    expect(typicalShape(series)).toBe(17.5);

    rememberPageShape(at(3), series, 800, 600); // a short credits page
    // Samples now 0.67, 0.75, 17.5 and 18: the middle two average.
    expect(typicalShape(series)).toBeCloseTo((600 / 800 + 17.5) / 2);
    expect(pageShape(pageShapeKey('s', '/typical', 9), series)).toBe(typicalShape(series));
  });

  test('re-measuring a page replaces its sample instead of adding one', () => {
    const series = 'resample';
    const at = (i: number) => pageShapeKey('s', '/resample', i);
    rememberPageShape(at(0), series, 100, 100);
    rememberPageShape(at(0), series, 100, 200);
    rememberPageShape(at(0), series, 100, 300);
    expect(typicalShape(series)).toBe(PLACEHOLDER_RATIO);
  });
});

describe('buildStripLayout', () => {
  test('stacks transitions and pages without gaps', () => {
    const ordered = [chapter(1), chapter(2), chapter(3)];
    const items = buildReaderItems([loaded(2, 3)], ordered);
    rememberPageShape(pageShapeKey('s', '/m/ch-2', 1), 'stack', 100, 1000);

    const layout = buildStripLayout(items, 's', 'stack', 400, 260);

    // prev transition, three pages, next transition
    expect(layout.lengths).toEqual([260, 400 * PLACEHOLDER_RATIO, 4000, 400 * PLACEHOLDER_RATIO, 260]);
    expect(layout.offsets).toEqual([0, 260, 860, 4860, 5460]);
  });

  test('a page measured later only moves what comes after it', () => {
    const ordered = [chapter(4), chapter(5)];
    const items = buildReaderItems([loaded(4, 2), loaded(5, 2)], ordered);
    const before = buildStripLayout(items, 's', 'later', 300, 200);

    rememberPageShape(pageShapeKey('s', '/m/ch-4', 1), 'later', 300, 3000);
    const after = buildStripLayout(items, 's', 'later', 300, 200);

    const grown = 3000 - 300 * PLACEHOLDER_RATIO;
    expect(after.offsets.slice(0, 3)).toEqual(before.offsets.slice(0, 3));
    expect(after.offsets.slice(3)).toEqual(before.offsets.slice(3).map(y => y + grown));
  });
});
