# Audit — 2026-11-21b

Two blind adversarial reviews of the fifteen scoped files, reconciled. This document reconciles the
legs and does not fix anything: every finding below is carried on untouched for triage.

## 1. Provenance

Reproduced verbatim from the runner's provenance file.

```
audit date        2026-11-21b
code commit       e289e67a51c3f8cfb139fc4a4ed51a3285d650ec  (dirty: no)
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
                  tools/chains.ts
                  tools/inline.ts
blind tree        6fc958fdc7530e9bce54c4a5cf4ce24d3062131d (scoped files only; hashes in BLIND.md)
skill             none — web-security prompt, audits/prompts/leg.md
leg 1 requested   codex gpt-5.6-sol · effort high · 1 pass
leg 1 cli         codex-cli 0.158.0
leg 1 observed    model: gpt-5.6-sol · reasoning effort: high
leg 1 wall        352s (exit 0)
leg 1 tokens      53,033
leg 2 requested   claude opus · 1 pass
leg 2 cli         2.1.329 (Claude Code)
leg 2 observed    "model":"claude-opus-5-5"
leg 2 wall        580s (exit 0)
leg 2 tokens      "output_tokens":1054
```

**Input read.** Both leg directories hold a non-empty `full-report.md`. Before deduplication: **leg 1
(codex) reported 4 findings** (F1 High, F2–F4 Medium) plus a section of required-surface notes it
marks "not additional findings"; **leg 2 (claude) reported 16 items** (H1, M1, L1–L7, I1–I7) plus a
section of surfaces with clean results. They reduce to **18 distinct findings** below.

## 2. Findings

Both legs used a Critical / High / Medium / Low scale; leg 2 adds Info. Leg 1 grades by impact class
(compromise, secret exposure, build-host integrity) with a precondition qualifier; leg 2 grades by
which party controls the input and whose trust domain it reaches. Where they differ, the entry says
which reading is adopted and why. Leg identifiers (F1…, H1…) are each leg's own; the A-numbers are
this document's.

### 2.1 High

#### A1 — Several chains of one project share one origin; any configured chain's contract or first endpoint controls every other chain's state

- **Where:** `pinnedTarget`, several-chains branch, `src/core/target.ts:195-226` (leg 1 cites `:204`); the framing policy `src/core/resolve.ts:40,63`; contract-chosen content type `src/core/resolve.ts:83`; per-chain endpoint lists `tools/build.ts:50-63`.
- **Found by:** both (leg 1 F1, leg 2 H1). **Severity:** leg 1 High, leg 2 High. **Adopted: High.** The legs agree. Repeats 2026-11-21 F1 and 2026-11-20 F1.
- **What:** chains are routed by first path segment, which is not a browser boundary. A document served under one chain's prefix has same-origin rights over every other chain's localStorage, IndexedDB, sessionStorage and cookies, can fetch and script the other chain's pages, can `unregister()` the shared worker, and can use EIP-1193 wallet permissions the visitor granted to the origin. Leg 2 adds two points: the first public endpoint listed for the weakest chain is enough, with no contract compromise; and the new root policy `frame-ancestors 'self'` names the shared origin, so it does not stop one chain framing another chain's root. Leg 1 adds that a sibling can unregister the worker and write an unreadable `gw44:boot` value, so the next load of another chain renders its root inline and its sub-resources go unserved.
- **Cost:** the origin is only as safe as the weakest configured chain, typically a testnet contract or testnet endpoint. Leg 2 notes that `target.ts:20-29` documents the shared origin as a decision, but not what it costs.

### 2.2 Medium

#### A2 — Unpinned host form: every contract is a sibling subdomain of one registrable domain

