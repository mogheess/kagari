import { queueGroups } from '../downloadQueue';
import type { DownloadEntry } from '../downloads';

let n = 0;
function entry(over: Partial<DownloadEntry>): DownloadEntry {
  n += 1;
  return {
    sourceId: 's1',
    mangaUrl: '/m',
    title: 'Title',
    chapterUrl: `/c${n}`,
    chapterName: `Chapter ${n}`,
    status: 'queued',
    pageCount: 0,
    downloaded: 0,
    createdAt: n,
    ...over,
  };
}

test('leaves finished downloads out', () => {
  const groups = queueGroups([entry({ status: 'done' }), entry({ mangaUrl: '/b', status: 'done' })]);
  expect(groups).toEqual([]);
});

test('groups by title, with waiting chapters first in queue order', () => {
  const groups = queueGroups([
    entry({ mangaUrl: '/a', title: 'A', status: 'done' }),
    entry({ mangaUrl: '/b', title: 'B', status: 'downloading' }),
    entry({ mangaUrl: '/a', title: 'A' }),
    entry({ mangaUrl: '/b', title: 'B' }),
    entry({ mangaUrl: '/c', title: 'C', status: 'error', createdAt: 50 }),
    entry({ mangaUrl: '/d', title: 'D', status: 'error', createdAt: 90 }),
    entry({ mangaUrl: '/a', title: 'A', status: 'error' }),
  ]);
  expect(groups.map(g => g.title)).toEqual(['B', 'A', 'D', 'C']);
  expect(groups[0].active.map(e => e.status)).toEqual(['downloading', 'queued']);
  expect(groups[1].active).toHaveLength(1);
  expect(groups[1].failed).toHaveLength(1);
});

test('the same url on two sources is two titles', () => {
  const groups = queueGroups([entry({ sourceId: 'x' }), entry({ sourceId: 'y' })]);
  expect(groups).toHaveLength(2);
});
