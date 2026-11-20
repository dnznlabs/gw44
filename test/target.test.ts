import assert from "node:assert/strict";
import { test } from "node:test";
import { GatewayError } from "../src/core/errors.ts";
import { parseTarget } from "../src/core/target.ts";
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
