jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import { downloadActivity } from '../downloadActivity';
import type { DownloadEntry, DownloadStatus } from '../downloads';

function entry(chapter: string, status: DownloadStatus, downloaded = 0, pageCount = 0): DownloadEntry {
  return {
    sourceId: '1',
    mangaUrl: '/m',
    title: 'Title',
    chapterUrl: `/m/${chapter}`,
    chapterName: `Chapter ${chapter}`,
    status,
    pageCount,
    downloaded,
    createdAt: 0,
  };
}

describe('downloadActivity', () => {
  test('nothing to keep alive when the queue is empty or done', () => {
    expect(downloadActivity([], false)).toBeNull();
    expect(downloadActivity([entry('1', 'done'), entry('2', 'error')], false)).toBeNull();
  });

  test('nothing while paused, even with chapters waiting', () => {
    expect(downloadActivity([entry('1', 'queued')], true)).toBeNull();
  });

  test('the chapter downloading now, with what is left', () => {
    const list = [entry('1', 'done'), entry('2', 'queued'), entry('3', 'downloading', 4, 20)];
    expect(downloadActivity(list, false)).toEqual({
      title: 'Title',
      chapterName: 'Chapter 3',
      downloaded: 4,
      pageCount: 20,
      remaining: 2,
    });
  });

  test('the next one up before a chapter has started', () => {
    expect(downloadActivity([entry('2', 'queued'), entry('3', 'queued')], false)?.chapterName).toBe('Chapter 2');
  });
});

describe('syncDownloadService', () => {
  const setDownloadActivity = jest.fn(async (_activity: unknown) => undefined);
  let sync: typeof import('../downloadActivity').syncDownloadService;

  beforeEach(() => {
    jest.resetModules();
    setDownloadActivity.mockClear();
    jest.doMock('../../engine', () => ({ getEngine: () => ({ setDownloadActivity }) }));
    sync = require('../downloadActivity').syncDownloadService;
  });

  const sentChapters = () =>
    setDownloadActivity.mock.calls.map(([a]) => {
      const activity = a as { chapterName: string; downloaded: number } | null;
      return activity ? `${activity.chapterName} ${activity.downloaded}` : null;
    });

  test('the first sync always goes, even with nothing to do', () => {
    sync([], false, 0);
    sync([], false, 10);
    expect(sentChapters()).toEqual([null]);
  });

  test('page progress goes at most once a second', () => {
    sync([entry('1', 'downloading', 1, 10)], false, 0);
    sync([entry('1', 'downloading', 2, 10)], false, 300);
    sync([entry('1', 'downloading', 3, 10)], false, 900);
    sync([entry('1', 'downloading', 4, 10)], false, 1000);
    expect(sentChapters()).toEqual(['Chapter 1 1', 'Chapter 1 4']);
  });

  test('a new chapter, a paused or an empty queue goes straight away', () => {
    sync([entry('1', 'downloading', 9, 10), entry('2', 'queued')], false, 0);
    sync([entry('1', 'done'), entry('2', 'downloading', 0, 5)], false, 100);
    sync([entry('2', 'downloading', 1, 5)], true, 200);
    sync([entry('2', 'done')], false, 300);
    expect(sentChapters()).toEqual(['Chapter 1 9', 'Chapter 2 0', null]);
  });
});
