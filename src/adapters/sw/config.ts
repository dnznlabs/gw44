import { type Pins, type Target, parseTarget, pinnedTarget } from "../../core/target.ts";
import type { Chains } from "../rpc/fetch.ts";

// Replaced by the build with the contents of the chains file. Baked in rather than fetched, so the
// service worker's bytes are the whole of what decides which endpoint is believed.
declare const __GW44_CHAINS__: Chains;
/** The configured contracts, or null in an ordinary build. Replaced by the build, like the chains. */
declare const __GW44_PINS__: Pins | null;
/**
 * Whether this build is pinned. A separate boolean rather than a `__GW44_PINS__ === null` test,
 * because the bundler folds a boolean constant in both directions and so drops the parser each
 * build does not use: comparing the object with null folds only the unpinned way, which left both
 * parsers in every bundle and cost the unpinned worker 570 bytes.
 */
declare const __GW44_PINNED__: boolean;

export const CHAINS: Chains = __GW44_CHAINS__;

/**
 * The one place either adapter decides which contract a URL names. A pinned build answers for its
 * configured contracts and reads no hostname; an unpinned build reads the two URL forms as before.
 */
export const targetOf: (url: URL) => Target | null = __GW44_PINNED__
  ? (url: URL) => pinnedTarget(url, __GW44_PINS__ as Pins)
  : parseTarget;
/** Reserved on every origin the gateway serves; a contract's own resource of this name is shadowed. */
export const SW_PATH = "/gw44-sw.js";
export const PURGE = "gw44:purge";
