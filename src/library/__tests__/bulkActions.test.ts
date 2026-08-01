/**
 * Covers the batched bulk-action paths behind chapter selection and the
 * download sheet. Both replace per-item loops that re-serialized the whole
 * store on every chapter, so the batching (and its skip rules) is the part
 * worth pinning down.
 */
import { setChaptersRead, chapterKey, getChapterProgressSnapshot } from '../chapterProgress';
import { enqueueDownloads } from '../downloads';
import type { ChapterDto, MangaDto } from '../../engine/types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Must be `mock`-prefixed: Babel hoists jest.mock factories above every other
// binding and only allows out-of-scope references matching that prefix.
const mockEngine = {
  getPages: jest.fn(() => Promise.resolve([])),
  downloadPage: jest.fn(() => Promise.resolve('file:///x')),
  deleteDownloadedChapter: jest.fn(() => Promise.resolve()),
};
jest.mock('../../engine', () => ({ getEngine: () => mockEngine }));

const SOURCE = '42';

const manga: MangaDto = {
  sourceId: SOURCE,
  url: '/manga/x',
  title: 'X',
  genres: [],
  status: 'ongoing',
  initialized: true,
};

function chapter(n: number): ChapterDto {
  return {
    sourceId: SOURCE,
    mangaUrl: manga.url,
    url: `/manga/x/ch-${n}`,
    name: `Chapter ${n}`,
    chapterNumber: n,
    dateUpload: 0,
  };
}

describe('setChaptersRead', () => {
  test('marks a batch read and reports how many changed', () => {
    const urls = [1, 2, 3].map(n => chapter(n).url);

    expect(setChaptersRead(SOURCE, urls, true)).toBe(3);

    const progress = getChapterProgressSnapshot();
    for (const url of urls) {
      expect(progress[chapterKey(SOURCE, url)].read).toBe(true);
    }
  });

  test('re-marking already-read chapters changes nothing', () => {
    const urls = [10, 11].map(n => chapter(n).url);
    setChaptersRead(SOURCE, urls, true);

    expect(setChaptersRead(SOURCE, urls, true)).toBe(0);
  });

  test('marking unread clears the resume page so no progress hint lingers', () => {
    const url = chapter(20).url;
    setChaptersRead(SOURCE, [url], true);

    expect(setChaptersRead(SOURCE, [url], false)).toBe(1);

    const entry = getChapterProgressSnapshot()[chapterKey(SOURCE, url)];
    expect(entry.read).toBe(false);
    expect(entry.lastPage).toBe(0);
  });

  test('is scoped to one source', () => {
    const url = chapter(30).url;
    setChaptersRead(SOURCE, [url], true);

    expect(getChapterProgressSnapshot()[chapterKey('99', url)]).toBeUndefined();
  });
});

describe('enqueueDownloads', () => {
  test('queues every chapter once and reports the count', () => {
    const chapters = [101, 102, 103].map(chapter);

    expect(enqueueDownloads(manga, chapters)).toBe(3);
  });

  test('skips chapters already queued', () => {
    const chapters = [201, 202].map(chapter);
    enqueueDownloads(manga, chapters);

    expect(enqueueDownloads(manga, chapters)).toBe(0);
    expect(enqueueDownloads(manga, [...chapters, chapter(203)])).toBe(1);
  });

  test('de-duplicates within a single batch', () => {
    const dupe = chapter(301);

    expect(enqueueDownloads(manga, [dupe, dupe, chapter(302)])).toBe(2);
  });

  test('queueing nothing is a no-op', () => {
    expect(enqueueDownloads(manga, [])).toBe(0);
  });
});