- **Where:** host form `src/core/target.ts:78-95`; effects land on the static-host fetches of the boot page and of `/gw44-sw.js` (`src/adapters/sw/boot.ts:90`, `updateViaCache: "none"`).
- **Found by:** leg 2 alone (M1). **Severity:** leg 2 Medium. **Adopted: Medium**, the only grade given. Repeats 2026-11-21 F3 and 2026-11-20 F6.
- **What:** unless the base domain is on the Public Suffix List, one contract's document can set `Domain=<base>` cookies. These can push every request to any `*.<base>` origin past the CDN header limit, so first visits fail and installed workers cannot update. They can also be read by other contracts (cookie tossing). Leg 2 also lists same-site framing of other contracts' sub-paths with unpartitioned storage, WebAuthn `rp.id = <base>` shared across contracts, and blocklist reputation acting on the whole domain.
- **Cost:** one hostile contract can deny service to every other contract on the gateway and pin visitors to a stale worker. The engine behaviour is from leg 2's knowledge and was not run.

#### A3 — Endpoint count multiplies the per-endpoint timeout, and the chains file bounds neither count nor duplicates

- **Where:** `src/adapters/rpc/fetch.ts:85-92` (leg 1 cites `:85`); `tools/chains.ts:41`.
- **Found by:** leg 1 alone as a finding (F2). Leg 2 recorded the mechanism in its no-finding section ("`n × timeoutMs` per call is documented (`fetch.ts:47-52`)") and did not grade it. **Severity:** leg 1 Medium. **Adopted: Low.** This is prior known answer #18, and the doc comment at `fetch.ts:47-53` states the bound and assigns the cross-list budget to M04. Leg 1's addition is that `parseChains` accepts an arbitrarily long list with repeated entries. That needs a deployer to write such a list, and leg 1's scale sets the cost of an operator's own input lower. 2026-11-21 adopted Low for the same mechanism (F8); this run adds nothing that raises it.
- **What:** each endpoint gets a fresh 10 s abort and the list is tried serially, so `n` hanging endpoints hold one navigation for `n × 10 s` before the 502.

### 2.3 Low

#### A4 — The chains file admits endpoints unfit for a public deployable: credentials in the URL, keyed URLs, loopback `http:`

- **Where:** `tools/chains.ts:44-55` (leg 1 cites `:50`); compiled into both bundles at `tools/build.ts:75`.
- **Found by:** both, in part. Leg 1 F3 covers the userinfo case. Leg 2 L7 covers userinfo, a path-embedded API key, and loopback `http:`. **Severity:** leg 1 Medium, leg 2 Low. **Adopted: Low.** The secret is one the deployer chose to put in a file whose whole content the build publishes, which is documented behaviour. The userinfo form cannot work, because `fetch` rejects credentialed URLs, so that endpoint fails on every call that reaches it. Leg 1's Medium rests on "secret exposure", but this is exposure by the operator's own input, not by an attacker.
- **What:** validation checks protocol and hostname only. `https://user:pass@…` passes, is published in `index.html`, `404.html` and `gw44-sw.js`, and is dead in the browser (leg 1 checked this with a local `Request` probe). `https://…/v3/<KEY>` is published, and in an unpinned build any contract can spend its quota. `http://localhost:8545` is valid for a dev build and, if shipped, sends every visitor's `eth_call` to their own loopback first.

#### A5 — Build output writes follow symlinks planted in the output directory

- **Where:** stray-file gate `tools/build.ts:106-112`; writes `tools/build.ts:114-119` (leg 1 cites `:114`).
- **Found by:** leg 1 alone (F4). **Severity:** leg 1 Medium. **Adopted: Low.** The precondition is a principal who can prepare the output directory, such as a reused CI workspace or a restored cache. In the usual layout, that principal can also edit the build's inputs under the same checkout, and that dominates. Leg 1's own scale puts "build-host integrity loss that requires … a local precondition" at Medium; this document weighs the precondition as stronger than that wording.
- **What:** the gate compares entry names only. It never `lstat`s them or checks whether `out` is itself a link. `writeFile` follows a link named `index.html` and overwrites its target, and the post-write name check still passes.

#### A6 — Sub-path documents carry no framing rule by default, and the worker path installs inside a frame

- **Where:** `src/core/resolve.ts:60-65` (only `html()` gets `frame-ancestors`), `:67-88`; `src/adapters/sw/boot.ts:52` (the top-level check guards the inline path only).
- **Found by:** leg 2 alone (L1). **Severity:** leg 2 Low. **Adopted: Low.**
- **What:** a contract whose UI lives at a sub-path, rather than in `html()`, is frameable cross-site unless it sends its own policy. Storage partitioning limits a cross-site framer to fresh state. The same-site case is part of A2.

