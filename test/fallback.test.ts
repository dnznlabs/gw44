// The no-worker fallback's two pure decisions (F2 of the 2026-11-20 review). The third, that the
// page is the top-level one, needs a browser and is in test/e2e/gateway.e2e.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { UNHONOURABLE_HEADERS, headersAreHonourable, isRootTarget } from "../src/adapters/sw/fallback.ts";
import type { GatewayResponse } from "../src/core/ports.ts";
import type { Target } from "../src/core/target.ts";
import { ADDRESS } from "./helpers.ts";

const target = (resource: string[]): Target => ({ chain: "1", address: ADDRESS, resource, params: [] });
const response = (headers: [string, string][]): GatewayResponse => ({
  status: 200,
  headers: [["content-type", "text/html; charset=utf-8"], ...headers],
  body: new Uint8Array(),
});

test("only a contract's root is rendered inline", () => {
  assert.equal(isRootTarget(target([])), true);
  for (const resource of [["widget.js"], ["a", "b"], [""], ["1", ADDRESS, ""]]) {
    assert.equal(isRootTarget(target(resource)), false, JSON.stringify(resource));
  }
});

test("a response carrying only headers the page can honour is rendered", () => {
  assert.equal(headersAreHonourable(response([])), true);
  assert.equal(
    headersAreHonourable(response([["cache-control", "no-store"], ["x-content-type-options", "nosniff"]])),
    true,
  );
});

/* Each one on its own: a list that only refused when several were present would pass a test written
   with all of them at once. */
test("any header the page cannot honour declines the render, one at a time", () => {
  for (const header of UNHONOURABLE_HEADERS) {
    assert.equal(headersAreHonourable(response([[header, "whatever"]])), false, header);
  }
});

test("the header check is case-insensitive, because a contract chooses the case", () => {
  assert.equal(headersAreHonourable(response([["Content-Security-Policy", "default-src 'none'"]])), false);
  assert.equal(headersAreHonourable(response([["X-FRAME-OPTIONS", "DENY"]])), false);
});

test("the list names every header the core can pass that the fallback cannot honour", () => {
  // Guards the pairing: a header added to what the worker passes through is considered for this list.
  for (const header of [
    "content-security-policy",
    "x-frame-options",
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy",
    "permissions-policy",
    "content-disposition",
  ]) {
    assert.ok(UNHONOURABLE_HEADERS.includes(header), header);
  }
});
