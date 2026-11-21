# Audit — 2026-11-21

Two blind adversarial reviews of the thirteen scoped files, reconciled. This document reconciles the
legs and does not fix anything: every finding below is carried on untouched for triage.

## 1. Provenance

Reproduced verbatim from the runner's provenance file.

```
audit date        2026-11-21
code commit       7f1cf002bc7a7e869e74463f620590ade5f49491  (dirty: no)
scope             src/core/abi.ts
                  src/core/errors.ts
                  src/core/ports.ts
                  src/core/resolve.ts
                  src/core/target.ts
                  src/adapters/rpc/fetch.ts
                  src/adapters/rpc/memory.ts
                  src/adapters/sw/boot.ts
                  src/adapters/sw/config.ts
                  src/adapters/sw/fallback.ts
                  src/adapters/sw/shell.html
                  src/adapters/sw/sw.ts
                  tools/build.ts
blind tree        0d6cc52d90bd327ee150fc23b16693416a36a1d2 (scoped files only; hashes in BLIND.md)
skill             none — web-security prompt, audits/prompts/leg.md
leg 1 requested   codex gpt-5.6-sol · effort high · 1 pass
leg 1 cli         codex-cli 0.158.0
leg 1 observed    model: gpt-5.6-sol · reasoning effort: high
leg 1 wall        344s (exit 0)
leg 1 tokens      50,372
leg 2 requested   claude opus · 1 pass
leg 2 cli         2.1.329 (Claude Code)
leg 2 observed    "model":"claude-opus-5-5"
leg 2 wall        412s (exit 0)
leg 2 tokens      "output_tokens":1034
```

Both leg directories are non-empty, and each has a non-empty `full-report.md` (11,164 and 26,086
bytes). **Read before deduplication: leg 1 (codex, gpt-5.6-sol): 6 findings** (2 High, 1 Medium,
3 Low), plus an unnumbered "reviewed routing and response decisions without a separate finding"
section. **Leg 2 (claude, opus): 19 items** — 14 graded (1 High, 3 Medium, 9 Low, 1 "Low/Info") and
5 Info — plus a "surfaces examined with no finding" section. After deduplication there are **20
distinct findings**: five issues were reported by both legs.

**About line numbers.** Every citation checked against the code at the review commit matches, in
both legs. Unlike 2026-11-20, no leg-2 citation points past the end of a file.

**Relation to 2026-11-20.** Where a finding repeats one from the previous audit, its entry names
the earlier number (`2026-11-20 F#`). Neither leg re-reports 2026-11-20 F2, F3 or F4 (the fallback's
dropped headers, aliased ABI header text, the `hexToBytes` regex); both legs' no-finding sections
state the corresponding code is now bounded or restricted. That is recorded as the legs' reading, not
as this document's verdict on the fixes.

## 2. Findings

Both legs used a Critical / High / Medium / Low scale; leg 2 adds Info. Each defined the steps in
its own words. Leg 1 grades by the mechanism's worst case; leg 2 by which party controls the input
and whose assets it reaches. Where they differ, the entry says which reading is adopted and why.

### 2.1 High

#### F1 — Several chains of one project share one origin; any configured contract controls every other chain's state

- **Where:** `pinnedTarget`, several-chains branch, `src/core/target.ts:174-205` (leg 1 cites `:183`); one registration at scope `/`, `src/adapters/sw/boot.ts:81`; contract-chosen active types, `src/core/resolve.ts:63-76`.
- **Found by:** both. **Severity:** leg 1 High, leg 2 High. **Adopted: High.** The legs agree. Repeats 2026-11-20 F1.
- **What:** chains are told apart by first path segment only, which is not a browser boundary. Any configured contract can serve `text/html` (or SVG) at a path it controls and then, with same-origin rights, read and write every other chain's localStorage, IndexedDB, cookies and sessionStorage, frame or open the other chain's pages and read their DOM, `unregister()` the shared worker, and use wallet (EIP-1193) connections and browser permissions granted to the origin while the visitor was on another chain. Leg 1 adds that the loopback path form has the same property across arbitrary contracts (`target.ts:81-88`), on loopback only. Leg 2 notes the comment at `target.ts:21-29` now states and accepts this.
- **Cost:** the origin is only as safe as the weakest configured contract. Leg 2's example: a hot-key or abandoned testnet contract compromises the mainnet dapp's origin.