#### A7 — A hostile endpoint can make the worker allocate hundreds of MB per call within the 16 MiB wire cap

- **Where:** `src/adapters/rpc/fetch.ts:70-71` (`readCapped` then `JSON.parse`), cap at `:30`.
- **Found by:** leg 2 alone (L2). **Severity:** leg 2 Low. **Adopted: Low.** A hostile endpoint can already choose the document, and that dominates. Leg 2 says the memory figures are estimates and were not run.
- **What:** deeply nested `[`…`]` padding beside a correct `result` makes each call allocate far more than the wire bytes. Concurrent sub-resources multiply this until the browser kills the worker.

#### A8 — Any error message containing "revert" stops failover and becomes a 404

- **Where:** `src/adapters/rpc/fetch.ts:39-41` (`/revert/i`), `:73`, `:89`; `src/core/resolve.ts:104-106`.
- **Found by:** leg 2 alone (L3). **Severity:** leg 2 Low. **Adopted: Low.** Repeats 2026-11-21 F9.
- **What:** a broken endpoint whose free-text error mentions "revert" turns every URL on its chain into "the contract does not serve this resource", and the next endpoint is never tried.

#### A9 — A non-2xx endpoint response body is never cancelled

- **Where:** `src/adapters/rpc/fetch.ts:69`.
- **Found by:** leg 2 alone (L4). **Severity:** leg 2 Low. **Adopted: Low.** Repeats 2026-11-21 F7.
- **What:** the response is held until the 10 s abort fires. Failover has already moved on, so one call can hold a connection on every failed endpoint, and on HTTP/1.1 that can use up a host's connection pool.

#### A10 — Without `AbortSignal.timeout`, every call fails and the 502 blames the endpoints

- **Where:** `src/adapters/rpc/fetch.ts:62`, swallowed at `:88-91`, reported at `:93`.
- **Found by:** leg 2 alone (L5). **Severity:** leg 2 Low. **Adopted: Low.** Leg 2 says its browser-version figures (Safari 15.x has service workers but no `AbortSignal.timeout`) are from memory and unchecked.
- **What:** the `TypeError` is raised before any request is sent and is swallowed as an endpoint failure, so the page reports `no RPC endpoint for chain … answered`.

#### A11 — Nothing ties an endpoint to its chain id

- **Where:** `tools/chains.ts:33-58`, `tools/build.ts:54-61`, `src/adapters/rpc/fetch.ts:57-78` (`eth_chainId` is never asked).
- **Found by:** leg 2 alone (L6). **Severity:** leg 2 Low. **Adopted: Low.**
- **What:** an endpoint for another chain listed under chain 1 builds cleanly, prints `pinned to 1:…`, and serves whatever that address holds on the other chain. That is a contract the build did not configure, reached through a build input and not through a URL.

### 2.4 Info

#### A12 — The reserved worker path is matched on the raw pathname; a percent-encoded spelling reaches the contract

- **Where:** `src/adapters/sw/sw.ts:45` (`url.pathname === SW_PATH`) against the percent-decoding in `src/core/target.ts:66-73`.
- **Found by:** leg 2 alone (I1). **Severity:** leg 2 Info. **Adopted: Info.** Leg 2 found no exploit. Registration and update fetches bypass the worker, so this cannot plant a worker script. The WHATWG parser does leave `/%67w44-sw.js` encoded in `pathname`; that was confirmed with a one-line Node check when this document was written.
- **What:** in a pinned build, `GET /%67w44-sw.js` gets past the reservation, decodes to resource `gw44-sw.js`, and serves the contract's bytes. That breaks the invariant `config.ts:30-31` states ("shadowed rather than served").

#### A13 — The inline-boot escape is not meaning-preserving in every JavaScript context

- **Where:** `tools/inline.ts:23`.
- **Found by:** leg 2 alone (I4). **Severity:** leg 2 Info. **Adopted: Info.** No input that reaches it today contains such a context.
- **What:** in a regular expression with the `u` or `v` flag, `<\!--` is an invalid identity escape (a `SyntaxError` that kills the boot script), and inside `String.raw` it changes the value. It is safe as HTML; the claim that the program is unchanged holds only for the contexts the bundle contains today.

