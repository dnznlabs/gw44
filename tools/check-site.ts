// Checks a *deployed* gateway in a real browser, over HTTPS, from a real host.
//   node tools/check-site.ts <base URL> <chains config>      GW44_ENGINE=chromium|firefox|webkit
//
// Everything else in this repository tests the gateway against `tools/serve.ts` on loopback. This
// is the first instrument that exercises a build the way a visitor meets it: a static host nobody
// here configures, answering unknown paths its own way, over a hostname with a certificate.
//
// The chains and the default come from the configuration the site was built from, passed in rather
// than written here — a check that hard-codes what it is checking proves only that two copies of a
// constant agree.
//
// Typechecked by tsconfig.e2e.json, so `page.evaluate` and the DOM library are available here and
// tsconfig.json excludes this file.
import { readFile } from "node:fs/promises";
import { type Browser, type BrowserContext, chromium, firefox, webkit } from "playwright-core";
import { parsePins } from "../src/core/target.ts";

const ENGINE_TYPES = { chromium, firefox, webkit } as const;
type EngineName = keyof typeof ENGINE_TYPES;

const [baseRaw, configPath] = process.argv.slice(2);
if (baseRaw === undefined || configPath === undefined) {
  console.error("usage: node tools/check-site.ts <base URL> <chains config>");
  process.exit(2);
}
const base = baseRaw.replace(/\/$/, "");

const engineName = process.env["GW44_ENGINE"] ?? "chromium";
if (!Object.hasOwn(ENGINE_TYPES, engineName)) {
  console.error(`GW44_ENGINE must be one of ${Object.keys(ENGINE_TYPES).join(", ")}; got ${engineName}`);
  process.exit(2);
}
const engine = ENGINE_TYPES[engineName as EngineName];

const pins = parsePins(JSON.parse(await readFile(configPath, "utf8")) as unknown);
const chains = Object.keys(pins.contracts);
const other = chains.find((c) => c !== pins.default);
if (other === undefined) {
  console.error(`${configPath} names one chain; this check needs at least two`);
  process.exit(2);
}

let failed = 0;
const SHELL = "gw44";

function report(name: string, ok: boolean, saw: string): void {
  if (!ok) failed++;
  console.log(`  ${engineName} ${name}: ${saw} ${ok ? "ok" : "FAIL"}`);
}

let browser: Browser | undefined;

/** A fresh context per case: a worker installed by one case must not decide another's result. */
async function fresh(options: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  if (browser === undefined) throw new Error("the browser was not launched");
  const context = await browser.newContext(options);
  /* Three times the slowest case the e2e suite has measured in CI, as #38 set it, and a deployed
     site adds DNS, TLS and a CDN to every navigation. */
  context.setDefaultTimeout(20000);
  return context;
}

/** The application's document, not the shell: the shell's element is gone and a real title is set. */
async function documentShown(page: import("playwright-core").Page): Promise<{ ok: boolean; title: string }> {
  try {
    await page.waitForSelector(`#${SHELL}`, { state: "detached", timeout: 20000 });
  } catch {
    return { ok: false, title: await page.title() };
  }
  const title = await page.title();
  return { ok: title !== "" && title !== SHELL, title };
}