### 2.2 Medium

#### F2 — The root document can carry no header, so every root is frameable and has no opener policy

- **Where:** `html()`, `src/core/resolve.ts:50-54`, via `respond()` at `:32-34`.
- **Found by:** leg 2 alone (M-1). Leg 1 saw the property and filed it as no finding ("root responses currently cannot carry contract-selected policy headers"). **Severity:** leg 2 Medium. **Adopted: Medium.** Repeats 2026-11-20 F7.
- **What:** ERC-8244 `html()` returns only a string, so the root response carries exactly `content-type`, `cache-control` and `nosniff`. `X-Frame-Options`, CSP `frame-ancestors` and COOP are allowlisted only for `request()` resources, and `frame-ancestors` is ignored in `<meta>`.
- **Cost:** any site can frame and overlay every contract's main page (clickjacking), and a `window.open`er keeps a navigable handle (tab-nabbing). The contract cannot opt out.

#### F3 — Unpinned host form: all contracts share a registrable domain, so one contract can cookie-bomb all others

- **Where:** host form, `src/core/target.ts:62-79`.
- **Found by:** leg 2 alone (M-2). **Severity:** leg 2 Medium. **Adopted: Medium.** Repeats 2026-11-20 F6.
- **What:** `<address>.<chain>.<base>` shares `<base>` as registrable domain unless `<base>` is on the Public Suffix List. A contract's document can set many large `Domain=<base>` cookies.
- **Cost (leg 2, by inference):** requests that reach the static host — every first visit to any contract, every worker update check (`updateViaCache: "none"`, `boot.ts:81`), every forced reload — exceed its header limit (400/431), so other contracts cannot boot in that browser until cookies are cleared. `SameSite` gives no separation between contracts.

### 2.3 Low

#### F4 — The boot loop guard trusts a value any same-origin document can write

