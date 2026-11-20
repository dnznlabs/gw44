import { HTML_SELECTOR, decodeRequestResult, decodeString, encodeRequest } from "./abi.ts";
import { GatewayError } from "./errors.ts";
import { type GatewayResponse, type Rpc, RpcRevert } from "./ports.ts";
import type { Target } from "./target.ts";

/**
 * Headers a contract may set on its own response. An allowlist, because the same core runs behind
 * adapters where a contract-chosen `Set-Cookie` or `Clear-Site-Data` would reach past its origin.
 */
const PASSED_HEADERS = new Set([
  "content-type",
  "content-language",
  "content-disposition",
  "content-security-policy",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "access-control-allow-origin",
  "x-frame-options",
]);

/** Never cached below the client, and never sniffed into a type the contract did not declare. */
const FIXED_HEADERS: [string, string][] = [
  ["cache-control", "no-store"],
  ["x-content-type-options", "nosniff"],
];

const HEADER_VALUE = /^[\t\x20-\x7e]*$/;

function respond(status: number, type: string, body: Uint8Array, extra: [string, string][] = []): GatewayResponse {
  return { status, headers: [["content-type", type], ...extra, ...FIXED_HEADERS], body };
}

/** Plain text, always: an error body never carries markup built from a URL or a contract. */
export function errorResponse(error: unknown): GatewayResponse {
  const known = error instanceof GatewayError ? error : new GatewayError("upstream", "internal gateway error");
  const body = new TextEncoder().encode(`gw44: ${known.message}\n`);
  return respond(known.status, "text/plain; charset=utf-8", body);
}

/** An address with no code, or a fallback that returns nothing, answers a call with zero bytes. */
async function call(target: Target, rpc: Rpc, data: string): Promise<Uint8Array> {
  const out = await rpc.call(target.chain, target.address, data);
  if (out.length === 0) throw new GatewayError("not-found", "the address does not serve this resource");
  return out;
}

async function html(target: Target, rpc: Rpc): Promise<GatewayResponse> {
  const body = decodeString(await call(target, rpc, HTML_SELECTOR));
  if (body.length === 0) throw new GatewayError("not-found", "html() returned an empty document");
  return respond(200, "text/html; charset=utf-8", body);
}

async function request(target: Target, rpc: Rpc): Promise<GatewayResponse> {
  const data = await call(target, rpc, encodeRequest(target.resource, target.params));
  const result = decodeRequestResult(data);
  // The range a `Response` can be built with; 1xx and 3xx-without-Location are not documents.
  if (result.status < 200 || result.status > 599) {
    throw new GatewayError("bad-response", `contract returned status ${result.status}`);
  }
  let type = "application/octet-stream";
  const extra: [string, string][] = [];
  for (const [rawKey, value] of result.headers) {
    const key = rawKey.toLowerCase();
    // A synthesized response is not content-decoded by the browser; garbage is worse than a 502.
    if (key === "content-encoding" && value.toLowerCase() !== "identity") {
      throw new GatewayError("bad-response", `content-encoding ${value} is not supported`);
    }
    if (!PASSED_HEADERS.has(key) || !HEADER_VALUE.test(value)) continue;
    if (key === "content-type") type = value;
    else extra.push([key, value]);
  }
  const nullBody = result.status === 204 || result.status === 205 || result.status === 304;
  return respond(result.status, type, nullBody ? new Uint8Array() : result.body, extra);
}

/**
 * The whole gateway: the root is ERC-8244 `html()`, every other path is ERC-5219 `request()`.
 * Never throws; a failure is a response.
 */
export async function resolve(target: Target, rpc: Rpc): Promise<GatewayResponse> {
  try {
    if (!rpc.supports(target.chain)) {
      throw new GatewayError("unknown-chain", `chain ${target.chain} is not configured on this gateway`);
    }
    return await (target.resource.length === 0 ? html(target, rpc) : request(target, rpc));
  } catch (error) {
    if (error instanceof RpcRevert) {
      return errorResponse(new GatewayError("not-found", "the contract does not serve this resource"));
    }
    return errorResponse(error);
  }
}
