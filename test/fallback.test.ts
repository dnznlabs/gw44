// The no-worker fallback's pure decisions (F2 of the 2026-11-20 review) and the boot counter it was
// joined by (#59). The one decision that needs a browser — that the page is the top-level one — is
// in test/e2e/gateway.e2e.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ATTEMPT_WINDOW_MS,
  MAX_ATTEMPTS,
  UNHONOURABLE_HEADERS,
  attemptsFrom,
  attemptsValue,
  headersAreHonourable,
  isRootTarget,
} from "../src/adapters/sw/fallback.ts";
import type { GatewayResponse } from "../src/core/ports.ts";
import { ROOT_FRAME_POLICY } from "../src/core/resolve.ts";
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

/* The boot counter (#59). The key is session storage, which a rendered contract document shares with
   the shell, so every case below is a value a document can write. `now` is passed in rather than
   read from the clock: what the parser decides is a function of the two. */
const NOW = 1_700_000_000_000;

test("a counter the page wrote itself is read back", () => {
  assert.equal(attemptsFrom(`0:${NOW}`, NOW), 0);
  assert.equal(attemptsFrom(`1:${NOW - 100}`, NOW), 1);
  assert.equal(attemptsFrom(`2:${NOW - ATTEMPT_WINDOW_MS + 1}`, NOW), 2);
});

test("no counter is a first load, not a spent one", () => {
  assert.equal(attemptsFrom(null, NOW), 0);
});

test("a counter older than the window is a fresh visit", () => {
  assert.equal(attemptsFrom(`9:${NOW - ATTEMPT_WINDOW_MS}`, NOW), 0);
  assert.equal(attemptsFrom(`2:${NOW - 60_000}`, NOW), 0);
  // Well formed, and the epoch is as stale as a timestamp gets. The old parser read the same 0 by
  // arithmetic on a value it had not checked, which is why the two cases look alike and are not.
  assert.equal(attemptsFrom("0:0", NOW), 0);
});

/* The property the finding is about: anything that is not a counter stops the reload rather than
   licensing one. Each on its own, with what the old `split(":").map(Number)` made of it. */
test("a value that is not a counter is the maximum, so a document cannot cause a loop", () => {
  const notCounters = [
    "", // Number("") is 0, and 0 was both the count and a timestamp inside the window
    "x:y",
    "0", // no timestamp at all
    `-1:${NOW}`,
    `1.5:${NOW}`,
    `1e0:${NOW}`,
    `10:${NOW}`, // two digits of count: not a value this page ever writes
    `0:${NOW} `,
    ` 0:${NOW}`,
    `0:0x${NOW.toString(16)}`,
    `0:${NOW}:${NOW}`,
    "0:Infinity",
    "0:NaN",
  ];
  for (const stored of notCounters) {
    assert.equal(attemptsFrom(stored, NOW), MAX_ATTEMPTS, JSON.stringify(stored));
  }
});

test("a timestamp in the future is the maximum, so the window cannot be held open", () => {
  assert.equal(attemptsFrom(`0:${NOW + 1}`, NOW), MAX_ATTEMPTS);
  assert.equal(attemptsFrom(`0:999999999999999`, NOW), MAX_ATTEMPTS);
});

/* The pair has to close: a value this page writes is a value it can read, or the guard resets itself
   every load and the loop it exists to stop comes back. */
test("what the page writes is what the parser accepts", () => {
  for (let n = 0; n <= 9; n++) {
    const written = attemptsValue(n, NOW);
    assert.equal(attemptsFrom(written, NOW), Math.min(n + 1, 9), written);
  }
});

/* The one header the fallback now meets, since #57 gives a root document a framing policy. It is
   honoured by where the page renders rather than by applying it: `boot.ts` renders only at the top
   level, which is stricter than `frame-ancestors 'self'` asks for. Anything else is declined. */
test("the gateway's own framing default is honourable; another policy is not", () => {
  assert.equal(headersAreHonourable(response([["content-security-policy", ROOT_FRAME_POLICY]])), true);
  assert.equal(headersAreHonourable(response([["Content-Security-Policy", ROOT_FRAME_POLICY]])), true);
  for (const value of [
    "frame-ancestors *",
    "frame-ancestors 'self' https://example.com",
    "frame-ancestors  'self'",
    "default-src 'none'",
    `${ROOT_FRAME_POLICY}; default-src 'none'`,
    "",
  ]) {
    assert.equal(headersAreHonourable(response([["content-security-policy", value]])), false, value);
  }
});
