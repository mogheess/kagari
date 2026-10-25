jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  scanlatorGroups,
  setHiddenScanlators,
  useHiddenScanlators,
  withoutHiddenScanlators,
} from '../scanlatorFilters';
import type { ChapterDto } from '../../engine/types';

function chapter(n: number, scanlator?: string): ChapterDto {
  return {
    sourceId: '1',
    mangaUrl: '/m',
    url: `/m/${scanlator ?? 'none'}/${n}`,
    name: `Ch. ${n}`,
    chapterNumber: n,
    dateUpload: 0,
    scanlator,
  };
}

const listed = [
  chapter(3, 'official'),
  chapter(3, 'unofficial'),
  chapter(2, 'official'),
  chapter(2, ' unofficial​'),
  chapter(1),
];

describe('scanlatorGroups', () => {
  test('counts chapters per cleaned group name, in source order', () => {
    expect(scanlatorGroups(listed)).toEqual([
      { name: 'official', count: 2 },
      { name: 'unofficial', count: 2 },
      { name: '', count: 1 },
    ]);
  });
});

describe('withoutHiddenScanlators', () => {
  test('takes out the hidden groups', () => {
    const left = withoutHiddenScanlators(listed, ['unofficial']);
    expect(left.map(c => c.url)).toEqual(['/m/official/3', '/m/official/2', '/m/none/1']);
  });

  test('ignores a filter that would leave nothing', () => {
    const one = [chapter(1, 'a'), chapter(2, 'a')];
    expect(withoutHiddenScanlators(one, ['a'])).toBe(one);
  });
});

describe('hidden groups store', () => {
  test('keeps a choice per title', () => {
    const seen: Record<string, readonly string[]> = {};
    function Probe({ url }: { url: string }) {
      seen[url] = useHiddenScanlators('1', url);
      return null;
    }
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <>
          <Probe url="/a" />
          <Probe url="/b" />
        </>,
      );
    });
    act(() => setHiddenScanlators('1', '/a', ['unofficial']));
    expect(seen['/a']).toEqual(['unofficial']);
    expect(seen['/b']).toEqual([]);
    act(() => setHiddenScanlators('1', '/a', []));
    expect(seen['/a']).toEqual([]);
    act(() => renderer?.unmount());
  });
});
