jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import { defaultLanguagesFor, filterByLanguages } from '../languageFilter';
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

describe('first-run languages', () => {
  test("every phone language, specific and base, then English", () => {
    expect(defaultLanguagesFor(['pt-BR', 'fr-CA'])).toEqual(['pt-br', 'pt', 'fr-ca', 'fr', 'en']);
  });

  test("a regional source matches the phone's language whatever the case", () => {
    const list = [source('1', 'en'), source('2', 'pt-BR'), source('3', 'ja')];
    expect(filterByLanguages(list, defaultLanguagesFor(['pt-BR'])).map(s => s.id)).toEqual(['1', '2']);
  });
});
