// Resolves one gateway URL through the core, with no browser: status and headers to stderr, body to
// stdout. The scriptable check a static gateway otherwise lacks, since curl only ever sees the shell.
//   node tools/get.ts http://localhost:8244/11155111/0x…/widget.js
//   node tools/get.ts https://0x….11155111.gw44.io/
import { readFile } from "node:fs/promises";
import { createFetchRpc, type Chains } from "../src/adapters/rpc/fetch.ts";
import { errorResponse, resolve } from "../src/core/resolve.ts";
import { parseTarget } from "../src/core/target.ts";

const arg = process.argv[2];
if (arg === undefined) {
  console.error("usage: node tools/get.ts <gateway url>");
  process.exit(2);
}
const chains = JSON.parse(await readFile(process.env["GW44_CHAINS"] ?? "chains.json", "utf8")) as Chains;
const started = performance.now();
let res;
try {
  const target = parseTarget(new URL(arg));
  if (target === null) {
    console.error("gw44: no contract in this URL");
    process.exit(2);
  }
  res = await resolve(target, createFetchRpc(chains));
} catch (error) {
  res = errorResponse(error);
}
console.error(`${res.status} ${res.body.length} B ${(performance.now() - started).toFixed(0)} ms`);
for (const [k, v] of res.headers) console.error(`${k}: ${v}`);
process.stdout.write(res.body);
process.exit(res.status < 400 ? 0 : 1);
