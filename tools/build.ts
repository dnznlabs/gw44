// Builds the whole deployable: dist/gw44-sw.js, dist/index.html and its copy dist/404.html.
//   node tools/build.ts            chains from ./chains.json, output to ./dist
//   GW44_CHAINS=… GW44_OUT=… node tools/build.ts
//   GW44_PIN=<chain>:<address>     one contract at every URL, that chain's endpoints only
//   GW44_CONFIG=gw44.json          one project's contract per chain, each under /<chain>/
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { type Pins, parsePin, parsePins } from "../src/core/target.ts";
import { readChains } from "./chains.ts";
import { inlineBoot } from "./inline.ts";

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
/* Validated here rather than trusted: these endpoints are compiled into the worker, so a bad one
   is not a build-time inconvenience but a URL every visitor's browser then talks to (#63). */
const chains = await readChains(process.env["GW44_CHAINS"] ?? "chains.json", (p) => readFile(p, "utf8"));

/* The contracts are compiled in, like the endpoints: the bytes a visitor runs are the whole of what
   decides what is served. An unpinned build defines them as null and keeps every chain. */
/* Set but empty is a mistake, not a default. CI templating a value that was not provided used to
   produce an unpinned build with every chain in the chains file, distinguishable only by the log's
   first line (#73). Unset still means unpinned, which is what a developer typing `make build` wants. */
for (const name of ["GW44_PIN", "GW44_CONFIG"] as const) {
  const value = process.env[name];
  if (value !== undefined && value.trim() === "") {
    throw new Error(`${name} is set but empty; unset it for an unpinned build, or give it a value`);
  }
}

const raw = process.env["GW44_PIN"] ?? "";
const configPath = process.env["GW44_CONFIG"] ?? "";
if (raw !== "" && configPath !== "") {
  throw new Error("GW44_PIN and GW44_CONFIG both set; a build serves one configuration, so pick one");
}
let pins: Pins | null = null;
let endpoints: Readonly<Record<string, readonly string[]>> = chains;
if (raw !== "" || configPath !== "") {
  pins =
    configPath === "" ? parsePin(raw) : parsePins(JSON.parse(await readFile(configPath, "utf8")) as unknown);
  const only: Record<string, readonly string[]> = {};
  for (const chain of Object.keys(pins.contracts)) {
    const endpointsFor = chains[chain];
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
const page = inlineBoot(shell, boot);

await mkdir(out, { recursive: true });

/* Both gates run before anything is written (#74). They used to run after, so a build that failed
   either had already overwritten `index.html` and `404.html` — and a deploy step that ignored the
   exit code shipped an oversized worker, or a directory mixing new files with stale ones. A failed
   build now leaves the output directory as it found it.

   The size gate measures the bytes that would be written rather than the string's length in UTF-16
   units, which are equal only while the bundler emits ASCII. */
const swBytes = Buffer.byteLength(sw);
if (swBytes > SW_LIMIT) {
  throw new Error(`gw44-sw.js would be ${swBytes} B, over the ${SW_LIMIT} B limit; nothing was written`);
}
const before = (await readdir(out)).sort();
const strays = before.filter((n) => !EXPECTED.includes(n));
if (strays.length > 0) {
  throw new Error(
    `${out}/ holds ${strays.join(", ")}; the deployable is only ${EXPECTED.join(", ")}; run 'make clean'`,
  );
}

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
for (const name of names) {
  const bytes = await readFile(`${out}/${name}`);
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${String(bytes.length).padStart(7)}  ${name}`);
}
console.log(pins === null ? `built ${out}/:` : `built ${out}/ (pinned to ${listing(pins)}):`);
for (const line of lines) console.log(`  ${line}`);

/* Asserted after the write as well, against the bytes on disk: the gates above decided on what was
   about to be written, and this catches a write that did not produce what it was given. */
if (names.join(",") !== EXPECTED.join(",")) {
  throw new Error(`${out}/ holds ${names.join(", ")} after the write; expected ${EXPECTED.join(", ")}`);
}
