import { GatewayError } from "./errors.ts";

/** `bytes4(keccak256("html()"))`, ERC-8244. */
export const HTML_SELECTOR = "0x33c34ac3";
/** `bytes4(keccak256("request(string[],(string,string)[])"))`, ERC-5219. */
export const REQUEST_SELECTOR = "0x1374c460";

const WORD = 32;
const MAX_HEADERS = 64;
const utf8 = new TextEncoder();

export function hexToBytes(hex: string): Uint8Array {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(hex)) throw new GatewayError("bad-response", "result is not hex");
  const out = new Uint8Array((hex.length - 2) / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function word(n: number): Uint8Array {
  const out = new Uint8Array(WORD);
  new DataView(out.buffer).setUint32(WORD - 4, n);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function encodeString(s: string): Uint8Array {
  const data = utf8.encode(s);
  const padded = new Uint8Array(Math.ceil(data.length / WORD) * WORD);
  padded.set(data);
  return concat([word(data.length), padded]);
}

/** A dynamic array of dynamic items: length, one offset per item, then the items. */
function encodeArray(items: Uint8Array[]): Uint8Array {
  const offsets: Uint8Array[] = [];
  let at = items.length * WORD;
  for (const item of items) {
    offsets.push(word(at));
    at += item.length;
  }
  return concat([word(items.length), ...offsets, ...items]);
}

function encodePair([key, value]: [string, string]): Uint8Array {
  const k = encodeString(key);
  return concat([word(2 * WORD), word(2 * WORD + k.length), k, encodeString(value)]);
}

/** Calldata for ERC-5219 `request(string[] resource, KeyValue[] params)`. */
export function encodeRequest(resource: string[], params: [string, string][]): string {
  const r = encodeArray(resource.map(encodeString));
  const p = encodeArray(params.map(encodePair));
  return REQUEST_SELECTOR + bytesToHex(concat([word(2 * WORD), word(2 * WORD + r.length), r, p])).slice(2);
}

/**
 * Reads ABI words out of bytes a contract chose. Every offset and length is attacker-controlled,
 * so each read is bounds-checked against the buffer and nothing is allocated from a claimed size.
 */
function uint(data: Uint8Array, at: number): number {
  if (!Number.isSafeInteger(at) || at < 0 || at + WORD > data.length) {
    throw new GatewayError("bad-response", "return data is truncated");
  }
  for (let i = at; i < at + WORD - 6; i++) {
    if (data[i] !== 0) throw new GatewayError("bad-response", "return data has an out-of-range word");
  }
  let n = 0;
  for (let i = at + WORD - 6; i < at + WORD; i++) n = n * 256 + (data[i] ?? 0);
  return n;
}

function bytesAt(data: Uint8Array, at: number): Uint8Array {
  const length = uint(data, at);
  const start = at + WORD;
  if (start + length > data.length) throw new GatewayError("bad-response", "return data is truncated");
  return data.subarray(start, start + length);
}

/** Return data of `html()`: one ABI `string`, handed back as its raw bytes. */
export function decodeString(data: Uint8Array): Uint8Array {
  return bytesAt(data, uint(data, 0));
}

export interface RequestResult {
  status: number;
  body: Uint8Array;
  headers: [string, string][];
}

/** Return data of ERC-5219 `request()`: `(uint16 statusCode, string body, KeyValue[] headers)`. */
export function decodeRequestResult(data: Uint8Array): RequestResult {
  const status = uint(data, 0);
  const body = bytesAt(data, uint(data, WORD));
  const list = uint(data, 2 * WORD);
  const count = uint(data, list);
  if (count > MAX_HEADERS) throw new GatewayError("bad-response", "too many headers");
  const base = list + WORD;
  const text = new TextDecoder("utf-8", { fatal: true });
  const headers: [string, string][] = [];
  try {
    for (let i = 0; i < count; i++) {
      const pair = base + uint(data, base + i * WORD);
      const key = bytesAt(data, pair + uint(data, pair));
      const value = bytesAt(data, pair + uint(data, pair + WORD));
      headers.push([text.decode(key), text.decode(value)]);
    }
  } catch (e) {
    if (e instanceof GatewayError) throw e;
    throw new GatewayError("bad-response", "header is not UTF-8");
  }
  return { status, body, headers };
}
