/// <reference lib="dom" />
import { GatewayError } from "../../core/errors.ts";
import { resolve } from "../../core/resolve.ts";
import { createFetchRpc } from "../rpc/fetch.ts";
import { CHAINS, PURGE, SW_PATH, targetOf } from "./config.ts";
import { headersAreHonourable, isRootTarget } from "./fallback.ts";

// The static host serves this page for every URL. It runs only when the service worker does not
// control the page: a first visit, a forced reload, or a browser without service workers.

const ATTEMPTS = "gw44:boot";
const WINDOW_MS = 10_000;
const MAX_ATTEMPTS = 2;
const WORKER_MS = 4000;

function say(message: string): void {
  const el = document.getElementById("gw44");
  if (el) el.textContent = message;
}

/** Counts reloads inside a short window, so a worker that never takes control cannot loop the page. */
function attempt(): number {
  let n = 0;
  try {
    const [count, at] = (sessionStorage.getItem(ATTEMPTS) ?? "0:0").split(":").map(Number);
    if (Date.now() - (at ?? 0) < WINDOW_MS) n = count ?? 0;
    sessionStorage.setItem(ATTEMPTS, `${n + 1}:${Date.now()}`);
  } catch {
    return MAX_ATTEMPTS; // storage blocked: no loop guard, so do not reload at all
  }
  return n;
}

const NEEDS_WORKER = "gw44: this page needs a service worker, and this browser is not providing one here.";

/**
 * No service worker: fetch the contract's root document here and write it over this page. Same
 * origin, same URL, and only ever the root — without a worker nothing can answer the document's
 * relative URLs, so a deeper path would render a document whose own subresources cannot load.
 *
 * It declines, with one sentence, unless all three hold: this is the top-level page, the URL is the
 * contract's root, and the response carries no header this page cannot honour.
 */
async function renderInline(url: URL): Promise<void> {
  const target = targetOf(url);
  if (target === null) return;
  // Both checked before the call, so a URL that will be declined costs no chain read.
  if (window.top !== window.self) return say(NEEDS_WORKER);
  if (!isRootTarget(target)) return say(NEEDS_WORKER);
  const res = await resolve(target, createFetchRpc(CHAINS));
  const type = res.headers.find(([k]) => k === "content-type")?.[1] ?? "";
  const text = new TextDecoder().decode(res.body);
  if (res.status !== 200 || !type.startsWith("text/html")) return say(text.trim());
  if (!headersAreHonourable(res)) return say(NEEDS_WORKER);
  document.open();
  document.write(text);
  document.close();
}

async function boot(): Promise<void> {
  const url = new URL(location.href);
  try {
    const target = targetOf(url);
    if (target === null) return say("gw44: no contract in this URL");
    /* Before any worker is registered: a multi-chain build sends `/` to the default chain's prefix,
       and the no-worker fallback can only render the root document of the URL it is on. Moving
       first means that fallback never renders the default chain's document at `/`, where the
       document's relative URLs would resolve outside the prefix.

       The fragment is carried explicitly. A browser keeps it across the worker's 302 and 308 by
       itself, but a script navigation does not, so without this a first visit to `/#/docs` landed
       on `/<default>/` while every later visit landed on `/<default>/#/docs`. */
    if (target.redirect !== undefined) return void location.replace(target.redirect + location.hash);
  } catch (error) {
    /* A configured build throws rather than returning null for a first segment it has no contract
       for, and that is the ordinary case of a visitor mistyping a chain — not a malformed URL. The
       worker serves `gw44: no contract at this path` there, so the page without a worker says the
       same sentence (#82). Anything that is not the gateway's own error keeps the old one. */
    return say(error instanceof GatewayError ? `gw44: ${error.message}` : "gw44: malformed URL");
  }
  if (!("serviceWorker" in navigator) || attempt() >= MAX_ATTEMPTS) return renderInline(url);
  try {
    // Raced, because a browser that blocks workers may leave `register` or `ready` pending forever.
    const registration = await Promise.race([
      navigator.serviceWorker
        .register(SW_PATH, { scope: "/", updateViaCache: "none" })
        .then(() => navigator.serviceWorker.ready),
      new Promise<never>((_, fail) => setTimeout(() => fail(new Error("worker timeout")), WORKER_MS)),
    ]);
    // Active but not controlling this page: the user forced a reload. Clear before going back.
    await new Promise<void>((done) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => done();
      registration.active?.postMessage(PURGE, [channel.port2]);
      setTimeout(done, 1000);
    });
    location.reload();
  } catch {
    await renderInline(url);
  }
}

void boot().catch(() => say("gw44: failed to load"));