#### A14 — The loop guard does not bound a hostile same-origin document, and misfires on quick forced reloads

- **Where:** `src/adapters/sw/fallback.ts:77-90`; `src/adapters/sw/boot.ts:27-36,77,85`.
- **Found by:** leg 2 alone (I6). Leg 1 covers the deny-reload half in its notes and in F1 (A1). **Severity:** leg 2 Info. **Adopted: Info.**
- **What:** a document can write a well-formed, fresh `0:<now>`, and `attemptsFrom` reads it as 0 attempts. This gains nothing, because the document can call `location.reload()` itself. Separately, three forced reloads of a sub-path within 10 s, in a browser with working service workers, reach `MAX_ATTEMPTS` and show the "needs a service worker" message. The `/<chain>` → `/<chain>/` redirect at `boot.ts:77` runs before the guard, so a host that strips the trailing slash would loop it. Leg 2 knows of no such host in the README's list.

#### A15 — Status 300–399 is accepted, though the comment says 3xx without `Location` is not a document

- **Where:** `src/core/resolve.ts:70-73`.
- **Found by:** leg 2 alone (I2). **Severity:** leg 2 Info. **Adopted: Info.** Repeats 2026-11-21 F17.

#### A16 — `access-control-allow-origin` and `cross-origin-resource-policy` are passed but cannot take effect

- **Where:** `src/core/resolve.ts:19-20`.
- **Found by:** leg 2 alone (I3). **Severity:** leg 2 Info. **Adopted: Info.** Overlaps 2026-11-21 F20.
- **What:** the gateway's worker never handles a cross-origin request to its origin. A contract that sets ACAO gets the static host's `404.html` cross-origin instead.

#### A17 — An endpoint string is compiled as written, not as validated

- **Where:** `tools/chains.ts:46` (validates `new URL(endpoint)`), `:55` (stores the raw string).
- **Found by:** leg 2 alone (I5). Leg 1 F3 notes the same storage of the raw string, but only for its credential consequence. **Severity:** leg 2 Info. **Adopted: Info.**
- **What:** the URL parser strips tab and newline, so a reviewer reading `chains.json` can see a different host than the validator and the browser both use. There is no check/use gap.

#### A18 — Dead pass-through in `handle`

- **Where:** `src/adapters/sw/sw.ts:20`.
- **Found by:** leg 2 alone (I7). **Severity:** leg 2 Info. **Adopted: Info.**
- **What:** `handle` runs only when `targetOf(url)` was non-null, so `fetch(url)` cannot be reached. If it ever were, it would drop the request's method, headers, mode and credentials.

## 3. Agreement and disagreement

**Overlap.** Two of the 18 distinct findings were reported by both legs: A1 and A4. That is two of
leg 1's four findings and two of leg 2's sixteen items. A4 overlaps only partly: leg 1 found the
userinfo case and not the keyed URL or loopback `http:`. A3 is a finding in leg 1 and a no-finding
note in leg 2, which is a difference of judgement, not a miss. A5 is leg 1's alone. A2 and A6–A18
are leg 2's alone.

**Severity on the shared findings.** The legs agree on A1 (High). They differ on A4 (leg 1 Medium,
leg 2 Low; adopted Low). The same pattern holds on the single-leg findings that were regraded, A3 and
A5: leg 1 grades by the impact class, and leg 2's reading weighs who supplies the input. This
document adopts the lower grade in all three, each time because the input is the deployer's own
(the chains file, the output directory). Taking the lower grade was not the rule.

**Single-leg findings: genuine miss or false positive.** From the reports alone:

