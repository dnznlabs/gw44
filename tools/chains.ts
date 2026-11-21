// The chains file, validated once for every program that reads it (#63). The file is data a
// deployer replaces, and both of its readers compile or call its endpoints without looking: the
// build freezes them into bytes every visitor runs, and `tools/get.ts` talks to them directly.
//
// Unvalidated, the shapes the 2026-11-20 and 2026-11-21 reviews found all pass: an `http:` endpoint
// on a public host, a bare string where an array belongs (`supports()` is true and the "list" is
// iterated one character at a time), `null` (which the pinned build's `!== undefined` check accepts)
// and a `__proto__` key. The last is an own property everywhere on the path from file to bundle —
// `JSON.parse` keeps it as one and esbuild emits it computed, measured both ways — so the key check
// below is what rejects it, not a prototype guard.
import type { Chains } from "../src/adapters/rpc/fetch.ts";
import { isChainId, isLoopback } from "../src/core/target.ts";

function fail(what: string): never {
  throw new Error(`the chains file ${what}`);
}

/** What a value is, for a message a deployer can act on: `typeof null` is "object", which names
 *  the wrong mistake at the one place a chains file is most likely to make it. */
function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  return `a ${typeof value}`;
}

/**
 * The chains file as `Chains`, or an error naming what is wrong and where. The accepted shape is an
 * object whose keys are decimal chain ids and whose values are non-empty arrays of `https:` URLs,
 * with `http:` for loopback hosts only, and nothing else: no other key, no other value, no empty
 * list. An empty object is accepted — a gateway configured with no chain serves nothing, which is
 * a deployment choice and not a malformed file.
 */
export function parseChains(value: unknown): Chains {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("is not an object of chain id to endpoints");
  }
  const out: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
  for (const [chain, endpoints] of Object.entries(value)) {
    if (!isChainId(chain)) fail(`has ${JSON.stringify(chain)} as a key, which is not a chain id`);
    if (!Array.isArray(endpoints)) fail(`gives chain ${chain} ${kindOf(endpoints)} instead of a list`);
    if (endpoints.length === 0) fail(`gives chain ${chain} an empty list of endpoints`);
    for (const endpoint of endpoints as unknown[]) {
      if (typeof endpoint !== "string") fail(`has ${kindOf(endpoint)} among chain ${chain}'s endpoints`);
      let url: URL;
      try {
        url = new URL(endpoint);
      } catch {
        fail(`has ${JSON.stringify(endpoint)} on chain ${chain}, which is not a URL`);
      }
      const ok = url.protocol === "https:" || (url.protocol === "http:" && isLoopback(url.hostname));
      if (!ok) {
        fail(`has ${JSON.stringify(endpoint)} on chain ${chain}: endpoints are https, or http on loopback`);
      }
    }
    out[chain] = endpoints as readonly string[];
  }
  return out;
}

/** The file at `path`, parsed and validated, with the path in anything thrown. */
export async function readChains(path: string, read: (p: string) => Promise<string>): Promise<Chains> {
  let value: unknown;
  try {
    value = JSON.parse(await read(path)) as unknown;
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return parseChains(value);
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
