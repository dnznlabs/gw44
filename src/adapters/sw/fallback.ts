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

/** Reloads allowed inside `ATTEMPT_WINDOW_MS` before the page stops trying to install a worker. */
export const MAX_ATTEMPTS = 2;
/** How long a reload counts towards the limit: longer than a worker install, shorter than a visit. */
export const ATTEMPT_WINDOW_MS = 10_000;

/** The stored counter's only accepted shape: one digit of count, a colon, an integer of epoch ms. */
const ATTEMPTS = /^([0-9]):([0-9]{1,15})$/;

/**
 * How many reloads this page has already made, read from session storage (#59).
 *
 * A rendered contract document shares this origin's session storage and can write anything into the
 * key. So a value this cannot read as a counter is `MAX_ATTEMPTS` and never 0: a document can then
 * stop a reload, which costs one page rendered inline, but cannot spend the page's reloads for it or
 * drive it in a loop. The old parser took `Number("")` as `NaN`, compared it and arrived at 0. A
 * timestamp in the future is the same answer, since it would otherwise hold the window open for as
 * long as the document liked.
 */
export function attemptsFrom(stored: string | null, now: number): number {
  if (stored === null) return 0;
  const parts = ATTEMPTS.exec(stored);
  if (parts === null) return MAX_ATTEMPTS;
  const at = Number(parts[2]);
  if (at > now) return MAX_ATTEMPTS;
  // Outside the window it is a fresh visit, whatever it counted: the reloads are spent, not lost.
  return now - at < ATTEMPT_WINDOW_MS ? Number(parts[1]) : 0;
}

/** The value to store for the next load. Kept to the shape `attemptsFrom` accepts, counter clamped
 *  to one digit so that what this writes is always a value it can read back. */
export function attemptsValue(attempts: number, now: number): string {
  return `${Math.min(attempts + 1, 9)}:${now}`;
}
