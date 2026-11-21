# gw44 web gateway — adversarial review, Opus leg

## What this leg could and could not do

- I read all 13 scoped files in full. I added no files and edited nothing in the tree; `git status` was clean before and after.
- **I could not run the gateway.** I had no browser, so nothing here was watched in a live service worker or page. Browser behaviour is cited from the Fetch, Service Worker and HTML specs as I know them, and every such claim is marked as an inference.
- **I ran one bundler experiment outside the tree.** I had no network. I used an `esbuild` binary (0.28.2) that already sat in a directory outside the scoped tree, on a synthetic three-line input in a scratch directory that I deleted afterwards. I read nothing else from that directory. It answered two questions about `tools/build.ts`, under B-2 and B-3 below. The version is not pinned by anything in scope, so those two results hold for 0.28.2 only.

## Severity scale

| Level | Meaning |
|---|---|
| **Critical** | A URL, a contract or an endpoint the build did not configure gets script execution or control on the deployed origin, or reads another origin's data. |
| **High** | A party the build *did* configure, such as one contract or one endpoint, compromises documents, storage or permissions that belong to another configured or unconfigured party. Or a stranger's content gains control over the gateway's behaviour for other visitors. |
| **Medium** | A cross-party weakness that needs extra conditions, or one the affected contract cannot opt out of. Or denial of service for other parties' visitors. |
| **Low** | Self-inflicted or bounded resource exhaustion, a broken guard, or a build-input hazard that needs a mistaken operator. |
| **Info** | Code and comment disagree, dead code, or a hardening gap with no demonstrated effect. |

---

## Findings

### H-1 — In the several-chains shape, every configured contract has full script control over every other chain's documents, storage, worker and wallet permissions — **High**

`src/core/target.ts:174-205`, `src/adapters/sw/boot.ts:81`, `src/core/resolve.ts:63-73`

`pinnedTarget` tells chains apart by their first path segment only. `boot.ts:81` registers one worker at scope `/` for all of them. `resolve.ts:72` lets any contract choose `content-type: text/html` (or `image/svg+xml`) for any of its non-root resources. So any configured contract can run script on the shared origin at a path it controls. From there it can do the following, using nothing but same-origin rights:

