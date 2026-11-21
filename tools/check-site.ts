// Checks a *deployed* gateway in a real browser, over HTTPS, from a real host.
//   node tools/check-site.ts <base URL> <chains config> [<chain>/<file>=sha384-…]
//   GW44_ENGINE=chromium|firefox|webkit
//
// The third argument is one embedded resource and the `integrity` value `tools/embeds.sh` printed
// for it at deploy time. Given it, two more cases run: a page on another origin embeds that URL by
// `<script src>` and must be refused when a character of the hash is changed, and the same URL
// fetched by the site's own controlled document must be answered by the service worker rather than
// by the host. Without it those two are reported as skipped, because the value has to come from the
// build and not from the bytes being checked — a check that hashes what it is checking proves only
// that sha384 is deterministic.
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
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { type Browser, type BrowserContext, chromium, firefox, webkit } from "playwright-core";
import { parsePins } from "../src/core/target.ts";

const ENGINE_TYPES = { chromium, firefox, webkit } as const;
type EngineName = keyof typeof ENGINE_TYPES;

const [baseRaw, configPath, embedRaw] = process.argv.slice(2);
if (baseRaw === undefined || configPath === undefined) {
  console.error("usage: node tools/check-site.ts <base URL> <chains config> [<chain>/<file>=sha384-…]");
  process.exit(2);
}
const base = baseRaw.replace(/\/$/, "");

/** `<chain>/<file>=sha384-…`, as `tools/embeds.sh` prints the pair. */
let embed: { path: string; integrity: string } | undefined;
if (embedRaw !== undefined) {
  const at = embedRaw.indexOf("=");
  const path = at === -1 ? "" : embedRaw.slice(0, at);
  const integrity = at === -1 ? "" : embedRaw.slice(at + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path) || !integrity.startsWith("sha384-")) {
    console.error(`the embed argument must be <chain>/<file>=sha384-…; got ${JSON.stringify(embedRaw)}`);
    process.exit(2);
  }
  embed = { path, integrity };
}

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

/* The other origin, for case 8. A page that embeds one URL with one `integrity` value and reports
   which of the two events the browser gave the script element. `src` and `integrity` arrive as query
   parameters and are written into attributes, so both are quoted with a character neither can
   contain: the URL comes from this script's own arguments, and an embed page that needed escaping
   would be a check with a bug in it rather than a finding. */
let embedServer: Server | undefined;
let embedPort = 0;
function embedPageUrl(src: string, integrity: string): string {
  const q = new URLSearchParams({ src, integrity });
  return `http://127.0.0.1:${embedPort}/?${q.toString()}`;
}

async function startEmbedServer(): Promise<void> {
  embedServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const src = (url.searchParams.get("src") ?? "").replaceAll('"', "");
    const integrity = (url.searchParams.get("integrity") ?? "").replaceAll('"', "");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(
      `<!doctype html><title>embed</title><script>
         window.gw44Embed = undefined;
         function gw44Done(what) { window.gw44Embed = what; window.dispatchEvent(new Event("gw44-embed")); }
       </script>
       <script src="${src}" integrity="${integrity}" crossorigin="anonymous"
               onload="gw44Done('load')" onerror="gw44Done('error')"></script>`,
    );
  });
  await new Promise<void>((done) =>
    embedServer?.listen(0, "127.0.0.1", () => {
      embedPort = (embedServer?.address() as AddressInfo).port;
      done();
    }),
  );
}

async function main(): Promise<void> {
  if (embed !== undefined) await startEmbedServer();
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
      body.includes("gw44:") && shown !== "RAKE",
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

  /* 8 — milestone criterion 4: a page on another origin embeds the published copy, pinned by the
     `integrity` the deploy printed. Served from 127.0.0.1 while the site is on its own hostname, so
     this is a real cross-origin embed and needs the host's CORS as well as the hash to match.

     The signal is the script element's own `load` or `error` event, not anything the script does:
     what is being checked is whether the browser ran it, and the embedded resource belongs to the
     project rather than to this check. The tampered case changes one character of the hash, so the
     bytes, the URL and the CORS headers are all identical between the two halves and the hash is
     the only difference. */
  if (embed !== undefined) {
    const context = await fresh();
    const page = await context.newPage();
    const url = `${base}/${embed.path}`;
    // One character of the base64, flipped to a different one, so the value stays well-formed.
    const last = embed.integrity.slice(-1);
    const tampered = embed.integrity.slice(0, -1) + (last === "A" ? "B" : "A");

    const results: string[] = [];
    for (const integrity of [embed.integrity, tampered]) {
      await page.goto(embedPageUrl(url, integrity));
      const got: string = await page.evaluate(
        () =>
          new Promise<string>((done) => {
            const w = window as unknown as { gw44Embed?: string };
            if (w.gw44Embed !== undefined) return done(w.gw44Embed);
            window.addEventListener("gw44-embed", () => done(w.gw44Embed ?? "none"), { once: true });
          }),
      );
      results.push(got);
    }
    const [printed, changed] = results;

    report(
      `a second origin runs ${embed.path} with the printed integrity and is refused when it is changed`,
      printed === "load" && changed === "error",
      `printed ${printed}, one character changed ${changed}`,
    );
    await context.close();
  } else {
    console.log(`  ${engineName} the cross-origin embed case: skipped, no <chain>/<file>=sha384-… given`);
  }

  /* 9 — the same URL asked for by the site's own document, which the service worker must answer from
     the chain rather than letting the host serve its static copy.

     Case 6 records that three instruments for "came from the service worker" do not discriminate on
     a deployed site. This one does, and it is the response's own headers: the gateway's core puts
     `cache-control: no-store` on every response it builds and never an `etag`, while the host serves
     a file with `cache-control: max-age=600` and an `etag`. The control is the same fetch with
     service workers blocked, so both halves ask for one URL and differ only in who answered. */
  if (embed !== undefined) {
    const path = `/${embed.path}`;
    interface Answered {
      status: number;
      cache: string;
      etag: string;
      controlled: boolean;
    }
    const read = async (options: Parameters<Browser["newContext"]>[0]): Promise<Answered> => {
      const context = await fresh(options);
      const page = await context.newPage();
      await page.goto(`${base}/`);
      await documentShown(page);
      const seen: Answered = await page.evaluate(async (p) => {
        const res = await fetch(p, { cache: "no-store" });
        return {
          status: res.status,
          cache: res.headers.get("cache-control") ?? "none",
          etag: res.headers.get("etag") === null ? "none" : "present",
          controlled: navigator.serviceWorker?.controller !== null,
        };
      }, path);
      await context.close();
      return seen;
    };

    const worker = await read({});
    const host = await read({ serviceWorkers: "block" });

    report(
      `${embed.path} on a controlled page is answered by the worker, not by the host`,
      worker.status === 200 &&
        worker.controlled &&
        worker.cache === "no-store" &&
        worker.etag === "none" &&
        host.cache !== "no-store" &&
        host.etag === "present",
      `worker: ${worker.status} cache-control ${worker.cache}, etag ${worker.etag}, controlled ${worker.controlled}` +
        ` | host control: ${host.status} cache-control ${host.cache}, etag ${host.etag}`,
    );
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
  embedServer?.close();
  process.exit(1);
}
embedServer?.close();
if (failed > 0) {
  console.error(`check-site: ${failed} case(s) failed on ${engineName}`);
  process.exit(1);
}
console.log(`check-site: every case passed on ${engineName}`);
