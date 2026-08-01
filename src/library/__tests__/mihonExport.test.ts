/**
 * The assembly step is what's worth pinning down: a wrong backup is only
 * discovered when someone actually needs to restore it.
 */
import { buildBackupRequest } from '../mihonExport';
import { toggleFavorite, setMangaCategories } from '../favorites';
import { addCategory } from '../categories';
import { setChaptersRead, recordChapterProgress } from '../chapterProgress';
import { recordRead } from '../history';
import { primeMangaCache } from '../../engine/mangaCache';
import type { ChapterDto, MangaDto } from '../../engine/types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const SOURCE = '7';

const manga: MangaDto = {
  sourceId: SOURCE,
  url: '/manga/solo',
  title: 'Solo Leveling',
  author: 'Chugong',
  thumbnailUrl: 'https://x/cover.jpg',
  genres: [],
  status: 'ongoing',
  initialized: true,
};

function chapter(n: number): ChapterDto {
  return {
    sourceId: SOURCE,
    mangaUrl: manga.url,
    url: `/manga/solo/ch-${n}`,
    name: `Chapter ${n}`,
    chapterNumber: n,
    dateUpload: 0,
  };
}

const NOW = new Date('2026-08-01T12:00:00Z');

describe('buildBackupRequest', () => {
  test('names the file by date', () => {
    expect(buildBackupRequest(NOW).fileName).toBe('kagari-backup-2026-08-01.tachibk');
  });

  test('exports favourites with categories, read state and last-read', () => {
    const category = addCategory('Reading')!;
    toggleFavorite(manga);
    setMangaCategories(SOURCE, manga.url, [category.id]);
    primeMangaCache(SOURCE, manga.url, manga, [chapter(1), chapter(2), chapter(3)]);

    setChaptersRead(SOURCE, [chapter(1).url], true);
    recordChapterProgress(SOURCE, chapter(2).url, 4, 20);
    recordRead(manga, chapter(2));

    const { request } = buildBackupRequest(NOW);

    expect(request.categories).toContain('Reading');
    const entry = request.manga.find(m => m.url === manga.url)!;
    expect(entry.title).toBe('Solo Leveling');
    expect(entry.author).toBe('Chugong');
    expect(entry.categories).toEqual(['Reading']);
    expect(entry.lastReadChapterUrl).toBe(chapter(2).url);
    expect(entry.lastReadAt).toBeGreaterThan(0);

    // Only chapters with something to restore, and never the untouched one.
    const byUrl = Object.fromEntries(entry.chapters.map(c => [c.url, c]));
    expect(byUrl[chapter(1).url]).toMatchObject({ read: true, name: 'Chapter 1' });
    expect(byUrl[chapter(2).url]).toMatchObject({ read: false, lastPageRead: 4 });
    expect(byUrl[chapter(3).url]).toBeUndefined();
  });

  test('never attributes read state to a manga whose chapters are unknown', () => {
    const other: MangaDto = { ...manga, url: '/manga/other', title: 'Other' };
    toggleFavorite(other);
    // Deliberately not cached, and its chapter urls share the source prefix —
    // a substring guess would file these under the wrong title.
    setChaptersRead(SOURCE, ['/manga/other/ch-1'], true);

    const { request, mangaMissingChapters } = buildBackupRequest(NOW);

    const entry = request.manga.find(m => m.url === other.url)!;
    expect(entry.chapters).toEqual([]);
    expect(mangaMissingChapters).toBeGreaterThan(0);

    // and the other title's state stayed put
    const solo = request.manga.find(m => m.url === manga.url);
    expect(solo?.chapters.some(c => c.url === '/manga/other/ch-1')).toBe(false);
  });
});
