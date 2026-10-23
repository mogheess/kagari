jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { mergeWithDefaults, type HomeBlock } from '../HomeConfig';

const ids = (blocks: HomeBlock[]) => blocks.map(b => `${b.id}${b.enabled ? '' : '(off)'}`);

describe('mergeWithDefaults', () => {
  test('slots sections added in a later version into their place, switched on', () => {
    const stored: HomeBlock[] = [
      { id: 'b_featured', kind: 'featured', enabled: true },
      { id: 'b_continue', kind: 'continue', enabled: true },
      { id: 'b_popular', kind: 'popular', enabled: false },
      { id: 'b_latest', kind: 'latest', enabled: true },
      { id: 'b_recommended', kind: 'recommended', enabled: false },
    ];
    expect(ids(mergeWithDefaults(stored))).toEqual([
      'b_featured',
      'b_history',
      'b_updates',
      'b_continue',
      'b_popular(off)',
      'b_latest',
      'b_sources',
      'b_recommended(off)',
    ]);
  });

  test('keeps the user order and brings back a long-gone built-in switched off', () => {
    const stored: HomeBlock[] = [
      { id: 'b_latest', kind: 'latest', enabled: true },
      { id: 'b_history', kind: 'history', enabled: false },
      { id: 'c_search_x', kind: 'search', query: 'solo', sourceId: '1', enabled: true, custom: true },
      { id: 'b_featured', kind: 'featured', enabled: true },
      { id: 'b_updates', kind: 'updates', enabled: true },
      { id: 'b_continue', kind: 'continue', enabled: true },
      { id: 'b_sources', kind: 'perSource', enabled: true },
      { id: 'b_recommended', kind: 'recommended', enabled: false },
    ];
    const merged = mergeWithDefaults(stored);
    expect(ids(merged).slice(0, 8)).toEqual(ids(stored));
    expect(ids(merged)[8]).toBe('b_popular(off)');
  });
});
