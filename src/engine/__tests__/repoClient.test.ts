import { fetchRepoExtensions } from '../repoClient';

/** UTF-8 encode without depending on Node's Buffer. */
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

/**
 * Installs a fake XMLHttpRequest that serves `routes` and records every URL
 * requested, in order. Anything not in `routes` responds 404.
 */
function mockHttp(routes: Record<string, string | Uint8Array>): string[] {
  const requested: string[] = [];
  class FakeXhr {
    status = 200;
    response: ArrayBuffer | null = null;
    responseType = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private url = '';

    open(_method: string, url: string) {
      this.url = url;
    }

    send() {
      requested.push(this.url);
      const body = routes[this.url];
      if (body === undefined) {
        this.status = 404;
        this.onload?.();
        return;
      }
      const bytes = typeof body === 'string' ? Uint8Array.from(utf8(body)) : body;
      this.response = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      this.onload?.();
    }
  }
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  return requested;
}

/** Encodes a one-extension index v2 payload (uncompressed). */
function pbIndex(pkg: string, versionName: string, apkUrl: string): Uint8Array {
  const bytes: number[] = [];
  const varint = (v: number) => {
    const out: number[] = [];
    let n = v;
    do {
      let b = n & 0x7f;
      n >>>= 7;
      if (n > 0) b |= 0x80;
      out.push(b);
    } while (n > 0);
    return out;
  };
  const str = (field: number, value: string) => {
    const body = utf8(value);
    return [...varint(field * 8 + 2), ...varint(body.length), ...body];
  };
  const msg = (field: number, body: number[]) => [
    ...varint(field * 8 + 2),
    ...varint(body.length),
    ...body,
  ];
  const uint = (field: number, value: number) => [...varint(field * 8), ...varint(value)];

  const ext = [
    ...str(1, 'Example'),
    ...str(2, pkg),
    ...msg(3, str(1, apkUrl)),
    ...str(4, versionName.split('.').slice(0, 2).join('.')),
    ...uint(5, 1),
    ...str(6, versionName),
    ...uint(7, 1),
  ];
  bytes.push(...str(1, 'Example Repo'), ...msg(101, msg(1, ext)));
  return new Uint8Array(bytes);
}

function pbExternalIndex(url: string): Uint8Array {
  const body = utf8(url);
  // field 102, wire type 2 => tag 818 => b2 06
  return new Uint8Array([0xb2, 0x06, body.length, ...body]);
}

function pbExtensionList(pkg: string, versionName: string, apkUrl: string): Uint8Array {
  const full = pbIndex(pkg, versionName, apkUrl);
  // Reuse the fixture encoder by decoding the outer index's field 101 payload:
  // skip field 1 (repo name), then the field-101 tag and its length.
  let offset = 0;
  const readVarint = () => {
    let value = 0;
    let multiplier = 1;
    for (;;) {
      const byte = full[offset++];
      value += (byte % 128) * multiplier;
      if (byte < 128) return value;
      multiplier *= 128;
    }
  };
  readVarint();
  const nameLength = readVarint();
  offset += nameLength;
  readVarint();
  const length = readVarint();
  return full.slice(offset, offset + length);
}

const NOT_INSTALLED = () => false;

const TOMBSTONE = JSON.stringify([
  { name: 'Outdated App', pkg: 'eu.kanade.tachiyomi.extension.all.keiyoushi', apk: 'a.apk', lang: 'all', code: 1, version: '1.4.1', nsfw: 0 },
  { name: 'Update to Mihon 0.20.1+', pkg: 'eu.kanade.tachiyomi.extension.all.mihon', apk: 'b.apk', lang: 'all', code: 1, version: '1.4.1', nsfw: 0 },
]);

test('prefers index.pb over a legacy index.min.json URL', async () => {
  const requested = mockHttp({
    'https://example.test/repo/index.min.json': TOMBSTONE,
    'https://example.test/repo/index.pb': pbIndex(
      'eu.kanade.tachiyomi.extension.en.example',
      '1.6.24',
      'https://cdn.test/apk/example-v1.6.24.apk',
    ),
  });

  const result = await fetchRepoExtensions(
    'https://example.test/repo/index.min.json',
    NOT_INSTALLED,
  );

  expect(requested).toEqual(['https://example.test/repo/index.pb']);
  expect(result).toHaveLength(1);
  expect(result[0].pkg).toBe('eu.kanade.tachiyomi.extension.en.example');
  expect(result[0].versionName).toBe('1.6.24');
  expect(result[0].extensionLib).toBe('1.6');
  expect(result[0].lang).toBe('en');
  expect(result[0].apkUrl).toBe('https://cdn.test/apk/example-v1.6.24.apk');
  expect(result[0].apk).toBe('example-v1.6.24.apk');
  // The tombstone must never reach the UI.
  expect(result.some(e => e.name === 'Outdated App')).toBe(false);
});