- Read and write the other chain's `localStorage`, `IndexedDB`, cookies and the `gw44:boot` counter (see M-3).
- Put the other chain's pages in a same-origin iframe or `window.open` them, then read their DOM, rewrite it, or capture what the visitor types into them.
- Call `navigator.serviceWorker.getRegistration().then(r => r.unregister())`. That forces the next visit back through the boot page, which works on every chain.
- Use any EIP-1193 wallet connection the visitor granted to "this origin". That gives silent `eth_accounts` (the visitor's address), and transaction or signature prompts that show the trusted origin. The wallet UI shows no chain prefix.
- Use any browser permission (notifications, camera, clipboard) granted while the visitor was on another chain's pages.

The comment at `target.ts:21-29` states this and accepts it. It is still the property most likely to matter in practice: testnet deployments are routinely owned by a hot developer key, upgradable, or left unmaintained. With this shape, compromising the testnet contract means compromising the mainnet dapp's origin.

**Repro:** build with `GW44_CONFIG` = `{"default":"1","contracts":{"1":"0xA…","11155111":"0xB…"}}`. Have the contract at `0xB…` return status 200, `content-type: text/html`, and the body `<script>parent.opener?.document; fetch('/1/').then(r=>r.text()).then(steal); localStorage.clear(); navigator.serviceWorker.getRegistration().then(r=>r.unregister())</script>` for `/11155111/x`. Visiting `/11155111/x` gives that script full read/write access to everything `/1/` holds.

### M-1 — The root document can never send a framing or opener policy, so every contract's root is clickjackable and the contract cannot opt out — **Medium**

`src/core/resolve.ts:50-54` (and `:32-34`)

`html()` answers the root with `respond(200, "text/html; charset=utf-8", body)`. Its only headers are `content-type`, `cache-control` and `nosniff`. ERC-8244 `html()` returns only a string, so no contract header ever reaches the root. `X-Frame-Options`, `Content-Security-Policy: frame-ancestors` and `Cross-Origin-Opener-Policy` are allowlisted (`resolve.ts:14-21`), but only for `request()` resources. `frame-ancestors` cannot be set from a `<meta>` tag, so the contract has no in-document way to opt out either.

Inference from the Service Worker spec: a cross-origin `<iframe src>` is a navigation request to the gateway's origin, so the gateway's own worker answers it. A hostile site can therefore frame any contract's root, which is normally the dapp's main UI, and overlay it.

The same applies to `window.open` without COOP: the opener keeps a `WindowProxy` reference and can navigate the dapp window later. That enables tab-nabbing to a look-alike page.

**Repro:** on any site, `<iframe src="https://0xA….1.gw.example/" style="opacity:0">` over a decoy "Claim" button. The root response carries no `frame-ancestors` or XFO, whatever the contract does (`resolve.ts:53`).

### M-2 — Unpinned host form: every contract is same-site with every other, so any contract can write cookies onto the whole gateway domain and break first visits for all contracts — **Medium**

`src/core/target.ts:62-79`

The host form gives each contract its own origin, `<address>.<chain>.<base>`, but they all share one registrable domain, `<base>`, unless `<base>` is on the Public Suffix List. In the unpinned shape, contracts are strangers. A document served by contract A can run `document.cookie = "x=" + "A".repeat(4000) + "; domain=<base>; path=/"` a few dozen times.

Inference: the browser then attaches a ~100 KB `Cookie` header to every request to every `*.<base>` origin. The static host refuses those requests (typically 400 or 431). Most traffic is unaffected, because a worker-controlled navigation never reaches the host. These do reach it:

- every first visit to any contract origin, which fetches the boot page from the host;
- every worker update check, because `updateViaCache: "none"` at `boot.ts:81` sends each check to the host;
- every forced reload.

So one contract breaks the gateway for all other contracts, in that visitor's browser, until the visitor clears cookies.

Same-site also means `SameSite` cookies give no separation between contracts. It also means site-keyed process sharing (inference, Chromium) puts all contracts in one renderer process, which weakens defence against Spectre-class side channels.

**Repro:** have contract A's `/x` return `text/html` carrying the cookie loop above. Then visit `https://0xB….1.<base>/` for the first time in that browser: the static host rejects the request, so the boot page never loads.

### M-3 — The boot loop guard trusts a value any same-origin document can write: it can be disabled (NaN), or pinned on forever (a future timestamp) — **Medium** in the several-chains shape, **Low** otherwise

`src/adapters/sw/boot.ts:21-31`, `:76`

`attempt()` parses `sessionStorage["gw44:boot"]` with `split(":").map(Number)`. It does no validation, and the key lives in the same storage that contract documents can read and write.

- **Guard disabled.** Set the value to `"x:<now>"`. Then `count` is `NaN`, so `n` is `NaN` (`NaN ?? 0` is `NaN`), and `NaN >= MAX_ATTEMPTS` is false. The value is stored back as `NaN:<now>`, so the guard never trips again in that tab. In any state where the worker does not take control after `location.reload()` (DevTools "bypass for network", a worker that keeps getting evicted, a browser bug), the page reloads without end.
- **Guard stuck on.** Set the value to `"99:9999999999999"`. Then `Date.now() - at` is negative, which is always `< WINDOW_MS`, so `n = 99` on every boot. `boot.ts:76` goes straight to `renderInline` and never registers a worker for the rest of that tab's session. Every non-root resource then fails with `NEEDS_WORKER`, and the root runs in the no-worker mode that the worker was meant to replace.

In the several-chains shape, contract B can do either of these to chain A's visitors. That is a narrower case of H-1.

**Repro:** a contract document runs `sessionStorage.setItem("gw44:boot","99:9999999999999"); location.href="/1/"`. Chain 1 is then served without a worker for the rest of the tab's session.

### L-1 — A non-2xx RPC response is thrown away without its body being cancelled, so the response is held until the abort timer fires — **Low**

`src/adapters/rpc/fetch.ts:69`

`if (!res.ok) throw …` exits without `res.body?.cancel()`. The stream, and on HTTP/1.1 its connection, stays open until `AbortSignal.timeout(timeoutMs)` aborts it (10 s by default) or the object is garbage-collected.

A broken or hostile endpoint can send `HTTP/1.1 429` headers and then trickle the body. Each such call ties up a pooled connection for 10 s. Under the per-host connection limit (6 on HTTP/1.1), later calls to that endpoint queue behind the held responses. Every one of them then fails, then waits out its own timeout, before failover happens.

This is the "response that is never released" case: bounded by the timer, but not released by the code.

**Repro:** endpoint 1 answers `429` with `Transfer-Encoding: chunked` and one byte every 5 s. A page with 12 subresources sees calls queue for multiples of 10 s before each one fails over.

### L-2 — RPC memory per call is about 4–6× the 16 MiB cap, with no limit on concurrent calls, so one page can exhaust the worker — **Low**

`src/adapters/rpc/fetch.ts:20-36`, `:54`, `:71`, `:77`; `src/adapters/sw/sw.ts:45`

For each call:

- `readCapped` builds a JS string of up to 16 Mi characters, about 32 MiB as UTF-16 if anything forces two-byte representation.
- `JSON.parse` makes a second copy of `result`.
- `hexToBytes` allocates up to 8 MiB.
- `boot.ts:51` decodes the body to a string again.

The worker answers every request concurrently (`sw.ts:45`), and nothing limits calls in flight.

A hostile endpoint that returns a 16 MiB `"0x…"` for every call needs only a page with ~50 subresources to push the worker towards OOM. The contract itself can do roughly the same with gas-bounded returns of a few MiB each. When the worker is killed, every in-flight response on the origin fails.

This is resource exhaustion and not a wrong document. The cap bounds each call, but not the worker.

**Repro:** endpoint returns `{"jsonrpc":"2.0","id":1,"result":"0x" + "00".repeat(8_388_600)}` to every `eth_call`, and a contract root carries `<img src=/i0>…<img src=/i63>`.

### L-3 — The RPC client follows endpoint redirects, so endpoints the build did not configure get believed — **Low**

`src/adapters/rpc/fetch.ts:58-66`

`send(endpoint, {...})` does not set `redirect`, so it defaults to `"follow"`. A configured endpoint, or anyone who controls its DNS, path or CDN, can answer `307`/`308` to any URL. The POST body is re-sent there, and that host's reply is decoded as the chain's answer.

`config.ts:4-5` says the worker's bytes are "the whole of what decides which endpoint is believed". This contradicts that: the endpoint list effectively includes wherever the endpoints point at request time. Inference: redirects to private-network addresses are mostly blocked by mixed-content rules and Private Network Access, but nothing in this code relies on those.

**Repro:** endpoint answers `HTTP/1.1 307` with `Location: https://other.example/rpc`. The gateway then serves whatever `other.example` returns (`fetch.ts:70-77`).

### L-4 — One failing endpoint stops failover: any error message containing "revert" is treated as a final answer — **Low**

`src/adapters/rpc/fetch.ts:39-41`, `:73`, `:89`

`isRevert` returns true for `code === 3` or for any `message` that matches `/revert/i`. In either case `call` rethrows at once (`:89`), so the next endpoint is never tried, and `resolve.ts:90-91` turns that into a 404.

A *broken* endpoint (not just a lying one) can produce a 404 for every resource. For example, a proxy whose rate-limit or upstream-error message happens to contain "reverted", or a load-balancer error that says "reverting to…". The honest second endpoint is never asked. The project already treats a wrong document from a lying endpoint as known; the gap here is that a broken endpoint also disables failover.

**Repro:** endpoint 1 returns `{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"upstream reverted to archive node, retry"}}`. Every resource is a 404, and endpoint 2 is never called.

### L-5 — Each call can take n × 10 s, and the slow first endpoint is retried on every call — **Low**

`src/adapters/rpc/fetch.ts:47-54`, `:85-92`

This is documented at `:47-51`. I record it because it is the hang surface: there is no deadline across the whole call and no memory of which endpoints have failed. An endpoint that blackholes (accepts the connection, never answers) adds 10 s to every resource, for every visitor, permanently. The boot path's `renderInline` (`boot.ts:49`) has no deadline either.

**Repro:** endpoint 1 is `https://10.255.255.1/` (unroutable) or a TCP sink. Every request takes at least 10 s.

### L-6 — Contract-driven RPC amplification: any page can make each visitor's browser spend the build's endpoint quota — **Low**

`src/adapters/sw/sw.ts:33-46`, `src/core/resolve.ts:56-58`

Every same-origin GET or HEAD a contract's document triggers becomes one `eth_call` per endpoint tried. Nothing caches results, coalesces duplicates or limits the rate.

In the unpinned shape, a stranger's contract linked from anywhere makes every visitor's browser send thousands of calls to the operator's compiled-in endpoints. Keyed endpoints then get rate-limited, so every contract's visitors see 502. A HEAD request costs a full call too.

**Repro:** a contract root containing `<script>for(let i=0;i<1e4;i++)fetch('/r'+i,{method:'HEAD'})</script>`.

### L-7 — The chains file is compiled in without validation — **Low**

`tools/build.ts:25`, `:35`, `:42-47`, `:62`

`chains.json` is never checked to be a `Record<string, string[]>` of `https:` URLs:

- An unpinned build embeds whatever JSON it holds, unchecked.
- A pinned build only checks `!== undefined`.

Consequences, all at runtime in the shipped bundle:

- A value written as a string (`"1": "https://rpc"`) passes `supports` (`fetch.ts:81`, since `.length > 0`). `for…of` then iterates it one character at a time, so every call fails with `upstream`.
- `null` passes the build check and becomes `unknown-chain`.
- `http:` endpoints are accepted and then blocked as mixed content in production.
- A `data:` URL is accepted as an endpoint and answers the same fixed bytes for every call.
- Any API key in an endpoint URL is published in two deployed files.

Checked with esbuild 0.28.2: a `"__proto__"` key in the chains file is emitted as a computed own property (`["__proto__"]:`), so it does **not** become the object's prototype. That holds only for that esbuild version.

**Repro:** `chains.json` = `{"1":"https://eth.example"}`. The build succeeds, and every request on chain 1 returns `502 no RPC endpoint for chain 1 answered`.

### L-8 — An empty `GW44_PIN` or `GW44_CONFIG` silently produces an unpinned build — **Low**

`tools/build.ts:29-36`

`?? ""` followed by `!== ""` means an environment variable that is set but empty is treated the same as one that is unset. CI templating such as `GW44_PIN=${{ vars.PIN }}` with a missing variable ships an **unpinned** gateway, containing the URL parser and every chain in the chains file, to the project's domain. Only the log line `built dist/:` (`:99`) shows it.

On a single, non-wildcard project hostname, the unpinned parser returns null for every URL (`target.ts:75-81`), so the failure is closed: "no contract in this URL". On a wildcard domain, or if the deployment hostname ever has the form `<address>.<chain>.…`, any contract becomes reachable.

**Repro:** `GW44_PIN= node tools/build.ts` builds unpinned and exits 0.

### L-9 — The build writes the deployable before checking its output directory or the size gate — **Low**

`tools/build.ts:81-87`, `:102-115`

All three files are written first, possibly overwriting `index.html` or `404.html` in whatever `GW44_OUT` names. Only after that does the build check for unexpected files, and only after that does it enforce `SW_LIMIT`.

- With `GW44_OUT=.` or another site's directory, existing files are overwritten before the error.
- A deploy step that ignores the exit code ships an oversized worker, or one mixed with stale files.

**Repro:** `GW44_OUT=./public node tools/build.ts`, where `public/index.html` is the real site. That file is overwritten, and then the build throws.

### L-10 — The worker answers HEAD and every resource request without reading the request, so Range and conditional requests are ignored — **Low/Info**

`src/adapters/sw/sw.ts:16-23`, `:37`, `:45`

`handle(url)` receives only the URL. A `Range` request (media seeking, resumed downloads) gets a full 200. A `HEAD` request runs the full `eth_call` and builds a body. The listener also accepts requests whose `destination` is `worker` or `sharedworker`, so a contract can serve worker scripts. That gives no new capability, because the origin is the contract's anyway.

The dead branch at `sw.ts:19` (`return fetch(url)` when `target === null`, which the listener never sends) would replay the request as a bare GET, dropping its method, headers, mode and credentials, if it ever became reachable.

**Repro:** `<video src="/clip.mp4">` with a seek. The worker returns the full body with status 200 for every range request.

### I-1 — Comment and code disagree: 3xx statuses without `Location` are accepted — **Info**

`src/core/resolve.ts:59-62`

The comment says "1xx and 3xx-without-Location are not documents". The check rejects only `< 200` and `> 599`, and `Location` is not allowlisted, so a contract status of 300–399 always arrives without a `Location`. Inference from Fetch: for a navigation, the redirect mode is manual, and a redirect status with a null location is returned as-is and rendered. No redirect can be built from the contract, so the destination cannot be chosen; the mismatch is the finding.

**Repro:** `request()` returns status 302 with body `<h1>hi</h1>` and no headers. The response is served with status 302 and no `Location`.

### I-2 — `SW_PATH` is not reserved under the worker in the host form or in either pinned shape — **Info**

`src/adapters/sw/config.ts:26-27`, `src/adapters/sw/sw.ts:38-45`, `src/core/target.ts:179-180`

The comment says the contract's resource of this name is shadowed. Under a controlling worker, `/gw44-sw.js` goes to the contract (`pinnedTarget` and the host form never exclude it). Only the worker's own registration and update fetch, which by spec bypass service workers (inference), reach the host's file.

I found no way for a contract to replace the worker this way, because the `register()` fetch always goes to the network. But page code that fetches `/gw44-sw.js` gets a different file from the one installed.

**Repro:** single-pin build, contract serves `/gw44-sw.js`. In a controlled page, `fetch('/gw44-sw.js')` returns the contract's bytes, not the deployed worker.

### I-3 — The no-worker fallback writes the contract's root into the live boot page, in the boot page's realm, also in browsers that do support workers — **Info**

`src/adapters/sw/boot.ts:43-57`, `:76`, `:93-94`

`document.open(); document.write(text)` runs the contract's root document under the static host's headers, in the same JS realm the boot bundle ran in. Inference: since the HTML spec's 2019 `document.open` change, no new global is created. Without a worker, that document gets no `nosniff` and no `no-store`.

`renderInline` is reached in three ways:

- when there is no `serviceWorker` API;
- after two boots within 10 s, so a visitor who reloads three times quickly gets the fallback;
- when registration takes longer than 4 s.

The fallback is therefore a regular path in worker-capable browsers, not a rare one.

The `headersAreHonourable` check (`fallback.ts:46-48`) is inert today, as its comment says. I found no injection beyond the intended one: the document is the contract's own, on the contract's own origin. The text paths use `textContent` (`boot.ts:17`). One cosmetic issue: an unconfigured first segment in the several-chains shape makes `pinnedTarget` throw, and the boot page reports that as "malformed URL" (`boot.ts:73-74`).

**Repro:** a worker-capable browser reloads `/` three times within 10 s. The root is rendered by `document.write` at `boot.ts:55`, and its `/app.js` is fetched from the static host, which returns `404.html`.

### I-4 — Allowlisted headers that do little or nothing in this adapter — **Info**

`src/core/resolve.ts:10-22`

Inference: `access-control-allow-origin` and `cross-origin-resource-policy` are inert for cross-origin subresource requests. Those requests are handled by the requesting origin's worker, if any, and so reach the static host, never this worker. They only take effect on navigations, where they do not matter.

`content-disposition: attachment; filename=…` lets a contract trigger downloads under a filename it chooses from the gateway origin. That is the contract's prerogative on its own origin, but in the several-chains shape the download is attributed to the shared project origin.

`referrer-policy: unsafe-url` lets a contract leak its full URLs, including query parameters, to third parties.

The error body at `resolve.ts:69` repeats a contract-chosen `content-encoding` value. It is plain text with `nosniff`, so it cannot become markup, but it can carry text for phishing ("gw44: content-encoding … visit …").

**Repro:** `request()` returns the header `content-encoding: br; your wallet is compromised, visit evil.example`. The visitor sees that sentence as the gateway's 502 text (`boot.ts:52` or the worker's error body).

