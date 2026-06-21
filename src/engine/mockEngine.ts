/**
 * In-JS mock implementation of the Engine contract. Lets the entire UI run
 * before the native Kotlin extension engine is built. Swapped out automatically
 * once the native module is present (see `engine.ts`).
 *
 * Cover images use picsum.photos seeds as stand-ins for real source thumbnails.
 */
import type {
  Engine,
  ExtensionDto,
  SourceDto,
  MangaDto,
  MangasPageDto,
  ChapterDto,
  PageDto,
  ImageRequestDto,
  FilterDto,
  RepoDto,
  AvailableExtensionDto,
} from './types';
import { fetchAllRepos, makeRepo } from './repoClient';

const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

const cover = (seed: string, w = 360, h = 520) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;

const MOCK_SOURCES: SourceDto[] = [
  {
    id: '1001',
    name: 'MangaDex',
    lang: 'en',
    supportsLatest: true,
    isNsfw: false,
    extensionPkg: 'app.manhwa.extension.en.mangadex',
  },
  {
    id: '1002',
    name: 'Weeb Central',
    lang: 'en',
    supportsLatest: true,
    isNsfw: false,
    extensionPkg: 'app.manhwa.extension.en.weebcentral',
  },
  {
    id: '1003',
    name: 'Comick',
    lang: 'en',
    supportsLatest: true,
    isNsfw: false,
    extensionPkg: 'app.manhwa.extension.all.comick',
  },
];

const MOCK_EXTENSIONS: ExtensionDto[] = [
  {
    pkg: 'app.manhwa.extension.en.mangadex',
    name: 'MangaDex',
    versionName: '1.4.210',
    versionCode: 210,
    libVersion: '1.4',
    lang: 'en',
    isNsfw: false,
    trusted: true,
    sources: [MOCK_SOURCES[0]],
  },
  {
    pkg: 'app.manhwa.extension.en.weebcentral',
    name: 'Weeb Central',
    versionName: '1.4.32',
    versionCode: 32,
    libVersion: '1.4',
    lang: 'en',
    isNsfw: false,
    trusted: true,
    sources: [MOCK_SOURCES[1]],
  },
  {
    pkg: 'app.manhwa.extension.all.comick',
    name: 'Comick',
    versionName: '1.4.18',
    versionCode: 18,
    libVersion: '1.4',
    lang: 'all',
    isNsfw: false,
    trusted: false,
    sources: [MOCK_SOURCES[2]],
  },
];

const TITLES = [
  'Shadow Sovereign',
  'Solo Leveling',
  'Omniscient Reader',
  'The Beginning After the End',
  'Kagurabachi',
  'Vagabond',
  'Berserk',
  'Vinland Saga',
  'Chainsaw Man',
  'Jujutsu Kaisen',
  'One Piece',
  'Frieren',
  'Kaiju No. 8',
  'Sakamoto Days',
  'Blue Lock',
  'Dandadan',
  'Monster',
  'Pluto',
  'Slam Dunk',
  'Tokyo Ghoul',
];

const AUTHORS = [
  'Chugong',
  'Sing Shong',
  'TurtleMe',
  'Takeshi Obata',
  'Takehiko Inoue',
  'Kentaro Miura',
  'Makoto Yukimura',
  'Tatsuki Fujimoto',
  'Gege Akutami',
];

const GENRE_POOL = [
  'Action',
  'Adventure',
  'Fantasy',
  'Drama',
  'Supernatural',
  'Seinen',
  'Shounen',
  'Mystery',
  'Slice of Life',
];

function makeManga(sourceId: string, i: number): MangaDto {
  const title = TITLES[i % TITLES.length];
  const seed = `${sourceId}-${title}-${i}`;
  return {
    sourceId,
    url: `/manga/${seed}`,
    title: i < TITLES.length ? title : `${title} ${Math.floor(i / TITLES.length) + 1}`,
    thumbnailUrl: cover(seed),
    author: AUTHORS[i % AUTHORS.length],
    genres: [GENRE_POOL[i % GENRE_POOL.length], GENRE_POOL[(i + 3) % GENRE_POOL.length]],
    status: i % 3 === 0 ? 'ongoing' : i % 3 === 1 ? 'completed' : 'on_hiatus',
    initialized: false,
  };
}

function makePage(sourceId: string, mangaUrl: string, i: number): MangaDto {
  return makeManga(sourceId, i);
}

function buildPage(sourceId: string, page: number, offset = 0): MangasPageDto {
  const pageSize = 20;
  const start = (page - 1) * pageSize + offset;
  const manga = Array.from({ length: pageSize }, (_, k) => makeManga(sourceId, start + k));
  return { manga, hasNextPage: page < 5 };
}

