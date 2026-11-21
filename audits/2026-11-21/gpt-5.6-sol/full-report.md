# Independent security review

Dynamic bundle-level reproduction was not available: the scoped tree contains no installed `esbuild`, and the review was required to use no network. All thirteen scoped files were read in full; findings below are from static analysis and small runtime checks using only the installed JavaScript runtime. No reviewed file was changed.

## Severity scale

- **Critical:** direct, broadly exploitable compromise with catastrophic impact and little or no prerequisite.
- **High:** compromise of an origin/trust domain, arbitrary code delivered to visitors, or comparable confidentiality/integrity impact.
- **Medium:** practical denial of service/resource exhaustion or a boundary failure requiring a meaningful prerequisite.
- **Low:** limited or session-local availability impact, defense-in-depth failure, or exploitability that depends on an unusual condition.

## Findings

### 1. High — Build-provided endpoint text can terminate the inline boot script with mixed-case HTML

**Location:** `tools/build.ts:79`

The boot bundle contains the JSON-serialized endpoint strings supplied by the chains file. It is inserted verbatim into an inline `<script>` after replacing only the case-sensitive byte sequence `</script`. HTML's script end-tag recognition is ASCII case-insensitive, so an endpoint containing `</ScRiPt>` is still an end tag but is not touched by this replacement. The rest of the endpoint can therefore become markup and executable script in both `index.html` and `404.html`.

This is more than control of the RPC answer for one chain: injected code runs in the static boot page before contract selection and therefore compromises every contract/chain sharing that deployed origin. `JSON.stringify` in the esbuild `define` values at lines 62–63 protects JavaScript syntax but does not make a string safe for an HTML raw-text element. The post-bundle escaping must be case-insensitive (and should not depend on a minifier incidentally escaping inline-script hazards).

**One-line reproduction:** build with a configured endpoint string `https://rpc.invalid/</ScRiPt><script>alert(document.domain)</script>`; the mixed-case closing tag passes `replaceAll("</script", ...)` and the following script is parsed as page markup.

### 2. High — Path multiplexing makes every configured chain only as trusted as the weakest contract

**Location:** `src/core/target.ts:183`

In the multi-chain pinned shape, `pinnedTarget` maps `/<chain>/...` to different contracts while all responses retain the same scheme/host/port origin. Contract root bytes are deliberately served as active HTML (`src/core/resolve.ts:50-53`), and non-root bytes can select any active content type (`src/core/resolve.ts:63-76`). Consequently, arbitrary JavaScript from any one configured contract has the browser authority of every peer: it can read and overwrite shared `localStorage`, IndexedDB and session state; frame or open another chain prefix and access its DOM; unregister the shared worker; and use wallet/account permissions the user granted to that origin while interacting with another chain.

The loopback path form has the same primitive for arbitrary, unrelated addresses at `src/core/target.ts:81-88`; restricting it to loopback prevents a public deployment from creating the boundary, but it does not isolate contracts from each other or from wallet permissions already granted to the localhost origin.

This is an origin-level compromise, not merely public readability of on-chain resources. Path prefixes are not browser security boundaries.

**One-line reproduction:** configure chain `1` to a contract whose `html()` returns `<script>console.log(localStorage); ethereum.request({method:'eth_accounts'}); let f=document.body.appendChild(document.createElement('iframe')); f.src='/2/'</script>` and visit `/1/` after using the legitimate `/2/` application.

### 3. Medium — The per-response RPC cap has no aggregate concurrency bound

**Location:** `src/adapters/sw/sw.ts:33`

Every matching fetch starts an independent `handle`/`resolve`/RPC chain immediately. `readCapped` limits one endpoint response to 16 MiB, but neither the worker nor the RPC adapter limits concurrent calls or aggregate bytes being received, decoded, concatenated, parsed as JSON, converted from hex, and ABI-decoded. HTTP/2 permits many responses from one hostile endpoint to progress concurrently, so the nominal per-response bound can become hundreds of MiB or more in one worker. JSON structural data also expands during `JSON.parse`, even when the raw response remains just below the cap.

An endpoint can exploit this without lying about a document: it can return a near-cap malformed or structurally expansive JSON body for every legitimate asset request. Cross-origin initiators do not need to read the responses to make requests to the gateway origin, and a normal contract document can naturally fan out many resource requests.

**One-line reproduction:** request 64 gateway resources concurrently while the first configured endpoint returns a just-under-16-MiB malformed JSON body to each; `sw.ts:33-45` launches all calls and permits roughly 1 GiB of in-flight capped bodies before parsing overhead.

### 4. Low — Non-2xx RPC bodies are abandoned without cancellation

**Location:** `src/adapters/rpc/fetch.ts:69`

