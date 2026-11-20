// The service-worker adapter in a real browser, against a fake chain. Everything is local: a
// JSON-RPC stub as chain 31337, the static host from tools/serve.ts, and a second origin that
// plays a third-party page embedding the widget.
//   node --test test/e2e/gateway.e2e.ts        GW44_ENGINE=chromium|firefox|webkit (default chromium)
// Playwright finds its own browsers in its cache; `make browsers` installs them.
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type Browser, type BrowserContext, chromium, firefox, webkit } from "playwright-core";
import { HTML_SELECTOR, bytesToHex, encodeRequest } from "../../src/core/abi.ts";
import { ADDRESS, htmlResult, requestResult } from "../helpers.ts";

const doc = (version: string): string =>
  `<!doctype html><title>${version}</title><h1 id="v">${version}</h1><script src="widget.js"></script>`;

/** What the fake contract answers, by calldata. Tests mutate it to play the owner. */
const calls = new Map<string, Uint8Array>([
  [HTML_SELECTOR, htmlResult(doc("v1"))],
  [
    encodeRequest(["widget.js"], []),
    requestResult(200, 'document.documentElement.dataset.widget="ran"', [["Content-Type", "text/javascript"]]),
  ],
]);
let rpcHits = 0;

function listen(server: Server): Promise<number> {
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done((server.address() as AddressInfo).port)));
}

const rpc = createServer((req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
  if (req.method === "OPTIONS") return void res.writeHead(204, cors).end();
  let body = "";
  req.on("data", (c: Buffer) => (body += c.toString()));
  req.on("end", () => {
    rpcHits++;
    const { params } = JSON.parse(body) as { params: [{ data: string }] };
    const out = calls.get(params[0].data);
    const reply = out ? { result: bytesToHex(out) } : { error: { code: 3, message: "execution reverted" } };
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, ...reply }));
  });
});

let gatewayPort = 0;
const host = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><script src="http://localhost:${gatewayPort}/31337/${ADDRESS}/widget.js"></script>`);
});

/* The engine under test. An unknown name is a failure at load, not a silent fall back to Chromium:
   a typo in ENGINES would otherwise report a green run of the wrong browser. */
const ENGINE_TYPES = { chromium, firefox, webkit } as const;
type EngineName = keyof typeof ENGINE_TYPES;

const engineName = process.env["GW44_ENGINE"] ?? "chromium";
if (!Object.hasOwn(ENGINE_TYPES, engineName)) {
  throw new Error(
    `GW44_ENGINE must be one of ${Object.keys(ENGINE_TYPES).join(", ")}; got ${JSON.stringify(engineName)}`,
  );
}
const engine = ENGINE_TYPES[engineName as EngineName];
const isChromium = engineName === "chromium";

let browser: Browser;
let server: ChildProcess;
let hostPort = 0;
const path = (): string => `http://localhost:${gatewayPort}/31337/${ADDRESS}/`;

before(async () => {
  const probe = createServer();
  const [rpcPort, freePort] = await Promise.all([listen(rpc), listen(probe)]);
  hostPort = await listen(host);
  probe.close();
  gatewayPort = freePort;
  const out = mkdtempSync(join(tmpdir(), "gw44-e2e-"));
  const chains = join(out, "chains.json");
  writeFileSync(chains, JSON.stringify({ "31337": [`http://127.0.0.1:${rpcPort}`] }));
  execFileSync(process.execPath, ["tools/build.ts"], { env: { ...process.env, GW44_CHAINS: chains, GW44_OUT: out } });
  server = spawn(process.execPath, ["tools/serve.ts", out], {
    env: { ...process.env, GW44_PORT: String(gatewayPort) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((done) => server.stdout?.once("data", done));
  browser = await engine.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
  for (const s of [rpc, host]) {
    s.closeAllConnections();
    s.close();
  }
});

async function fresh(options: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  context.setDefaultTimeout(8000);
  return context;
}

test("first visit: the shell installs the worker and the contract's document replaces it", async () => {
  const context = await fresh();
  const page = await context.newPage();

  await page.goto(path());
  await page.waitForSelector("#v");

  assert.equal(await page.textContent("#v"), "v1");
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null), true);
  assert.equal(page.url(), path());
  await context.close();
});

test("a relative subresource is ERC-5219 request(), with the contract's type, and runs", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(path());
  await page.waitForSelector("#v");

  await page.waitForFunction(() => document.documentElement.dataset["widget"] === "ran");
  const widget = await page.evaluate(async () => {
    const res = await fetch("widget.js");
    return { status: res.status, type: res.headers.get("content-type"), cache: res.headers.get("cache-control") };
  });

  assert.deepEqual(widget, { status: 200, type: "text/javascript", cache: "no-store" });
  await context.close();
});

