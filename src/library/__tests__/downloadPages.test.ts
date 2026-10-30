/**
 * The queue downloads several pages of a chapter at once. Pins the limit, and
 * that a failure or a pause stops new pages without abandoning those in flight.
 */
import {
  enqueueDownload,
  getDownloadEntry,
  pauseDownloads,
  resumeDownloads,
  whenDownloadsHydrated,
} from '../downloads';
import type { ChapterDto, MangaDto, PageDto } from '../../engine/types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

// Each page download waits until the test settles it.
const mockInFlight: { index: number; settle: (error?: Error) => void }[] = [];
const mockEngine = {
  downloadPage: jest.fn(
    (_sourceId: string, _chapterUrl: string, page: PageDto) =>
      new Promise<string>((resolve, reject) => {
        mockInFlight.push({
          index: page.index,
          settle: error => (error ? reject(error) : resolve('file:///x')),
        });
      }),
  ),
  deleteDownloadedChapter: jest.fn(() => Promise.resolve()),
  setDownloadActivity: jest.fn(() => Promise.resolve()),
  onDownloadsPauseRequested: jest.fn(() => () => {}),
};
jest.mock('../../engine', () => ({ getEngine: () => mockEngine }));
jest.mock('../../engine/pageCache', () => ({
  loadPages: jest.fn(async () =>
    Array.from({ length: 10 }, (_, index) => ({ index, imageUrl: `https://x/${index}.jpg` })),
  ),
}));

const manga: MangaDto = {
  sourceId: '1',
  url: '/m',
  title: 'Title',
  genres: [],
  status: 'ongoing',
  initialized: true,
};
const chapter = (n: number): ChapterDto => ({
  sourceId: '1',
  mangaUrl: '/m',
  url: `/m/${n}`,
  name: `Chapter ${n}`,
  chapterNumber: n,
  dateUpload: 0,
});

const settle = () => new Promise<void>(resolve => setImmediate(() => resolve()));
const entry = (n: number) => getDownloadEntry('1', `/m/${n}`);

/** Settles the oldest page in flight, then lets the queue react. */
async function finishOne(error?: Error): Promise<void> {
  mockInFlight.shift()?.settle(error);
  await settle();
  await settle();
}

beforeAll(() => whenDownloadsHydrated());

beforeEach(() => {
  mockInFlight.length = 0;
});

test('downloads four pages at a time until the chapter is done', async () => {
  enqueueDownload(manga, chapter(1));
  await settle();
  expect(mockInFlight.map(p => p.index)).toEqual([0, 1, 2, 3]);

  await finishOne();
  expect(mockInFlight.map(p => p.index)).toEqual([1, 2, 3, 4]);
  expect(entry(1)).toMatchObject({ status: 'downloading', downloaded: 1, pageCount: 10 });

  while (mockInFlight.length > 0) await finishOne();
  expect(entry(1)).toMatchObject({ status: 'done', downloaded: 10 });
});

test('a failed page stops new ones and fails the chapter once the rest land', async () => {
  enqueueDownload(manga, chapter(2));
  await settle();
  await finishOne(new Error('HTTP 500'));
  // The three still in flight finish; nothing new starts.
  expect(mockInFlight.map(p => p.index)).toEqual([1, 2, 3]);
  while (mockInFlight.length > 0) await finishOne();
  expect(entry(2)).toMatchObject({ status: 'error', error: 'HTTP 500' });
});

test('pausing lets the pages in flight land, then waits', async () => {
  enqueueDownload(manga, chapter(3));
  await settle();
  pauseDownloads();
  while (mockInFlight.length > 0) await finishOne();
  expect(entry(3)).toMatchObject({ status: 'queued', downloaded: 4 });

  resumeDownloads();
  await settle();
  expect(mockInFlight).toHaveLength(4);
  while (mockInFlight.length > 0) await finishOne();
  expect(entry(3)?.status).toBe('done');
});