- **A2** looks like a genuine miss by leg 1, for the third run. Its notes describe the host form's URL rules and never consider the shared registrable domain.
- **A5** looks like a genuine miss by leg 2. Leg 2 never discusses the output directory, and its build section is about injection only.
- **A8, A9** look like genuine misses by leg 1. Both follow from the cited lines, and leg 2 reported both on 2026-11-21 too.
- **A6, A11, A12** are plausible and uncontradicted. A12 holds as stated: the raw-pathname comparison is at `sw.ts:45`, and the parser leaves `%67` encoded. Leg 1's note says "the exact worker pathname is reserved", which is accurate and does not consider encoded spellings.
- **A7, A10** are plausible, but rest on engine behaviour that leg 2 says it did not run or check.
- **A13–A18** are leg 2's Info items. Leg 1 is silent on them, except A14's deny-reload half (in A1) and A17's raw string (in A4).

**No contradiction between legs.** Neither leg's report contradicts a finding of the other.

**Coverage both legs reported clean.** Both traced URL-to-contract selection in all three shapes and
found no URL that reaches an unconfigured contract, including percent-encoded first segments. Both
found every constructed redirect origin-relative, with the query and fragment kept. Both found the ABI
decoder bounds-checked, with header count and header bytes capped before decoding. Both found header
names allowlisted, values free of CR/LF, and the fixed headers unoverridable. Both found the `define`
substitutions JSON-safe and the inline escape HTML-safe. Both read the no-worker fallback as limited
to a top-level root, with `frame-ancestors 'self'` as the one tolerated policy.

## 4. Grading against the known answer

This run's eight known answers are **fixes**. Each leg is graded **silent**, **re-reported** (a false
positive) or **confirmed**, per `audits/KNOWN_ANSWER.md`. **Neither leg re-reported any of the eight
as open**, and neither made the `__proto__`-sets-the-prototype claim the chains-file item warns
about. Leg 2 mentions `__proto__` once, about `pins.contracts` keys being validated digits
(`target.ts:151`), which is correct.

### 1. A root document's framing rule (#57) — `src/core/resolve.ts` `html()` / `ROOT_FRAME_POLICY`

- **Leg 1: confirmed.** In its notes: "the sole allowed otherwise-unhonourable header is the exact root `frame-ancestors 'self'` policy, for which the top-level check is stricter." That names the default. It does not mention the `"any"` opt-out.
- **Leg 2: confirmed, with a narrower gap.** H1 (A1): "`frame-ancestors 'self'` (`resolve.ts:40`) is satisfied because 'self' is the shared origin, so the root framing rule protects nothing between chains". The item lists this narrower gap by name. L1 (A6) also names the default ("only `html()` gets `frame-ancestors`") and reports the sub-path boundary as a separate finding.

### 2. The worker's own path (#62) — `src/adapters/sw/sw.ts` `fetch` listener, `SW_PATH`

- **Leg 1: confirmed.** "The exact worker pathname is reserved and answered locally with 404 before contract routing."
- **Leg 2: confirmed, with a narrower gap.** I1 (A12) names the reservation, and reports that it is matched on the raw pathname, so `/%67w44-sw.js` reaches the contract. It also states that registration bypasses the worker, so no worker can be planted. That is a narrower gap left by the fix and not a re-report. The item's listed narrower forms do not include it, but the code bears it out.

### 3. The boot reload counter (#59) — `src/adapters/sw/fallback.ts` `attemptsFrom` / `attemptsValue`

- **Leg 1: confirmed, with a narrower gap.** "malformed and future values fail closed at `MAX_ATTEMPTS`; they suppress worker reload/reinstallation rather than resetting the count". F1 (A1) gives the narrower gap the item names: a document can still deny the reload, here across chains.
- **Leg 2: confirmed, with a qualification of the item's own claim.** "When the stored value can't be read as a counter it counts as `MAX_ATTEMPTS`, which fails safe in the direction the comment intends." I6 (A14) adds that a well-formed fresh `0:<now>` resets the counter. That holds against `attemptsFrom` at `fallback.ts:77-85`, and it qualifies the item's "cannot license one". Leg 2 also notes that a document gains nothing by it, since it can reload itself. This is a narrower statement about the fix, not a report that the counter is unvalidated.

### 4. The inlined boot bundle (#58) — `tools/inline.ts` `inlineBoot`

- **Leg 1: confirmed.** "`inlineBoot` neutralizes case-insensitive `</script` and `<!--` sequences before inserting the boot bundle."
- **Leg 2: confirmed, with a narrower gap.** It names the escape as closing "both HTML escape hazards", and I4 (A13) reports that `<\!--` is not meaning-preserving in a `u`/`v` regular expression or `String.raw`. That qualifies the item's statement that "the program is unchanged", for contexts the bundle does not contain today.

