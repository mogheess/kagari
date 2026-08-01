/**
 * Decoder for the "index v2" extension repo index (`index.pb`).
 *
 * Mihon 0.20.0 replaced the JSON `index.min.json` with a gzip-compressed
 * protobuf index. keiyoushi now serves only a two-entry "Outdated App" stub at
 * the old JSON path, so anything still reading it sees an empty catalogue.
 *
 * There is no published `.proto`, so the schema below was recovered from the
 * wire format of keiyoushi's live index. Field *numbers* and types are exact;
 * the names are ours. Unknown fields are skipped, so additive changes upstream
 * degrade to missing optional data rather than a parse failure.
 *
 *   Index {
 *     1   string name                    // "Keiyoushi"
 *     2   string shortName               // "KEI"
 *     3   string signingKeyFingerprint
 *     4   Meta   { 1 string website; 2 string support }
 *     101  ExtensionList { repeated Extension extensions = 1 }
 *   }
 *
 *   Extension {
 *     1   string name
 *     2   string pkg
 *     3   Urls   { 1 string apk; 2 string icon; 501 string jar }
 *     4   string extensionLib            // "1.4" | "1.6"
 *     5   uint32 versionCode
 *     6   string versionName
 *     7   uint32 contentRating           // 1 none, 2 suggestive, 3 nsfw
 *     8   repeated Source
 *   }
 *
 *   Source { 1 uint64 id; 2 string name; 3 string lang; 4 string baseUrl }
 *
 * `contentRating` is the manifest's `tachiyomix.contentWarning` plus one (proto
 * enums reserve 0 for "unspecified").
 */

const WIRE_VARINT = 0;
const WIRE_I64 = 1;
const WIRE_LEN = 2;
const WIRE_I32 = 5;

/** Content rating carried by index v2 entries. */
export enum ContentRating {
  Unspecified = 0,
  Safe = 1,
  Suggestive = 2,
  Nsfw = 3,
}

export interface PbSource {
  id: string;
  name: string;
  lang: string;
  baseUrl?: string;
}

export interface PbExtension {
  name: string;
  pkg: string;
  apkUrl: string;
  iconUrl?: string;
  jarUrl?: string;
  /** Extension-lib version the APK was built against, e.g. "1.4" or "1.6". */
  extensionLib: string;
  versionCode: number;
  versionName: string;
  contentRating: ContentRating;
  sources: PbSource[];
}

export interface PbIndex {
  name: string;
  shortName?: string;
  signingKeyFingerprint?: string;
  website?: string;
  extensions: PbExtension[];
}

/**
 * Sequential protobuf wire reader.
 *
 * Varints accumulate with multiplication rather than `<<` so lengths above
 * 2^31 stay exact (JS bitwise operators truncate to 32 bits).
 */
class Reader {
  private pos = 0;

  constructor(private readonly buf: Uint8Array, private readonly end = buf.length) {}

  get done(): boolean {
    return this.pos >= this.end;
  }

  varint(): number {
    let result = 0;
    let shift = 1;
    for (;;) {
      if (this.pos >= this.end) throw new Error('index.pb: truncated varint');
      const b = this.buf[this.pos++];
      result += (b & 0x7f) * shift;
      if ((b & 0x80) === 0) return result;
      shift *= 128;
    }
  }

  /** Reads a varint as an exact 64-bit value, returned as a decimal string. */
  varint64(): string {
    let result = BigInt(0);
    let shift = BigInt(0);
    for (;;) {
      if (this.pos >= this.end) throw new Error('index.pb: truncated varint64');
      const b = this.buf[this.pos++];
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result.toString();
      shift += BigInt(7);
    }
  }

  /** Length-delimited payload, as a sub-reader over the same buffer. */
  sub(): Reader {
    const len = this.varint();
    const start = this.pos;
    const stop = start + len;
    if (stop > this.end) throw new Error('index.pb: length-delimited field overruns buffer');
    this.pos = stop;
    return new Reader(this.buf.subarray(start, stop));
  }

  /** Length-delimited payload decoded as UTF-8. */
  string(): string {
    const len = this.varint();
    const start = this.pos;
    const stop = start + len;
    if (stop > this.end) throw new Error('index.pb: string field overruns buffer');
    this.pos = stop;
    return utf8Decode(this.buf, start, stop);
  }

  skip(wire: number): void {
    switch (wire) {
      case WIRE_VARINT:
        this.varint();
        return;
      case WIRE_I64:
        this.pos += 8;
        return;
      case WIRE_LEN: {
        // Read the length first: `this.pos += this.varint()` would capture the
        // pre-varint position and swallow the length prefix into the payload.
        const len = this.varint();
        this.pos += len;
        return;
      }
      case WIRE_I32:
        this.pos += 4;
        return;
      default:
        throw new Error(`index.pb: unsupported wire type ${wire}`);
    }
  }

