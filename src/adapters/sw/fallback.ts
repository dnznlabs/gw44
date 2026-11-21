import type { GatewayResponse } from "../../core/ports.ts";
import type { Target } from "../../core/target.ts";

/**
 * What the no-worker fallback may render, as two pure decisions so they can be tested without a
 * browser. The third condition — that the page is the top-level one — needs `window`, so it stays
 * in `boot.ts`.
 *
 * The fallback writes a contract's bytes into a document whose real headers are the static host's,
 * so anything the contract set to constrain its own document would not apply and the visitor could
 * not tell (F2, the 2026-11-20 review). Rather than honour part of what a contract asked for, it
 * declines.
 */

/**
 * Headers this page cannot honour. `content-security-policy-report-only` is here although the core's
 * allowlist does not pass it: this list is what the fallback cannot honour, not what can reach it,
 * and the two should not have to be read together to be safe.
 */
export const UNHONOURABLE_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
  "content-disposition",
];

/**
 * Only a contract's root. Without a worker nothing answers the document's relative URLs, so a deeper
 * path would render a document whose own subresources cannot load.
 */
export function isRootTarget(target: Target): boolean {
  return target.resource.length === 0;
}

/**
 * True when every header of the response is one this page can honour.
 *
 * Inert today and deliberately kept: the root is the only resource the fallback will render, and the
 * core builds a root response from `html()` with fixed headers only, so no contract header can reach
 * here. It becomes live the moment a root response can carry one (#57).
 */
export function headersAreHonourable(res: GatewayResponse): boolean {
  return !res.headers.some(([key]) => UNHONOURABLE_HEADERS.includes(key.toLowerCase()));
}