test('falls back to the legacy JSON index when no index.pb exists', async () => {
  const requested = mockHttp({
    'https://third.party/repo/index.min.json': JSON.stringify([
      {
        name: 'Tachiyomi: Legacy Source',
        pkg: 'eu.kanade.tachiyomi.extension.fr.legacy',
        apk: 'legacy-v1.4.3.apk',
        lang: 'fr',
        code: 3,
        version: '1.4.3',
        nsfw: 1,
        sources: [{ name: 'Legacy', lang: 'fr', id: '99' }],
      },
    ]),
  });

  const result = await fetchRepoExtensions(
    'https://third.party/repo/index.min.json',
    NOT_INSTALLED,
  );

  expect(requested).toEqual([
    'https://third.party/repo/index.pb',
    'https://third.party/repo/index.min.json',
  ]);
  expect(result).toHaveLength(1);
  expect(result[0].name).toBe('Legacy Source');
  expect(result[0].apkUrl).toBe('https://third.party/repo/apk/legacy-v1.4.3.apk');
  expect(result[0].isNsfw).toBe(true);
});

test('follows a repo.json descriptor to index_v2', async () => {
  const requested = mockHttp({
    'https://example.test/repo/repo.json': JSON.stringify({
      index_v2: 'https://example.test/repo/index.pb',
      meta: { name: 'Example' },
    }),
    'https://example.test/repo/index.pb': pbIndex(
      'eu.kanade.tachiyomi.extension.ja.example',
      '1.4.7',
      'https://cdn.test/apk/example-v1.4.7.apk',
    ),
  });

  const result = await fetchRepoExtensions(
    'https://example.test/repo/repo.json',
    NOT_INSTALLED,
  );

  expect(requested).toEqual([
    'https://example.test/repo/repo.json',
    'https://example.test/repo/index.pb',
  ]);
  expect(result[0].lang).toBe('ja');
});

test('accepts a bare repo directory URL', async () => {
  mockHttp({
    'https://example.test/repo/index.pb': pbIndex(
      'eu.kanade.tachiyomi.extension.all.example',
      '1.4.1',
      'https://cdn.test/apk/example-v1.4.1.apk',
    ),
  });

  const result = await fetchRepoExtensions('https://example.test/repo', NOT_INSTALLED);

  expect(result).toHaveLength(1);
  expect(result[0].lang).toBe('all');
});

test('follows index v2 extensionListUrl', async () => {
  const requested = mockHttp({
    'https://example.test/repo/index.pb': pbExternalIndex('extensions.pb'),
    'https://example.test/repo/extensions.pb': pbExtensionList(
      'eu.kanade.tachiyomi.extension.en.external',
      '1.6.2',
      'https://cdn.test/external.apk',
    ),
  });

  const result = await fetchRepoExtensions('https://example.test/repo', NOT_INSTALLED);

  expect(requested).toEqual([
    'https://example.test/repo/index.pb',
    'https://example.test/repo/extensions.pb',
  ]);
  expect(result[0].pkg).toBe('eu.kanade.tachiyomi.extension.en.external');
});

test('marks installed extensions', async () => {
  mockHttp({
    'https://example.test/repo/index.pb': pbIndex(
      'eu.kanade.tachiyomi.extension.en.example',
      '1.4.1',
      'https://cdn.test/apk/example-v1.4.1.apk',
    ),
  });

  const result = await fetchRepoExtensions(
    'https://example.test/repo/index.pb',
    pkg => pkg === 'eu.kanade.tachiyomi.extension.en.example',
  );

  expect(result[0].installed).toBe(true);
});

test('surfaces an error when every candidate fails', async () => {
  mockHttp({});
  await expect(
    fetchRepoExtensions('https://dead.test/repo/index.min.json', NOT_INSTALLED),
  ).rejects.toThrow(/404/);
});
