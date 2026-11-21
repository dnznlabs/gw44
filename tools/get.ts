// Resolves one gateway URL through the core, with no browser: status and headers to stderr, body to
// stdout. The scriptable check a static gateway otherwise lacks, since curl only ever sees the shell.
//   node tools/get.ts http://localhost:8244/11155111/0x…/widget.js
//   node tools/get.ts https://0x….11155111.gw44.io/
//   GW44_PIN=<chain>:<address> node tools/get.ts https://any.host/  resolve as a pinned build does
//   GW44_CONFIG=gw44.json node tools/get.ts https://any.host/<chain>/   …as a configured build does
import { readFile } from "node:fs/promises";
import { createFetchRpc } from "../src/adapters/rpc/fetch.ts";
import { errorResponse, resolve } from "../src/core/resolve.ts";
import { parsePin, parsePins, parseTarget, pinnedTarget } from "../src/core/target.ts";
import { readChains } from "./chains.ts";

const arg = process.argv[2];
if (arg === undefined) {
  console.error("usage: node tools/get.ts <gateway url>");
  process.exit(2);
}
// The build's validator, so this instrument believes exactly the endpoints a build would (#63).
const chains = await readChains(process.env["GW44_CHAINS"] ?? "chains.json", (p) => readFile(p, "utf8"));
const started = performance.now();
let res;
try {
  /* The same decision a pinned build compiles in, so the pinned path can be compared with the
     chain without a browser. The configuration is read here and not from a build's output. */
  const raw = process.env["GW44_PIN"] ?? "";
  const configPath = process.env["GW44_CONFIG"] ?? "";
  if (raw !== "" && configPath !== "") {
    console.error("gw44: GW44_PIN and GW44_CONFIG both set; pick one");
    process.exit(2);
  }
  const url = new URL(arg);
  const pins =
    configPath !== ""
      ? parsePins(JSON.parse(await readFile(configPath, "utf8")) as unknown)
      : raw !== ""
        ? parsePin(raw)
        : null;
  const target = pins === null ? parseTarget(url) : pinnedTarget(url, pins);
  if (target === null) {
    console.error("gw44: no contract in this URL");
    process.exit(2);
  }
  /* Reported, not followed: what a caller comparing bytes with the chain needs to know is that this
     URL redirects and to where, and following it would hide a redirect loop rather than show it. */
  if (target.redirect !== undefined) {
    const status = target.redirectStatus ?? 308;
    console.error(`${status} 0 B 0 ms`);
    console.error(`location: ${target.redirect}`);
    process.exit(0);
  }
  res = await resolve(target, createFetchRpc(chains));
} catch (error) {
  res = errorResponse(error);
}
console.error(`${res.status} ${res.body.length} B ${(performance.now() - started).toFixed(0)} ms`);
for (const [k, v] of res.headers) console.error(`${k}: ${v}`);
process.stdout.write(res.body);
process.exit(res.status < 400 ? 0 : 1);
