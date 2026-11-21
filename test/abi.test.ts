import assert from "node:assert/strict";
import { test } from "node:test";
import { bytesToHex, decodeRequestResult, decodeString, encodeRequest, hexToBytes } from "../src/core/abi.ts";
import { GatewayError } from "../src/core/errors.ts";
import { aliasedHeaderResult, htmlResult, requestResult } from "./helpers.ts";
import { CALL_MIXED, CALL_WIDGET, RESULT_HTML, RESULT_REQUEST } from "./vectors.ts";

const text = (b: Uint8Array): string => new TextDecoder().decode(b);

test("encodeRequest matches cast for one segment and no params", () => {
  const calldata = encodeRequest(["widget.js"], []);

  assert.equal(calldata, CALL_WIDGET);
});

test("encodeRequest matches cast for multi-byte segments and params", () => {
  const calldata = encodeRequest(["a", "b c", "ü"], [["k", "v"], ["empty", ""]]);

  assert.equal(calldata, CALL_MIXED);
});

test("decodeString reads cast's html() return data", () => {
  const body = decodeString(hexToBytes(RESULT_HTML));

  assert.equal(text(body), "<!doctype html><p>hi</p>");
});

test("decodeRequestResult reads cast's request() return data", () => {
  const result = decodeRequestResult(hexToBytes(RESULT_REQUEST));

  assert.equal(result.status, 200);
  assert.equal(text(result.body), "hello world");
  assert.deepEqual(result.headers, [["Content-Type", "text/plain"], ["X-Other", "1"]]);
});

test("the independent test encoder agrees with cast", () => {
  const html = bytesToHex(htmlResult("<!doctype html><p>hi</p>"));
  const request = bytesToHex(requestResult(200, "hello world", [["Content-Type", "text/plain"], ["X-Other", "1"]]));

  assert.equal(html, RESULT_HTML);
  assert.equal(request, RESULT_REQUEST);
});

test("hexToBytes rejects anything that is not whole hex bytes", () => {
  for (const bad of ["", "00", "0x0", "0xzz", "0x00 ", "0X00"]) {
    assert.throws(() => hexToBytes(bad), GatewayError, bad);
  }
});

test("a length that runs past the buffer is refused, not read", () => {
  const data = htmlResult("abc");
  data[63] = 0xff; // claims 255 bytes; 32 follow

  assert.throws(() => decodeString(data), /truncated/);
});

test("an offset too large for a number is refused", () => {
  const data = htmlResult("abc");
  data[0] = 0x80;

  assert.throws(() => decodeString(data), /out-of-range/);
});

test("a header count above the cap is refused before any header is read", () => {
  const data = requestResult(200, "", []);
  data[data.length - 2] = 0xff; // count word: 0xff00

  assert.throws(() => decodeRequestResult(data), /too many headers/);
});

/* F4 of the 2026-11-20 review: the validating regular expression backtracked once per byte and threw
   `RangeError` above about 4 MiB, which the RPC adapter counted as that endpoint failing — so a
   document the size cap admits was fetched from every endpoint in turn and served as a 502. */
test("eight mebibytes of hex decode, where the regular expression overflowed", () => {
  const hex = `0x${"ab".repeat(8 * 1024 * 1024)}`;

  const out = hexToBytes(hex);

  assert.equal(out.length, 8 * 1024 * 1024);
  assert.equal(out[0], 0xab);
  assert.equal(out.at(-1), 0xab);
});

test("one bad character at the end of a large string is bad-response, never a RangeError", () => {
  const hex = `0x${"ab".repeat(5 * 1024 * 1024 - 1)}zz`;

  assert.throws(() => hexToBytes(hex), GatewayError);
  assert.throws(() => hexToBytes(hex), /not hex/);
});

/* F3 of the 2026-11-20 review: the count cap bounded how many headers were read and nothing bounded
   how much text they decoded to, so 64 pairs aliasing one string multiplied the data 128 times. */
test("headers that alias one string are refused before any of them is decoded", () => {
  const data = aliasedHeaderResult(64, 64 * 1024);

  assert.throws(() => decodeRequestResult(data), GatewayError);
  assert.throws(() => decodeRequestResult(data), /header/);
});

test("the size bound is on the header text, not on the data: a small aliased set still decodes", () => {
  const result = decodeRequestResult(aliasedHeaderResult(64, 64));

  assert.equal(result.headers.length, 64);
  assert.equal(result.headers[0]?.[0], "h".repeat(64));
});

test("sixty-four distinct small headers still decode", () => {
  const headers: [string, string][] = Array.from({ length: 64 }, (_, i) => [`x-k-${i}`, `v-${i}`]);
  const result = decodeRequestResult(requestResult(200, "", headers));

  assert.equal(result.headers.length, 64);
  assert.deepEqual(result.headers[63], ["x-k-63", "v-63"]);
});

/* The run count is `GW44_FUZZ_RUNS`, default 20,000 so `make test` stays quick; CI sets 1,000,000.
   A value that is not a positive integer fails rather than silently falling back, because a typo in
   the workflow would otherwise turn the million into the default and nobody would notice. */
function fuzzRuns(): number {
  const raw = process.env["GW44_FUZZ_RUNS"];
  if (raw === undefined || raw === "") return 20_000;
  const runs = Number(raw);
  assert.ok(
    Number.isInteger(runs) && runs > 0,
    `GW44_FUZZ_RUNS must be a positive integer; got ${JSON.stringify(raw)}`,
  );
  return runs;
}

test("no bytes a contract can return make the decoders throw anything but GatewayError", () => {
  const runs = fuzzRuns();
  // Deterministic xorshift, so a failure names a reproducible input.
  let seed = 0x9e3779b9;
  const next = (): number => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const valid = [htmlResult("hello"), requestResult(200, "body", [["Content-Type", "text/plain"], ["a", "b"]])];

  for (let i = 0; i < runs; i++) {
    const base = valid[i % 2] as Uint8Array;
    // Half the runs mutate a valid encoding, which reaches deeper than noise does.
    const data = i % 4 < 2 ? base.slice(0, next() % (base.length + 1)) : new Uint8Array(next() % 400);
    const flips = i % 4 < 2 ? 1 + (next() % 3) : data.length;
    for (let f = 0; f < flips && data.length > 0; f++) data[next() % data.length] = next() & 0xff;
    for (const decode of [decodeString, decodeRequestResult]) {
      try {
        decode(data);
      } catch (error) {
        assert.ok(error instanceof GatewayError, `run ${i} of ${runs}: ${String(error)}`);
      }
    }
  }
});
