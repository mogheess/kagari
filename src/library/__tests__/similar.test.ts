import type { MangaDto, MangasPageDto, RelatedMangaDto } from '../../engine/types';

// Must be `mock`-prefixed: Babel hoists jest.mock factories above every other
// statement, and only `mock*` names may be referenced from inside them.
const mockEngine = {
  getRelatedManga: jest.fn<Promise<RelatedMangaDto>, unknown[]>(),
  search: jest.fn<Promise<MangasPageDto>, unknown[]>(),
};
jest.mock('../../engine', () => ({ getEngine: () => mockEngine }));

import {
  loadSimilar,
  rankSimilar,
  REQUEST_TIMEOUT_MS,
  sharesKeywords,
  similarQueries,
  titleKeywords,
} from '../similar';

function manga(url: string, title = url): MangaDto {
  return { sourceId: '1', url, title, genres: [], status: 'unknown', initialized: false };
}

function page(...items: MangaDto[]): MangasPageDto {
  return { manga: items, hasNextPage: false };
}

describe('titleKeywords', () => {
  test('drops the subtitle, stopwords and short words', () => {
    expect(titleKeywords('The Beginning After the End')).toEqual(['beginning', 'end']);
    expect(titleKeywords('Solo Leveling: Ragnarok')).toEqual(['solo', 'leveling']);
    expect(titleKeywords('Overgeared (Team Argo)')).toEqual(['overgeared']);
  });

  test('keeps a title with no spaces whole', () => {
    expect(titleKeywords('ワンピース')).toEqual(['ワンピース']);
  });
});

describe('similarQueries', () => {
  test('phrase first, then the longest word alone', () => {
    expect(similarQueries('SSS-Class Suicide Hunter')).toEqual([
      'sss class suicide hunter',
      'suicide',
    ]);
  });

  test('one query when the phrase is a single word', () => {
    expect(similarQueries('Overgeared')).toEqual(['overgeared']);
  });
});

describe('sharesKeywords', () => {
  test('needs two key words when the title has two or more', () => {
    const k = titleKeywords('Blue Lock');
    expect(sharesKeywords('Blue Lock: Episode Nagi', k)).toBe(true);
    expect(sharesKeywords('Blue Exorcist', k)).toBe(false);
  });

  test('one key word is enough when that is all the title has', () => {
    expect(sharesKeywords('Overgeared (Team Argo)', titleKeywords('Overgeared'))).toBe(true);
  });

  test('loose matches on a stopword-heavy title are dropped', () => {
    const k = titleKeywords('The Beginning After the End');
    expect(sharesKeywords('Legend the Beginning', k)).toBe(false);
    expect(sharesKeywords('The Beginning After the End: Side Story', k)).toBe(true);
  });

  test('unspaced titles match as substrings', () => {
    expect(sharesKeywords('ワンピース 外伝', titleKeywords('ワンピース'))).toBe(true);
  });
});

describe('rankSimilar', () => {
  test('drops the title itself and ranks titles found twice first', () => {
    const self = manga('/a', 'Blue Lock');
    const ranked = rankSimilar(self, [
      [manga('/a', 'Blue Lock'), manga('/b'), manga('/c')],
      [manga('/c'), manga('/d'), manga('/e', 'BLUE LOCK!')],
    ]);
    expect(ranked.map(m => m.url)).toEqual(['/c', '/b', '/d']);
  });
});