### I-5 — The `</script` escape in the build is case-sensitive and does not handle `<!--` — **Info**

`tools/build.ts:79`

`replaceAll("</script", "<\\/script")` misses `</SCRIPT` and `</Script`, which also end the inline script in HTML. It also leaves `<!--`, which together with a later `<script` puts the HTML parser into the script-data-double-escaped state.

Checked with esbuild 0.28.2: the bundler itself already escapes `</script` in string literals case-insensitively (`"</ScRiPt>"` is emitted as `"<\/ScRiPt>"`), so a hostile chains-file string cannot break out today. It does **not** escape `<!--`. The build's own escape is therefore not what keeps the page safe, and it is weaker than it looks. Safety depends on the bundler version, which nothing in scope pins.

**Repro:** with a bundler that does not escape `</script`, a chains-file endpoint of `"https://x/</SCRIPT><script>alert(origin)</script>"` executes in `index.html` and `404.html`.

---

## Surfaces examined with no finding

These are stated so the rollup can tell "looked, found nothing" apart from "did not look".

- **Which contract a URL reaches.**
  - *Pinned shapes:* `pinnedTarget` never reads the hostname. Single-pin maps every path to the pinned contract (`target.ts:179-180`). Several-chains accepts only own keys of `contracts` (`:196`); keys are validated against `CHAIN` (`:131`), so `__proto__` and similar cannot be keys. Percent-encoding (`/%31/`) decodes to a configured chain and stays within the configuration.
  - *Unpinned path form:* it is reached only through `isLoopback`. `parseTarget` is folded out of pinned bundles through `__GW44_PINNED__` (`config.ts:23-25`, `build.ts:65`). That rests on minification plus the boolean define, which is what ships today. Nothing checks it at runtime: `__GW44_PINS__ as Pins` is trusted unconditionally.
  - *Conclusion:* I found no URL that reaches a contract the build did not configure.