  /** Iterates `(field, wire)` pairs, leaving the value unread. */
  *tags(): Generator<[number, number]> {
    while (!this.done) {
      const tag = this.varint();
      const field = Math.floor(tag / 8);
      const wire = tag % 8;
      if (field === 0) throw new Error('index.pb: field number 0');
      yield [field, wire];
    }
  }
}

/**
 * Minimal UTF-8 decode. `TextDecoder` is not guaranteed on every RN/Hermes
 * build, and the index is plain text in practice, so decode by hand.
 */
function utf8Decode(buf: Uint8Array, start: number, end: number): string {
  let out = '';
  let i = start;
  while (i < end) {
    const b0 = buf[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if (b0 < 0xe0) {
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (buf[i++] & 0x3f));
    } else if (b0 < 0xf0) {
      out += String.fromCharCode(
        ((b0 & 0x0f) << 12) | ((buf[i++] & 0x3f) << 6) | (buf[i++] & 0x3f),
      );
    } else {
      const cp =
        ((b0 & 0x07) << 18) |
        ((buf[i++] & 0x3f) << 12) |
        ((buf[i++] & 0x3f) << 6) |
        (buf[i++] & 0x3f);
      const v = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    }
  }
  return out;
}

function decodeSource(r: Reader): PbSource {
  const src: PbSource = { id: '', name: '', lang: '' };
  for (const [field, wire] of r.tags()) {
    if (field === 1 && wire === WIRE_VARINT) src.id = r.varint64();
    else if (field === 2 && wire === WIRE_LEN) src.name = r.string();
    else if (field === 3 && wire === WIRE_LEN) src.lang = r.string();
    else if (field === 4 && wire === WIRE_LEN) src.baseUrl = r.string();
    else r.skip(wire);
  }
  return src;
}

function decodeExtension(r: Reader): PbExtension {
  const ext: PbExtension = {
    name: '',
    pkg: '',
    apkUrl: '',
    extensionLib: '',
    versionCode: 0,
    versionName: '',
    contentRating: ContentRating.Unspecified,
    sources: [],
  };
  for (const [field, wire] of r.tags()) {
    if (field === 1 && wire === WIRE_LEN) ext.name = r.string();
    else if (field === 2 && wire === WIRE_LEN) ext.pkg = r.string();
    else if (field === 3 && wire === WIRE_LEN) {
      const urls = r.sub();
      for (const [uf, uw] of urls.tags()) {
        if (uf === 1 && uw === WIRE_LEN) ext.apkUrl = urls.string();
        else if (uf === 2 && uw === WIRE_LEN) ext.iconUrl = urls.string();
        else if (uf === 501 && uw === WIRE_LEN) ext.jarUrl = urls.string();
        else urls.skip(uw);
      }
    } else if (field === 4 && wire === WIRE_LEN) ext.extensionLib = r.string();
    else if (field === 5 && wire === WIRE_VARINT) ext.versionCode = r.varint();
    else if (field === 6 && wire === WIRE_LEN) ext.versionName = r.string();
    else if (field === 7 && wire === WIRE_VARINT) ext.contentRating = r.varint();
    else if (field === 8 && wire === WIRE_LEN) ext.sources.push(decodeSource(r.sub()));
    else r.skip(wire);
  }
  return ext;
}

/** Decodes an already-inflated `index.pb` payload. */
export function decodeRepoIndexPb(bytes: Uint8Array): PbIndex {
  const index: PbIndex = { name: '', extensions: [] };
  const r = new Reader(bytes);
  for (const [field, wire] of r.tags()) {
    if (field === 1 && wire === WIRE_LEN) index.name = r.string();
    else if (field === 2 && wire === WIRE_LEN) index.shortName = r.string();
    else if (field === 3 && wire === WIRE_LEN) index.signingKeyFingerprint = r.string();
    else if (field === 4 && wire === WIRE_LEN) {
      const meta = r.sub();
      for (const [mf, mw] of meta.tags()) {
        if (mf === 1 && mw === WIRE_LEN) index.website = meta.string();
        else meta.skip(mw);
      }
    } else if (field === 101 && wire === WIRE_LEN) {
      const list = r.sub();
      for (const [lf, lw] of list.tags()) {
        if (lf === 1 && lw === WIRE_LEN) index.extensions.push(decodeExtension(list.sub()));
        else list.skip(lw);
      }
    } else r.skip(wire);
  }
  return index;
}
