/**
 * Downloads live with their titles now, so two things have to be right: a
 * title's downloads can stand in for its chapter list when the source is
 * unreachable, and titles that only had downloads get adopted into the library.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const mockEngine = {
  getPages: jest.fn(() => Promise.resolve([])),
  downloadPage: jest.fn(() => Promise.resolve('file:///x')),
  deleteDownloadedChapter: jest.fn(() => Promise.resolve()),
  setDownloadActivity: jest.fn(() => Promise.resolve()),
  onDownloadsPauseRequested: jest.fn(() => () => {}),
};
jest.mock('../../engine', () => ({ getEngine: () => mockEngine }));

import { chapterNumberFromName, downloadedChapterList, type DownloadEntry } from '../downloads';
import { downloadedTitlesOutside } from '../downloadsLibrary';

let n = 0;
function entry(over: Partial<DownloadEntry>): DownloadEntry {
  n += 1;
  return {
    sourceId: 's',
    mangaUrl: '/m',
    title: 'Title',
    chapterUrl: `/c${n}`,
    chapterName: `Chapter ${n}`,
    status: 'done',
    pageCount: 10,
    downloaded: 10,
    createdAt: n,
    ...over,
  };
}

describe('chapterNumberFromName', () => {
  test.each([
    ['Chapter 152 - {Season 5 Start}', 152],
    ['Ch. 223.9 - A Laborer', 223.9],
    ['Episode 7', 7],
    ['Vol.3 Ch.12', 12],
    ['Side story 4', 4],
    ['Prologue', -1],
  ])('%s', (name, expected) => {
    expect(chapterNumberFromName(name)).toBe(expected);
  });
});

describe('downloadedChapterList', () => {
  test("only this title's finished chapters, newest first", () => {
    const list = downloadedChapterList(
      [
        entry({ chapterUrl: '/a', chapterName: 'Chapter 1', chapterNumber: 1 }),
        entry({ chapterUrl: '/b', chapterName: 'Chapter 3', chapterNumber: 3 }),
        entry({ chapterUrl: '/c', chapterName: 'Chapter 2', status: 'queued' }),
        entry({ chapterUrl: '/d', mangaUrl: '/other', chapterNumber: 9 }),
        entry({ chapterUrl: '/e', sourceId: 'other', chapterNumber: 8 }),
      ],
      's',
      '/m',
    );
    expect(list.map(c => c.url)).toEqual(['/b', '/a']);
    expect(list[0]).toMatchObject({ sourceId: 's', mangaUrl: '/m', name: 'Chapter 3' });
  });

  test('older downloads without a stored number are ordered by their names', () => {
    const list = downloadedChapterList(
      [
        entry({ chapterUrl: '/x', chapterName: 'Ch. 10' }),
        entry({ chapterUrl: '/y', chapterName: 'Chapter 11', chapterNumber: -1 }),
        entry({ chapterUrl: '/z', chapterName: 'Chapter 9.5' }),
      ],
      's',
      '/m',
    );
    expect(list.map(c => c.chapterNumber)).toEqual([11, 10, 9.5]);
  });
});

describe('downloadedTitlesOutside', () => {
  test('titles with a finished download that are not in the library, once each', () => {
    const outside = downloadedTitlesOutside(
      [
        entry({ mangaUrl: '/in', title: 'In library' }),
        entry({ mangaUrl: '/out', title: 'Only downloaded', thumbnailUrl: 'https://img' }),
        entry({ mangaUrl: '/out', title: 'Only downloaded' }),
        entry({ mangaUrl: '/queued', title: 'Still queued', status: 'queued' }),
        entry({ mangaUrl: '/failed', title: 'Failed', status: 'error' }),
      ],
      [{ sourceId: 's', url: '/in' }],
    );
    expect(outside).toHaveLength(1);
    expect(outside[0]).toMatchObject({
      sourceId: 's',
      url: '/out',
      title: 'Only downloaded',
      thumbnailUrl: 'https://img',
      categoryIds: [],
    });
  });
});
