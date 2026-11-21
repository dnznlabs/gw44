# Security

> **Purpose:** What gw44 trusts, what it defends, and what it does not, and what a review of the code that ships found.

## Reporting a vulnerability

Use GitHub private vulnerability reporting on this repository. Do not open a public issue. No bounty.

## Review status

**Date:** 2026-11-20
**Method:** a **two-model agent review** — two language models in two harnesses read the scoped files independently and blind, in a tree holding nothing else, and a third pass reconciled them; the method, its limits and what "reproducible" does and does not mean are in [`audits/README.md`](audits/README.md). **This is not an independent audit** and should not be cited as one: it was commissioned, prompted and run by the people who wrote the code, and both legs are language models with correlated and unmeasured blind spots.
**Scope commit:** `be92f1f7fcb34121bd7c05203411850fbb64dd5f` — the code as it ships after M01's builds, with the review's own scaffolding added and no file in scope changed since.
**Scope:** twelve files — everything a visitor's browser runs (`src/core/`, `src/adapters/rpc/`, `src/adapters/sw/`, including `shell.html`) plus `tools/build.ts`, the program that compiles the endpoints and contracts into the worker and substitutes the boot script into the page. Excluded, each with its reason in [`audits/SCOPE`](audits/SCOPE): `test/`, which is not shipped; `tools/get.ts`, `tools/serve.ts`, `tools/verify.sh` and `tools/verify-browser.ts`, which never reach a visitor; `chains.json`, which is data a deployer replaces. The per-file hashes at the scope commit are in [`audits/2026-11-20/BLIND.md`](audits/2026-11-20/BLIND.md).
**Result:** 16 findings accepted — **2 High, 5 Medium, 9 Low** — and 9 informational items carried without grading. None was rejected. Six of the sixteen were reported by both legs. The rollup is [`audits/2026-11-20/AUDIT.md`](audits/2026-11-20/AUDIT.md).
**External audit:** none.

**Second run, 2026-11-21.** The same method over the same scope plus `src/adapters/sw/fallback.ts`, after the fixes below, because a fix under review scope is followed by one more run over the files it touched. Scope commit `7f1cf00`. **20 findings accepted, 1 High, 2 Medium, 12 Low, 5 informational**, five of them reported by both legs; the rollup is [`audits/2026-11-21/AUDIT.md`](audits/2026-11-21/AUDIT.md). **Neither leg re-reported the three findings fixed below**, and both said in their own no-finding sections that the code is now bounded or restricted. The High is the shared origin of F1, which is roadmap decision 9 and unchanged; the two Medium are the root's missing headers ([#57](https://github.com/dnznlabs/gw44/issues/57)) and the host form's shared registrable domain, both already recorded here.

## Trust model

A visitor trusts three things, and the gateway adds no fourth:

1. **The static host**, for two files. Whoever can change `gw44-sw.js` controls every origin under the gateway. It is 7 KB with no dependencies so that it can be read, and built reproducibly so that it can be checked.
2. **The RPC endpoint** named in `chains.json`. Its answer is taken as the chain's. A lying endpoint can serve any document at a contract's origin. Not defended today; quorum and proof verification are on the roadmap.
3. **The contract**, for its own origin and nothing else — **except where an origin holds more than one contract.** A build configured with several chains of one project serves them all from one origin, so each of those contracts is trusted for every one of them: see F1 below. On loopback, the path form does the same across arbitrary contracts, by design.

There is no gateway server and no server-side cache, so there is no operator who can serve a stale or altered document without changing one of those two files.

## Findings — disposition

Every finding the 2026-11-20 review accepted, with its state. **Rows are never removed**; a finding that is fixed becomes a row that says so. `AUDIT.md` carries the mechanism, the measurement and which leg found what; this table is the state.

The three states are: **limit** — a property that is stated and accepted, with where it is stated; **carried** — an open issue, linked, which the milestone's review decides on; **fix in m01-t07** — referred to its own task and deliberately not fixed by the review that found it, so that a fix under review scope is followed by one more review run over the files it touched.

