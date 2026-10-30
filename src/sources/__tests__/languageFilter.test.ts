jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import { filterByLanguages } from '../languageFilter';
import type { SourceDto } from '../../engine/types';

const source = (id: string, lang: string): SourceDto =>
  ({ id, name: `Source ${id}`, lang, supportsLatest: true, isNsfw: false }) as SourceDto;

const spanish = [source('1', 'es'), source('2', 'es'), source('3', 'es-419')];

describe('filterByLanguages', () => {
  test('keeps the enabled languages', () => {
    const mixed = [source('0', 'en'), ...spanish];
    expect(filterByLanguages(mixed, ['es']).map(s => s.id)).toEqual(['1', '2']);
  });

  test('an empty set shows everything', () => {
    expect(filterByLanguages(spanish, [])).toBe(spanish);
  });

  test('a set that matches none of the sources shows everything instead of nothing', () => {
    // Only Spanish extensions installed, English enabled: the lists came up empty.
    expect(filterByLanguages(spanish, ['en'])).toBe(spanish);
  });
});
