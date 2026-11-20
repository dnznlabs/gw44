import { hexToBytes } from "../../core/abi.ts";
import { GatewayError } from "../../core/errors.ts";
import { type Rpc, RpcRevert } from "../../core/ports.ts";

/** Chain id to its JSON-RPC endpoints, tried in order. */
export type Chains = Readonly<Record<string, readonly string[]>>;

export interface FetchRpcOptions {
  timeoutMs?: number;
  /** Cap on one JSON-RPC response body. The document arrives hex-encoded, so twice its size. */
  maxBytes?: number;
  fetch?: typeof fetch;
}

interface JsonRpcReply {
  result?: unknown;
  error?: { code?: unknown; message?: unknown; data?: unknown };
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const text = new TextDecoder();
  let out = "";
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out + text.decode();
    seen += value.length;
    if (seen > maxBytes) {
      await reader.cancel();
      throw new Error("response exceeds the size cap");
    }
    out += text.decode(value, { stream: true });
  }
}

/** A revert is the contract's answer; every other JSON-RPC error is the endpoint's problem. */
function isRevert(error: NonNullable<JsonRpcReply["error"]>): boolean {
  return error.code === 3 || (typeof error.message === "string" && /revert/i.test(error.message));
}

/**
 * JSON-RPC over `fetch`, with ordered failover. Limits: one endpoint's word is taken as the chain's;
 * there is no quorum and no proof verification.
 */
export function createFetchRpc(chains: Chains, options: FetchRpcOptions = {}): Rpc {
  const { timeoutMs = 10_000, maxBytes = 16 * 1024 * 1024 } = options;
  const send = options.fetch ?? fetch;

  async function callOne(endpoint: string, to: string, data: string): Promise<Uint8Array> {
    const res = await send(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      signal: AbortSignal.timeout(timeoutMs),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const text = await readCapped(res, maxBytes);
    const reply = JSON.parse(text) as JsonRpcReply;
    if (reply.error) {
      if (isRevert(reply.error)) throw new RpcRevert();
      throw new Error("endpoint returned an error");
    }
    if (typeof reply.result !== "string") throw new Error("endpoint returned no result");
    return hexToBytes(reply.result);
  }

  return {
    supports: (chain) => (chains[chain]?.length ?? 0) > 0,
    async call(chain, to, data) {
      const endpoints = chains[chain] ?? [];
      if (endpoints.length === 0) throw new GatewayError("unknown-chain", `chain ${chain} is not configured`);
      for (const endpoint of endpoints) {
        try {
          return await callOne(endpoint, to, data);
        } catch (error) {
          if (error instanceof RpcRevert) throw error;
          // Deliberately swallowed: the next endpoint is the handling.
        }
      }
      throw new GatewayError("upstream", `no RPC endpoint for chain ${chain} answered`);
    },
  };
}
