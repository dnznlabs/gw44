import assert from "node:assert/strict";
import { test } from "node:test";
import { bytesToHex, decodeRequestResult, decodeString, encodeRequest, hexToBytes } from "../src/core/abi.ts";
import { GatewayError } from "../src/core/errors.ts";
import { htmlResult, requestResult } from "./helpers.ts";
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

test("no bytes a contract can return make the decoders throw anything but GatewayError", () => {
  // Deterministic xorshift, so a failure names a reproducible input.
  let seed = 0x9e3779b9;
  const next = (): number => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const valid = [htmlResult("hello"), requestResult(200, "body", [["Content-Type", "text/plain"], ["a", "b"]])];

  for (let i = 0; i < 20_000; i++) {
    const base = valid[i % 2] as Uint8Array;
    // Half the runs mutate a valid encoding, which reaches deeper than noise does.
    const data = i % 4 < 2 ? base.slice(0, next() % (base.length + 1)) : new Uint8Array(next() % 400);
    const flips = i % 4 < 2 ? 1 + (next() % 3) : data.length;
    for (let f = 0; f < flips && data.length > 0; f++) data[next() % data.length] = next() & 0xff;
    for (const decode of [decodeString, decodeRequestResult]) {
      try {
        decode(data);
      } catch (error) {
        assert.ok(error instanceof GatewayError, `run ${i}: ${String(error)}`);
      }
    }
  }
});
