# Audit — 2026-11-20

Two blind adversarial reviews of the twelve scoped files, reconciled. This document reconciles the
legs and does not fix anything: every finding below is carried on untouched for triage.

## 1. Provenance

Reproduced verbatim from the runner's provenance file.

```
audit date        2026-11-20
code commit       be92f1f7fcb34121bd7c05203411850fbb64dd5f  (dirty: no)
scope             src/core/abi.ts
                  src/core/errors.ts
                  src/core/ports.ts
                  src/core/resolve.ts
                  src/core/target.ts
                  src/adapters/rpc/fetch.ts
                  src/adapters/rpc/memory.ts
                  src/adapters/sw/boot.ts
                  src/adapters/sw/config.ts
                  src/adapters/sw/shell.html
                  src/adapters/sw/sw.ts
                  tools/build.ts
blind tree        2e5e33557ce24f0df0f5c4859bb91d919b974297 (scoped files only; hashes in BLIND.md)
skill             none — web-security prompt, audits/prompts/leg.md
leg 1 requested   codex gpt-5.6-sol · effort high · 1 pass
leg 1 cli         codex-cli 0.158.0
leg 1 observed    model: gpt-5.6-sol · reasoning effort: high
leg 1 wall        360s (exit 0)
leg 1 tokens      46,997
leg 2 requested   claude opus · 1 pass
leg 2 cli         2.1.329 (Claude Code)
leg 2 observed    "model":"claude-opus-5-5"
leg 2 wall        355s (exit 0)
leg 2 tokens      "output_tokens":1099
```

