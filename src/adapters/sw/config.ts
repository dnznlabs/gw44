import type { Chains } from "../rpc/fetch.ts";

// Replaced by the build with the contents of the chains file. Baked in rather than fetched, so the
// service worker's bytes are the whole of what decides which endpoint is believed.
declare const __GW44_CHAINS__: Chains;

export const CHAINS: Chains = __GW44_CHAINS__;
/** Reserved on every origin the gateway serves; a contract's own resource of this name is shadowed. */
export const SW_PATH = "/gw44-sw.js";
export const PURGE = "gw44:purge";
