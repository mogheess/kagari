import { baseLanguage, compareLanguages, preferredLanguages } from '../../utils/lang';
import { sortSourcesForPicker } from '../../utils/sourceSelect';
import type { SourceDto } from '../../engine/types';

const codes = ['ar', 'de', 'en', 'es', 'es-419', 'fr', 'pt-br', 'all', 'ja', 'pt'];
const sorted = (preferred: string[]) => [...codes].sort((a, b) => compareLanguages(a, b, preferred));

describe('preferredLanguages', () => {
  test("the phone's languages, then English, then enabled ones, by base language", () => {
    expect(preferredLanguages(['pt-BR', 'fr-CA'], ['en', 'zh-Hans', 'pt'])).toEqual(['pt', 'fr', 'en', 'zh']);
  });

  test('an English phone keeps English alone up top', () => {
    expect(preferredLanguages(['en-US'], ['en'])).toEqual(['en']);
  });
});

describe('compareLanguages', () => {
  test("puts the phone's language and its variants ahead of English", () => {
    expect(sorted(preferredLanguages(['pt-BR'], ['en']))).toEqual([
      'pt',
      'pt-br',
      'en',
      'ar',
      'de',
      'es',
      'fr',
      'ja',
      'es-419', // "LATAM"
      'all', // "Multi"
    ]);
  });

  test('an enabled language sits right after English', () => {
    expect(sorted(preferredLanguages(['en-GB'], ['en', 'ja'])).slice(0, 3)).toEqual(['en', 'ja', 'ar']);
  });

  test('without other preferences, English first and the rest by label as before', () => {
    // By label: es-419 reads "LATAM", all reads "Multi".
    expect(sorted(['en'])).toEqual(['en', 'ar', 'de', 'es', 'fr', 'ja', 'es-419', 'all', 'pt', 'pt-br']);
  });

  test('base languages ignore region and script, either separator', () => {
    expect(['pt-BR', 'zh_Hant', 'en'].map(baseLanguage)).toEqual(['pt', 'zh', 'en']);
  });
});

describe('sortSourcesForPicker', () => {
  const source = (id: string, lang: string): SourceDto =>
    ({ id, name: `Source ${id}`, lang, supportsLatest: true, isNsfw: false }) as SourceDto;

  test("lists the reader's languages first", () => {
    const list = [source('1', 'en'), source('2', 'ar'), source('3', 'id')];
    expect(sortSourcesForPicker(list, ['id', 'en']).map(s => s.lang)).toEqual(['id', 'en', 'ar']);
  });
});
