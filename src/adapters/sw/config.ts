import { type Pin, type Target, parseTarget, pinnedTarget } from "../../core/target.ts";
import type { Chains } from "../rpc/fetch.ts";

// Replaced by the build with the contents of the chains file. Baked in rather than fetched, so the
// service worker's bytes are the whole of what decides which endpoint is believed.
declare const __GW44_CHAINS__: Chains;
/** The pinned contract, or null in an ordinary build. Replaced by the build, like the chains. */
declare const __GW44_PIN__: Pin | null;

export const CHAINS: Chains = __GW44_CHAINS__;
export const PIN: Pin | null = __GW44_PIN__;

/**
 * The one place either adapter decides which contract a URL names. A pinned build answers for its
 * contract at every URL and reads no hostname; an unpinned build reads the two URL forms as before.
 */
export function targetOf(url: URL): Target | null {
  return PIN === null ? parseTarget(url) : pinnedTarget(url, PIN);
}
/** Reserved on every origin the gateway serves; a contract's own resource of this name is shadowed. */
export const SW_PATH = "/gw44-sw.js";
export const PURGE = "gw44:purge";
