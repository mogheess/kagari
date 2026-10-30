const writes: { key: string; value: string; done: (error?: Error) => void }[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  // Each write stays in flight until the test finishes it, like the native
  // side running writes on background threads.
  setItem: jest.fn(
    (key: string, value: string) =>
      new Promise<void>((resolve, reject) => {
        writes.push({ key, value, done: error => (error ? reject(error) : resolve()) });
      }),
  ),
}));

import { makePersistence } from '../persist';

const flushPromises = () => new Promise<void>(resolve => setImmediate(() => resolve()));

beforeEach(() => {
  writes.length = 0;
});

describe('makePersistence save', () => {
  test('writes one at a time, so the last save is the one left on disk', async () => {
    const store = makePersistence<number[]>('k');
    store.save([1, 2, 3]);
    store.save([1, 2]);
    store.save([1]);
    // Only the first is in flight; the next waits for it.
    expect(writes.map(w => w.value)).toEqual(['[1,2,3]']);

    writes[0].done();
    await flushPromises();
    // The saves in between are skipped: only the newest is written.
    expect(writes.map(w => w.value)).toEqual(['[1,2,3]', '[1]']);

    writes[1].done();
    await flushPromises();
    expect(writes).toHaveLength(2);
  });

  test('a failed write does not stop later saves', async () => {
    const store = makePersistence<string>('k');
    store.save('a');
    store.save('b');
    writes[0].done(new Error('disk full'));
    await flushPromises();
    expect(writes.map(w => w.value)).toEqual(['"a"', '"b"']);

    writes[1].done();
    await flushPromises();
    store.save('c');
    expect(writes.map(w => w.value)).toEqual(['"a"', '"b"', '"c"']);
  });

  test('keys write independently', () => {
    makePersistence<number>('a').save(1);
    makePersistence<number>('b').save(2);
    expect(writes.map(w => `${w.key}=${w.value}`)).toEqual(['a=1', 'b=2']);
  });
});
