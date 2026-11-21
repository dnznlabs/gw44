// The fetch RPC adapter's limits: the body cap, the per-endpoint timeout, and ordered failover.
// Every test substitutes the `fetch` option; none opens a socket and none sleeps past 200 ms.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Chains, createFetchRpc } from "../src/adapters/rpc/fetch.ts";
import { GatewayError } from "../src/core/errors.ts";
import { RpcRevert } from "../src/core/ports.ts";
import { ADDRESS } from "./helpers.ts";

const CALLDATA = "0xabcdef01";
const ONE: Chains = { "1": ["https://one.invalid"] };
const TWO: Chains = { "1": ["https://one.invalid", "https://two.invalid"] };

/** A JSON-RPC 200 whose body is `payload`, serialised. */
const reply = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

/** Records every endpoint a call reached, in order. */
function recorder(responder: (endpoint: string) => Promise<Response>): { calls: string[]; fetch: typeof fetch } {
  const calls: string[] = [];
  return {
    calls,
    fetch: (async (input) => {
      const endpoint = String(input);
      calls.push(endpoint);
      return await responder(endpoint);
    }) as typeof fetch,
  };
}

async function kindOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "resolved";
  } catch (error) {
    if (error instanceof GatewayError) return error.kind;
    if (error instanceof RpcRevert) return "revert";
    return `unexpected: ${String(error)}`;
  }
}

test("a result is decoded, and the request carries eth_call, the address, the calldata and latest", async () => {
  let seen: { url: string; body: unknown } | undefined;
  const rpc = createFetchRpc(ONE, {
    fetch: (async (input, init) => {
      seen = { url: String(input), body: JSON.parse(String(init?.body)) };
      return reply({ jsonrpc: "2.0", id: 1, result: "0x1234" });
    }) as typeof fetch,
  });

  const out = await rpc.call("1", ADDRESS, CALLDATA);

  assert.deepEqual(out, new Uint8Array([0x12, 0x34]));
  assert.equal(seen?.url, "https://one.invalid");
  assert.deepEqual(seen?.body, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: ADDRESS, data: CALLDATA }, "latest"],
  });
});

test("a body one byte over maxBytes is upstream, and the stream is cancelled rather than drained", async () => {
  let delivered = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      delivered += 1;
      controller.enqueue(new Uint8Array(64));
    },
    cancel() {
      cancelled = true;
    },
  });
  const rpc = createFetchRpc(ONE, {
    maxBytes: 128,
    fetch: (async () => new Response(body, { status: 200 })) as typeof fetch,
  });

  const kind = await kindOf(rpc.call("1", ADDRESS, CALLDATA));

  assert.equal(kind, "upstream");
  assert.equal(cancelled, true, "the body was read to the end instead of cancelled");
  // 64-byte chunks against a 128-byte cap: it stops as soon as it is over, not after the stream.
  assert.ok(delivered <= 4, `read ${delivered} chunks past a 128-byte cap`);
});

test("a fetch that never settles until its signal aborts is upstream within timeoutMs", async () => {
  const rpc = createFetchRpc(ONE, {
    timeoutMs: 50,
    fetch: ((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch,
  });

  const started = Date.now();
  const kind = await kindOf(rpc.call("1", ADDRESS, CALLDATA));
  const took = Date.now() - started;

  assert.equal(kind, "upstream");
  assert.ok(took < 50 + 150, `took ${took} ms for a 50 ms timeout`);
});

test("a body that stalls after the headers is upstream too: the timeout covers the read", async () => {
  const rpc = createFetchRpc(ONE, {
    timeoutMs: 50,
    fetch: (async (_input, init) => {
      // Headers arrive at once; the body never ends. Only a timeout over the read catches this.
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
        },
      });
      return new Response(body, { status: 200 });
    }) as typeof fetch,
  });

  const started = Date.now();
  const kind = await kindOf(rpc.call("1", ADDRESS, CALLDATA));
  const took = Date.now() - started;

  assert.equal(kind, "upstream");
  assert.ok(took < 50 + 150, `took ${took} ms for a 50 ms timeout`);
});

