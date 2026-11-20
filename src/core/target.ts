import { GatewayError } from "./errors.ts";

export interface Target {
  /** Decimal chain id, no leading zeros. */
  chain: string;
  /** Lower-case, 0x-prefixed, 20 bytes. */
  address: string;
  /** Percent-decoded path segments. Empty for the root. */
  resource: string[];
  params: [string, string][];
  /**
   * Set when a path-form URL lacks the slash after the address. Relative URLs in the document
   * would resolve one level too high, so the adapter redirects here instead of serving.
   */
  redirect?: string;
}

const ADDRESS = /^0x[0-9a-f]{40}$/;
const CHAIN = /^[1-9][0-9]{0,15}$/;

/** Loopback only: `localhost`, any `*.localhost`, 127.0.0.0/8 and `[::1]`. */
export function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    /^127(\.[0-9]{1,3}){3}$/.test(hostname)
  );
}

function segments(pathname: string): string[] {
  const parts = pathname.split("/").slice(1);
  try {
    return parts.map((p) => decodeURIComponent(p));
  } catch {
    throw new GatewayError("bad-target", "malformed percent-encoding in path");
  }
}

/**
 * Two URL forms, and nothing else:
 *
 *   host form  `<address>.<chain>.<any base>/<path>`   every contract its own origin
 *   path form  `<loopback>/<chain>/<address>/<path>`   every contract on one origin
 *
 * The path form is honoured on loopback hosts only. On a public host it would put every contract
 * in one origin, where any document could read another's storage or replace its service worker.
 *
 * Returns null when the URL names no contract, so the adapter can leave it to the static host.
 */
export function parseTarget(url: URL): Target | null {
  const labels = url.hostname.toLowerCase().split(".");
  const params: [string, string][] = [...url.searchParams.entries()];

  const [first, second] = labels;
  if (labels.length >= 3 && first !== undefined && second !== undefined && ADDRESS.test(first)) {
    if (!CHAIN.test(second)) return null;
    const resource = segments(url.pathname);
    return { chain: second, address: first, resource: trimRoot(resource), params };
  }

  if (!isLoopback(url.hostname.toLowerCase())) return null;
  const [chain, rawAddress, ...rest] = segments(url.pathname);
  const address = rawAddress?.toLowerCase();
  if (chain === undefined || address === undefined) return null;
  if (!CHAIN.test(chain) || !ADDRESS.test(address)) return null;
  const target: Target = { chain, address, resource: trimRoot(rest), params };
  if (rest.length === 0) target.redirect = `${url.pathname}/${url.search}`;
  return target;
}

/** `/` splits to one empty segment; the root is the empty resource. */
function trimRoot(resource: string[]): string[] {
  return resource.length === 1 && resource[0] === "" ? [] : resource;
}
