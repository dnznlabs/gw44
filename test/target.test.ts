import assert from "node:assert/strict";
import { test } from "node:test";
import { GatewayError } from "../src/core/errors.ts";
import { parsePin, parsePins, parseTarget, pinnedTarget } from "../src/core/target.ts";
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
    default: "11155111",
    contracts: { "11155111": ADDRESS },
  });
});

// --- the configuration file: one project, one contract per chain ---

const B = "0x00b19609f2349d4160d2babaf46b0cd1ec6d7f8e";
const TWO = parsePins({ default: "1", contracts: { "1": ADDRESS, "8453": B } });
const two = (url: string) => pinnedTarget(new URL(url), TWO);

test("a one-contract configuration needs no default and behaves as a pin", () => {
  assert.deepEqual(parsePins({ contracts: { "1": ADDRESS } }), { default: "1", contracts: { "1": ADDRESS } });
  const one = parsePins({ contracts: { "1": ADDRESS } });
  assert.deepEqual(pinnedTarget(new URL("https://example.com/8453/x"), one), {
    chain: "1",
    address: ADDRESS,
    resource: ["8453", "x"],
    params: [],
  });
});

test("a two-contract configuration is read, and its addresses lower-cased", () => {
  assert.deepEqual(parsePins({ default: "8453", contracts: { "1": ADDRESS.toUpperCase().replace("0X", "0x"), "8453": B } }), {
    default: "8453",
    contracts: { "1": ADDRESS, "8453": B },
  });
});

test("a configuration that cannot be acted on is refused, naming what is wrong", () => {
  for (const [bad, needle] of [
    [{ contracts: { "1": ADDRESS, "8453": B } }, "needs \"default\""],
    [{ default: "5", contracts: { "1": ADDRESS, "8453": B } }, '"default" must be one of'],
    [{ default: "1", contracts: { "1": ADDRESS }, extra: 1 }, 'no key "extra"'],
    [{ default: "1", contracts: { "01": ADDRESS } }, "not a decimal chain id"],
    [{ default: "1", contracts: { "1": "0x1234" } }, "must be 0x and 40 hex digits"],
    [{ default: "1", contracts: {} }, "at least one chain"],
    ["not an object", "must be a JSON object"],
    [[{ "1": ADDRESS }], "must be a JSON object"],
    [{ default: "1", contracts: [] }, '"contracts" must be an object'],
  ] as [unknown, string][]) {
    assert.throws(
      () => parsePins(bad),
      (error: unknown) =>
        error instanceof GatewayError && error.kind === "bad-target" && error.message.includes(needle),
      JSON.stringify(bad),
    );
  }
});

test("with several chains the root redirects to the default, as a 302", () => {
  assert.deepEqual(two("https://example.com/"), {
    chain: "1",
    address: ADDRESS,
    resource: [],
    params: [],
    redirect: "/1/",
    redirectStatus: 302,
  });
});

test("a chain without its trailing slash redirects to it, as a 308", () => {
  assert.deepEqual(two("https://example.com/8453"), {
    chain: "8453",
    address: B,
    resource: [],
    params: [],
    redirect: "/8453/",
    redirectStatus: 308,
  });
});

test("both redirects carry the query", () => {
  assert.equal(two("https://example.com/?a=1&b=2").redirect, "/1/?a=1&b=2");
  assert.equal(two("https://example.com/8453?a=1").redirect, "/8453/?a=1");
});

test("a configured chain's prefix serves that chain's contract", () => {
  assert.deepEqual(two("https://example.com/8453/"), { chain: "8453", address: B, resource: [], params: [] });
  assert.deepEqual(two("https://example.com/8453/a/b"), {
    chain: "8453",
    address: B,
    resource: ["a", "b"],
    params: [],
  });
});

/* The case decision 9 exists for: under one chain's prefix, an address that looks like the path form
   is a resource of the configured contract and never a second contract. */
test("a path-form path under a prefix reaches the configured contract, with the address as a resource", () => {
  assert.deepEqual(two(`https://example.com/1/${B}/`), {
    chain: "1",
    address: ADDRESS,
    resource: [B, ""],
    params: [],
  });
});

test("a first segment that is not a configured chain is a 404 that costs no call", () => {
  for (const path of ["/08453/", "/widget.js", "/favicon.ico", "/5/", "/nope/x"]) {
    assert.throws(
      () => two(`https://example.com${path}`),
      (error: unknown) => error instanceof GatewayError && error.kind === "not-found",
      path,
    );
  }
});

test("a configured build never reads the hostname", () => {
  for (const host of ["https://example.com", "http://localhost:8244", `https://${B}.1.gw44.io`]) {
    assert.deepEqual(two(`${host}/8453/`), { chain: "8453", address: B, resource: [], params: [] });
  }
});
