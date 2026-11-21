// Hashes what a *deployed* site serves, as a controlled page sees it.
//   node tools/site-hash.ts <base URL> <prefix> <path>...
//
// Prints one `<path> <sha256> <bytes>` line per path, and nothing else, so `tools/verify.sh` can
// compare them with the hashes it took from `cast`. The fetch happens inside a page the service
// worker controls, which is the whole point: it measures the bytes a visitor's browser receives
// after the worker has answered, not what an HTTP client gets from the static host.
//
// Hashed in the page with `crypto.subtle`, so the bytes are never serialised out through the
// harness — a large document would otherwise cross that boundary twice for no reason.
//
// Typechecked by tsconfig.e2e.json for `page.evaluate`; tsconfig.json excludes it.
import { chromium } from "playwright-core";

const [baseRaw, prefix, ...paths] = process.argv.slice(2);
if (baseRaw === undefined || prefix === undefined || paths.length === 0) {
  console.error("usage: node tools/site-hash.ts <base URL> <prefix> <path>...");
  process.exit(2);
}
const base = baseRaw.replace(/\/$/, "");

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  context.setDefaultTimeout(30000);
  const page = await context.newPage();

  // Install and take control first: an uncontrolled page would be measuring the static host.
  await page.goto(`${base}${prefix}`);
  await page.waitForSelector("#gw44", { state: "detached" });
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  if (!controlled) {
    console.error(`site-hash: the page at ${base}${prefix} is not controlled by a service worker`);
    process.exit(1);
  }

  for (const path of paths) {
    const out = await page.evaluate(async (target: string) => {
      const res = await fetch(target, { cache: "no-store" });
      const bytes = new Uint8Array(await res.arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return { status: res.status, hex, length: bytes.length };
    }, path);
    if (out.status !== 200) {
      console.error(`site-hash: ${path} answered ${out.status}`);
      process.exit(1);
    }
    console.log(`${path} ${out.hex} ${out.length}`);
  }
} finally {
  await browser.close();
}
