// Builds the whole deployable: dist/gw44-sw.js, dist/index.html and its copy dist/404.html.
//   node tools/build.ts            chains from ./chains.json, output to ./dist
//   GW44_CHAINS=… GW44_OUT=… node tools/build.ts
//   GW44_PIN=<chain>:<address>     one contract at every URL, that chain's endpoints only
//   GW44_CONFIG=gw44.json          one project's contract per chain, each under /<chain>/
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { type Pins, parsePin, parsePins } from "../src/core/target.ts";

const out = process.env["GW44_OUT"] ?? "dist";

/** Every configured contract, and which chain `/` goes to, so the log says what was built. */
function listing(pins: Pins): string {
  const each = Object.entries(pins.contracts)
    .map(([chain, address]) => `${chain}:${address}`)
    .join(" ");
  return Object.keys(pins.contracts).length === 1 ? each : `${each}, default ${pins.default}`;
}

/** The deployable is these three files and nothing else; `gw44-sw.js` holds scope `/` at the root. */
const EXPECTED = ["404.html", "gw44-sw.js", "index.html"];
/** The worker is code every visitor of every contract executes, so its size is a gate, not a note. */
const SW_LIMIT = 16_384;
const chains = JSON.parse(await readFile(process.env["GW44_CHAINS"] ?? "chains.json", "utf8")) as unknown;

/* The contracts are compiled in, like the endpoints: the bytes a visitor runs are the whole of what
   decides what is served. An unpinned build defines them as null and keeps every chain. */
const raw = process.env["GW44_PIN"] ?? "";
const configPath = process.env["GW44_CONFIG"] ?? "";
if (raw !== "" && configPath !== "") {
  throw new Error("GW44_PIN and GW44_CONFIG both set; a build serves one configuration, so pick one");
}
let pins: Pins | null = null;
let endpoints = chains;
if (raw !== "" || configPath !== "") {
  pins =
    configPath === "" ? parsePin(raw) : parsePins(JSON.parse(await readFile(configPath, "utf8")) as unknown);
  const all = chains as Record<string, unknown>;
  const only: Record<string, unknown> = {};
  for (const chain of Object.keys(pins.contracts)) {
    const endpointsFor = all[chain];
    if (endpointsFor === undefined) {
      const where = configPath === "" ? `pin ${raw}` : configPath;
      throw new Error(`${where} names chain ${chain}, which the chains file does not carry`);
    }
    only[chain] = endpointsFor;
  }
  endpoints = only;
}

async function bundle(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2022",
    write: false,
    legalComments: "none",
    define: {
      __GW44_CHAINS__: JSON.stringify(endpoints),
      __GW44_PINS__: JSON.stringify(pins),
      // A boolean the bundler can fold both ways, so each build carries one parser and not two.
      __GW44_PINNED__: String(pins !== null),
    },
  });
  const file = result.outputFiles[0];
  if (file === undefined) throw new Error(`no output for ${entry}`);
  return file.text;
}

const [sw, boot, shell] = await Promise.all([
  bundle("src/adapters/sw/sw.ts"),
  bundle("src/adapters/sw/boot.ts"),
  readFile("src/adapters/sw/shell.html", "utf8"),
]);
// A function replacement: a string one would expand `$&` and friends found in the minified script.
const page = shell.replace("/*@boot@*/", () => boot.replaceAll("</script", "<\\/script"));

await mkdir(out, { recursive: true });
await Promise.all([
  writeFile(`${out}/gw44-sw.js`, sw),
  writeFile(`${out}/index.html`, page),
  // GitHub Pages serves 404.html for unknown paths; S3 and CloudFront are pointed at index.html.
  writeFile(`${out}/404.html`, page),
]);
/* The hashes are printed from the files on disk rather than from the strings above: what a reader
   wants to reproduce is the artefact, and a hash of the value in memory would not catch a write
   that changed it. Sorted by name so two runs are diffable line by line. */
const names = (await readdir(out)).sort();
const lines: string[] = [];
const sizes = new Map<string, number>();
for (const name of names) {
  const bytes = await readFile(`${out}/${name}`);
  sizes.set(name, bytes.length);
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${String(bytes.length).padStart(7)}  ${name}`);
}
console.log(pins === null ? `built ${out}/:` : `built ${out}/ (pinned to ${listing(pins)}):`);
for (const line of lines) console.log(`  ${line}`);

const unexpected = names.filter((n) => !EXPECTED.includes(n));
if (unexpected.length > 0) {
  throw new Error(
    `${out}/ holds ${unexpected.join(", ")}; the deployable is only ${EXPECTED.join(", ")}; run 'make clean'`,
  );
}
/* The gate reads the bytes on disk, which the hash loop above already measured. `sw.length` is a
   string's length in UTF-16 units and equals the byte count only while the bundler emits ASCII,
   which is its default and not a thing this file asserts. */
const swBytes = sizes.get("gw44-sw.js");
if (swBytes === undefined) throw new Error(`${out}/ has no gw44-sw.js`);
if (swBytes > SW_LIMIT) {
  throw new Error(`gw44-sw.js is ${swBytes} B, over the ${SW_LIMIT} B limit`);
}
