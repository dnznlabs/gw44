// A stand-in for the static host: serves dist/ and answers every other path with index.html, which
// is all S3 + CloudFront, GitHub Pages or any web server is asked to do. It reads no chain.
//   node tools/serve.ts [dir]      GW44_PORT (8244), GW44_HOST (127.0.0.1)
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist";
const port = Number(process.env["GW44_PORT"] ?? 8244);
const host = process.env["GW44_HOST"] ?? "127.0.0.1";

// The only files there are. A lookup, not a path join on the URL: nothing a request says is a path.
const FILES: Record<string, [file: string, type: string]> = {
  "/gw44-sw.js": ["gw44-sw.js", "text/javascript; charset=utf-8"],
};
const SHELL: [string, string] = ["index.html", "text/html; charset=utf-8"];

createServer((req, res) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const [file, type] = FILES[pathname] ?? SHELL;
  readFile(join(dir, file)).then(
    (body) => {
      res.writeHead(200, { "content-type": type, "cache-control": "no-cache", "x-content-type-options": "nosniff" });
      res.end(body);
    },
    () => {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`gw44: ${file} is not built; run 'make build'\n`);
    },
  );
}).listen(port, host, () => console.log(`gw44 static host on http://${host}:${port}/<chain>/<contract>/`));
