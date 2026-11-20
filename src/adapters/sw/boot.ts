/// <reference lib="dom" />
import { resolve } from "../../core/resolve.ts";
import { parseTarget } from "../../core/target.ts";
import { createFetchRpc } from "../rpc/fetch.ts";
import { CHAINS, PURGE, SW_PATH } from "./config.ts";

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

/**
 * No service worker: fetch the root document here and write it over this page. Same origin, same
 * URL, but only the root: without a worker nothing can answer the document's relative URLs.
 */
async function renderInline(url: URL): Promise<void> {
  const target = parseTarget(url);
  if (target === null) return;
  const res = await resolve(target, createFetchRpc(CHAINS));
  const type = res.headers.find(([k]) => k === "content-type")?.[1] ?? "";
  const text = new TextDecoder().decode(res.body);
  if (res.status !== 200 || !type.startsWith("text/html")) return say(text.trim());
  document.open();
  document.write(text);
  document.close();
}

async function boot(): Promise<void> {
  const url = new URL(location.href);
  try {
    if (parseTarget(url) === null) return say("gw44: no contract in this URL");
  } catch {
    return say("gw44: malformed URL");
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