for (const [name, body] of [
  ["a non-JSON body", "<html>not json</html>"],
  ["a JSON body with neither result nor error", JSON.stringify({ jsonrpc: "2.0", id: 1 })],
  ["a result that is not hex", JSON.stringify({ jsonrpc: "2.0", id: 1, result: "nope" })],
] as const) {
  test(`${name} is upstream`, async () => {
    const rpc = createFetchRpc(ONE, {
      fetch: (async () => new Response(body, { status: 200 })) as typeof fetch,
    });

    const kind = await kindOf(rpc.call("1", ADDRESS, CALLDATA));

    assert.equal(kind, "upstream");
  });
}

for (const status of [429, 500] as const) {
  test(`an HTTP ${status} is upstream, even with a result-shaped body`, async () => {
    const rpc = createFetchRpc(ONE, {
      fetch: (async () =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1234" }), { status })) as typeof fetch,
    });

    const kind = await kindOf(rpc.call("1", ADDRESS, CALLDATA));

    assert.equal(kind, "upstream", `HTTP ${status} was believed because its body parsed`);
  });
}

for (const [name, first] of [
  ["a non-2xx status", async () => new Response("{}", { status: 500 })],
  ["a non-JSON body", async () => new Response("<html>", { status: 200 })],
  ["no result and no error", async () => reply({ jsonrpc: "2.0", id: 1 })],
  ["a result that is not hex", async () => reply({ jsonrpc: "2.0", id: 1, result: "nope" })],
  ["a thrown fetch", async () => Promise.reject<Response>(new Error("connection refused"))],
] as const) {
  test(`failover: the second endpoint answers when the first gives ${name}`, async () => {
    const { calls, fetch: f } = recorder(async (endpoint) =>
      endpoint === "https://one.invalid" ? await first() : reply({ jsonrpc: "2.0", id: 1, result: "0x5678" }),
    );
    const rpc = createFetchRpc(TWO, { fetch: f });

    const out = await rpc.call("1", ADDRESS, CALLDATA);

    assert.deepEqual(out, new Uint8Array([0x56, 0x78]));
    assert.deepEqual(calls, ["https://one.invalid", "https://two.invalid"], "the first endpoint was not tried once");
  });
}

for (const [name, error] of [
  ["error.code 3", { code: 3, message: "execution reverted" }],
  ["a message containing revert", { code: -32000, message: "Error: execution reverted: Unauthorized" }],
] as const) {
  test(`a revert reported as ${name} is RpcRevert, and the second endpoint is not called`, async () => {
    const { calls, fetch: f } = recorder(async () => reply({ jsonrpc: "2.0", id: 1, error }));
    const rpc = createFetchRpc(TWO, { fetch: f });

    const kind = await kindOf(rpc.call("1", ADDRESS, CALLDATA));

    assert.equal(kind, "revert");
    assert.deepEqual(calls, ["https://one.invalid"], "a revert fell through to the next endpoint");
  });
}

test("an unconfigured chain is unknown-chain and calls nothing", async () => {
  const { calls, fetch: f } = recorder(async () => reply({ jsonrpc: "2.0", id: 1, result: "0x" }));
  const rpc = createFetchRpc(ONE, { fetch: f });

  const kind = await kindOf(rpc.call("999", ADDRESS, CALLDATA));

  assert.equal(kind, "unknown-chain");
  assert.equal(rpc.supports("999"), false);
  assert.deepEqual(calls, []);
});

/* The bound the doc comment states: `timeoutMs` is per endpoint and nothing spans the list, so two
   stalling endpoints cost two timeouts and not one. This pins the cost so that adding a budget
   later is a visible change rather than a silent one. */
test("the timeout is per endpoint: two stalling endpoints cost two timeouts, not one", async () => {
  const { calls, fetch: f } = recorder(
    async () =>
      await new Promise<Response>((_resolve, reject) => {
        setTimeout(() => reject(new Error("aborted")), 60);
      }),
  );
  const rpc = createFetchRpc(TWO, { timeoutMs: 50, fetch: f });

  const started = Date.now();
  const kind = await kindOf(rpc.call("1", ADDRESS, CALLDATA));
  const took = Date.now() - started;

  assert.equal(kind, "upstream");
  assert.deepEqual(calls, ["https://one.invalid", "https://two.invalid"]);
  assert.ok(took >= 110, `two 60 ms stalls finished in ${took} ms, so a budget now spans the list`);
});
