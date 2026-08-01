import { loadPages, peekPages, invalidatePages } from '../pageCache';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const mockGetPages = jest.fn();
jest.mock('../../engine', () => ({ getEngine: () => ({ getPages: mockGetPages }) }));

const SOURCE = '3';

beforeEach(() => {
  mockGetPages.mockReset();
});

test('fetches once, then serves from cache', async () => {
  mockGetPages.mockResolvedValue([{ index: 0 }, { index: 1 }]);

  expect(await loadPages(SOURCE, '/ch-1')).toHaveLength(2);
  expect(await loadPages(SOURCE, '/ch-1')).toHaveLength(2);

  expect(mockGetPages).toHaveBeenCalledTimes(1);
  expect(peekPages(SOURCE, '/ch-1')).toHaveLength(2);
});

test('concurrent callers share one request', async () => {
  // The reader preloads neighbours, so the same chapter is easily asked for
  // twice at once — as the next chapter, then again when it becomes current.
  mockGetPages.mockResolvedValue([{ index: 0 }]);

  await Promise.all([loadPages(SOURCE, '/ch-2'), loadPages(SOURCE, '/ch-2')]);

  expect(mockGetPages).toHaveBeenCalledTimes(1);
});

test('an empty result is not cached', async () => {
  // Empty means a failed parse, not a real answer; caching it would leave the
  // chapter permanently broken.
  mockGetPages.mockResolvedValue([]);
  await loadPages(SOURCE, '/ch-3');
  expect(peekPages(SOURCE, '/ch-3')).toBeUndefined();

  mockGetPages.mockResolvedValue([{ index: 0 }]);
  expect(await loadPages(SOURCE, '/ch-3')).toHaveLength(1);
  expect(mockGetPages).toHaveBeenCalledTimes(2);
});

test('a failure is not cached and does not wedge the chapter', async () => {
  mockGetPages.mockRejectedValueOnce(new Error('network'));
  await expect(loadPages(SOURCE, '/ch-4')).rejects.toThrow('network');

  mockGetPages.mockResolvedValue([{ index: 0 }]);
  expect(await loadPages(SOURCE, '/ch-4')).toHaveLength(1);
});

test('invalidate forces a re-fetch', async () => {
  mockGetPages.mockResolvedValue([{ index: 0 }]);
  await loadPages(SOURCE, '/ch-5');
  invalidatePages(SOURCE, '/ch-5');
  await loadPages(SOURCE, '/ch-5');

  expect(mockGetPages).toHaveBeenCalledTimes(2);
});

test('is scoped per source', async () => {
  mockGetPages.mockResolvedValue([{ index: 0 }]);
  await loadPages(SOURCE, '/ch-6');
  expect(peekPages('99', '/ch-6')).toBeUndefined();
});