export function createMockEngine(): Engine {
  // Mutable session state (demo): configured repos and installed extensions.
  const repos: RepoDto[] = [];
  const installed = new Map<string, AvailableExtensionDto>();

  const isInstalled = (pkg: string) => installed.has(pkg);

  const installedSources = (): SourceDto[] =>
    Array.from(installed.values()).flatMap(ext =>
      ext.sources.map(s => ({
        id: s.id,
        name: s.name,
        lang: s.lang,
        supportsLatest: true,
        isNsfw: ext.isNsfw,
        extensionPkg: ext.pkg,
      })),
    );

  return {
    isNative: false,

    async reload() {
      // Demo engine holds state in memory; nothing to re-scan.
    },
    async listExtensions() {
      await delay(120);
      const installedDtos: ExtensionDto[] = Array.from(installed.values()).map(ext => ({
        pkg: ext.pkg,
        name: ext.name,
        versionName: ext.versionName,
        versionCode: ext.versionCode,
        libVersion: '1.4',
        lang: ext.lang,
        isNsfw: ext.isNsfw,
        trusted: true,
        sources: ext.sources.map(s => ({
          id: s.id,
          name: s.name,
          lang: s.lang,
          supportsLatest: true,
          isNsfw: ext.isNsfw,
          extensionPkg: ext.pkg,
        })),
      }));
      return [...installedDtos, ...MOCK_EXTENSIONS];
    },

    async listSources() {
      await delay(80);
      return [...installedSources(), ...MOCK_SOURCES];
    },

    async listRepos() {
      await delay(40);
      return repos.slice();
    },

    async addRepo(url: string) {
      await delay(120);
      const repo = makeRepo(url);
      if (!repos.some(r => r.url === repo.url)) repos.push(repo);
    },

    async removeRepo(url: string) {
      await delay(40);
      const i = repos.findIndex(r => r.url === url);
      if (i >= 0) repos.splice(i, 1);
    },

    async getAvailableExtensions() {
      const all = await fetchAllRepos(repos, isInstalled);
      // de-dupe by pkg, keep installed flag fresh
      const seen = new Map<string, AvailableExtensionDto>();
      for (const e of all) {
        if (!seen.has(e.pkg)) seen.set(e.pkg, { ...e, installed: isInstalled(e.pkg) });
      }
      return Array.from(seen.values());
    },

    async installExtension(ext: AvailableExtensionDto) {
      await delay(500);
      installed.set(ext.pkg, { ...ext, installed: true });
    },

    async uninstallExtension(pkg: string) {
      await delay(120);
      installed.delete(pkg);
    },

    async installApk(_uri: string) {
      await delay(400);
    },

    async trustSignature(_pkg: string, _certSha256: string) {
      await delay(60);
    },

    async getPopular(sourceId: string, page: number) {
      await delay(220);
      return buildPage(sourceId, page);
    },

    async getLatest(sourceId: string, page: number) {
      await delay(220);
      return buildPage(sourceId, page, 7);
    },

    async search(sourceId: string, query: string, page: number) {
      await delay(260);
      const res = buildPage(sourceId, page);
      const q = query.trim().toLowerCase();
      if (!q) return res;
      return {
        manga: res.manga.filter(m => m.title.toLowerCase().includes(q)),
        hasNextPage: false,
      };
    },

    async getFilters(_sourceId: string): Promise<FilterDto[]> {
      await delay(60);
      return [
        { type: 'header', name: 'Filters' },
        {
          type: 'sort',
          name: 'Sort',
          values: ['Popularity', 'Latest', 'Title'],
          state: { index: 0, ascending: false },
        },
        {
          type: 'group',
          name: 'Genres',
          filters: GENRE_POOL.map<FilterDto>(g => ({
            type: 'tristate',
            name: g,
            state: 0,
          })),
        },
      ];
    },

    async getMangaDetails(sourceId: string, mangaUrl: string): Promise<MangaDto> {
      await delay(200);
      const idx = Math.abs(hash(mangaUrl)) % TITLES.length;
      const base = makeManga(sourceId, idx);
      return {
        ...base,
        url: mangaUrl,
        description:
          'A masterful tale of ambition, solitude, and the pursuit of strength. ' +
          'When everything is taken from him, he discovers a power that rewrites the rules ' +
          'of the world \u2014 and the resolve to use it.',
        genres: GENRE_POOL.slice(0, 5),
        initialized: true,
      };
    },

    async getChapters(sourceId: string, mangaUrl: string): Promise<ChapterDto[]> {
      await delay(180);
      const count = 60;
      const now = Date.now();
      return Array.from({ length: count }, (_, k) => {
        const num = count - k;
        return {
          sourceId,
          mangaUrl,
          url: `${mangaUrl}/chapter/${num}`,
          name: `Chapter ${num}`,
          chapterNumber: num,
          scanlator: k % 2 === 0 ? 'Official' : 'Scanlation Team',
          dateUpload: now - k * 7 * 24 * 60 * 60 * 1000,
        };
      });
    },

    async getPages(sourceId: string, chapterUrl: string): Promise<PageDto[]> {
      await delay(200);
      const count = 18;
      return Array.from({ length: count }, (_, k) => ({
        index: k,
        imageUrl: cover(`${chapterUrl}-p${k}`, 800, 1200),
      }));
    },

    async resolveImage(_sourceId: string, page: PageDto): Promise<ImageRequestDto> {
      await delay(20);
      return {
        url: page.imageUrl ?? page.url ?? '',
        headers: { Referer: 'https://example.org/' },
      };
    },
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// Exported for potential reuse/testing of the page-stub generator.
export const _internal = { makePage };