- **Where:** `attempt()`, `src/adapters/sw/boot.ts:21-31` (parse at `:24`), checked at `:76`.
- **Found by:** both (leg 1 #5, leg 2 M-3). **Severity:** leg 1 Low; leg 2 Medium in the several-chains shape, Low otherwise. **Adopted: Low.** Repeats 2026-11-20 F9.
- **Why Low:** the only case leg 2 grades Medium is one contract doing this to another chain in a several-chains build, and leg 2 itself calls that "a narrower case of H-1": a contract with F1's same-origin script control can already unregister the worker and rewrite the other chain's storage, so this adds no capability beyond F1. Standalone, the effect is tab-local, which is Low on both legs' scales.
- **What:** `split(":").map(Number)` is not validated. `NaN:<now>` (either leg) makes `n` `NaN`, so `>= MAX_ATTEMPTS` is never true and the reload bound is disabled. A future timestamp with a large count (leg 2, `99:9999999999999`) passes the window test forever, so every boot in the tab goes to `renderInline` and never registers a worker; leg 1 names the milder one-shot form (a fresh count of 2).
- **Cost:** unbounded reloads in the condition the guard exists for, or a tab stuck in the no-worker fallback.

#### F5 — No aggregate bound on concurrent RPC calls; the per-response cap does not bound the worker

- **Where:** `src/adapters/sw/sw.ts:33-45` (every matching fetch starts a call); `readCapped`, `JSON.parse`, `hexToBytes` in `src/adapters/rpc/fetch.ts:20-36, 54, 71, 77`.
- **Found by:** both (leg 1 #3, leg 2 L-2). **Severity:** leg 1 Medium, leg 2 Low. **Adopted: Low.**
- **Why Low:** the effect both legs describe is one visitor's worker running out of memory. Leg 1's own scale puts "limited or session-local availability impact" at Low and reserves Medium for "practical denial of service". The parties who can send the bytes are the believed endpoint and the contract itself (leg 2), and either can already deny that visitor the document outright. Neither leg shows the effect crossing to another visitor.
- **What:** `maxBytes` (16 MiB) bounds one response. Leg 2 estimates 4–6× that per call in copies (string, parsed JSON, bytes, decoded body). Nothing limits calls in flight; leg 1 notes HTTP/2 lets one endpoint progress many responses at once.
- **Cost:** a page with ~50–64 subresources against an endpoint returning near-cap bodies can push the worker to OOM, failing every in-flight response on the origin.

#### F6 — The `</script` escape on the inlined boot script is case-sensitive and ignores `<!--`

- **Where:** `tools/build.ts:79`; values from `define` at `:61-65`.
- **Found by:** both (leg 1 #1, leg 2 I-5). **Severity:** leg 1 High, leg 2 Info. **Adopted: Low.** Repeats 2026-11-20 F8 (adopted Low there).
- **Why Low, and not either leg's grade:** this is not an average; the two halves of the finding sit at different grades and Low is where the surviving half sits on both scales.
  - *Casing half — leg 2's Info is right.* Leg 2 ran esbuild 0.28.2 on a synthetic input and observed it already escapes `</script` in string literals case-insensitively (`"</ScRiPt>"` → `"<\/ScRiPt>"`). Leg 1 could not run esbuild, and its one-line reproduction is therefore contradicted by the only measurement either leg made. Leg 2 wrote that nothing in scope pins the version; outside scope, this document observes that `package.json` and `package-lock.json` pin esbuild at exactly `0.28.2`, the version measured.
  - *`<!--` half — unneutralised.* Leg 2 observed esbuild does **not** escape `<!--`, which with a later `<script` moves the tokenizer into the double-escaped state. Leg 2's own scale puts "a build-input hazard that needs a mistaken operator" at Low: the input is the deployer's chains file, and whoever writes it already chooses the endpoint believed for every document.
  - Leg 1's High rests on the injected markup running before contract selection, on every origin the build serves. That is true of timing but gives the chains-file author little they lack.
- **What:** `replaceAll("</script", …)` matches lower case only; the HTML tokenizer ends a script on any casing. Page safety rests on the bundler's own escaping, not on this line.

#### F7 — A non-2xx RPC response body is never cancelled

- **Where:** `src/adapters/rpc/fetch.ts:69`.
- **Found by:** both (leg 1 #4, leg 2 L-1). **Severity:** both Low. **Adopted: Low.** Repeats 2026-11-20 F10.
- **What:** `if (!res.ok) throw …` exits without `res.body?.cancel()`, and failover starts the next endpoint. The stream (and on HTTP/1.1 its pooled connection) is held until `AbortSignal.timeout` (10 s) or GC; the 16 MiB cap is never applied.
- **Cost:** a hostile endpoint answering `429`/`500` and trickling an endless body overlaps streams per call; leg 2 adds that under the HTTP/1.1 six-connection limit later calls queue behind held ones.

#### F8 — A call can take `n × timeoutMs`, and the slow first endpoint is retried on every call

- **Where:** `src/adapters/rpc/fetch.ts:47-54` (doc comment and timeout), loop at `:85-92`.
- **Found by:** leg 2 alone (L-5). **Severity:** leg 2 Low. **Adopted: Low**, the only grade given. Repeats 2026-11-20 F5 and F11 together (F5 was adopted Medium there on leg 1's grade; this run leg 1 does not report it — see § 4).
- **What:** the timeout is per endpoint and nothing spans the list; every call starts at endpoint 0. Leg 2 records it as documented at `:47-51` and as "the hang surface". `renderInline` (`boot.ts:49`) has no deadline either.
- **Cost:** a blackholing first endpoint adds 10 s to every resource for every visitor.

#### F9 — Any JSON-RPC error whose message contains "revert" stops failover and becomes a 404

- **Where:** `isRevert`, `src/adapters/rpc/fetch.ts:39-41`; thrown `:73`, rethrown `:89`; 404 at `src/core/resolve.ts:90-91`.
- **Found by:** leg 2 alone (L-4). **Severity:** leg 2 Low. **Adopted: Low.** Repeats 2026-11-20 F12.
- **What:** `/revert/i` anywhere in `error.message`, or `code === 3`, is treated as the contract's final answer.
- **Cost:** a broken (not merely lying) endpoint whose error text says e.g. "reverted to archive node" makes every resource 404, and healthy later endpoints are never asked.

#### F10 — The RPC client follows endpoint redirects

- **Where:** `callOne`, `src/adapters/rpc/fetch.ts:58-66` (no `redirect` option, so `"follow"`).
- **Found by:** leg 2 alone (L-3). **Severity:** leg 2 Low. **Adopted: Low.** New this run.
- **What:** a configured endpoint, or whoever controls its DNS/CDN/path, can answer `307`/`308` to any URL; the POST is re-sent and that host's reply decoded as the chain's answer. Contradicts `config.ts:4-5`, which says the worker's bytes are the whole of what decides which endpoint is believed.

#### F11 — Contract-driven RPC amplification against the build's endpoint quota

- **Where:** `src/adapters/sw/sw.ts:33-46`, `src/core/resolve.ts:56-58`.
- **Found by:** leg 2 alone (L-6). **Severity:** leg 2 Low. **Adopted: Low.** New this run.
- **What:** every same-origin GET or HEAD a document triggers is one `eth_call` per endpoint tried; nothing caches, coalesces or rate-limits, and HEAD costs a full call.
- **Cost:** in the unpinned shape, a stranger's contract (`for … fetch('/r'+i,{method:'HEAD'})`) spends the operator's keyed endpoint quota until rate limiting gives every contract's visitors 502.

#### F12 — URL-controlled request calldata has no size or item-count limit

- **Where:** `encodeRequest`, `src/core/abi.ts:98`; copies in `encodeString`, `encodeArray`, `concat`, `bytesToHex`, and the JSON body.
- **Found by:** leg 1 alone (#6). **Severity:** leg 1 Low. **Adopted: Low.** New this run (2026-11-20 F14 concerned the privacy of the same query data, not its size).
- **What:** every path segment and query entry is copied into ABI structures, then a hex string about twice the size, then the JSON-RPC body, with no gateway-side bound. Leg 1 notes an installed worker processes programmatically built URLs before any host request-line limit applies.
- **Cost:** client CPU/memory and an oversized POST to a public endpoint; bounded by browser URL limits.

#### F13 — The chains file is compiled in without validation

- **Where:** `tools/build.ts:25, 35, 42-47, 62`; consumers `fetch.ts:81, 83-85`.
- **Found by:** leg 2 alone (L-7). **Severity:** leg 2 Low. **Adopted: Low.** Repeats 2026-11-20 F15.
- **What:** a string instead of an array passes `supports()` and is iterated per character (every call `upstream`); `null` passes the pinned build's `!== undefined` check; `http:` and `data:` endpoints are accepted; any API key in an endpoint URL is published in two deployed files. **Correction of 2026-11-20 F15, reported by leg 2 and not adjudicated here:** leg 2 ran esbuild 0.28.2 and observed a `"__proto__"` key emitted as a computed own property, so it does **not** set the object's prototype, contrary to F15's statement. If triage confirms, this supersedes that sentence of F15.

#### F14 — An empty `GW44_PIN` or `GW44_CONFIG` silently produces an unpinned build

- **Where:** `tools/build.ts:29-36` (`?? ""` then `!== ""`).
- **Found by:** leg 2 alone (L-8). **Severity:** leg 2 Low. **Adopted: Low.** New this run.
- **What:** a set-but-empty variable, e.g. from CI templating a missing value, is treated as unset and ships the unpinned gateway with every chain in the chains file; only the log line `built dist/:` shows it.
- **Cost:** on a single non-wildcard hostname the unpinned parser returns null for every URL (fails closed); on a wildcard domain any contract becomes reachable on the project's domain.

#### F15 — The build writes the deployable before checking the output directory or the size gate

- **Where:** `tools/build.ts:81-87` (writes), `:102-115` (checks).
- **Found by:** leg 2 alone (L-9). **Severity:** leg 2 Low. **Adopted: Low.** New this run.
- **What:** with `GW44_OUT` naming an existing site directory, `index.html`/`404.html` are overwritten before the unexpected-files error; a deploy step that ignores the exit code ships an oversized worker or one mixed with stale files.

### 2.4 Info

#### F16 — The worker ignores the request beyond its URL: Range, conditional and HEAD semantics

- **Where:** `src/adapters/sw/sw.ts:16-23, 37, 45`.
- **Found by:** leg 2 alone (L-10). **Severity:** leg 2 "Low/Info". **Adopted: Info.** Leg 2 gave no single grade; Info, because it shows no security consequence: it says serving worker scripts "gives no new capability", and the one hazard it names, the `fetch(url)` branch at `:19` that would drop method, headers, mode and credentials, is unreachable behind the listener. Overlaps 2026-11-20 Info I-7.
- **What:** `Range` gets a full 200; `HEAD` runs the full call and builds a body.

#### F17 — Comment and code disagree: 3xx statuses without `Location` are accepted

- **Where:** `src/core/resolve.ts:59-62`. **Found by:** leg 2 alone (I-1). **Severity:** Info. Repeats 2026-11-20 Info I-3.
- **What:** the comment says 3xx-without-Location is not a document; the check rejects only `< 200` and `> 599`, and `location` is not allowlisted, so every contract 3xx is served with no `Location`. No destination can be chosen.

#### F18 — `SW_PATH` is not reserved under the worker, contrary to `config.ts`

- **Where:** `src/adapters/sw/config.ts:26-27`; listener `sw.ts:38-45`; `target.ts:179-180`.
- **Found by:** leg 2 as a finding (I-2). Leg 1 saw it and filed it as no finding ("ordinary pinned-origin requests of that name can be contract resources"). **Severity:** leg 2 Info. **Adopted: Info.** Repeats 2026-11-20 F13, which was adopted Low; here neither leg grades it above Info and this document follows that.
- **What:** in a controlled page, `fetch('/gw44-sw.js')` returns the contract's bytes, not the installed worker. Both legs agree registration and update fetches bypass the worker, so the worker cannot be replaced this way.

#### F19 — The no-worker fallback writes the root into the live boot page, and is a regular path in worker-capable browsers

- **Where:** `src/adapters/sw/boot.ts:43-57, 76, 93-94`; `headersAreHonourable`, `src/adapters/sw/fallback.ts:46-48`.
- **Found by:** leg 2 alone (I-3). Leg 1 reviewed the fallback and filed it as no finding within a single-contract origin, and as part of F1 where several contracts share one. **Severity:** Info.
- **What:** `document.open(); document.write(text)` runs the contract's root in the boot bundle's realm, under the static host's headers (no `nosniff`, no `no-store`). Reached with no `serviceWorker` API, after two boots in 10 s, or when registration exceeds 4 s. Leg 2 found no injection beyond the intended one, and notes `headersAreHonourable` is inert today, as its comment says. Cosmetic: an unconfigured first segment in the several-chains shape is reported as "malformed URL" (`boot.ts:73-74`).

#### F20 — Allowlisted headers that do little, and a contract-chosen `content-encoding` echoed into error text

- **Where:** `src/core/resolve.ts:10-22`, error body at `:69`. **Found by:** leg 2 alone (I-4). **Severity:** Info.
- **What:** `access-control-allow-origin` and `cross-origin-resource-policy` are inert in this adapter; `content-disposition` downloads are attributed to the shared origin in the several-chains shape; `referrer-policy: unsafe-url` leaks full URLs. The 502 body repeats the contract's refused `content-encoding` value: plain text with `nosniff`, so not markup, but usable for phishing text presented as the gateway's.

## 3. Agreement and disagreement

**Overlap.** Five of the 20 distinct findings were reported by both legs: F1, F4, F5, F6 and F7.
That is five of leg 1's six findings and five of leg 2's nineteen items. Leg 1's sixth, F12, is
leg 1's alone. Leg 2 reported fourteen issues leg 1 did not report; leg 1 described three of those
(F2, F18, F19) in its no-finding section and declined to grade them, which is a difference of
judgement, not a miss.

**Severity on the shared findings.** The legs agreed on two of the five (F1 High, F7 Low) and differed
on three:

| Finding | Leg 1 | Leg 2 | Adopted |
|---|---|---|---|
| F4 boot loop guard | Low | Medium (several-chains) / Low | Low |
| F5 aggregate RPC memory | Medium | Low | Low |
| F6 `</script` escape | High | Info | Low |

The pattern is the same as 2026-11-20. In two of the three, leg 1 grades higher by mechanism, and
leg 2 grades by who controls the input. F4 reverses that, with leg 2 the higher. F6 is the one
disagreement settled by evidence rather than by scale: leg 2 measured the bundler, and leg 1's
reproduction does not survive that measurement for the casing half.

**Single-leg findings: genuine miss or false positive.** From the reports alone:

- **F9, F10** look like genuine misses by leg 1. Both follow directly from the code at the cited lines (`/revert/i` on the message; no `redirect` option on `fetch`).
- **F8** is a genuine miss by leg 1 this run. Leg 1 found it at Medium on 2026-11-20 (F5). Its F7 entry this run mentions "roughly ten seconds per abandoned response" and stops there.
- **F3** is a genuine miss by leg 1. Leg 1 discusses the host form only as "intentionally permits an arbitrary address" and does not consider the shared registrable domain.
- **F11, F13, F14, F15** are plausible and uncontradicted. They are build-tool and quota issues. Leg 1's report shows no sign it examined those aspects of `tools/build.ts` or endpoint quota.
- **F12** is plausible, and looks like a genuine miss by leg 2. Leg 2's ABI section covers the decoder's bounds only ("No loop bound or allocation is chosen by the input beyond those caps") and says nothing about the encoder.
- **F2, F18, F19** are not misses (see above). **F16, F17, F20** are leg 2's Info items. Leg 1 is silent on them.

**One contradiction between legs:** F6, as above. No other single-leg finding is contradicted by the
other leg's report.

**Coverage the legs agreed on, with no finding.** Both traced URL-to-contract selection in both pinned
shapes and found no route to an unconfigured contract, including percent-encoded prefixes. Both found
all three redirects origin-relative, with the query kept and the fragment kept. Both found the ABI
decoder bounds-checked, with header count and header text capped. Both found header names
allowlisted and values free of CR/LF. Both found the listener passes through cross-origin and
non-read requests. Both regard contract-chosen active content as inherent to a contract owning its
origin, and as F1 where the origin is shared.

## 4. Grading against the known answer

### 1. One page load can wait `n × timeoutMs` when endpoints hang (#18) — `src/adapters/rpc/fetch.ts`, `createFetchRpc`

- **Leg 1: missed.** Nothing in its report says the per-endpoint timeout accumulates across the list. Its only timeout statement is in #4 (F7): "the default exposure is bounded to roughly ten seconds per abandoned response". That is one endpoint's timeout, which is the "there is a timeout" case the item says does not count. **This is a regression from 2026-11-20**, where the same leg found it at Medium.
- **Leg 2: found, Low.** L-5 is titled "Each call can take n × 10 s", and it says "there is no deadline across the whole call". The location is `fetch.ts:47-54, 85-92` and it cites the doc comment. On 2026-11-20 it only restated the bound; this run it reports it as a finding.

### 2. The browser's own `/favicon.ico` is a chain call where every path is the contract's (#36) — `src/core/target.ts`, `pinnedTarget`, one-contract branch

- **Leg 1: missed.** It states that "the single-contract pinned shape ignores hostname and treats every path-like chain/address string as that configured contract's resource". It never says that requests the browser makes unprompted therefore reach the contract, and names no cost.
- **Leg 2: missed.** It came closest on two counts, and neither meets the criterion:
  - L-6 (F11) names the cost of an `eth_call` per request. But it concerns requests a *document* triggers, in the unpinned shape.
  - I-2 (F18) traces `/gw44-sw.js` through `pinnedTarget`'s one-contract branch. But that is a path page code fetches, not one the browser requests unprompted.
  
  Neither mentions browser-initiated requests in the one-contract build, or the asymmetry with the several-chains build.

**Neither leg found this item, for the second audit running.**

### 3. How the pin is enforced, and what a source reader will get wrong (#37) — `src/adapters/sw/config.ts` `targetOf` / `__GW44_PINNED__`; `tools/build.ts` `define`

- **Leg 1: missed.** Its report never mentions `__GW44_PINNED__` or what a bundle contains. It describes which parser each shape *uses* at run time ("The unpinned build uses only `parseTarget`"), and that is not a statement about which parser a build ships. It made no wrong claim either: it never says a pinned build carries the unpinned parser. **This is a regression from 2026-11-20**, where the same leg found it, and found it right.
- **Leg 2: found, and right.** In its no-finding section it says: "`parseTarget` is folded out of pinned bundles through `__GW44_PINNED__` (`config.ts:23-25`, `build.ts:65`). That rests on minification plus the boolean define, which is what ships today. Nothing checks it at runtime." The citations match the code. Its esbuild experiment answered two other questions (F6, F13), so the elimination is read from the source and not measured. It adds a caveat: `__GW44_PINS__ as Pins` is trusted unconditionally. No severity, because it is not a finding. L-8 (F14) also says correctly that an unpinned build contains the URL parser.

Neither leg claimed a pinned build ships the unpinned parser, or that the pin holds at run time only.
Neither recommended removing a parser or splitting the module. **This item has no false positive to
record for the second run**, so there is still no evidence for the limit of method it was set up to
detect.

**Summary:**

| Known answer | Leg 1 (codex) | Leg 2 (claude) |
|---|---|---|
| 1. `n × timeoutMs` (#18) | **missed** (found, Medium, on 2026-11-20) | found, Low |
| 2. favicon in one-contract build (#36) | **missed** | **missed** |
| 3. build-time parser selection (#37) | **missed** (found, right, on 2026-11-20) | found, right |

## 5. Legs

**Leg 1 — codex, gpt-5.6-sol** ([`gpt-5.6-sol/`](gpt-5.6-sol/full-report.md)). It reviewed the
thirteen scoped files from source, with no network. Verbatim: "Dynamic bundle-level reproduction was
not available: the scoped tree contains no installed `esbuild`, and the review was required to use no
network. All thirteen scoped files were read in full; findings below are from static analysis and
small runtime checks using only the installed JavaScript runtime. No reviewed file was changed." It
does not say which runtime checks it ran, or which findings they support. It produced **6 findings**
(2 High, 1 Medium, 3 Low) and a section of reviewed surfaces with no finding. Every line it cited
matches the code. It found none of the three known answers, against two of three on 2026-11-20.

**Leg 2 — claude, opus** ([`opus/`](opus/full-report.md)). It read all thirteen files and reports
`git status` clean before and after. Verbatim: "**I could not run the gateway.** I had no browser,
so nothing here was watched in a live service worker or page." It marks browser-behaviour claims as
inference.

It ran one experiment. Verbatim: "I used an `esbuild` binary (0.28.2) that already sat in a directory
outside the scoped tree, on a synthetic three-line input in a scratch directory that I deleted
afterwards. I read nothing else from that directory." **The report does not name that directory.**
Whether it sat inside the repository, which the blind method keeps out of a leg's reach, cannot be
told from the report, and the runner should check. The report says the experiment answers questions
"under B-2 and B-3 below", but no item carries those labels. The results appear under L-7 (F13) and
I-5 (F6).

It produced **19 items**: 1 High, 3 Medium, 9 Low, 1 "Low/Info" and 5 Info. The provenance records
this leg's tokens as `"output_tokens":1034`. That is hard to square with a 26,086-byte report, the
same discrepancy noted on 2026-11-20. It is reproduced as recorded and not corrected.
