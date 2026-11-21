/// <reference lib="webworker" />
import { GatewayError } from "../../core/errors.ts";
import { errorResponse, resolve } from "../../core/resolve.ts";
import type { GatewayResponse } from "../../core/ports.ts";
import { createFetchRpc } from "../rpc/fetch.ts";
import { CHAINS, FRAME, PURGE, SW_PATH, targetOf } from "./config.ts";

declare const self: ServiceWorkerGlobalScope;

const rpc = createFetchRpc(CHAINS);

/**
 * The gateway's own script path, by the name a contract would be asked for rather than by the bytes
 * in the URL. `/%67w44-sw.js` is a different `pathname` and the same resource once the path is
 * decoded, and it is the decoded form that `pinnedTarget` would send to a contract, so matching the
 * raw string alone left the reservation one percent-escape wide (A12, the 2026-11-21b review).
 */
function isWorkerPath(url: URL): boolean {
  if (url.pathname === SW_PATH) return true;
  try {
    return decodeURIComponent(url.pathname) === SW_PATH;
  } catch {
    return false; // malformed escapes are not this path; `targetOf` reports them as a bad target
  }
}

function toResponse(r: GatewayResponse): Response {
  const nullBody = r.status === 204 || r.status === 205 || r.status === 304;
  return new Response(nullBody ? null : (r.body as Uint8Array<ArrayBuffer>), { status: r.status, headers: r.headers });
}

async function handle(url: URL): Promise<Response> {
  try {
    const target = targetOf(url);
    if (target === null) return fetch(url);
    if (target.redirect !== undefined) {
      return Response.redirect(new URL(target.redirect, url), target.redirectStatus ?? 308);
    }
    return toResponse(await resolve(target, rpc, FRAME));
  } catch (error) {
    return toResponse(errorResponse(error));
  }
}

// A new worker replaces the old one at once: there is no cached state for the two to disagree on.
self.addEventListener("install", () => void self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Not ours: the document's own traffic (its RPC, its wallet) and anything that is not a read.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET" && event.request.method !== "HEAD") return;
  /* The gateway's own script, answered here in every build and never read from a contract (#62).
     A pinned build turns every path into a resource of its contract, so without this the path the
     worker is registered from is an `eth_call`, and whatever the contract returns for it is served
     from the gateway's origin at the gateway's own script URL. The browser fetches the worker's
     script outside this handler, so a worker update is unaffected: what reaches here is a page
     asking for the file. */
  if (isWorkerPath(url)) {
    return event.respondWith(
      toResponse(errorResponse(new GatewayError("not-found", `${SW_PATH} is the gateway's own script`))),
    );
  }
  let named: boolean;
  try {
    named = targetOf(url) !== null;
  } catch {
    named = true; // malformed, but ours to answer
  }
  if (!named) return;
  event.respondWith(handle(url));
});

// Nothing is cached yet, so there is nothing to purge. The message exists so the boot script's
// forced-reload path is already the one a cache will be cleared through.
self.addEventListener("message", (event) => {
  if (event.data === PURGE) event.ports[0]?.postMessage(true);
});