| ID | Severity | Finding | State |
|:---|:---------|:--------|:------|
| F1 | High | Several chains of one project share one origin: storage, worker registration and a granted wallet connection are shared across them, and `src/core/target.ts:21-23` claims the opposite | **limit** — roadmap decision 9, and § Trust model above; the property stands, and the comment is **corrected** in `7f1cf00` (`src/core/target.ts`), with no behaviour change. The 2026-11-21 run reports the shared origin again as its only High, which is decision 9 and not a defect |
| F2 | High | The no-worker fallback keeps only `content-type`, so a contract's CSP, framing and sniffing headers are dropped, and `renderInline` is not restricted to the root as its comment claims | **fixed** in `7f1cf00`. The fallback now renders only at the top level, only at the contract's root, and only when the response carries no header it cannot honour; otherwise it shows one sentence. Covered by `test/fallback.test.ts` (the root and header conditions, each header on its own) and by `test/e2e/gateway.e2e.ts`'s "without service workers a non-root path is declined, not rendered" in three engines. **The framing route the legs disagreed over was measured on 2026-11-21 and does not work**: in all three engines the shell loads inside a cross-origin frame and the fallback never renders there, with the same context at the top level rendering as a control — so leg 1's Medium was the better grade, and the next run should carry that as a superseding entry |
| F3 | Medium | Aliased ABI header offsets amplify a capped response about 128× into decoded strings; measured 509 MB of RSS from 4.2 MB of return data | **fixed** in `a830140`. `MAX_HEADER_BYTES` is 16,384 and the key and value byte lengths are summed and checked **before** either is decoded, because decoding is where the copy is paid for. The count cap stays. Covered by `test/abi.test.ts`'s "headers that alias one string are refused before any of them is decoded", which fails at that commit's parent |
| F4 | Medium | `hexToBytes`'s regex overflows the backtrack stack above ~4 MiB, so a 4–8 MiB return value is downloaded from every endpoint in turn and the visitor gets a 502 that blames them | **fixed** in `a830140`. Validated in the conversion loop with no regular expression, so no `RangeError` can leave it. Measured here: 3 MiB decoded in 75 ms before and **14 ms** after, and 4, 5 and 8 MiB each threw before and now decode in 19, 22 and 39 ms. Covered by `test/abi.test.ts`'s "eight mebibytes of hex decode" and "one bad character at the end of a large string is bad-response, never a RangeError", both failing before |
| F5 | Medium | Nothing bounds a call across the endpoint list: latency is the sum of the per-endpoint timeouts | **limit** — stated at `src/adapters/rpc/fetch.ts:47-51`, pinned by `test/rpc-fetch.test.ts`'s "the timeout is per endpoint", and open as [#18](https://github.com/dnznlabs/gw44/issues/18) for M04 |
| F6 | Medium | Host-form contracts share a registrable domain, so one contract's document can set cookies every other receives, including enough to break their requests | **limit** — § What it does not defend, "Cookies across contracts"; closing it needs the base domain on the Public Suffix List |
| F7 | Medium | The root document can carry no headers at all, so it is always frameable and can set no CSP | **carried** — [#57](https://github.com/dnznlabs/gw44/issues/57) |
| F8 | Low | The `</script` guard on the inlined boot script is case-sensitive | **carried** — [#58](https://github.com/dnznlabs/gw44/issues/58) |
| F9 | Low | The boot loop counter is unvalidated and writable by any document on the origin | **carried** — [#59](https://github.com/dnznlabs/gw44/issues/59) |
| F10 | Low | A non-2xx RPC response body is never cancelled | **carried** — [#60](https://github.com/dnznlabs/gw44/issues/60) |
| F11 | Low | Failover keeps no memory between calls, so a dead first endpoint is paid for on every request | **limit** — the same mechanism as F5 and stated with it; ordered failover with no health tracking is § What it does not defend, "Availability of the endpoints" |
| F12 | Low | Any JSON-RPC error whose message contains "revert" stops failover and becomes a 404 | **carried** — [#61](https://github.com/dnznlabs/gw44/issues/61) |
| F13 | Low | The worker does not reserve its own path, contrary to `src/adapters/sw/config.ts:26` | **carried** — [#62](https://github.com/dnznlabs/gw44/issues/62) |
| F14 | Low | Every query string is sent to the public RPC endpoint in `eth_call` calldata | **limit** — how ERC-5219 carries parameters; now stated in § What it does not defend |
| F15 | Low | The chains file is never validated, so a malformed one reaches the bundle | **carried** — [#63](https://github.com/dnznlabs/gw44/issues/63) |
| F16 | Low | A trailing-dot hostname gives one contract a second origin, with separate storage and permissions | **carried** — [#64](https://github.com/dnznlabs/gw44/issues/64) |

The nine informational items are in `AUDIT.md` § 2.4, ungraded and carried so the next review can cite them. One is worth repeating here because it is the question this review most needed answered: **no route was found by which a URL reaches a contract the build did not configure**, in any of the three build shapes.

## What the review did not cover

- **The static host.** Whoever can change the three files it serves controls every origin under the gateway. Nothing in the review looks at how a host is configured, who can deploy to it, or whether it serves the bytes the build produced.
- **Whether an endpoint tells the truth.** One endpoint's answer is taken as the chain's; there is no quorum and no proof verification. A lying endpoint serving a wrong document is **known and inherent**, and the review was told so explicitly, so no leg reports it.
- **The contracts served.** They are code their owners chose, and a gateway serves what they return.
- **The browser.** Origin isolation, storage partitioning, service-worker semantics and the Public Suffix List are all assumed to work as documented.
- **The build's own dependencies.** `esbuild` and Node are trusted to compile honestly. There is no dependency scanning, no static analysis and no mutation testing — all three are out of this review's scope.
- **Everything `audits/SCOPE` excludes**, each with its reason there: the tests, the instruments that never reach a visitor, and `chains.json`.
- **The artifact.** The legs read source. Nobody disassembled `gw44-sw.js`, so where the build removes code — which it does, per build — the review reasoned about it from `tools/build.ts` and the `define` block rather than from the bytes.
- **Consistency between runs.** The 2026-11-21 run graded the same three known answers as the 2026-11-20 one, and the codex leg **regressed on two of them**: it found the accumulating timeout (#18) at Medium and the build-time parser selection (#37) correctly on the first run, and missed both on the second, with the same model, the same effort and the same prompt. The claude leg found one of those two on the first run and both on the second. That is what `audits/README.md` means by the output not being deterministic, measured rather than asserted: a finding absent from one run is not evidence the code is sound, and two runs are a floor on this method's variance rather than a ceiling.
- **Behaviour that only shows at run time, on the evidence of this run.** Of the three answers known by hand before the review, **both legs missed the one that is purely about what a browser does unprompted**: that where every path on an origin is the contract's resource, the browser's own `/favicon.ico` request becomes a chain call on every page load ([#36](https://github.com/dnznlabs/gw44/issues/36)). Both legs traced which contract each URL reaches, correctly, and neither asked what requests a browser makes without being told to. Both found the other two items. So this method's demonstrated reach is the code's logic, and a reader should not take it as evidence about the gateway's behaviour in a running browser; the browser suite in three engines is what covers that, and it found #36 in the first place.

## The reviewed commit

The review read source, and what a visitor runs is the build's output. A reader checks that the two correspond:

```
reviewed commit   be92f1f7fcb34121bd7c05203411850fbb64dd5f
build             devbox run -- make build
```

At that commit the unpinned build writes three files, and `make build` prints their hashes as it writes them:

```
5e56b9250ae65fbb6d5299f8004c2546cf5949dbb2cf0ab199eeed8cfaa33c1c     8362  404.html
55d0a577d5578aa295fa3ca869809c8f15440dd87ee89ee0d5da3472e3358cfe     7417  gw44-sw.js
5e56b9250ae65fbb6d5299f8004c2546cf5949dbb2cf0ab199eeed8cfaa33c1c     8362  index.html
```

A pinned or configured build has its own three hashes, which depend on the contracts and endpoints compiled in; CI builds each shape twice from one commit and compares them, so the figures above are reproducible rather than merely recorded. The per-file hashes of the reviewed **source** are in [`audits/2026-11-20/BLIND.md`](audits/2026-11-20/BLIND.md), which also records the hashes of the tree the legs actually read.

## What the gateway defends

- **One contract from another, on a public host.** The public URL form gives each contract its own origin, and the path form, which shares one, is refused off loopback (`test/target.test.ts`). **A build configured with several chains of one project is the exception and shares an origin deliberately** — see § Trust model and F1 in the disposition table.
- **The pin, at build time rather than only at run time.** `targetOf` chooses between the unpinned URL parser and the configured one on `__GW44_PINNED__`, a boolean the build substitutes, so the bundler folds the branch away and each deployable carries only the parser it uses: `grep -c localhost` on `gw44-sw.js` is 1 for an unpinned build and 0 for a one-contract or several-chain build, and `pinnedTarget`'s own marker is 0 in the unpinned worker and 1 in both others. The source contains both parsers, which is why reading `src/` alone cannot show this; both legs of the 2026-11-20 review got it right from `tools/build.ts`. The guarantee is the build's, so it holds for a deployable built by `make build` from this source and says nothing about one assembled another way.
- **The RPC endpoint from the URL.** Endpoints are compiled in. Nothing in a URL can choose one, so a link cannot point a contract's origin at an attacker's node.
- **The decoder from the contract.** Every offset and length in return data is bounds-checked, and mutated inputs produce only typed errors — 20,000 per local run, **1,000,000 in CI** via `GW44_FUZZ_RUNS` (`test/abi.test.ts`).
- **Memory from a large response.** One JSON-RPC body is capped at `maxBytes`, 16 MiB by default, and the cap is enforced while reading: the stream is cancelled the moment it is exceeded, not drained first (`test/rpc-fetch.test.ts`).
- **A hung endpoint from stalling the gateway.** Each endpoint gets `timeoutMs`, 10 s by default, and it covers the body as well as the connect, so a response that stops after its headers still fails (`test/rpc-fetch.test.ts`). The bound is per endpoint: `n` endpoints can cost `n × timeoutMs`, which `createFetchRpc`'s doc comment states and a test pins.
- **A failing endpoint from being believed.** A non-2xx status fails that endpoint whatever its body contains, so a rate-limit page that happens to parse as JSON-RPC cannot be served as an answer; the next endpoint is tried. A revert is the contract's answer, not a failure, and stops the walk (`test/rpc-fetch.test.ts`).
- **The response from the contract's headers.** `request()` headers pass an allowlist; `Set-Cookie`, `Clear-Site-Data`, caching headers and values with control bytes are dropped (`test/resolve.test.ts`). Every response is `no-store` and `nosniff`.
- **Error pages from injection.** Error bodies are `text/plain` and built from fixed strings.

## What it does not defend

- **Cookies across contracts.** Origins isolate storage and scripts, not cookies: a document can set a cookie for the base domain that sibling origins receive. Closing this needs the base domain on the Public Suffix List, which is a roadmap item and a one-way door.
- **ERC-8244's rendering rules.** The ERC asks a client to render the document in a sandboxed frame with a default-deny policy and to mediate the wallet. A gateway serves the document as a top-level page, like any website; the wallet is the visitor's own. The origin per contract is the isolation, and it is weaker than the ERC's.
- **A contract's own document.** It is code its owner chose, running in its own origin. If the owner can change it, the gateway will serve the change.
- **Query parameters reaching the endpoint.** Every `?key=value` on a sub-path travels in plaintext `eth_call` calldata to the public RPC endpoint, which can log it beside the request's `Origin`. That is how ERC-5219 carries parameters, so it is inherent and not a defect, but an application must not put a secret — an invite token, an OAuth `code` — in a query string on a gateway origin (F14).
- **A document whose headers the fallback cannot honour, where there is no service worker.** The no-worker path writes a contract's bytes into a page whose real headers are the static host's, so a `content-security-policy`, `x-frame-options`, COOP, COEP, CORP, `permissions-policy` or `content-disposition` the contract set would silently not apply. Rather than honour part of what a contract asked for, **the fallback declines and shows one sentence**: a contract that sets any of those headers has no fallback in a browser without service workers, and gets one only where a worker can run. The fallback also renders **only** at the contract's root and **never inside a frame** — measured 2026-11-21, no engine reaches it in a cross-origin frame anyway. The list of headers lives in `src/adapters/sw/fallback.ts`; a header added to what the worker passes through is considered for it.
- **The forced-reload recovery, outside Chromium.** A hard reload loads the shell with the worker installed but not controlling the page, and the shell recovers by registering again and rendering the document. That recovery is proven in Chromium only, because reaching the state needs a load that is uncontrolled while a registration exists, and the only handle on it is the Chrome DevTools Protocol's `Network.setBypassServiceWorker` — a keyboard hard reload is browser chrome, which a headless page never receives, so it cannot be driven in Firefox or WebKit (#11). The code path is the same in all three engines and nothing about it is Chromium-specific; what is missing is the test, not the behaviour.
- **Availability of the endpoints.** A public RPC endpoint can rate-limit or disappear. Failover is ordered and every endpoint is tried once per call; there is no health tracking, no retry, no backoff and no racing, so a list whose first entry is slow pays that cost on every request. When no endpoint answers, the visitor gets a 502 whose body is a fixed string and carries nothing the endpoint said (`test/resolve.test.ts`).