`fetch()` resolves after response headers are available. For a non-2xx status, `callOne` throws immediately without consuming or cancelling `res.body`, then the failover loop starts the next endpoint. A hostile endpoint can send an error status promptly and continue an unbounded chunked body in the background. With multiple endpoints this creates overlapping response streams and connections. The native timeout signal should eventually abort each fetch at the configured deadline, so the default exposure is bounded to roughly ten seconds per abandoned response, but immediate cancellation is missing and the 16 MiB cap is never applied to these bodies.

**One-line reproduction:** make endpoint 1 reply `HTTP 500` immediately and stream an endless chunked body; line 69 starts endpoint 2 without `res.body.cancel()`, while endpoint 1 continues until abort/collection.

### 5. Low — Attacker-controlled `sessionStorage` values defeat the reload-loop guard

**Location:** `src/adapters/sw/boot.ts:24`

The guard parses same-origin `sessionStorage` with `Number` but never verifies that the count and timestamp are finite non-negative integers. Same-origin contract code can store a fresh count of `2` and force the next uncontrolled boot to skip worker installation and enter the limited inline fallback. More subtly, `NaN:<fresh timestamp>` makes `n` become `NaN`; `${n + 1}` remains `NaN`, and `attempt() >= MAX_ATTEMPTS` is always false. In exactly the repeated-uncontrolled-reload condition the guard is meant to stop, that value prevents the limit from ever firing.

The direct effect is session/tab-local availability. It becomes cross-contract in the multi-chain and loopback shapes because one contract can seed the shared counter, unregister the shared worker, and leave other prefixes unable to recover normally.

**One-line reproduction:** before an uncontrolled boot-page load run `sessionStorage.setItem('gw44:boot','NaN:'+Date.now())`; every call to `attempt()` returns `NaN`, so the `>= 2` stop condition at line 76 never becomes true.

### 6. Low — URL-controlled request calldata has no size or item-count limit

**Location:** `src/core/abi.ts:98`

All decoded path segments and every query entry are copied into ABI structures and then copied again into a hex string and JSON-RPC request. There is no limit on URL length, segment count, parameter count, or total encoded calldata. A long URL therefore causes multiple proportional allocations in `encodeString`, `encodeArray`, `concat`, `bytesToHex`, and `JSON.stringify`; a request with many small parameters also creates large arrays and loop overhead. This request-side work is outside the RPC response cap.

The impact is client-side CPU/memory use and an oversized POST to a public endpoint. It is limited by browser/platform URL constraints, so this is Low rather than Medium, but an already installed service worker processes programmatically constructed URLs before a static host can reject their request-line length.

**One-line reproduction:** with the worker installed, navigate an image or frame to a valid gateway resource whose query contains several MiB of repeated `a=` parameters; `encodeRequest` creates the ABI buffers, a roughly doubled hex string, and the JSON request without a gateway-side bound.

## Reviewed routing and response decisions without a separate finding

- **Contract selection:** the single-contract pinned shape ignores hostname and treats every path-like chain/address string as that configured contract's resource. The multi-chain shape accepts only an exact percent-decoded first segment that is an own key of `pins.contracts`; other prefixes throw before an RPC call. The unpinned build uses only `parseTarget`: host form intentionally permits an arbitrary address on a configured chain, and path form is gated on a loopback hostname. I did not find a percent-encoding or shape-confusion path from either pinned shape to an unconfigured contract.
- **Redirects:** all three generated redirect strings begin with `/`; the chain/default component is validated decimal configuration, and path-form redirects reuse the already-parsed pathname. Query strings are retained and the boot path explicitly retains the fragment. `new URL(target.redirect, url)` therefore stays on the request origin and within the selected configured prefix where a prefix exists.
- **Status, headers and types:** contract status is restricted to `200..599`; null-body statuses are stripped; header names are allowlisted and values exclude HTTP control bytes; fixed `no-store` and `nosniff` headers are added. Active content types intentionally execute contract bytes with origin authority, which is the cross-contract impact in finding 2 rather than a separate injection finding.
- **Inline fallback:** `document.write` intentionally executes a root contract's HTML in the live origin. It is restricted to a top-level root target and root responses currently cannot carry contract-selected policy headers. That does not create a separate boundary inside a single-contract origin, but it participates in finding 2 when several contracts share the origin.
- **Fetch listener:** it responds only to same-origin `GET`/`HEAD` requests that name a target; cross-origin requests, non-read methods, and unowned URLs are left to the browser/static host. The service-worker script URL is reached from the network by service-worker update fetching, while ordinary pinned-origin requests of that name can be contract resources.
- **ABI decoding:** attacker-controlled offsets, lengths and array counts are bounds-checked; integer words are restricted to a safe six-byte range; header count and decoded header text are capped before text allocation. I did not find a read past the buffer or an allocation directly sized by an unchecked ABI word.

