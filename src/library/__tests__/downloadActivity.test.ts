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
