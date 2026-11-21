import assert from "node:assert/strict";
import { test } from "node:test";
import { GatewayError } from "../src/core/errors.ts";
import { parsePin, parseTarget, pinnedTarget } from "../src/core/target.ts";
import { ADDRESS } from "./helpers.ts";

const parse = (url: string) => parseTarget(new URL(url));

test("host form: address and chain come from the two leftmost labels", () => {
  const target = parse(`https://${ADDRESS}.11155111.gw44.io/`);

  assert.deepEqual(target, { chain: "11155111", address: ADDRESS, resource: [], params: [] });
});

test("host form: path and query become the ERC-5219 resource and params", () => {
  const target = parse(`https://${ADDRESS}.1.gw44.io/a/b%20c/widget.js?x=1&y=`);

  assert.deepEqual(target?.resource, ["a", "b c", "widget.js"]);
  assert.deepEqual(target?.params, [["x", "1"], ["y", ""]]);
});

test("host form works under any base, including a localhost one", () => {
  const target = parse(`http://${ADDRESS}.31337.localhost:8244/widget.js`);

  assert.equal(target?.chain, "31337");
  assert.deepEqual(target?.resource, ["widget.js"]);
});

test("path form on loopback", () => {
  for (const host of ["localhost:8244", "127.0.0.1:8244", "[::1]:8244", "gw.localhost"]) {
    const target = parse(`http://${host}/84532/${ADDRESS}/widget.js`);

    assert.deepEqual(target, { chain: "84532", address: ADDRESS, resource: ["widget.js"], params: [] }, host);
  }
});

test("path form accepts a checksummed address and lower-cases it", () => {
  const target = parse(`http://localhost/1/${ADDRESS.toUpperCase().replace("0X", "0x")}/`);

  assert.equal(target?.address, ADDRESS);
});

test("path form without the trailing slash asks for a redirect that keeps the query", () => {
  const target = parse(`http://localhost:8244/1/${ADDRESS}?a=1`);

  assert.equal(target?.redirect, `/1/${ADDRESS}/?a=1`);
});

test("path form is refused on a public host, where it would share one origin", () => {
  for (const host of ["gw44.io", "example.com", "localhost.evil.com", "127.0.0.1.evil.com", "10.0.0.1"]) {
    assert.equal(parse(`https://${host}/1/${ADDRESS}/`), null, host);
  }
});

test("URLs that name no contract are left to the static host", () => {
  for (const url of [
    "https://gw44.io/",
    "http://localhost:8244/",
    "http://localhost:8244/1/",
    "http://localhost:8244/01/" + ADDRESS + "/",
    "http://localhost:8244/1/0x1234/",
    "http://localhost:8244/sepolia/" + ADDRESS + "/",
    `https://${ADDRESS}.sepolia.gw44.io/`,
    `https://${ADDRESS}.gw44/`,
  ]) {
    assert.equal(parse(url), null, url);
  }
});

test("malformed percent-encoding is a bad target, not a crash", () => {
  assert.throws(() => parse(`https://${ADDRESS}.1.gw44.io/%E0%A4%A`), GatewayError);
});

// --- the pin: one contract, every URL ---

const OTHER = "0x00d19609f2349d4160d2babaf46b0cd1ec6d7f8e";
const PIN = parsePin(`11155111:${ADDRESS}`);
const pinned = (url: string) => pinnedTarget(new URL(url), PIN);

test("a pinned build serves its contract at any hostname, root and nested", () => {
  for (const host of ["https://example.com", "http://localhost:8244", "https://pinned.invalid"]) {
    assert.deepEqual(pinned(`${host}/`), { chain: "11155111", address: ADDRESS, resource: [], params: [] }, host);
    assert.deepEqual(
      pinned(`${host}/a/b/widget.js?v=2`),
      { chain: "11155111", address: ADDRESS, resource: ["a", "b", "widget.js"], params: [["v", "2"]] },
      host,
    );
  }
});

test("a host-form hostname naming another contract still gets the pinned one", () => {
  assert.deepEqual(pinned(`https://${OTHER}.84532.gw44.io/`), {
    chain: "11155111",
    address: ADDRESS,
    resource: [],
    params: [],
  });
});

/* The path form is the case that would otherwise reach a second contract, so the pinned build must
   read it as an ordinary three-segment path of its own contract and never as a chain and address. */
test("a path-form path naming another contract is a resource of the pinned contract", () => {
  assert.deepEqual(pinned(`http://localhost:8244/84532/${OTHER}/`), {
    chain: "11155111",
    address: ADDRESS,
    resource: ["84532", OTHER, ""],
    params: [],
  });
});

test("a pinned target never redirects", () => {
  assert.equal(Object.hasOwn(pinned(`http://localhost:8244/1/${OTHER}`), "redirect"), false);
});

test("malformed percent-encoding is still a bad target under a pin", () => {
  assert.throws(() => pinned("https://example.com/%E0%A4%A"), GatewayError);
});

test("a malformed pin is rejected rather than guessed at", () => {
  for (const bad of [
    `11155111${ADDRESS}`, // no colon
    `011155111:${ADDRESS}`, // chain with a leading zero
    "11155111:0x00a9f390a6010d045e0d34856048ddd6910d25b", // 39 hex digits
    `11155111:${ADDRESS.slice(2)}`, // no 0x
    "", // empty
    `11155111:${ADDRESS}:`, // a trailing colon part
  ]) {
    assert.throws(() => parsePin(bad), GatewayError, bad);
  }
});

test("a pin's address is accepted in mixed case and carried lower-case", () => {
  assert.deepEqual(parsePin(`11155111:${ADDRESS.toUpperCase().replace("0X", "0x")}`), {
    chain: "11155111",
    address: ADDRESS,
  });
});