test("the owner changes the document and the next plain reload shows it", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(path());
  await page.waitForSelector("#v");

  calls.set(HTML_SELECTOR, htmlResult(doc("v2")));
  await page.reload();
  const shown = await page.textContent("#v");
  calls.set(HTML_SELECTOR, htmlResult(doc("v1")));

  assert.equal(shown, "v2");
  await context.close();
});

test("a controlled navigation is one eth_call, and carries the real status", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(path());
  await page.waitForSelector("#v");

  const before = rpcHits;
  const missing = await page.goto(`${path()}missing`);
  const perMissing = rpcHits - before;

  assert.equal(missing?.status(), 404);
  assert.equal(perMissing, 1);
  await context.close();
});

test("host form: the same contract on its own origin", async () => {
  const context = await fresh();
  const page = await context.newPage();

  await page.goto(`http://${ADDRESS}.31337.localhost:${gatewayPort}/`);
  await page.waitForSelector("#v");
  await page.waitForFunction(() => document.documentElement.dataset["widget"] === "ran");

  assert.equal(await page.textContent("#v"), "v1");
  await context.close();
});

test("path form without the trailing slash redirects to it", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(path());
  await page.waitForSelector("#v");

  await page.goto(path().slice(0, -1));
  await page.waitForSelector("#v");

  assert.equal(page.url(), path());
  await context.close();
});

/* Chromium only: the forced reload is driven through the Chrome DevTools Protocol, which Playwright
   exposes on Chromium alone. Firefox and WebKit have no equivalent for "reload ignoring cache". */
test("a forced reload bypasses the worker and still ends on the document", {
  skip: isChromium
    ? false
    : `${engineName}: drives the Chrome DevTools Protocol, which Playwright exposes on Chromium only`,
}, async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(path());
  await page.waitForSelector("#v");

  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.reload", { ignoreCache: true });
  await page.waitForSelector("#gw44", { state: "detached" });
  await page.waitForSelector("#v");

  assert.equal(await page.textContent("#v"), "v1");
  await context.close();
});

test("without service workers the root document is still rendered, at the same URL", async () => {
  const context = await fresh({ serviceWorkers: "block" });
  const page = await context.newPage();

  await page.goto(path());
  await page.waitForSelector("#v");

  assert.equal(await page.textContent("#v"), "v1");
  assert.equal(page.url(), path());
  await context.close();
});

// The limit of a gateway with no backend, pinned so it is never rediscovered: a service worker
// answers its own pages only. Another site's <script src> reaches the static host, and gets the shell.
test("LIMIT: a cross-origin <script src> is not served by the worker", async () => {
  const context = await fresh();
  const own = await context.newPage();
  await own.goto(path());
  await own.waitForSelector("#v");

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${hostPort}/`, { waitUntil: "load" });
  const ran = await page.evaluate(() => document.documentElement.dataset["widget"]);
  const direct = await fetch(`${path()}widget.js`);

  assert.equal(ran, undefined);
  assert.equal(direct.headers.get("content-type"), "text/html; charset=utf-8");
  await context.close();
});