async function main(): Promise<void> {
  browser = await engine.launch();

  // 1 — the root reaches the default chain's prefix and the application replaces the shell.
  {
    const context = await fresh();
    const page = await context.newPage();
    await page.goto(`${base}/`);
    const shown = await documentShown(page);
    const path = new URL(page.url()).pathname;
    report(
      "root ends on the default chain and shows the application",
      shown.ok && path === `/${pins.default}/`,
      `path ${path}, title ${JSON.stringify(shown.title)}`,
    );
    await context.close();
  }

  /* 2 — the assumption this milestone rests on. A deep link into a static host is a path the host
     has no file for, so it answers its own 404 page; that page is our shell, which then recovers.
     The status is printed rather than asserted beyond 404, because what Pages does here is the
     measurement the handoff wants. */
  {
    const context = await fresh();
    const page = await context.newPage();
    const response = await page.goto(`${base}/${other}/`);
    const status = response?.status() ?? 0;
    const shown = await documentShown(page);
    report(
      "a cold deep link recovers from the host's own 404 page",
      status === 404 && shown.ok,
      `first response ${status}, title ${JSON.stringify(shown.title)}`,
    );
    await context.close();
  }

  // 3 — the prefix without its slash.
  {
    const context = await fresh();
    const page = await context.newPage();
    await page.goto(`${base}/${other}`);
    await documentShown(page);
    const path = new URL(page.url()).pathname;
    report("a chain without its trailing slash ends on the prefix", path === `/${other}/`, `path ${path}`);
    await context.close();
  }

  // 4 — an unconfigured first segment is the gateway's own 404, not the application.
  {
    const context = await fresh();
    const page = await context.newPage();
    await page.goto(`${base}/nope`);
    await page.waitForTimeout(3000);
    const body = await page.evaluate(() => document.body?.textContent ?? "");
    const shown = await page.title();
    report(
      "an unconfigured path is the gateway's 404 and not the application",
      // The sentence, not just the prefix: before #82 this page said `gw44: malformed URL` here.
      body.includes("gw44: no contract at this path") && shown !== "RAKE",
      `body ${JSON.stringify(body.trim().slice(0, 40))}`,
    );
    await context.close();
  }

  // 5 — the fragment survives a cold first visit, which is a script navigation (m01-t05).
  {
    const context = await fresh();
    const page = await context.newPage();
    await page.goto(`${base}/#/docs`);
    await documentShown(page);
    const url = new URL(page.url());
    report(
      "a cold fragment link keeps its fragment",
      url.pathname === `/${pins.default}/` && url.hash === "#/docs",
      `ended on ${url.pathname}${url.hash}`,
    );
    await context.close();
  }

  /* 6 — the favicon the browser asks for unprompted, which a multi-chain build answers itself (#36).

     The plan's fallback, taken deliberately: assert the 404 and name what is not asserted. Three
     instruments were tried for "came from the service worker" and none discriminates on a deployed
     site. `fromServiceWorker` is never reported, because a response the worker synthesises without
     touching the network raises no Playwright response event at all. `performance.getEntriesByName`
     returns **0** entries for the fetch — and **also 0** in a control page with service workers
     blocked, so an absence of entries distinguishes nothing. Counting requests to the configured
     endpoints during the fetch does not work either: the application polls its own chains while it
     runs, so 13 endpoint requests arrive in any window of that length whether the favicon is
     fetched or not.

     What holds the no-chain-call property up is `test/target.test.ts`'s "a first segment that is not
     a configured chain is a 404 that costs no call" and `test/e2e/multi.e2e.ts`'s fourth case, which
     assert it against a stub that records every call. This case adds that the deployed site answers
     the same status. The handoff says so rather than implying the site proved more than it did. */
  {
    const context = await fresh();
    const page = await context.newPage();
    await page.goto(`${base}/`);
    await documentShown(page);
    const seen = await page.evaluate(async () => {
      const res = await fetch("/favicon.ico", { cache: "no-store" });
      const href = new URL("/favicon.ico", location.href).href;
      return {
        status: res.status,
        entries: performance.getEntriesByName(href).length,
        controlled: navigator.serviceWorker.controller !== null,
      };
    });
    report(
      "the favicon is answered 404 on a controlled page (origin not asserted: a synthesised response leaves no trace to attribute)",
      seen.status === 404 && seen.controlled,
      `status ${seen.status}, controlled ${seen.controlled}, ${seen.entries} resource-timing entries`,
    );
    await context.close();
  }

  // 7 — no service worker at all: the boot page has to carry the first visit by itself.
  {
    const context = await fresh({ serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto(`${base}/`);
    const shown = await documentShown(page);
    const path = new URL(page.url()).pathname;
    report(
      "with service workers blocked the root still shows the application",
      shown.ok && path === `/${pins.default}/`,
      `path ${path}, title ${JSON.stringify(shown.title)}`,
    );
    await context.close();
  }

  await browser.close();
  browser = undefined;
}

console.log(`check-site: ${base} on ${engineName}, chains [${chains.join(" ")}], default ${pins.default}`);
try {
  await main();
} catch (error) {
  console.error(`check-site: ${engineName} threw ${(error as Error).message.split("\n")[0]}`);
  await browser?.close();
  process.exit(1);
}
if (failed > 0) {
  console.error(`check-site: ${failed} case(s) failed on ${engineName}`);
  process.exit(1);
}
console.log(`check-site: every case passed on ${engineName}`);
