// The chains file's validator (#63). Each case is a file that passed unvalidated and what it cost.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChains } from "../tools/chains.ts";

const GOOD = { "11155111": ["https://ethereum-sepolia-rpc.publicnode.com"] };

test("a well-formed file comes back as itself", () => {
  const chains = parseChains(structuredClone(GOOD));

  assert.deepEqual({ ...chains }, GOOD);
});

test("loopback http is for development and stays accepted", () => {
  for (const host of ["127.0.0.1:8545", "localhost:8545", "dev.localhost", "[::1]:8545"]) {
    assert.doesNotThrow(() => parseChains({ "31337": [`http://${host}`] }), host);
  }
});

test("an empty object is a gateway with no chain, not a malformed file", () => {
  assert.deepEqual({ ...parseChains({}) }, {});
});

/* Every rejected shape, with the message a deployer reads. The point of each is in its name: these
   are not type-checking for its own sake, they are the endpoints a visitor's browser then calls. */
const BAD: [name: string, value: unknown, message: RegExp][] = [
  ["http on a public host is not an endpoint", { "1": ["http://rpc.example.com"] }, /endpoints are https/],
  ["a data: URL is not an endpoint", { "1": ["data:text/plain,0x"] }, /endpoints are https/],
  ["a ws: URL is not an endpoint", { "1": ["wss://rpc.example.com"] }, /endpoints are https/],
  ["a string where a list belongs", { "1": "https://rpc.example.com" }, /a string instead of a list/],
  ["null where a list belongs", { "1": null }, /gives chain 1 null instead of a list/],
  ["an empty list of endpoints", { "1": [] }, /an empty list/],
  ["a number among the endpoints", { "1": [8545] }, /a number among chain 1's endpoints/],
  ["a key that is not a chain id", { mainnet: ["https://rpc.example.com"] }, /"mainnet" as a key/],
  ["a chain id with a leading zero", { "01": ["https://rpc.example.com"] }, /"01" as a key/],
  ["__proto__ as a key", { ["__proto__"]: ["https://evil.example"] }, /"__proto__" as a key/],
  ["a list, not an object", [["https://rpc.example.com"]], /is not an object/],
  ["null, not an object", null, /is not an object/],
  ["a string, not an object", "chains", /is not an object/],
];

for (const [name, value, message] of BAD) {
  test(`rejected: ${name}`, () => {
    assert.throws(() => parseChains(value), message, name);
  });
}

/* The file the 2026-11-21 correction turned on: `__proto__` is an own property on the whole path
   from file to bundle, so it is the key check above that rejects it. Asserted here so the reason
   stays in the repository: a prototype guard would be the wrong fix for the right finding. */
test("a __proto__ key is an own property of the parsed file, not its prototype", () => {
  const parsed = JSON.parse('{"__proto__":["https://evil.example"]}') as object;

  assert.equal(Object.hasOwn(parsed, "__proto__"), true, "JSON.parse set a prototype");
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype, "the prototype changed");
});
