jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

const favorite = { sourceId: '1', url: '/m', title: 'Title', categoryIds: [] };
jest.mock('../favorites', () => ({
  getFavorites: () => [favorite],
  subscribeFavorites: () => () => {},
  favoritesHydrated: () => true,
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  checkLibraryUpdates,
  useLibraryUpdates,
  type LibraryUpdate,
} from '../libraryUpdates';
import { setHiddenScanlators } from '../scanlatorFilters';
import type { ChapterDto, Engine } from '../../engine/types';

function chapter(n: number, scanlator: string): ChapterDto {
  return {
    sourceId: '1',
    mangaUrl: '/m',
    url: `/m/${scanlator}/${n}`,
    name: `Ch. ${n}`,
    chapterNumber: n,
    dateUpload: n,
    scanlator,
  };
}

let listed: ChapterDto[] = [];
const engine = { getChapters: async () => listed } as unknown as Engine;

test('chapters from a group hidden on the title are not new', async () => {
  let feed: LibraryUpdate[] = [];
  function Probe() {
    feed = useLibraryUpdates();
    return null;
  }
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });

  // The first scan baselines the title silently.
  listed = [chapter(1, 'official'), chapter(1, 'unofficial')];
  await act(() => checkLibraryUpdates(engine, { force: true }));
  expect(feed).toHaveLength(0);

  // Both groups publish chapter 2; only the shown group's copy counts.
  setHiddenScanlators('1', '/m', ['official']);
  listed = [chapter(2, 'official'), chapter(2, 'unofficial'), ...listed];
  await act(() => checkLibraryUpdates(engine, { force: true }));
  expect(feed).toHaveLength(1);
  expect(feed[0]).toMatchObject({ newCount: 1, latestChapterUrl: '/m/unofficial/2' });

  // Showing the group again doesn't report its earlier chapters as new.
  setHiddenScanlators('1', '/m', []);
  await act(() => checkLibraryUpdates(engine, { force: true }));
  expect(feed).toHaveLength(1);

  act(() => renderer?.unmount());
});
