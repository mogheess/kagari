import { decodeRepoIndexPb, ContentRating } from '../repoIndexPb';

/** Minimal protobuf writer, just enough to build fixtures. */
function varint(value: number | bigint): number[] {
  let v = BigInt(value);
  const out: number[] = [];
  do {
    let byte = Number(v & BigInt(0x7f));
    v >>= BigInt(7);
    if (v > BigInt(0)) byte |= 0x80;
    out.push(byte);
  } while (v > BigInt(0));
  return out;
}

function tag(field: number, wire: number): number[] {
  return varint(field * 8 + wire);
}

function str(field: number, value: string): number[] {
  const bytes: number[] = [];
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return [...tag(field, 2), ...varint(bytes.length), ...bytes];
}

function msg(field: number, body: number[]): number[] {
  return [...tag(field, 2), ...varint(body.length), ...body];
}

function uint(field: number, value: number | bigint): number[] {
  return [...tag(field, 0), ...varint(value)];
}

test('decodes an index v2 payload', () => {
  const source = [
    ...uint(1, BigInt('2131019126180322627')),
    ...str(2, 'Weeb Central'),
    ...str(3, 'en'),
    ...str(4, 'https://weebcentral.com'),
  ];
  const urls = [
    ...str(1, 'https://cdn.example/apk/tachiyomi-en.weebcentral-v1.6.24.apk'),
    ...str(2, 'https://cdn.example/icon.png'),
    ...str(501, 'https://cdn.example/jar/tachiyomi-en.weebcentral-v1.6.24.jar'),
  ];
  const extension = [
    ...str(1, 'Weeb Central'),
    ...str(2, 'eu.kanade.tachiyomi.extension.en.weebcentral'),
    ...msg(3, urls),
    ...str(4, '1.6'),
    ...uint(5, 24),
    ...str(6, '1.6.24'),
    ...uint(7, ContentRating.Suggestive),
    ...msg(8, source),
  ];
  const index = [
    ...str(1, 'Keiyoushi'),
    ...str(2, 'KEI'),
    ...str(3, '9add655a'),
    ...msg(4, [...str(1, 'https://keiyoushi.github.io')]),
    ...msg(101, msg(1, extension)),
  ];

  const decoded = decodeRepoIndexPb(new Uint8Array(index));

  expect(decoded.name).toBe('Keiyoushi');
  expect(decoded.shortName).toBe('KEI');
  expect(decoded.signingKeyFingerprint).toBe('9add655a');
  expect(decoded.website).toBe('https://keiyoushi.github.io');
  expect(decoded.extensions).toHaveLength(1);

  const ext = decoded.extensions[0];
  expect(ext.pkg).toBe('eu.kanade.tachiyomi.extension.en.weebcentral');
  expect(ext.versionName).toBe('1.6.24');
  expect(ext.versionCode).toBe(24);
  expect(ext.extensionLib).toBe('1.6');
  expect(ext.contentRating).toBe(ContentRating.Suggestive);
  expect(ext.apkUrl).toContain('.apk');
  expect(ext.jarUrl).toContain('.jar');
  expect(ext.sources).toHaveLength(1);
  // 64-bit source ids must survive without float rounding.
  expect(ext.sources[0].id).toBe('2131019126180322627');
});

test('skips unknown fields instead of failing', () => {
  const extension = [
    ...str(1, 'Example'),
    ...str(2, 'eu.kanade.tachiyomi.extension.en.example'),
    ...uint(900, 7), // unknown varint
    ...str(901, 'unknown string'), // unknown length-delimited
    ...str(6, '1.4.1'),
  ];
  const index = [...str(1, 'Repo'), ...msg(101, msg(1, extension))];

  const decoded = decodeRepoIndexPb(new Uint8Array(index));

  expect(decoded.extensions).toHaveLength(1);
  expect(decoded.extensions[0].name).toBe('Example');
  expect(decoded.extensions[0].versionName).toBe('1.4.1');
});

test('decodes multi-byte UTF-8 names', () => {
  const extension = [...str(1, 'マンガ / 漫画'), ...str(2, 'eu.kanade.tachiyomi.extension.ja.x')];
  const decoded = decodeRepoIndexPb(new Uint8Array([...msg(101, msg(1, extension))]));
  expect(decoded.extensions[0].name).toBe('マンガ / 漫画');
});

test('rejects a truncated payload', () => {
  // Declares a 40-byte string but supplies none.
  const bad = new Uint8Array([...tag(1, 2), ...varint(40)]);
  expect(() => decodeRepoIndexPb(bad)).toThrow(/overruns buffer/);
});