- **Redirects.** All of them are origin-relative and same-origin:
  - path form: `${pathname}/${search}`, where the pathname must begin `/<chain>`, so never `//`;
  - several-chains: `/<configured chain>/${search}`;
  - `//x` redirects to `/<default>/` and drops `x`, which is not an open redirect;
  - `Response.redirect(new URL(r, url))` at `sw.ts:21`, and `location.replace(r + hash)` at `boot.ts:72`.
  - The query is kept. The fragment is kept by the browser, or explicitly at `boot.ts:72`.
- **ABI decoder** (`abi.ts:108-167`).
  - Every read goes through `uint`, which bounds-checks `at + 32 <= length` and rejects words of 2^48 or more. `bytesAt` uses `subarray`, so it copies nothing.
  - Header count is capped at 64 and header text at 16 KiB, summed before decoding. The status is range-checked at `resolve.ts:60`.
  - No loop bound or allocation is chosen by the input beyond those caps. `hexToBytes` allocates a buffer sized from the input, but that input is bounded by `maxBytes`.
- **Header allowlist mechanics.** Header names are emitted only after matching an exact lowercase allowlist entry. Values are restricted to `[\t\x20-\x7e]`, so no CR/LF, and `new Headers` cannot throw. `cache-control` and `nosniff` are fixed, and the contract cannot override them. A non-identity `content-encoding` is refused.
- **Worker `fetch` listener.** Cross-origin requests and methods other than GET/HEAD are passed through. Navigations to unpinned non-targets reach the static host. A malformed URL gets a 400 in plain text.
- **Build `define`.** Every value goes through `JSON.stringify`, so it reaches the bundle as JSON data and cannot be injected as code. Pin values are validated hex and decimal.
