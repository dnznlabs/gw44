// A pinned build in a real browser: one contract at every URL, and no URL that reaches another.
// The fake chain here records the address each call was sent to, which `gateway.e2e.ts`'s stub does
// not, because what these cases prove is about `to` and not only about calldata.
//   node --test test/e2e/pinned.e2e.ts        GW44_ENGINE=chromium|firefox|webkit (default chromium)
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

/** The contract the build is pinned to, and one it must never reach. */
const OTHER = "0x00d19609f2349d4160d2babaf46b0cd1ec6d7f8e";
const CHAIN = "31337";

const doc = (version: string): string =>
  `<!doctype html><title>${version}</title><h1 id="v">${version}</h1><script src="widget.js"></script>`;

/* The path form's own path, read as a resource of the pinned contract rather than as a chain and an
   address. The trailing empty segment is the trailing slash: only a bare `/` is trimmed to the root. */
const PATH_FORM_RESOURCE = ["1", OTHER, ""];

const calls = new Map<string, Uint8Array>([
  [HTML_SELECTOR, htmlResult(doc("v1"))],
  [
    encodeRequest(["widget.js"], []),
    requestResult(200, 'document.documentElement.dataset.widget="ran"', [["Content-Type", "text/javascript"]]),
  ],
  [
    encodeRequest(PATH_FORM_RESOURCE, []),
    requestResult(200, '<!doctype html><title>path</title><h1 id="v">path-form</h1>', [["Content-Type", "text/html"]]),
  ],
]);
/** Every call the chain saw, so a test can assert what was asked of whom. */
const seen: { to: string; data: string }[] = [];

function listen(server: Server): Promise<number> {
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done((server.address() as AddressInfo).port)));
}

const rpc = createServer((req, res) => {
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

before(async () => {
  const probe = createServer();
  const [rpcPort, freePort] = await Promise.all([listen(rpc), listen(probe)]);
  probe.close();
  port = freePort;
  const out = mkdtempSync(join(tmpdir(), "gw44-pinned-"));
  // Outside GW44_OUT: the build refuses an output directory holding anything but the deployable.
  const chains = join(mkdtempSync(join(tmpdir(), "gw44-pinned-chains-")), "chains.json");
  writeFileSync(chains, JSON.stringify({ [CHAIN]: [`http://127.0.0.1:${rpcPort}`] }));
  execFileSync(process.execPath, ["tools/build.ts"], {
    env: { ...process.env, GW44_CHAINS: chains, GW44_OUT: out, GW44_PIN: `${CHAIN}:${ADDRESS}` },
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
  rpc.closeAllConnections();
  rpc.close();
});

async function fresh(): Promise<BrowserContext> {
  const context = await browser.newContext();
  context.setDefaultTimeout(8000);
  return context;
}

test("the pinned contract is served at the root, and its widget runs", async () => {
  const context = await fresh();
  const page = await context.newPage();

  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector("#v");
  await page.waitForFunction(() => document.documentElement.dataset["widget"] === "ran");

  assert.equal(await page.textContent("#v"), "v1");
  await context.close();
});

test("a second hostname on the same host serves the same contract", async () => {
  const context = await fresh();
  const page = await context.newPage();

  await page.goto(`http://pinned.localhost:${port}/`);
  await page.waitForSelector("#v");
  await page.waitForFunction(() => document.documentElement.dataset["widget"] === "ran");

  assert.equal(await page.textContent("#v"), "v1");
  await context.close();
});

test("a host-form hostname naming another contract gets the pinned one, and the other is never called", async () => {
  const context = await fresh();
  const page = await context.newPage();

  await page.goto(`http://${OTHER}.1.localhost:${port}/`);
  await page.waitForSelector("#v");

  assert.equal(await page.textContent("#v"), "v1");
  assert.deepEqual(
    seen.filter((c) => c.to === OTHER),
    [],
  );
  assert.equal(
    seen.every((c) => c.to === ADDRESS),
    true,
  );
  await context.close();
});

test("a path-form path naming another contract is a resource of the pinned contract", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector("#v");

  const at = seen.length;
  await page.goto(`http://localhost:${port}/1/${OTHER}/`);
  await page.waitForSelector("#v");
  /* Filtered by calldata, not sliced raw: under a pin every path is the contract's resource, so the
     browser's own `/favicon.ico` is an eth_call too, and Firefox and WebKit ask for it where the
     headless Chromium shell does not. What matters is that this path was asked of the pinned
     address exactly once, and that nothing was asked of any other address. */
  const wanted = encodeRequest(PATH_FORM_RESOURCE, []);
  const made = seen.slice(at);

  assert.equal(await page.textContent("#v"), "path-form");
  assert.deepEqual(
    made.filter((c) => c.data === wanted),
    [{ to: ADDRESS, data: wanted }],
  );
  assert.deepEqual(
    made.filter((c) => c.to !== ADDRESS),
    [],
  );
  await context.close();
});

/* Counted by selector rather than by total calls: the root document pulls `widget.js`, so a count of
   everything the chain saw would be two and would say nothing about the navigation itself. */
test("a controlled navigation to the root is one eth_call", async () => {
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector("#v");
  await page.waitForFunction(() => document.documentElement.dataset["widget"] === "ran");

  const at = seen.length;
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector("#v");
  const roots = seen.slice(at).filter((c) => c.data === HTML_SELECTOR);

  assert.deepEqual(roots, [{ to: ADDRESS, data: HTML_SELECTOR }]);
  await context.close();
});
