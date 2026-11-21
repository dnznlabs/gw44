// An ABI encoder for return data, written apart from src/core/abi.ts on purpose: the tests check
// the gateway's decoder against this and against vectors from `cast`, not against itself.
const utf8 = new TextEncoder();
const WORD = 32;

function word(n: number): Uint8Array {
  const out = new Uint8Array(32);
  new DataView(out.buffer).setUint32(28, n);
  return out;
}

export function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function str(s: string | Uint8Array): Uint8Array {
  const data = typeof s === "string" ? utf8.encode(s) : s;
  const padded = new Uint8Array(Math.ceil(data.length / 32) * 32);
  padded.set(data);
  return cat(word(data.length), padded);
}

/** Return data of `html()`. */
export function htmlResult(doc: string | Uint8Array): Uint8Array {
  return cat(word(32), str(doc));
}

/** Return data of `request()`. */
export function requestResult(status: number, body: string | Uint8Array, headers: [string, string][]): Uint8Array {
  const b = str(body);
  const pairs = headers.map(([k, v]) => {
    const key = str(k);
    return cat(word(64), word(64 + key.length), key, str(v));
  });
  let at = pairs.length * 32;
  const offsets = pairs.map((p) => {
    const o = word(at);
    at += p.length;
    return o;
  });
  return cat(word(status), word(96), word(96 + b.length), b, word(pairs.length), ...offsets, ...pairs);
}

/**
 * Return data of `request()` whose every header pair aliases one string, which `requestResult`
 * cannot build because it lays each pair out separately. Every bounds check passes: the offsets are
 * inside the data and the lengths are honest. What it costs is `count * 2` decodes of one string, so
 * `size` bytes on the wire become `count * 2 * size` bytes of header text (F3, m01-t06).
 */
export function aliasedHeaderResult(count: number, size: number): Uint8Array {
  const body = str("");
  const big = str("h".repeat(size));
  // Every pair offset is relative to the word after the count, and names the one pair below.
  const pairAt = count * WORD;
  const offsets = Array.from({ length: count }, () => word(pairAt));
  // Both of the pair's own offsets are relative to the pair, and name the same string.
  const pair = cat(word(2 * WORD), word(2 * WORD), big);
  const list = cat(word(count), ...offsets, pair);
  return cat(word(200), word(96), word(96 + body.length), body, list);
}

export const ADDRESS = "0x00a9f390a6010d045e0d34856048ddd6910d25ba";
