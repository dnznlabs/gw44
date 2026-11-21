import assert from "node:assert/strict";
import { test } from "node:test";
import { createFetchRpc } from "../src/adapters/rpc/fetch.ts";
import { type MemoryCalls, createMemoryRpc, memoryKey } from "../src/adapters/rpc/memory.ts";
import { HTML_SELECTOR, encodeRequest } from "../src/core/abi.ts";
import { GatewayError } from "../src/core/errors.ts";
import type { Rpc } from "../src/core/ports.ts";
import { ROOT_FRAME_POLICY, resolve } from "../src/core/resolve.ts";
import { type Frame, parseTarget } from "../src/core/target.ts";
import { ADDRESS, htmlResult, requestResult } from "./helpers.ts";

const text = (b: Uint8Array): string => new TextDecoder().decode(b);
const header = (headers: [string, string][], name: string): string | undefined =>
  headers.find(([k]) => k === name)?.[1];

function gateway(
  calls: [data: string, result: Uint8Array][],
  frame?: Frame,
): (path: string) => ReturnType<typeof resolve> {
  const map: MemoryCalls = new Map(calls.map(([data, result]) => [memoryKey("1", ADDRESS, data), result]));
  const rpc = createMemoryRpc(["1"], map);
  return (path) => {
    const target = parseTarget(new URL(`https://${ADDRESS}.1.gw44.io${path}`));
    assert.ok(target);
    return frame === undefined ? resolve(target, rpc) : resolve(target, rpc, frame);
  };
}

test("the root is html(), served as an HTML document", async () => {
  const get = gateway([[HTML_SELECTOR, htmlResult("<!doctype html><p>hi</p>")]]);

  const res = await get("/");

  assert.equal(res.status, 200);
  assert.equal(header(res.headers, "content-type"), "text/html; charset=utf-8");
  assert.equal(text(res.body), "<!doctype html><p>hi</p>");
});

test("every response forbids caching and sniffing", async () => {
  const get = gateway([[HTML_SELECTOR, htmlResult("x")]]);

  for (const res of [await get("/"), await get("/missing")]) {
    assert.equal(header(res.headers, "cache-control"), "no-store");
    assert.equal(header(res.headers, "x-content-type-options"), "nosniff");
  }
});

test("the root ignores the query string and never falls back to request()", async () => {
  const get = gateway([[encodeRequest([], []), requestResult(200, "from request()", [])]]);

  const res = await get("/?a=1");

  assert.equal(res.status, 404);
});

test("any other path is ERC-5219 request(), with the contract's status and type", async () => {
  const get = gateway([
    [encodeRequest(["widget.js"], []), requestResult(200, "alert(1)", [["Content-Type", "application/javascript"]])],
    [encodeRequest(["gone"], [["a", "1"]]), requestResult(410, "gone", [["content-type", "text/plain"]])],
  ]);

  const widget = await get("/widget.js");
  const gone = await get("/gone?a=1");

  assert.equal(widget.status, 200);
  assert.equal(header(widget.headers, "content-type"), "application/javascript");
  assert.equal(text(widget.body), "alert(1)");
  assert.equal(gone.status, 410);
});

test("a response without a content type is opaque bytes, never guessed", async () => {
  const get = gateway([[encodeRequest(["x"], []), requestResult(200, "<script>", [])]]);

  const res = await get("/x");

  assert.equal(header(res.headers, "content-type"), "application/octet-stream");
});

test("headers outside the allowlist, and values with control bytes, are dropped", async () => {
  const get = gateway([
    [
      encodeRequest(["x"], []),
      requestResult(200, "", [
        ["Set-Cookie", "a=b; Domain=gw44.io"],
        ["Clear-Site-Data", '"*"'],
        ["Cache-Control", "max-age=31536000"],
        ["Service-Worker-Allowed", "/"],
        ["Content-Language", "en\r\nSet-Cookie: a=b"],
        ["Content-Security-Policy", "default-src 'none'"],
      ]),
    ],
  ]);

  const res = await get("/x");

  assert.deepEqual(res.headers.map(([k]) => k).sort(), [
    "cache-control",
    "content-security-policy",
    "content-type",
    "x-content-type-options",
  ]);
  assert.equal(header(res.headers, "cache-control"), "no-store");
});

test("a compressed body is refused rather than served as garbage", async () => {
  const get = gateway([[encodeRequest(["x"], []), requestResult(200, "\x1f\x8b", [["Content-Encoding", "gzip"]])]]);

  const res = await get("/x");

  assert.equal(res.status, 502);
});

test("a status a Response cannot carry is a bad response", async () => {
  const get = gateway([[encodeRequest(["x"], []), requestResult(42, "", [])]]);

  const res = await get("/x");

  assert.equal(res.status, 502);
});

