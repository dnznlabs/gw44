// An ABI encoder for return data, written apart from src/core/abi.ts on purpose: the tests check
// the gateway's decoder against this and against vectors from `cast`, not against itself.
const utf8 = new TextEncoder();

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

export const ADDRESS = "0x00a9f390a6010d045e0d34856048ddd6910d25ba";
