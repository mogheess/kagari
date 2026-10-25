import {
  buildReaderItems,
  indexOfPage,
  insertChapter,
  MAX_LOADED_CHAPTERS,
  neighboursOf,
  skipDuplicateChapters,
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

/** A chapter from one scan group; the url tells copies of a number apart. */
function scanned(chapterNumber: number, scanlator: string): ChapterDto {
  return {
    ...chapter(chapterNumber),
    url: `/m/${scanlator}/ch-${chapterNumber}`,
    name: `Ch. ${chapterNumber}`,
    scanlator,
  };
}

describe('skipDuplicateChapters', () => {
  const urls = (list: ChapterDto[]) => list.map(c => c.url);
  // Newest first, as sources list them, with two groups.
  const listed = [
    scanned(21, 'official'),
    scanned(21, 'unofficial'),
    scanned(20.5, 'unofficial'),
    scanned(20, 'official'),
    scanned(20, 'unofficial'),
    scanned(19, 'official'),
    scanned(19, 'unofficial'),
  ];

  test("reads on through the opened chapter's group", () => {
    const opened = scanned(20, 'official');
    const ordered = skipDuplicateChapters(toReadingOrder(listed), opened);
    expect(urls(ordered)).toEqual([
      '/m/official/ch-19',
      '/m/official/ch-20',
      '/m/unofficial/ch-20.5',
      '/m/official/ch-21',
    ]);
    expect(neighboursOf(ordered, opened.url).next?.url).toBe('/m/unofficial/ch-20.5');
  });

  test('keeps the opened chapter even when another copy is downloaded', () => {
    const opened = scanned(20, 'unofficial');
    const downloaded = (c: ChapterDto) => c.url === '/m/official/ch-20';
    const ordered = skipDuplicateChapters(toReadingOrder(listed), opened, downloaded);
    expect(urls(ordered)).toContain('/m/unofficial/ch-20');
    expect(urls(ordered)).not.toContain('/m/official/ch-20');
  });

  test("prefers a downloaded copy when the group has none", () => {
    const list = [scanned(2, 'b'), scanned(2, 'c'), scanned(1, 'a')];
    const downloaded = (c: ChapterDto) => c.url === '/m/c/ch-2';
    const ordered = skipDuplicateChapters(toReadingOrder(list), scanned(1, 'a'), downloaded);
    expect(urls(ordered)).toEqual(['/m/a/ch-1', '/m/c/ch-2']);
  });

  test('otherwise keeps the first copy the source listed', () => {
    const list = [scanned(2, 'b'), scanned(2, 'c'), scanned(1, 'a')];
    const ordered = skipDuplicateChapters(toReadingOrder(list), scanned(1, 'a'));
    expect(urls(ordered)).toEqual(['/m/a/ch-1', '/m/b/ch-2']);
  });

  test('treats blank and zero-width group names as no group', () => {
    const list = [scanned(2, '\u200B'), scanned(2, 'x'), scanned(1, ' ')];
    const ordered = skipDuplicateChapters(toReadingOrder(list), list[2]);
    expect(ordered.map(c => c.scanlator)).toEqual([' ', '\u200B']);
  });

  test('keeps every chapter without a number', () => {
    const list = [chapter(3, -1), chapter(2, -1), chapter(1, -1)];
    expect(skipDuplicateChapters(toReadingOrder(list), list[2])).toHaveLength(3);
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

  test('with keepEarlier, reading forward never drops an earlier chapter', () => {
    const ordered = Array.from({ length: 12 }, (_, i) => chapter(i + 1));
    const add = (w: LoadedChapter[], n: number, active: number) =>
      insertChapter(w, loaded(n, 20), ordered, ordered[active - 1].url, MAX_LOADED_CHAPTERS, true);
    let window: LoadedChapter[] = [];

    // Reading forward: open chapter n, then its next one is preloaded.
    for (let n = 1; n <= 8; n++) {
      window = add(window, n, n);
      window = add(window, n + 1, n);
    }

    expect(window.map(item => item.chapter.name)).toEqual(ordered.slice(0, 9).map(c => c.name));
  });

  test('with keepEarlier, chapters after the active one are trimmed, keeping the next', () => {
    const ordered = Array.from({ length: 10 }, (_, i) => chapter(i + 1));
    const add = (w: LoadedChapter[], n: number) =>
      insertChapter(w, loaded(n, 5), ordered, ordered[5].url, MAX_LOADED_CHAPTERS, true);
    // Active is chapter 6 with five earlier chapters loaded; two later ones arrive.
    let window = [1, 2, 3, 4, 5, 6].map(n => loaded(n, 5));
    window = add(window, 7);
    window = add(window, 8);

    expect(window.map(item => item.chapter.name)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map(n => `Chapter ${n}`),
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

describe('buildReaderItems with transitionsBetween', () => {
  test('puts a ready transition between loaded chapters, keyed like the window end', () => {
    const ordered = [chapter(1), chapter(2), chapter(3)];
    const one = buildReaderItems([loaded(1, 2)], ordered, { transitionsBetween: true });
    const two = buildReaderItems([loaded(1, 2), loaded(2, 1)], ordered, {
      transitionsBetween: true,
    });

    expect(two.map(i => i.key)).toEqual([
      'prev:/m/ch-1',
      '/m/ch-1:0',
      '/m/ch-1:1',
      'next:/m/ch-1',
      '/m/ch-2:0',
      'next:/m/ch-2',
    ]);
    const between = two[3];
    expect(between.kind === 'transition' && between.ready).toBe(true);
    // Before chapter 2 loaded, the same key ended the window.
    expect(one[one.length - 1].key).toBe('next:/m/ch-1');
  });

  test('webtoon keeps chapters back to back', () => {
    const ordered = [chapter(1), chapter(2)];
    const items = buildReaderItems([loaded(1, 1), loaded(2, 1)], ordered);
    expect(items.filter(i => i.kind === 'transition')).toHaveLength(2);
  });
});