describe('loadSimilar', () => {
  beforeEach(() => {
    mockEngine.getRelatedManga.mockReset();
    mockEngine.search.mockReset();
  });

  test("uses the source's own related list when it has one", async () => {
    mockEngine.getRelatedManga.mockResolvedValue({
      mangas: [manga('/x'), manga('/self')],
      searchAllowed: true,
    });
    const result = await loadSimilar(manga('/self', 'Some Title'));
    expect(result.status).toBe('ok');
    expect(result.items.map(m => m.url)).toEqual(['/x']);
    expect(mockEngine.search).not.toHaveBeenCalled();
  });

  test('falls back to searching, stopping once the first query is enough', async () => {
    mockEngine.getRelatedManga.mockResolvedValue({ mangas: null, searchAllowed: true });
    const hit = (url: string) => manga(url, `Regressed Mercenary ${url}`);
    mockEngine.search.mockResolvedValue(
      page(hit('/s1'), hit('/s2'), manga('/noise', 'Plan B'), hit('/s3'), hit('/s4'), manga('/self2')),
    );
    const result = await loadSimilar(manga('/self2', 'Mercenary Plan Regressed'));
    expect(result.items.map(m => m.url)).toEqual(['/s1', '/s2', '/s3', '/s4']);
    expect(mockEngine.search).toHaveBeenCalledTimes(1);
    expect(mockEngine.search).toHaveBeenCalledWith('1', 'mercenary plan regressed', 1);
  });

  test("doesn't search when the source opts out, and caches the answer", async () => {
    mockEngine.getRelatedManga.mockResolvedValue({ mangas: null, searchAllowed: false });
    const m = manga('/self3', 'Anything Here');
    expect(await loadSimilar(m)).toEqual({ status: 'unsupported', items: [] });
    expect(await loadSimilar(m)).toEqual({ status: 'unsupported', items: [] });
    expect(mockEngine.search).not.toHaveBeenCalled();
    expect(mockEngine.getRelatedManga).toHaveBeenCalledTimes(1);
  });

  test('a title with nothing related is a settled answer, not a failure', async () => {
    mockEngine.getRelatedManga.mockResolvedValue({ mangas: null, searchAllowed: true });
    mockEngine.search.mockResolvedValue(page(manga('/other', 'Unrelated Story')));
    const m = manga('/self6', 'Lonely Knight Tale');
    expect(await loadSimilar(m)).toEqual({ status: 'ok', items: [] });
    await loadSimilar(m);
    expect(mockEngine.getRelatedManga).toHaveBeenCalledTimes(1);
  });

  test("a failing source is reported, and isn't remembered", async () => {
    mockEngine.getRelatedManga.mockRejectedValueOnce(new Error('offline'));
    const m = manga('/self4', 'Whatever Title');
    expect(await loadSimilar(m)).toEqual({ status: 'failed', items: [] });

    mockEngine.getRelatedManga.mockResolvedValueOnce({ mangas: [manga('/y')], searchAllowed: true });
    expect((await loadSimilar(m)).items.map(x => x.url)).toEqual(['/y']);
    expect(mockEngine.getRelatedManga).toHaveBeenCalledTimes(2);
  });

  test('keeps hits from the first search when the second fails, and asks again next time', async () => {
    mockEngine.getRelatedManga.mockResolvedValue({ mangas: null, searchAllowed: true });
    const hit = (url: string) => manga(url, `Shadow Monarch ${url}`);
    mockEngine.search
      .mockResolvedValueOnce(page(hit('/a1'), hit('/a2')))
      .mockRejectedValueOnce(new Error('timeout'));
    const m = manga('/self5', 'Shadow Monarch Returns');
    const first = await loadSimilar(m);
    expect(first.status).toBe('ok');
    expect(first.items.map(x => x.url)).toEqual(['/a1', '/a2']);

    mockEngine.search.mockResolvedValue(page(hit('/a1'), hit('/a2'), hit('/a3')));
    await loadSimilar(m);
    expect(mockEngine.getRelatedManga).toHaveBeenCalledTimes(2);
  });

  test('a source that never answers times out as a failure', async () => {
    jest.useFakeTimers();
    try {
      mockEngine.getRelatedManga.mockReturnValue(new Promise(() => {}));
      const pending = loadSimilar(manga('/self7', 'Endless Wait'));
      jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
      expect(await pending).toEqual({ status: 'failed', items: [] });
    } finally {
      jest.useRealTimers();
    }
  });
});
