// A configured build of one project on two chains, in a real browser: each contract under its own
// `/<chain>/`, `/` to the default, and nothing else reaching a contract at all. Two separate fake
// chains on two ports, each recording the address it was asked about, because what these cases prove
// is that one chain's prefix never reaches the other chain's contract.
//   node --test test/e2e/multi.e2e.ts        GW44_ENGINE=chromium|firefox|webkit (default chromium)
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

/** The default chain, and the other one. Different addresses, so a wrong call is visible. */
const A_CHAIN = "31337";
const B_CHAIN = "31338";
const A_ADDRESS = ADDRESS;
const B_ADDRESS = "0x00b19609f2349d4160d2babaf46b0cd1ec6d7f8e";

const doc = (title: string): string =>
  `<!doctype html><title>${title}</title><h1 id="v">${title}</h1><script src="widget.js"></script>`;

/** One stub's state: what it answers, and every call it saw. */
interface Stub {
  server: Server;
  calls: Map<string, Uint8Array>;
  seen: { to: string; data: string }[];
}

function stub(title: string): Stub {
  const calls = new Map<string, Uint8Array>([
    [HTML_SELECTOR, htmlResult(doc(title))],
    [
      encodeRequest(["widget.js"], []),
      requestResult(200, `document.documentElement.dataset.widget="${title}"`, [
        ["Content-Type", "text/javascript"],
      ]),
    ],
  ]);
  const seen: { to: string; data: string }[] = [];
  const server = createServer((req, res) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
    if (req.method === "OPTIONS") return void res.writeHead(204, cors).end();
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      const { params } = JSON.parse(body) as { params: [{ to: string; data: string }] };
      seen.push({ to: params[0].to.toLowerCase(), data: params[0].data });
      const out = calls.get(params[0].data);
      const reply = out ? { result: bytesToHex(out) } : { error: { code: 3, message: "execution reverted" } };
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, ...reply }));
    });
  });
  return { server, calls, seen };
}

const a = stub("A");
const b = stub("B");

function listen(server: Server): Promise<number> {
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done((server.address() as AddressInfo).port)));
}

const ENGINE_TYPES = { chromium, firefox, webkit } as const;
type EngineName = keyof typeof ENGINE_TYPES;

const engineName = process.env["GW44_ENGINE"] ?? "chromium";
if (!Object.hasOwn(ENGINE_TYPES, engineName)) {
  throw new Error(
    `GW44_ENGINE must be one of ${Object.keys(ENGINE_TYPES).join(", ")}; got ${JSON.stringify(engineName)}`,
  );
}
const engine = ENGINE_TYPES[engineName as EngineName];

let browser: Browser;
let server: ChildProcess;
let port = 0;
const at = (path: string): string => `http://localhost:${port}${path}`;