### 5. The chains file (#63) — `tools/chains.ts` `parseChains` / `readChains`

- **Leg 1: confirmed, with a narrower gap.** It names the validator ("`parseChains` … constrain the values used by esbuild"), and F3 (A4) reports that a credential embedded in an endpoint URL is published in the deployable. That is the item's listed narrower gap, in its userinfo form. F2 (A3) adds the absence of a count or duplicate bound.
- **Leg 2: confirmed, with narrower gaps.** L7 (A4) cites `chains.ts:44-55` and reports a published API key, userinfo, and loopback `http:`. L6 (A11) reports that the endpoint list is trusted once validated, with nothing tying it to the chain id. I5 (A17) reports that the raw string is stored, not the validated one. The first two are among the item's listed narrower forms.

### 6. An empty `GW44_PIN` or `GW44_CONFIG` (#73) — `tools/build.ts`

- **Leg 1: silent.**
- **Leg 2: silent.**

### 7. The build's gates run before it writes (#74) — `tools/build.ts`

- **Leg 1: confirmed, with a narrower gap.** F4 (A5) names "the pre-write output check" and reports that it checks names only, so symlinked entries pass. That is not the non-atomic-set gap the item lists. It is a different narrower gap in the gate itself, and is graded on its own as A5.
- **Leg 2: silent.**

### 8. The sentence on an unconfigured path (#82) — `src/adapters/sw/boot.ts`, the `catch` around `targetOf`

- **Leg 1: silent.** It says an unknown segment "throws before an RPC call", which is about `target.ts`, not about the sentence the shell shows.
- **Leg 2: silent.**

**Summary:**

| Known answer | Leg 1 (codex) | Leg 2 (claude) |
|---|---|---|
| 1. root framing rule (#57) | confirmed | confirmed, narrower (shared origin) |
| 2. worker's own path (#62) | confirmed | confirmed, narrower (encoded spelling) |
| 3. boot reload counter (#59) | confirmed, narrower (deny reload) | confirmed, qualifies "cannot license" |
| 4. inlined boot bundle (#58) | confirmed | confirmed, narrower (JS context) |
| 5. chains file (#63) | confirmed, narrower (credential URL) | confirmed, narrower (key, chain id) |
| 6. empty variable (#73) | silent | silent |
| 7. gates before write (#74) | confirmed, narrower (symlinks) | silent |
| 8. unconfigured-path sentence (#82) | silent | silent |

Re-reports: **none in either leg**. Leg 1 confirmed six of eight and leg 2 five of eight. Both legs
were silent on #73 and #82.

## 5. Legs

**Leg 1 — codex, gpt-5.6-sol** ([`gpt-5.6-sol/`](gpt-5.6-sol/full-report.md)). It read all fifteen
scoped files, with no network. Verbatim: "The deliberately reduced tree contains no package manifest,
installed build dependency, tests, or browser harness, so I could not run the complete esbuild build
or browser/service-worker integration tests. I used static analysis and small local Node probes for
URL and `Request` behavior; in particular, I confirmed that `parseChains` accepts a URL containing
userinfo while the platform `Request` constructor rejects that URL." It produced **4 findings** (1
High, 3 Medium) and a section of required-surface notes it marks as not findings. It re-reported none
of the eight fixes, confirmed six, and was silent on two.

**Leg 2 — claude, opus** ([`opus/`](opus/full-report.md)). It read all fifteen files and left the tree
untouched. Verbatim: "**Nothing was executed.** The review is a static reading of the 15 scoped files.
I did not run the build, a test, a bundler or a browser, and there was no network." It marks
engine-dependent claims (A2, A7, A10) as unchecked. It produced **16 items** (1 High, 1 Medium,
7 Low, 7 Info) and a section of surfaces with clean results. It re-reported none of the eight fixes,
confirmed five, and was silent on three. The provenance records 1,054 output tokens for this leg
against a 26,081-byte report. This document does not resolve that difference.
