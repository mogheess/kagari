import { arrangeGroups, formatBytes, groupByManga, type ArrangeOptions } from '../downloadsArrange';
import type { DownloadEntry } from '../downloads';

function entry(over: Partial<DownloadEntry>): DownloadEntry {
  return {
    sourceId: 's1',
    mangaUrl: '/m',
    title: 'Title',
    chapterUrl: `/c${Math.random()}`,
    chapterName: 'Ch',
    status: 'done',
    pageCount: 10,
    downloaded: 10,
    createdAt: 0,
    ...over,
  };
}

const entries: DownloadEntry[] = [
  // Berserk: 3 done, from source s2, oldest
  entry({ sourceId: 's2', mangaUrl: '/berserk', title: 'Berserk', createdAt: 1 }),
  entry({ sourceId: 's2', mangaUrl: '/berserk', title: 'Berserk', createdAt: 2 }),
  entry({ sourceId: 's2', mangaUrl: '/berserk', title: 'Berserk', createdAt: 3 }),
  // apothecary: one failed, newest of the finished ones
  entry({ mangaUrl: '/apo', title: 'apothecary diaries', createdAt: 9 }),
  entry({ mangaUrl: '/apo', title: 'apothecary diaries', status: 'error', createdAt: 10 }),
  // Solo Leveling: one still downloading, oldest
  entry({ mangaUrl: '/solo', title: 'Solo Leveling', status: 'downloading', createdAt: 0 }),
];

const base: ArrangeOptions = { sort: 'recent', status: 'all', sourceId: null, query: '' };
const titles = (opts: Partial<ArrangeOptions>) =>
  arrangeGroups(groupByManga(entries), { ...base, ...opts }).map(g => g.title);

test('recent keeps active downloads on top, then newest', () => {
  expect(titles({})).toEqual(['Solo Leveling', 'apothecary diaries', 'Berserk']);
});

test('title sort ignores case', () => {
  expect(titles({ sort: 'title' })).toEqual(['apothecary diaries', 'Berserk', 'Solo Leveling']);
});

test('source sort uses display names, then title', () => {
  const sourceNames = new Map([
    ['s1', 'Zeta'],
    ['s2', 'Alpha'],
  ]);
  expect(titles({ sort: 'source', sourceNames })).toEqual(['Berserk', 'apothecary diaries', 'Solo Leveling']);
});

test('chapter count sort puts the biggest first', () => {
  expect(titles({ sort: 'chapters' })[0]).toBe('Berserk');
});

test('size sort puts unknown sizes last', () => {
  const sizes = new Map([
    ['s1:/apo', 5_000],
    ['s2:/berserk', 90_000],
  ]);
  expect(titles({ sort: 'size', sizes })).toEqual(['Berserk', 'apothecary diaries', 'Solo Leveling']);
});

test('status filters', () => {
  expect(titles({ status: 'active' })).toEqual(['Solo Leveling']);
  expect(titles({ status: 'failed' })).toEqual(['apothecary diaries']);
  expect(titles({ status: 'done' })).toEqual(['Berserk']);
});

test('source filter and search combine', () => {
  expect(titles({ sourceId: 's1', query: 'LEVEL' })).toEqual(['Solo Leveling']);
  expect(titles({ sourceId: 's2', query: 'level' })).toEqual([]);
});

test('formatBytes', () => {
  expect(formatBytes(512)).toBe('512 B');
  expect(formatBytes(1536)).toBe('1.5 KB');
  expect(formatBytes(84 * 1024 * 1024)).toBe('84 MB');
  expect(formatBytes(300 * 1024 * 1024)).toBe('300 MB');
  expect(formatBytes(1.25 * 1024 ** 3)).toBe('1.3 GB');
});