before(async () => {
  const probe = createServer();
  const [aPort, bPort, freePort] = await Promise.all([listen(a.server), listen(b.server), listen(probe)]);
  probe.close();
  port = freePort;
  const out = mkdtempSync(join(tmpdir(), "gw44-multi-"));
  // Both files outside GW44_OUT: the build refuses an output directory holding anything else.
  const inputs = mkdtempSync(join(tmpdir(), "gw44-multi-in-"));
  const chains = join(inputs, "chains.json");
  const config = join(inputs, "gw44.json");
  writeFileSync(
    chains,
    JSON.stringify({ [A_CHAIN]: [`http://127.0.0.1:${aPort}`], [B_CHAIN]: [`http://127.0.0.1:${bPort}`] }),
  );
  writeFileSync(
    config,
    JSON.stringify({ default: A_CHAIN, contracts: { [A_CHAIN]: A_ADDRESS, [B_CHAIN]: B_ADDRESS } }),
  );
  execFileSync(process.execPath, ["tools/build.ts"], {
    env: { ...process.env, GW44_CHAINS: chains, GW44_OUT: out, GW44_CONFIG: config },
  });
  server = spawn(process.execPath, ["tools/serve.ts", out], {
    env: { ...process.env, GW44_PORT: String(port) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((done) => server.stdout?.once("data", done));
  browser = await engine.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
  for (const s of [a.server, b.server]) {
    s.closeAllConnections();
    s.close();
  }
});

async function fresh(options: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  /* Three times the slowest case observed in CI: "first visit: the shell installs the worker and the
     contract's document replaces it" took 6,589 ms across the last ten runs on `main`, and the old
     8,000 ms left so little headroom that a loaded runner failed a passing suite (#38). */
  context.setDefaultTimeout(20000);
  return context;
}

test("the root ends on the default chain's prefix, showing its contract", async () => {
  const context = await fresh();
  const page = await context.newPage();

  await page.goto(at("/"));
  await page.waitForSelector("#v");
  await page.waitForFunction(() => document.documentElement.dataset["widget"] === "A");

  assert.equal(await page.textContent("#v"), "A");
  assert.equal(new URL(page.url()).pathname, `/${A_CHAIN}/`);
  await context.close();
});

test("the other chain's prefix serves the other contract, and only ever asks that chain", async () => {
  const context = await fresh();
  const page = await context.newPage();

  const aAt = a.seen.length;
  await page.goto(at(`/${B_CHAIN}/`));
  await page.waitForSelector("#v");
  await page.waitForFunction(() => document.documentElement.dataset["widget"] === "B");
  const asked = b.seen.filter((c) => c.data === HTML_SELECTOR || c.data === encodeRequest(["widget.js"], []));

  assert.equal(await page.textContent("#v"), "B");
  assert.equal(
    asked.every((c) => c.to === B_ADDRESS),
    true,
  );
  assert.deepEqual(a.seen.slice(aAt), []);
  await context.close();
});

test("a chain without its trailing slash ends on the prefix", async () => {
  const context = await fresh();
  const page = await context.newPage();

  await page.goto(at(`/${B_CHAIN}`));
  await page.waitForSelector("#v");

  assert.equal(new URL(page.url()).pathname, `/${B_CHAIN}/`);
  assert.equal(await page.textContent("#v"), "B");
  await context.close();
});

test("a first segment that is not a configured chain is 404 and costs no call", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(at("/"));
  await page.waitForSelector("#v");

  const aAt = a.seen.length;
  const bAt = b.seen.length;
  const statuses: (number | undefined)[] = [];
  for (const path of ["/nope/x", "/favicon.ico"]) {
    statuses.push((await page.goto(at(path)))?.status());
  }

  assert.deepEqual(statuses, [404, 404]);
  assert.deepEqual(a.seen.slice(aAt), []);
  assert.deepEqual(b.seen.slice(bAt), []);
  await context.close();
});

/* Decision 9's reason for the prefix: an absolute URL in a document must fail rather than quietly
   read the default chain's contract, which is what a single shared origin would have done. */
test("an absolute URL from a document under one prefix reaches no contract", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(at(`/${B_CHAIN}/`));
  await page.waitForSelector("#v");

  const aAt = a.seen.length;
  const bAt = b.seen.length;
  const status = await page.evaluate(async () => (await fetch("/widget.js")).status);

  assert.equal(status, 404);
  assert.deepEqual(a.seen.slice(aAt), []);
  assert.deepEqual(b.seen.slice(bAt), []);
  await context.close();
});

test("a controlled navigation to a prefix is one eth_call", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(at(`/${B_CHAIN}/`));
  await page.waitForSelector("#v");
  await page.waitForFunction(() => document.documentElement.dataset["widget"] === "B");

  const bAt = b.seen.length;
  await page.goto(at(`/${B_CHAIN}/`));
  await page.waitForSelector("#v");
  const roots = b.seen.slice(bAt).filter((c) => c.data === HTML_SELECTOR);

  assert.deepEqual(roots, [{ to: B_ADDRESS, data: HTML_SELECTOR }]);
  await context.close();
});

/* The redirect happens in `boot.ts` before any worker is registered, so the engine without one ends
   on the prefix too rather than rendering the default chain's document at `/`, where the document's
   relative URLs would resolve outside the prefix. */
test("without service workers the root still ends on the default chain's prefix", async () => {
  const context = await fresh({ serviceWorkers: "block" });
  const page = await context.newPage();

  await page.goto(at("/"));
  await page.waitForSelector("#v");

  assert.equal(await page.textContent("#v"), "A");
  assert.equal(new URL(page.url()).pathname, `/${A_CHAIN}/`);
  await context.close();
});
