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
  /** How to answer `redirect`; 308 when absent. 302 is for a redirect whose destination can change. */
  redirectStatus?: 302 | 308;
}

/**
 * One project's contracts, one per chain, as `gw44.json` names them. Several chains of one project
 * share one origin and are told apart by the first path segment, which is a path and not a browser
 * boundary: they share storage, the worker registration and any wallet permission the visitor has
 * granted, so each is only as safe as the weakest contract configured beside it. An application
 * that keeps per-chain state separates it by chain itself; nothing in the origin does that for it.
 * What the prefix buys is that a document's absolute URL fails instead of reading another chain's
 * contract, and that one project's contracts stay out of every other project's origin (decision 9;
 * F1 of the 2026-11-20 review, which found this comment claiming the opposite).
 */
export interface Pins {
  /** A key of `contracts`; the chain `/` goes to. */
  default: string;
  /** Chain id to lower-case address. At least one. */
  contracts: Record<string, string>;
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
export function parsePin(text: string): Pins {
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
  return { default: chain, contracts: { [chain]: address } };
}

/**
 * The configuration file, validated. Throws rather than returning null for the same reason
 * `parsePin` does: a malformed configuration is a mistake, not a URL that names no contract.
 */
export function parsePins(value: unknown): Pins {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GatewayError("bad-target", `configuration must be a JSON object; got ${describe(value)}`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "default" && key !== "contracts") {
      throw new GatewayError("bad-target", `configuration has no key ${JSON.stringify(key)}`);
    }
  }
  const raw = record["contracts"];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new GatewayError("bad-target", `configuration "contracts" must be an object; got ${describe(raw)}`);
  }
  const contracts: Record<string, string> = {};
  for (const [chain, address] of Object.entries(raw as Record<string, unknown>)) {
    if (!CHAIN.test(chain)) {
      throw new GatewayError("bad-target", `configuration chain ${JSON.stringify(chain)} is not a decimal chain id`);
    }
    if (typeof address !== "string" || !ADDRESS.test(address.toLowerCase())) {
      throw new GatewayError(
        "bad-target",
        `configuration address for chain ${chain} must be 0x and 40 hex digits; got ${describe(address)}`,
      );
    }
    contracts[chain] = address.toLowerCase();
  }
  const chains = Object.keys(contracts);
  const only = chains[0];
  if (only === undefined) {
    throw new GatewayError("bad-target", 'configuration "contracts" must name at least one chain');
  }
  /* The default may be left out only when there is nothing to choose between. With two contracts a
     missing default would make `/` mean whichever chain the JSON happened to list first. */
  const fallback = record["default"] ?? (chains.length === 1 ? only : undefined);
  if (fallback === undefined) {
    throw new GatewayError("bad-target", `configuration needs "default" when it names ${chains.length} chains`);
  }
  if (typeof fallback !== "string" || !Object.hasOwn(contracts, fallback)) {
    throw new GatewayError(
      "bad-target",
      `configuration "default" must be one of ${chains.join(", ")}; got ${describe(fallback)}`,
    );
  }
  return { default: fallback, contracts };
}

function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  const shown: string | undefined = JSON.stringify(value);
  return shown ?? typeof value;
}

/**
 * The target of a URL in a pinned build: always one of the configured contracts, whatever the
 * hostname says, which is never read. With one contract the whole path is the resource, so a path
 * of the path form is just a path. With several, the first segment is the chain and nothing else
 * reaches a contract — an unconfigured first segment is a 404 that costs no call.
 */
export function pinnedTarget(url: URL, pins: Pins): Target {
  const params: [string, string][] = [...url.searchParams.entries()];
  const chains = Object.keys(pins.contracts);
  const path = segments(url.pathname);

  if (chains.length === 1) {
    return { chain: pins.default, address: at(pins, pins.default), resource: trimRoot(path), params };
  }

  const [first, ...rest] = path;
  if (first === undefined || first === "") {
    // 302, not 308: which chain is the default is a setting, and a cached permanent redirect to the
    // old one would outlive the change in every browser that saw it.
    return {
      chain: pins.default,
      address: at(pins, pins.default),
      resource: [],
      params,
      redirect: `/${pins.default}/${url.search}`,
      redirectStatus: 302,
    };
  }
  if (!Object.hasOwn(pins.contracts, first)) {
    throw new GatewayError("not-found", "no contract at this path");
  }
  const target: Target = { chain: first, address: at(pins, first), resource: trimRoot(rest), params };
  if (rest.length === 0) {
    target.redirect = `/${first}/${url.search}`;
    target.redirectStatus = 308;
  }
  return target;
}

function at(pins: Pins, chain: string): string {
  const address = pins.contracts[chain];
  if (address === undefined) throw new GatewayError("not-found", "no contract at this path");
  return address;
}

/** `/` splits to one empty segment; the root is the empty resource. */
function trimRoot(resource: string[]): string[] {
  return resource.length === 1 && resource[0] === "" ? [] : resource;
}
