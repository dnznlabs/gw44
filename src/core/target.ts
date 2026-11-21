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

/** One contract, compiled into the build. The chain's endpoints are compiled in beside it. */
export interface Pin {
  /** Decimal chain id, no leading zeros. */
  chain: string;
  /** Lower-case, 0x-prefixed, 20 bytes. */
  address: string;
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

/**
 * `<chain>:<address>`, the pin as a build gives it. Throws rather than returning null: a URL that
 * names no contract is ordinary and a malformed pin is a mistake, so the two must not look alike.
 */
export function parsePin(text: string): Pin {
  const parts = text.split(":");
  const [chain, rawAddress] = parts;
  if (parts.length !== 2 || chain === undefined || rawAddress === undefined) {
    throw new GatewayError("bad-target", `pin must be <chain>:<address>; got ${JSON.stringify(text)}`);
  }
  const address = rawAddress.toLowerCase();
  if (!CHAIN.test(chain)) {
    throw new GatewayError("bad-target", `pin chain must be a decimal chain id; got ${JSON.stringify(chain)}`);
  }
  if (!ADDRESS.test(address)) {
    throw new GatewayError("bad-target", `pin address must be 0x and 40 hex digits; got ${JSON.stringify(rawAddress)}`);
  }
  return { chain, address };
}

/**
 * The target of a URL in a pinned build: always the pinned contract, whatever the URL says. The
 * hostname is never read, so every origin serves the one contract, and the whole path is the
 * resource — a path that would be the path form elsewhere is just a path here, which is what keeps
 * `/<chain>/<address>/` from reaching a second contract.
 */
export function pinnedTarget(url: URL, pin: Pin): Target {
  return {
    chain: pin.chain,
    address: pin.address,
    resource: trimRoot(segments(url.pathname)),
    params: [...url.searchParams.entries()],
  };
}

/** `/` splits to one empty segment; the root is the empty resource. */
function trimRoot(resource: string[]): string[] {
  return resource.length === 1 && resource[0] === "" ? [] : resource;
}