test("a revert, an empty document and an address without code are all 404", async () => {
  const get = gateway([
    [HTML_SELECTOR, htmlResult("")],
    [encodeRequest(["eoa"], []), new Uint8Array()],
  ]);

  assert.equal((await get("/")).status, 404);
  assert.equal((await get("/eoa")).status, 404);
  assert.equal((await get("/reverts")).status, 404);
});

test("undecodable return data is 502 with a plain-text body", async () => {
  const get = gateway([[HTML_SELECTOR, new Uint8Array(7)]]);

  const res = await get("/");

  assert.equal(res.status, 502);
  assert.equal(header(res.headers, "content-type"), "text/plain; charset=utf-8");
});

test("an unconfigured chain is 404 and makes no call", async () => {
  let called = false;
  const rpc: Rpc = { supports: () => false, call: async () => ((called = true), new Uint8Array()) };
  const target = parseTarget(new URL(`https://${ADDRESS}.5.gw44.io/`));
  assert.ok(target);

  const res = await resolve(target, rpc);

  assert.equal(res.status, 404);
  assert.equal(called, false);
});

test("an RPC outage is 502, and an unexpected throw does not leak its message", async () => {
  const target = parseTarget(new URL(`https://${ADDRESS}.1.gw44.io/`));
  assert.ok(target);
  const down: Rpc = { supports: () => true, call: async () => Promise.reject(new GatewayError("upstream", "no RPC")) };
  const broken: Rpc = { supports: () => true, call: async () => Promise.reject(new Error("secret internals")) };

  const outage = await resolve(target, down);
  const bug = await resolve(target, broken);

  assert.equal(outage.status, 502);
  assert.equal(bug.status, 502);
  assert.doesNotMatch(text(bug.body), /secret/);
});

/* The real adapter, end to end, once: everything above substitutes `Rpc` itself, so nothing else
   pins what a visitor sees when the configured endpoint is the thing that failed. */
test("the real fetch adapter behind resolve(): a failing endpoint is 502 text, with none of its body", async () => {
  const target = parseTarget(new URL(`https://${ADDRESS}.1.gw44.io/`));
  assert.ok(target);
  const rpc = createFetchRpc(
    { "1": ["https://endpoint.invalid"] },
    {
      fetch: (async () =>
        new Response("rate limited: project 0bad51de over quota, contact support@example.invalid", {
          status: 429,
        })) as typeof fetch,
    },
  );

  const res = await resolve(target, rpc);
  const body = text(res.body);

  assert.equal(res.status, 502);
  assert.equal(header(res.headers, "content-type"), "text/plain; charset=utf-8");
  assert.equal(body, "gw44: no RPC endpoint for chain 1 answered\n");
  // The endpoint's body is the part that must not travel: it can name a project, a key or a host.
  for (const leak of ["rate limited", "0bad51de", "support@example.invalid", "429"]) {
    assert.doesNotMatch(body, new RegExp(leak), `the endpoint's body reached the client: ${leak}`);
  }
});

/* The framing rule a root document is served with (#57). `html()` returns bytes and no headers, so
   without this the page could be framed by any site; the gateway supplies what the document cannot. */
test("a root document is served frame-ancestors 'self' by default", async () => {
  for (const frame of [undefined, "self"] as const) {
    const get = gateway([[HTML_SELECTOR, htmlResult("<!doctype html><p>hi</p>")]], frame);

    const res = await get("/");

    assert.equal(header(res.headers, "content-security-policy"), ROOT_FRAME_POLICY, String(frame));
  }
});

test('"any" omits the header, which is the whole of what it means', async () => {
  const get = gateway([[HTML_SELECTOR, htmlResult("<!doctype html><p>hi</p>")]], "any");

  const res = await get("/");

  assert.equal(res.status, 200);
  assert.equal(header(res.headers, "content-security-policy"), undefined);
});

/* Only the root. A sub-path's headers are the contract's, within the allowlist, and a gateway header
   there would silently override a policy the contract set for its own resource. */
test("a sub-path carries no framing header, with either setting", async () => {
  const calls: [string, Uint8Array][] = [
    [encodeRequest(["page"], []), requestResult(200, "<p>page</p>", [["Content-Type", "text/html"]])],
  ];
  for (const frame of [undefined, "self", "any"] as const) {
    const res = await gateway(calls, frame)("/page");

    assert.equal(res.status, 200);
    assert.equal(header(res.headers, "content-security-policy"), undefined, String(frame));
  }
});

test("a contract's own policy on a sub-path is still passed through", async () => {
  const calls: [string, Uint8Array][] = [
    [
      encodeRequest(["page"], []),
      requestResult(200, "<p>page</p>", [
        ["Content-Type", "text/html"],
        ["Content-Security-Policy", "frame-ancestors https://example.com"],
      ]),
    ],
  ];

  const res = await gateway(calls)("/page");

  assert.equal(header(res.headers, "content-security-policy"), "frame-ancestors https://example.com");
});
