# Spike 001 — a gateway with no backend

Run 2026-11-20. The prototype it produced is the code in this repository at the commit that adds this file.

## Verdict: PARTIAL

**Question.** Can a gateway that is only static files serve a contract's ERC-8244 `html()` at `/` and its ERC-5219 `request()` everywhere else, with no server-side cache to go stale, fast enough to replace a hosted gateway?

**Answer.** Yes for a visitor's browser. No for anything that is not a browser on the gateway's own origin, and that includes another site's `<script src>`.

## Evidence

Fixture: the rake `App` at `0x00a9f390a6010d045e0d34856048ddd6910d25ba` on Sepolia (11155111) and Base Sepolia (84532). Headless Chromium 1243 on the development VM; public RPC endpoints from `chains.json`. Times are medians of five fresh browser contexts, measured from navigation until the rake document has replaced its gzip bootstrap.

| Path | First visit | Repeat visit | Result |
|:--|--:|--:|:--|
| gw44, path form, Sepolia | 463 ms | 279 ms | renders, no console errors |
| gw44, host form, Base Sepolia | 429 ms | 323 ms | renders, no console errors |
| hosted gateway, Base Sepolia | 764 ms | 327 ms | renders |
| hosted gateway, Sepolia | — | — | HTTP 400, `execution reverted`, while `html()` answers a direct call |

| Measurement | Value |
|:--|:--|
| `html()` by `eth_call`, four endpoints, three runs each | 118–497 ms; 64,305-byte document, about 59 KB on the wire |
| JSON parse, hex decode and ABI decode of that response | 1.39 ms median, 200 runs, Node 24 |
| `/widget.js` through the core | 8,509 bytes, SHA-256 equal to the hosted gateway's |
| `dist/gw44-sw.js` / `dist/index.html` | 7,077 B / 7,954 B (3,088 / 3,562 gzipped) |
| Source, core and adapters | 575 lines, no runtime dependencies |
| CORS preflight on the endpoints used | allowed, `access-control-max-age` 172,800 s or 600 s |

`make check` holds the behaviour: 31 unit tests and 9 browser tests, the latter against a fake chain so they need no network.

## What worked

- **The service-worker model.** The static host answers every URL with one shell. The shell registers a worker and reloads; the worker then answers the navigation itself, so the document arrives as a real page load with the contract's status and content type, and its relative URLs (`widget.js`) reach the worker too.
- **No cache, and no need for one yet.** A repeat visit costs one `eth_call`: 279 ms and 323 ms against the hosted gateway's 327 ms. An owner's change shows on the next plain reload with nothing to restart or purge (`test/e2e`, "the owner changes the document").
- **A forced reload** bypasses the worker, lands on the shell, and recovers to the document. That is the client-side reset path a future cache would be cleared through.
- **Without service workers** the shell fetches `html()` itself and writes it into the page at the same URL. Root document only.

## What failed or surprised

- **Cross-origin subresources are not served.** A worker handles requests from its own pages. `<script src="https://<contract>.<chain>.<base>/widget.js">` on someone else's site goes to the static host and gets the shell (`test/e2e`, the `LIMIT` case). No static design fixes this; it needs either a loader script on the host page or a function at the edge. This is how rake's widget is embedded today.
- **Nothing but a browser sees the document.** `curl`, crawlers and link previews get the shell. `tools/get.ts` covers scripted checks.
- **The first visit pays for the install**: about 150–180 ms over a repeat visit, once per origin.
- **A blocked worker can leave `register()` pending forever.** The shell now gives up after four seconds and renders inline. Found by the test, not predicted.
- **The hosted gateway is not serving the unmodified document.** It returned 72,177 bytes for a 64,305-byte `html()` on Base Sepolia.

## Not measured

- Firefox and Safari. In-app wallet browsers, some of which are believed to run without service workers; the inline fallback exists for them and has only been exercised with workers blocked in Chromium.
- A real static host. `tools/serve.ts` stands in for one. Wildcard DNS and a certificate per chain label (`*.<chain>.<base>`) are untested, and a host that cannot serve wildcard subdomains cannot serve the public form at all.
- Mainnet endpoints, rate limits under load, and any endpoint's honesty.

## Rust and WebAssembly

Not for this. The gateway's own work on a 64 KB document is 1.4 ms; the RPC round trip is 120–500 ms. There is no time for a compiled core to win back, and it would add a toolchain, a binary to load on every worker start, and a TypeScript shim regardless. The strict-TypeScript core is 575 lines and runs unchanged in a worker, in Node and at an edge runtime.

What would bring it back: verifying the RPC answer against a light client, which is real computation and where the mature implementation is Rust compiled to WebAssembly.

## Recommendation

Adjust and proceed. Build the MVP as the static gateway, with the embed limit taken as a decision before the public deployment rather than discovered after it. Next step: [the roadmap](../ROADMAP.md), M01.
