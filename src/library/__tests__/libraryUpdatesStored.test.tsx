// The feed loads when the module is imported, so the stored data has to live
// inside the mock factory: anything declared up here isn't initialized yet.
jest.mock('@react-native-async-storage/async-storage', () => {
  const update = (url: string, foundAt: number, kind: string) => ({
    sourceId: '1',
    mangaUrl: '/m',
    title: 'Title',
    newCount: 1,
    latestChapterName: url,
    latestChapterUrl: url,
    foundAt,
    kind,
  });
  const feed = [update('/m/2', 2, 'new'), update('/m/1', 1, 'added')];
  return {
    getItem: jest.fn(async (key: string) =>
      key === '@kagari/libraryUpdates/v1' ? JSON.stringify(feed) : null,
    ),
    setItem: jest.fn(async () => undefined),
  };
});

jest.mock('../favorites', () => ({
  getFavorites: () => [{ sourceId: '1', url: '/m', title: 'Title', categoryIds: [] }],
  subscribeFavorites: () => () => {},
  favoritesHydrated: () => true,
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLibraryUpdates, type LibraryUpdate } from '../libraryUpdates';

test('"Added to library" entries stored by older versions are dropped', async () => {
  let feed: LibraryUpdate[] = [];
  function Probe() {
    feed = useLibraryUpdates();
    return null;
  }
  await act(async () => {
    TestRenderer.create(<Probe />);
    // Loading reads three keys and then filters; let it all settle.
    for (let i = 0; i < 5; i += 1) await new Promise<void>(resolve => setImmediate(() => resolve()));
  });

  expect(feed.map(u => u.latestChapterUrl)).toEqual(['/m/2']);
  // Written back, so it's gone from storage too.
  const saved = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
    ([key]) => key === '@kagari/libraryUpdates/v1',
  );
  expect(saved.length).toBeGreaterThan(0);
  expect(JSON.parse(saved[saved.length - 1][1])).toHaveLength(1);
});
