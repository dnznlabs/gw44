// Builds the whole deployable: dist/gw44-sw.js, dist/index.html and its copy dist/404.html.
//   node tools/build.ts            chains from ./chains.json, output to ./dist
//   GW44_CHAINS=… GW44_OUT=… node tools/build.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const out = process.env["GW44_OUT"] ?? "dist";
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
console.log(`built ${out}/: gw44-sw.js ${sw.length} B, index.html ${page.length} B`);
