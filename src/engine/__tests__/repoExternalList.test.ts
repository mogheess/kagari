/**
 * A store may keep its catalogue in a separate file rather than inline
 * (`extensionListUrl`, field 102 in Mihon's `NetworkExtensionStore`).
 */
import { fetchRepoExtensions } from '../repoClient';

function utf8(value: string): number[] {
  const out: number[] = [];
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

function varint(v: number): number[] {
  const out: number[] = [];
  let n = v;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

const str = (field: number, value: string) => {
  const body = utf8(value);
  return [...varint(field * 8 + 2), ...varint(body.length), ...body];
};
const msg = (field: number, body: number[]) => [
  ...varint(field * 8 + 2),
  ...varint(body.length),
  ...body,
];

function extension(pkg: string, name: string): number[] {
  return [
    ...str(1, name),
    ...str(2, pkg),
    ...msg(3, str(1, `https://cdn.test/${pkg}.apk`)),
    ...str(4, '1.4'),
    ...str(6, '1.4.1'),
  ];
}

/** A store whose catalogue lives at `listUrl`, optionally with an inline copy. */
function storeWithExternalList(listUrl: string, inline?: number[]): Uint8Array {
  return new Uint8Array([
    ...str(1, 'Example'),
    ...(inline ? msg(101, msg(1, inline)) : []),
    ...str(102, listUrl),
  ]);
}

function mockHttp(routes: Record<string, Uint8Array>): string[] {
  const requested: string[] = [];
  class FakeXhr {
    status = 200;
    response: ArrayBuffer | null = null;
    responseType = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private url = '';
    open(_m: string, url: string) {
      this.url = url;
    }
    send() {
      requested.push(this.url);
      const body = routes[this.url];
      if (!body) {
        this.status = 404;
        this.onload?.();
        return;
      }
      this.response = body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      ) as ArrayBuffer;
      this.onload?.();
    }
  }
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  return requested;
}

const NOT_INSTALLED = () => false;

test('follows extensionListUrl to a separate catalogue file', async () => {
  const list = new Uint8Array(msg(1, extension('eu.kanade.tachiyomi.extension.en.a', 'A')));
  mockHttp({
    'https://example.test/repo/index.pb': storeWithExternalList(
      'https://example.test/repo/extensions.pb',
    ),
    'https://example.test/repo/extensions.pb': list,
  });

  const result = await fetchRepoExtensions('https://example.test/repo/index.pb', NOT_INSTALLED);

  expect(result.map(e => e.pkg)).toEqual(['eu.kanade.tachiyomi.extension.en.a']);
});

test('resolves a relative extensionListUrl against the index', async () => {
  const list = new Uint8Array(msg(1, extension('eu.kanade.tachiyomi.extension.en.b', 'B')));
  const requested = mockHttp({
    'https://example.test/repo/index.pb': storeWithExternalList('extensions.pb'),
    'https://example.test/repo/extensions.pb': list,
  });

  const result = await fetchRepoExtensions('https://example.test/repo/index.pb', NOT_INSTALLED);

  expect(requested).toContain('https://example.test/repo/extensions.pb');
  expect(result).toHaveLength(1);
});

test('falls back to the inline list when the external one is unreachable', async () => {
  // Losing a whole repo because a secondary file 404s would be worse than
  // serving the catalogue the index already carried.
  const inline = extension('eu.kanade.tachiyomi.extension.en.inline', 'Inline');
  mockHttp({
    'https://example.test/repo/index.pb': storeWithExternalList(
      'https://example.test/repo/missing.pb',
      inline,
    ),
  });

  const result = await fetchRepoExtensions('https://example.test/repo/index.pb', NOT_INSTALLED);

  expect(result.map(e => e.pkg)).toEqual(['eu.kanade.tachiyomi.extension.en.inline']);
});
