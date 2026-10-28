import { baseLanguage, compareLanguages, languageKeys, preferredLanguages } from '../../utils/lang';
import { pickDefaultSource, sortSourcesForPicker } from '../../utils/sourceSelect';
import type { SourceDto } from '../../engine/types';

const codes = ['ar', 'de', 'en', 'es', 'es-419', 'fr', 'pt-br', 'all', 'ja', 'pt'];
const sorted = (preferred: string[]) => [...codes].sort((a, b) => compareLanguages(a, b, preferred));

describe('preferredLanguages', () => {
  test("the phone's languages, then English, then enabled ones, each specific first", () => {
    expect(preferredLanguages(['pt-BR', 'fr-CA'], ['en', 'zh-Hans'])).toEqual([
      'pt-br',
      'pt',
      'fr-ca',
      'fr',
      'en',
      'zh-hans',
      'zh',
    ]);
  });

  test('an English phone keeps English up top', () => {
    expect(preferredLanguages(['en-US'], ['en'])).toEqual(['en-us', 'en']);
  });
});

describe('languageKeys', () => {
  test('a tag answers to its script and region, then its base', () => {
    expect(languageKeys('zh-Hant-TW')).toEqual(['zh-hant-tw', 'zh-hant', 'zh-tw', 'zh']);
    expect(languageKeys('pt_BR')).toEqual(['pt-br', 'pt']);
    expect(languageKeys('en')).toEqual(['en']);
  });
});

describe('compareLanguages', () => {
  test("puts the phone's own variant, then its language, ahead of English", () => {
    expect(sorted(preferredLanguages(['pt-BR'], ['en']))).toEqual([
      'pt-br',
      'pt',
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

  test("a phone in one script ranks that script's sources first", () => {
    const chinese = ['zh-hans', 'zh', 'zh-hant', 'en'];
    const order = preferredLanguages(['zh-Hant-TW'], ['en']);
    expect([...chinese].sort((a, b) => compareLanguages(a, b, order))).toEqual([
      'zh-hant',
      'zh',
      'zh-hans',
      'en',
    ]);
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

describe('pickDefaultSource', () => {
  const source = (id: string, lang: string, isNsfw = false): SourceDto =>
    ({ id, name: `Source ${id}`, lang, supportsLatest: true, isNsfw }) as SourceDto;

  test("opens on the phone's language when there's a source in it", () => {
    const list = [source('1', 'en'), source('2', 'pt-BR')];
    expect(pickDefaultSource(list, preferredLanguages(['pt-BR'], ['en']))?.id).toBe('2');
  });

  test('an English phone still opens on English', () => {
    const list = [source('1', 'pt-BR'), source('2', 'en')];
    expect(pickDefaultSource(list, preferredLanguages(['en-US'], ['en']))?.id).toBe('2');
  });

  test('a recently failing source goes last, then language beats NSFW, as before', () => {
    const list = [source('1', 'en', true), source('2', 'ja'), source('3', 'en')];
    expect(pickDefaultSource(list, ['en'], { unhealthy: new Set(['3']) })?.id).toBe('1');
  });
});
