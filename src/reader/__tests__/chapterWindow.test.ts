import {
  buildReaderItems,
  indexOfPage,
  insertChapter,
  MAX_LOADED_CHAPTERS,
  neighboursOf,
  toReadingOrder,
  type LoadedChapter,
} from '../chapterWindow';
import type { ChapterDto } from '../../engine/types';

function chapter(n: number, chapterNumber = n): ChapterDto {
  return {
    sourceId: '1',
    mangaUrl: '/m',
    url: `/m/ch-${n}`,
    name: `Chapter ${n}`,
    chapterNumber,
    dateUpload: 0,
  };
}

function loaded(n: number, pages: number): LoadedChapter {
  return {
    chapter: chapter(n),
    pages: Array.from({ length: pages }, (_, i) => ({ index: i })),
    offline: false,
  };
}

describe('toReadingOrder', () => {
  test('sorts by chapter number when the source provides one', () => {
    const ordered = toReadingOrder([chapter(3), chapter(1), chapter(2)]);
    expect(ordered.map(c => c.name)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
  });

  test('reverses source order when chapter numbers are missing', () => {
    // Sources list newest-first; without numbers, reading order is the reverse.
    const ordered = toReadingOrder([chapter(3, -1), chapter(2, -1), chapter(1, -1)]);
    expect(ordered.map(c => c.name)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
  });
});

describe('buildReaderItems', () => {
  test('runs two loaded chapters together with no transition between them', () => {
    const ordered = [chapter(1), chapter(2), chapter(3)];
    const items = buildReaderItems([loaded(1, 2), loaded(2, 2)], ordered);

    expect(items.map(i => i.kind)).toEqual([
      'transition', // before chapter 1
      'page',
      'page',
      // no transition here — this is the seamless boundary
      'page',
      'page',
      'transition', // after chapter 2
    ]);
  });

  test('the leading and trailing transitions name the adjacent chapters', () => {
    const ordered = [chapter(1), chapter(2), chapter(3)];
    const items = buildReaderItems([loaded(2, 1)], ordered);

    const first = items[0];
    const last = items[items.length - 1];
    expect(first.kind === 'transition' && first.direction).toBe('prev');
    expect(first.kind === 'transition' && first.to?.name).toBe('Chapter 1');
    expect(last.kind === 'transition' && last.direction).toBe('next');
    expect(last.kind === 'transition' && last.to?.name).toBe('Chapter 3');
  });

  test('omits the neighbour at the ends of the series', () => {
    const ordered = [chapter(1)];
    const items = buildReaderItems([loaded(1, 1)], ordered);

    expect(items[0].kind === 'transition' && items[0].to).toBeUndefined();
    expect(items[2].kind === 'transition' && items[2].to).toBeUndefined();
  });

  test('pages carry their position within their own chapter', () => {
    const ordered = [chapter(1), chapter(2)];
    const items = buildReaderItems([loaded(1, 2), loaded(2, 3)], ordered);
    const pages = items.filter(i => i.kind === 'page');

    expect(pages.map(p => (p.kind === 'page' ? `${p.chapter.name}#${p.pageIndex}/${p.pageCount}` : '')))
      .toEqual([
        'Chapter 1#0/2',
        'Chapter 1#1/2',
        'Chapter 2#0/3',
        'Chapter 2#1/3',
        'Chapter 2#2/3',
      ]);
  });

  test('keys are unique across chapters', () => {
    const ordered = [chapter(1), chapter(2)];
    const items = buildReaderItems([loaded(1, 3), loaded(2, 3)], ordered);
    expect(new Set(items.map(i => i.key)).size).toBe(items.length);
  });

  test('an empty window renders nothing', () => {
    expect(buildReaderItems([], [chapter(1)])).toEqual([]);
  });
});

describe('indexOfPage', () => {
  test('finds a page in the second chapter', () => {
    const ordered = [chapter(1), chapter(2)];
    const items = buildReaderItems([loaded(1, 2), loaded(2, 2)], ordered);

    // [transition, p0, p1, p0, p1, transition]
    expect(indexOfPage(items, '/m/ch-2', 1)).toBe(4);
    expect(indexOfPage(items, '/m/ch-9', 0)).toBe(-1);
  });
});

describe('insertChapter', () => {
  test('keeps the window in reading order when prepending', () => {
    const ordered = [chapter(1), chapter(2), chapter(3)];
    const next = insertChapter([loaded(2, 1)], loaded(1, 1), ordered);

    expect(next.map(l => l.chapter.name)).toEqual(['Chapter 1', 'Chapter 2']);
  });

  test('ignores a chapter already in the window', () => {
    const ordered = [chapter(1), chapter(2)];
    const start = [loaded(1, 1)];
    expect(insertChapter(start, loaded(1, 1), ordered)).toBe(start);
  });

  test('bounds long reading sessions around the active chapter', () => {
    const ordered = Array.from({ length: 12 }, (_, i) => chapter(i + 1));
    let window: LoadedChapter[] = [];

    for (let n = 1; n <= ordered.length; n++) {
      window = insertChapter(window, loaded(n, 20), ordered, ordered[n - 1].url);
      expect(window.length).toBeLessThanOrEqual(MAX_LOADED_CHAPTERS);
    }

    expect(window.map(item => item.chapter.url)).toEqual(
      ordered.slice(-MAX_LOADED_CHAPTERS).map(item => item.url),
    );
  });
});

describe('neighboursOf', () => {
  test('reports both sides and the ends', () => {
    const ordered = [chapter(1), chapter(2), chapter(3)];
    expect(neighboursOf(ordered, '/m/ch-2').prev?.name).toBe('Chapter 1');
    expect(neighboursOf(ordered, '/m/ch-2').next?.name).toBe('Chapter 3');
    expect(neighboursOf(ordered, '/m/ch-1').prev).toBeUndefined();
    expect(neighboursOf(ordered, '/m/ch-3').next).toBeUndefined();
  });
});
