/// <reference lib="webworker" />
import { errorResponse, resolve } from "../../core/resolve.ts";
import type { GatewayResponse } from "../../core/ports.ts";
import { createFetchRpc } from "../rpc/fetch.ts";
import { CHAINS, PURGE, targetOf } from "./config.ts";

declare const self: ServiceWorkerGlobalScope;

const rpc = createFetchRpc(CHAINS);

function toResponse(r: GatewayResponse): Response {
  const nullBody = r.status === 204 || r.status === 205 || r.status === 304;
  return new Response(nullBody ? null : (r.body as Uint8Array<ArrayBuffer>), { status: r.status, headers: r.headers });
}

async function handle(url: URL): Promise<Response> {
  try {
    const target = targetOf(url);
    if (target === null) return fetch(url);
    if (target.redirect !== undefined) return Response.redirect(new URL(target.redirect, url), 308);
    return toResponse(await resolve(target, rpc));
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
