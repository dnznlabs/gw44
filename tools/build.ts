// Builds the whole deployable: dist/gw44-sw.js, dist/index.html and its copy dist/404.html.
//   node tools/build.ts            chains from ./chains.json, output to ./dist
//   GW44_CHAINS=… GW44_OUT=… node tools/build.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const out = process.env["GW44_OUT"] ?? "dist";

/** The deployable is these three files and nothing else; `gw44-sw.js` holds scope `/` at the root. */
const EXPECTED = ["404.html", "gw44-sw.js", "index.html"];
/** The worker is code every visitor of every contract executes, so its size is a gate, not a note. */
const SW_LIMIT = 16_384;
const chains = JSON.parse(await readFile(process.env["GW44_CHAINS"] ?? "chains.json", "utf8")) as unknown;

async function bundle(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2022",
    write: false,
    legalComments: "none",
    define: { __GW44_CHAINS__: JSON.stringify(chains) },
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
for (const name of names) {
  const bytes = await readFile(`${out}/${name}`);
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${String(bytes.length).padStart(7)}  ${name}`);
}
console.log(`built ${out}/:`);
for (const line of lines) console.log(`  ${line}`);

const unexpected = names.filter((n) => !EXPECTED.includes(n));
if (unexpected.length > 0) {
  throw new Error(`${out}/ holds ${unexpected.join(", ")}; the deployable is only ${EXPECTED.join(", ")}`);
}
if (sw.length > SW_LIMIT) {
  throw new Error(`gw44-sw.js is ${sw.length} B, over the ${SW_LIMIT} B limit`);
}