Both leg directories are non-empty, and each has a non-empty `full-report.md` (12,749 and 23,707
bytes). **Read before deduplication: leg 1 (codex, gpt-5.6-sol): 7 findings** (3 High, 2 Medium,
2 Low), plus an unnumbered "reviewed surfaces without an additional finding" section. **Leg 2
(claude, opus): 14 graded findings** (2 High, 4 Medium, 8 Low) **plus 9 Info items**. After
deduplication there are **16 distinct findings** (leg 2's L-3 holds two separate issues), plus leg 2's
Info items, which are carried in § 2.4.

**About line numbers.** All of leg 1's citations match the code at the review commit. Leg 2's
citations into `src/adapters/sw/boot.ts`, `src/core/target.ts` and `src/core/abi.ts` match. **Every** one of
its citations into `src/core/resolve.ts` (95 lines), `src/adapters/rpc/fetch.ts` (96),
`src/adapters/sw/config.ts` (28), `src/adapters/sw/sw.ts` (52) and `tools/build.ts` (115) points
past the end of the file: for example `fetch.ts:212-219`, `build.ts:260`, `config.ts:110-112`.
BLIND.md shows that the blind tree's hashes equal the repository's, so the leg read the same bytes.
Its quoted code and identifiers are accurate. Below, those findings are placed at the real line
found from the quoted code, and the leg's own citation is given in brackets. The report does not
show why this happened.

## 2. Findings

Severities are on the shared four-step scale both legs used (Critical / High / Medium / Low). Each
leg defined that scale in its own words, and the definitions are close but not identical.

### 2.1 High

#### F1 — Several chains of one project share one origin; the code says their storage stays separate

- **Where:** `src/core/target.ts:21-23` (the `Pins` comment), `pinnedTarget` at `src/core/target.ts:169`; one registration at scope `/`, `src/adapters/sw/boot.ts:70`.
- **Found by:** both. **Severity:** leg 1 High, leg 2 High (leg 2 adds: "Medium if every chain's contract is guaranteed to share one owner key and one upgrade path; the build does not check that"). **Adopted: High.** The legs agree.
- **What:** in the several-chain build, `/1/…` and `/10/…` are one origin, and the path prefix is not a browser boundary. Every configured contract's document therefore shares localStorage, IndexedDB, Cache Storage, cookies and sessionStorage, can script the others' windows and `fetch` their responses, and can `unregister()` the shared worker. Leg 2 adds per-origin permissions, wallet (EIP-1193) connection approvals above all: the chain-10 document inherits a connection the user granted at `/1/`. The comment at `target.ts:22-23` says the opposite ("the project's storage stays separate by chain"). Leg 1 adds that the loopback path form has the same property across arbitrary contracts, by design and on loopback only.
- **Cost:** the origin is only as safe as the weakest contract configured on it. A compromised or hostile upgrade of any one chain's contract takes over every other chain's state and wallet standing.

#### F2 — The no-worker fallback drops every header the contract set, and renders any path

- **Where:** `src/adapters/sw/boot.ts:36-45` (`renderInline`: header lookup at `:40`, `document.write` at `:43-45`); compare `request()` in `src/core/resolve.ts:56-77` [leg 2: `resolve.ts:276-287`].
- **Found by:** both. **Severity:** leg 1 Medium, leg 2 High. **Adopted: High.**
- **Why High:** leg 1 rated it Medium because reaching the fallback has "material prerequisites": service workers unavailable, blocked, or registration timing out. Leg 2 names a way for an attacker to reach it: framing the page from a third-party site in a browser that blocks partitioned storage, so that `register()` rejects or passes `WORKER_MS`. Leg 1 does not address that route. If it works, the effect meets leg 1's own definition of High ("cross-security-boundary code/data compromise"): script runs on the gateway origin despite a CSP the contract set to stop it. **Neither leg ran the iframe route.** If triage finds a third party cannot force the fallback, leg 1's Medium is the right grade, and the next audit should say so as a superseding entry.
- **What:** `renderInline` resolves whatever target the URL names, and keeps only `content-type`. A `text/html` body is written with `document.write` over the boot page, whose real headers are the static host's. Lost are CSP (including `sandbox`), `X-Frame-Options`, COOP/COEP/CORP, `Permissions-Policy`, `Referrer-Policy`, `nosniff` and `Content-Disposition` (so an intended download is rendered instead). The comment at `boot.ts:33-34` says "but only the root", yet nothing in `renderInline` restricts it to the root. Leg 2 also notes, as correctness rather than security, that `TextDecoder()` at `:41` ignores any declared charset.
- **Cost:** a contract that contains untrusted HTML behind a response-header CSP is protected under the worker and not under the fallback. With F9, a sibling chain's document in a multi-chain build can push a tab onto this path.

### 2.2 Medium

#### F3 — Aliased ABI header offsets amplify return data about 128× into decoded strings

- **Where:** `src/core/abi.ts:116-120` (`decodeRequestResult`, `text.decode` at `:120`); further copies at `src/core/resolve.ts:66` (`toLowerCase`) [leg 2: `resolve.ts:277`].
- **Found by:** both. **Severity:** leg 1 High, leg 2 Medium **[run]**. **Adopted: Medium.**
- **Why Medium:** the two legs agree on the mechanism, and leg 2 measured it: a 4,196,608-byte return value decoded into 536,870,912 characters, with RSS up 509 MB in 0.5 s under Node 24. The legs differ only on who is harmed. Leg 1 rated it under "reliable severe resource exhaustion". But the parties who can send these bytes are the contract being served and the endpoint believed for it, and either of them already decides the whole document. The harm is availability for the contract's own visitors. The one case where the harm crosses a boundary, a worker shared by several chains, is F1's consequence and is counted there. That is leg 2's scale ("a hostile contract… can… exhaust resources"), and both legs' reasoning supports it.
- **What:** `MAX_HEADERS = 64` caps the header count, not the decoded bytes. All 64 pair offsets, and both offsets inside each pair, may name one multi-MiB string. Every bounds check passes, and every `decode` allocates a fresh copy.
- **Cost:** a few parallel subresource requests take the worker, or on the fallback path the page, out of memory.

#### F4 — `hexToBytes`'s regex overflows V8's backtrack stack at about 4 MiB; every endpoint is then downloaded and the visitor gets a 502

- **Where:** `src/core/abi.ts:13`, reached from `src/adapters/rpc/fetch.ts:77` [leg 2: `:204`]; swallowed by the failover `catch` at `fetch.ts:88-90` [leg 2: `:212-219`]; cap at `fetch.ts:54`.
- **Found by:** leg 2 alone, **[run]**. **Severity:** leg 2 Medium. **Adopted: Medium.**
- **What:** `/^0x([0-9a-fA-F]{2})*$/` backtracks once per byte. Leg 2 measured a `RangeError: Maximum call stack size exceeded` above 4,193,280 bytes of return data, unaffected by `--stack-size`. The default 16 MiB `maxBytes` admits up to 8 MiB of return data. The `RangeError` counts as that endpoint failing, so the next endpoint is tried.
- **Cost:** any return value between about 4 and 8 MiB downloads up to 16 MiB from each endpoint in turn. The visitor gets `502 … upstream`, which blames the endpoints wrongly. A hostile first endpoint can force this onto every later one.

#### F5 — Nothing bounds the call across the endpoint list; latency is `n × timeoutMs`

- **Where:** `src/adapters/rpc/fetch.ts:85` (serial loop), `:62` (per-endpoint `AbortSignal.timeout`), documented at `:47-51`; chains list not capped at `tools/build.ts:25`.
- **Found by:** leg 1 as a finding. Leg 2 restates the documented bound inside its L-3 and does not report it (see F11 and § 4). **Severity:** leg 1 Medium. **Adopted: Medium**, the only severity either leg gave it.
- **What:** each endpoint gets a fresh 10 s timeout and endpoints are tried in order, so one `call` can wait out every endpoint's timeout in turn. Leg 1's repro uses a chains file with 1,000 hanging endpoints, about 10,000 s. At the defaults, two hanging endpoints cost 20 s. Leg 1 notes that the doc comment states the behaviour, and that neither worker caller imposes the whole-list budget the comment asks for.
- **Cost:** a visitor waits on the shell for the sum of the timeouts, and concurrent requests stack up pending fetch events.

#### F6 — Host-form contracts share a registrable domain: cookie tossing and a cookie bomb across contracts

- **Where:** `src/core/target.ts:69-74` (host form under "any base").
- **Found by:** leg 2 alone. **Severity:** leg 2 Medium. **Adopted: Medium.**
- **What:** every contract is `<address>.<chain>.<base>`. Unless `<base>` is on the Public Suffix List, any contract's document can set `Domain=<base>` cookies. Those cookies are sent to every other contract's origin and appear in its `document.cookie`. Nothing in the build or the parser checks or warns.
- **Cost:** enough large cookies push every later request to any `*.<base>` past the static host's header limit (400/431), so contracts the visitor has not yet opened cannot boot. The planted cookies also appear in every other contract's `document.cookie`.

#### F7 — The root document can carry no header: it is always frameable and has no CSP

- **Where:** `html()` at `src/core/resolve.ts:50`, built by `respond()` at `:32` with the fixed headers at `:26-27` [leg 2: `resolve.ts:261-265, 235-239`].
- **Found by:** leg 2 alone. **Severity:** leg 2 Medium. **Adopted: Medium.**
- **What:** `html()` returns only bytes, so the root response carries exactly `content-type`, `cache-control` and `nosniff`, and the gateway sets no `frame-ancestors` / `X-Frame-Options` default. Both are ignored in `<meta>`. Sub-paths can opt in through `request()`; the root, which is the dapp's main page, cannot.
- **Cost:** any site can frame and overlay every contract's main page (clickjacking on "Connect", "Approve", "Sign"). On the F2 path this holds for every path.

### 2.3 Low

#### F8 — The `</script` guard on the inlined boot script is case-sensitive

- **Where:** `tools/build.ts:79` [leg 2: `build.ts:260`]; the substituted values come from `define` at `:61-65`.
- **Found by:** both. **Severity:** leg 1 High, leg 2 Low. **Adopted: Low.**
- **Why Low:** both legs agree the only outside data in the boot bundle is the `define` values, and that the endpoint strings are not validated. The question is who writes that input. The chains file is the deployer's own build input; `audits/SCOPE` excludes it as "data a deployer replaces". Whoever can write it already chooses the endpoint believed for every document the gateway serves. Leg 1's argument is that markup in the page runs before contract resolution, and so goes "more than" a lying endpoint. That is true of timing, but it hands the same party little it lacks. Leg 1's High requires "realistic adversarial input"; leg 2's Low names "hostile or careless build input", and the second describes who controls the input. **Neither leg checked whether esbuild's minified output already escapes these sequences in string literals.** Both said they could not, and one `make build` answers it.
- **What:** `replaceAll("</script", …)` matches lower case only, while the HTML tokenizer ends a script on `</SCRIPT` and any other casing. Leg 2 adds `<!--`…`<script`, which moves the tokenizer into the double-escaped state.
- **Cost:** an endpoint string such as `…</ScRiPt><script>…` puts active markup into every generated `index.html` and `404.html`.

#### F9 — The boot loop counter is unvalidated and writable by any document on the origin

- **Where:** `src/adapters/sw/boot.ts:20-30` (parse at `:23`, window test at `:24`).
- **Found by:** both. **Severity:** leg 1 Low, leg 2 Low (leg 2: "Medium together with H-2 and H-1", i.e. F1 and F2). **Adopted: Low.**
- **What:** `gw44:boot` lives in the origin's sessionStorage, and `split(":").map(Number)` accepts anything. The legs found it from opposite directions. Leg 1: a stored `NaN:<now>` makes the count `NaN`, so `>= MAX_ATTEMPTS` is never true and the two-reload bound is defeated. Leg 2: a future timestamp passes `Date.now() - at < WINDOW_MS`, so a planted large count such as `9:9e15` sends every later load in the tab straight to `renderInline`.
- **Cost:** tab-local on a contract's own origin. In a multi-chain build, one chain's document can push another chain's pages onto the header-dropping fallback (F2).

#### F10 — A non-2xx RPC response body is never cancelled

- **Where:** `src/adapters/rpc/fetch.ts:69` [leg 2: `:196`].
- **Found by:** both (leg 2 as the second half of L-3). **Severity:** both Low. **Adopted: Low.**
- **What:** on a successful status, `readCapped` consumes the body and cancels it if the cap is exceeded. On a non-OK status, `callOne` throws without consuming or cancelling `res.body`.
- **Cost:** a hostile endpoint answering `429`/`500` with a slow, endless body holds one connection per request until `AbortSignal.timeout` fires, outside the explicit size handling.

#### F11 — Failover keeps no memory between calls

- **Where:** `src/adapters/rpc/fetch.ts:85` [leg 2: `:212-219`].
- **Found by:** leg 2 alone (first half of L-3). **Severity:** leg 2 Low. **Adopted: Low.**
- **What:** every call starts at endpoint 0. A first endpoint that accepts connections and never answers costs every request its full 10 s, and a page with 50 subresources pays it 50 times at once. Leg 2 notes the doc comment documents the `n × timeoutMs` bound but says nothing about statelessness. This is a different issue from F5, which is the sum over the endpoint list.

#### F12 — Any JSON-RPC error whose message contains "revert" stops failover and becomes a 404

- **Where:** `isRevert` at `src/adapters/rpc/fetch.ts:39-41`, thrown at `:73`, rethrown at `:89`; mapped to 404 at `src/core/resolve.ts:90-91` [leg 2: `fetch.ts:166-168, 200, 216`, `resolve.ts:301-302`].
- **Found by:** leg 2 alone. **Severity:** leg 2 Low. **Adopted: Low.**
- **What:** `/revert/i` matches anywhere in `error.message`, and `code === 3` from any endpoint is believed. A rate-limiting first endpoint whose message happens to contain "revert" makes every resource 404, and healthy later endpoints are never asked.

#### F13 — The worker does not reserve its own path, contrary to `config.ts`

- **Where:** claim at `src/adapters/sw/config.ts:26`; the fetch listener has no `SW_PATH` check, `src/adapters/sw/sw.ts:33-46` [leg 2: `config.ts:26-27` (matches), `sw.ts:162-175`].
- **Found by:** leg 2 as a finding. Leg 1 saw it too and filed it under "reviewed surfaces without an additional finding", calling the comment "the reverse of what an ordinary controlled fetch observes". **Severity:** leg 2 Low; leg 1 none. **Adopted: Low.**
- **What:** a controlled document's `fetch('/gw44-sw.js')` gets the contract's own `request(["gw44-sw.js"])` in the host form and the one-contract build. In the several-chain build it gets the worker's 404, because `gw44-sw.js` is not a configured chain (`target.ts:191-192`). Leg 1 says "in each shape", which is wrong for the several-chain build; leg 2 verified that case. Both legs agree that registration and update fetches bypass the worker, so a contract cannot replace the installed worker this way.
- **Cost:** anything that assumes a same-origin read of `/gw44-sw.js` returns the real worker is wrong. Leg 2 names integrity checks and the planned purge/cache logic.

#### F14 — Every query string is sent to the public RPC endpoint

- **Where:** `src/core/target.ts:67` (params), `encodeRequest` in `src/core/abi.ts:65-69`, `fetch.ts:61` [leg 2: `fetch.ts:188`].
- **Found by:** leg 2 alone. **Severity:** leg 2 Low. **Adopted: Low.**
- **What:** every `?key=value` on a sub-path, including client-only values such as OAuth `?code=`/`?state=` and invite tokens, travels in plaintext `eth_call` calldata, which the provider can log alongside the request's `Origin`. This is how ERC-5219 is specified to carry params. It is recorded as leg 2 graded it, and whether it is a defect or a documented property is triage's call.

#### F15 — The chains file is never validated

- **Where:** `tools/build.ts:25` (parse), `:37-46` (pinned subset) [leg 2: `build.ts:206, 216, 220-229, 243`]; consumers `fetch.ts:81, 83-85`.
- **Found by:** leg 2 as a finding. Leg 1 states the same fact ("the chains JSON is not validated or capped by `tools/build.ts:25`") as a cause within F5. **Severity:** leg 2 Low. **Adopted: Low.**
- **What:** `http:` endpoints are accepted, and fail quietly as mixed content under `https:`. A string instead of an array passes `supports()` and is iterated character by character. A `__proto__` key survives into the `define`d literal and sets `CHAINS`'s prototype. In a pinned build `[]` passes the "chains file carries it" check, and every URL then answers 404 `unknown-chain`.

#### F16 — A trailing-dot hostname gives one contract a second origin

- **Where:** `src/core/target.ts:66-74`.
- **Found by:** leg 2 alone (verified by running `parseTarget`). **Severity:** leg 2 Low. **Adopted: Low.**
- **What:** `<addr>.1.<base>.` parses as the host form, but it is a different origin from `<addr>.1.<base>`, with split storage, worker, wallet connection and permissions. A link to the dotted form looks the same to a user and reaches a context where revocations made on the other one do not apply.

### 2.4 Leg 2's Info items, carried untouched

None of these is graded. They are listed so the next audit can cite them.

| Item | Where | What |
|---|---|---|
| I-1 | `target.ts`, `config.ts:23-25` [leg 2: `config.ts:110-112`] | Which contract a URL reaches, traced per build. No route to an unconfigured contract found. `/%31/` reaches chain 1 under a non-canonical prefix; `//evil.com` → 302 to `/1/`. On the build-time parser selection, see § 4 item 3. |
| I-2 | `sw.ts:21`, `boot.ts:61` | All three redirects are origin-relative and cannot leave the origin or prefix; query and fragment kept. (Leg 1 reached the same conclusion.) |
| I-3 | `resolve.ts:59-60` [leg 2: `:270`] | The comment says 3xx-without-Location is not a document, but 300–399 passes, and `location` is not allowlisted, so every contract 3xx is an empty, non-redirecting response. |
| I-4 | `resolve.ts:10` allowlist | `access-control-allow-origin` has no effect in this adapter. |
| I-5 | `resolve.ts:72` | A contract-chosen content-type can make any path HTML/SVG/XHTML. This is inherent on the contract's own origin, and becomes F1 when the origin is shared. (Leg 1 said the same.) |
| I-6 | `target.ts:45` `segments` | `/a%2Fb` → resource `["a/b"]`, which a contract that joins segments may confuse with `["a","b"]`. |
| I-7 | `sw.ts:19, 33-46` [leg 2: `sw.ts:148`] | HEAD gets a full body; `Range` is ignored; the `fetch(url)` fallback drops mode/credentials/headers but is unreachable behind the listener's `named` check. |
| I-8 | `boot.ts:61` | The boot redirect runs before the attempt counter. On a host that strips trailing slashes, the two redirects can loop forever. |
| I-9 | `boot.ts:62-63` | A `not-found` from `pinnedTarget` for an unconfigured first segment is shown as "gw44: malformed URL". |

## 3. Agreement and disagreement

**Overlap.** Six of the 16 distinct findings were reported by both legs: F1, F2, F3, F8, F9 and F10.
That is six of leg 1's seven findings, and seven of leg 2's fourteen graded items (F10 is half of
L-3). Leg 1's seventh, F5, was seen by leg 2, which restated it as documented behaviour and did not
report it. That is a difference of judgement, not a miss. Leg 2 reported nine issues leg 1 did not
report as findings: F4, F6, F7, F11, F12, F13, F14, F15 and F16. Leg 1 described two of those,
F13 and F15, in passing without grading them.

**Severity on the shared findings.** The legs agreed on three of the six (F1 High, F9 Low, F10 Low)
and differed on three. In every one of those three, leg 1 graded higher:

| Finding | Leg 1 | Leg 2 | Adopted |
|---|---|---|---|
| F2 fallback drops headers | Medium | High | High |
| F3 ABI aliasing | High | Medium | Medium |
| F8 `</script` casing | High | Low | Low |

F8 shows the widest gap, two steps. It is the same disagreement as F3, and the grading of the
build input in F15: leg 1 grades by the mechanism's worst case, leg 2 by who controls the input.
This document follows leg 2 there, and gives the reason at each entry. On F2 the order is reversed:
leg 2 argued an attacker-reachable trigger, which leg 1 had not considered.

**Single-leg findings: genuine miss or false positive.** From the reports alone:

- **F4** looks like a genuine miss by leg 1. Leg 2 measured the boundary, and leg 1's ABI section discusses integer reads and slices but never the hex regex on the way in.
- **F6, F7, F12** look like genuine misses. F7 and F12 follow directly from the code at the lines given (`html()` returns bytes only; `/revert/i` on the message). F6 is a property of the host form's naming scheme, which neither leg disputes.
- **F11** is genuine but close to F5. The two legs looked at the same loop and each reported a different consequence.
- **F13** is not a miss: leg 1 saw it and declined to grade it. On the several-chain case leg 1's description is wrong and leg 2's is right.
- **F14** is a real behaviour that may be the specified one (ERC-5219 carries params in calldata). It is closer to a documented property than to a defect, and triage should decide.
- **F15** is genuine; leg 1 stated the fact without grading it.
- **F16** is plausible. Leg 2 ran the parser on the dotted hostname, and nothing in leg 1 contradicts it.

No single-leg finding is contradicted by the other leg's report.

**Coverage the legs agreed on, with no finding.** Both traced URL-to-contract selection and found no
path to an unconfigured contract in a pinned build. Both found the three redirects origin-relative.
Both found the header allowlist and value regex close CR/LF splitting. Both regard contract-chosen
active content as inherent to the contract owning its origin.

## 4. Grading against the known answer

### 1. One page load can wait `n × timeoutMs` when endpoints hang (#18) — `src/adapters/rpc/fetch.ts`, `createFetchRpc`

- **Leg 1: found, Medium.** F5 says it plainly: each endpoint gets "a fresh 10-second timeout", endpoints are "tried serially", and "there is no overall deadline". The repro scales the wait with the endpoint count (1,000 endpoints ≈ 10,000 s). It also notes that the doc comment documents the per-endpoint behaviour. Location (`fetch.ts:85`) and mechanism both match.
- **Leg 2: found weakly, Low, as an aside.** L-3 says "the comment … documents the n × `timeoutMs` bound". That is a statement that the timeout accumulates across the list, which meets this item's criterion as worded. But leg 2 gives it as a known property, not as its finding. What it reports is the different issue F11, that every call restarts at endpoint 0. Its citation (`:174-179`) is past the end of the file; the comment is at `fetch.ts:47-51`.

### 2. The browser's own `/favicon.ico` is a chain call where every path is the contract's (#36) — `src/core/target.ts`, `pinnedTarget`, one-contract branch

- **Leg 1: missed.** It states that "a one-contract pinned build … treats the entire decoded path as that configured contract's resource". It never says that requests the browser makes unprompted therefore reach the contract, and names no cost.
- **Leg 2: missed.** It came closest. I-1 says that in the one-contract build "every path is that contract's resource". L-4 names the asymmetry between the two pinned builds for `/gw44-sw.js`: a contract call in the one-contract build, a 404 with no call in the several-chain build. But L-4 concerns a request a *document* makes, and an integrity assumption. It does not mention browser-initiated requests or the reverting `eth_call` each one costs. The criterion requires both, so this is a miss.

**Neither leg found this item.**

### 3. How the pin is enforced, and what a source reader will get wrong (#37) — `src/adapters/sw/config.ts` `targetOf` / `__GW44_PINNED__`; `tools/build.ts` `define`

- **Leg 1: found, and right.** In its reviewed surfaces it says: "`__GW44_PINNED__` is a build constant, so the source selects one parser in each artifact rather than dynamically choosing a shape from the URL." That states that each artifact carries one parser. Leg 1 said it could not inspect a generated bundle, so this is read from the source and the comments, not measured. No severity, because it is not a finding.
- **Leg 2: found, and right.** I-1 says: "Because `__GW44_PINNED__` is a constant, esbuild should drop the unused parser… If it does not, nothing changes: a pinned `targetOf` cannot call `parseTarget`." It also says correctly that the unpinned bundle keeps the loopback path form. It marks the elimination as unverified (no esbuild offline), which amounts to asking what the define does rather than assuming. Info, no severity. Its citation `config.ts:110-112` is past the end of the 28-line file; the code is at `config.ts:23-25`.

Neither leg claimed a pinned build ships the unpinned parser, or that the pin holds at run time only.
Neither recommended removing a parser or splitting the module. **This item has no false positive to
record**, so this run gives no evidence for the limit of method it was set up to detect.

**Summary:**

| Known answer | Leg 1 (codex) | Leg 2 (claude) |
|---|---|---|
| 1. `n × timeoutMs` (#18) | found, Medium | found weakly, Low (restated, not reported) |
| 2. favicon in one-contract build (#36) | **missed** | **missed** |
| 3. build-time parser selection (#37) | found, right | found, right |

## 5. Legs

**Leg 1 — codex, gpt-5.6-sol** ([`gpt-5.6-sol/`](gpt-5.6-sol/full-report.md)). A source-only review
of the twelve scoped files, with no network. It said, verbatim: "The local tree did not contain an
installed `esbuild`, so I could not inspect a generated bundle empirically; the build finding below
follows the source-level substitution and HTML parsing path." It produced **7 findings** (3 High,
2 Medium, 2 Low) and a section of reviewed surfaces with no finding. Every line it cited matches the
code. It ran nothing.

**Leg 2 — claude, opus** ([`opus/`](opus/full-report.md)). It read all twelve files. It said,
verbatim: "There was no browser, no esbuild and no network, so nothing ran inside a real service
worker, and nothing that depends on esbuild's output (how it escapes `</script`, whether it drops
the unused parser) was checked." It imported `abi.ts` and `target.ts` read-only under Node v24 from a
scratch directory outside the tree, then deleted that directory. It reports `git status` clean. It
produced **14 graded findings** (2 High, 4 Medium, 8 Low) and **9 Info items**. It says "Three
findings were checked that way and are marked **[run]**", but only two carry the mark (M-1 = F3,
M-3 = F4). L-4, L-8 and I-1 say "verified" in their text. Its citations into five of the twelve
files point past the end of those files (see § 1). The provenance records this leg's tokens as
`"output_tokens":1099`. That is hard to square with a 23,707-byte report, so the field may count
something other than the leg's whole output. It is reproduced above as recorded and not corrected.
