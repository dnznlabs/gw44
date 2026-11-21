# gw44 gateway — adversarial review, leg "opus"

## What this leg could not do

- **Nothing was executed.** The review is a static reading of the 15 scoped files. I did not run the
  build, a test, a bundler or a browser, and there was no network. Claims about what a browser does
  (cookie scoping, service-worker interception rules, `AbortSignal.timeout` availability, JSON parser
  memory behaviour) come from my knowledge of the specs and engines, not from a run. Where a claim
  depends on engine behaviour I could not check, the finding says so.
- The tree was left untouched. No file was written inside it.

## Severity scale

| Severity | Meaning |
|---|---|
| **Critical** | With no precondition beyond a visitor following a link, attacker script runs in an origin it should not reach, or a URL reaches a contract the build did not configure. |
| **High** | Control of one input the build accepted (one configured contract, or one configured endpoint) gives authority over a *different* trust domain than that input should have: another chain's app, its storage, or its wallet permissions. |
| **Medium** | A hostile contract or endpoint can affect visitors of *other* contracts or origins in a bounded way (DoS, state injection, forced stale code), or a build input silently ships something dangerous. |
| **Low** | Availability or hardening problems with a narrow precondition, or an attacker effect that something else the attacker already has dominates. |
| **Info** | Inconsistencies, dead code, or invariants that do not hold as stated but have no demonstrated effect. |

I found no Critical. In every shape, no URL I could build reaches a contract the build did not
configure (see § Which contract a URL reaches, which shows the work). The findings cluster around
**origins shared between trust domains** and the **RPC client**.

---

## Findings

### H1 — Several-chains shape: the weakest chain's contract *or its first RPC endpoint* gets full script authority over every other chain's state, storage and wallet permissions

- **Where:** `src/core/target.ts:195-226` (`pinnedTarget`, every chain under one origin),
  `src/core/target.ts:20-29` (the design note), `src/core/resolve.ts:40,63` (`frame-ancestors 'self'`,
  which names the shared origin), `src/core/resolve.ts:83` (contract-chosen content type),
  `tools/build.ts:50-63` (each chain keeps its own endpoint list, so the trust bases differ per chain).
- **Severity: High.** The comment in `target.ts:20-29` documents this as a decision, so the rollup may
  downgrade it. I keep High because what it costs is not stated anywhere: a multi-chain project nearly
  always pairs a mainnet with testnets (the comment at `abi.ts:17` measures "both testnets"). The
  precondition is controlling *either* a testnet contract (often deployed from a hot dev key, or
  upgradeable) *or* the first public endpoint listed for that testnet. Either one is enough for full
  same-origin script on the origin where the mainnet app's wallet connection, storage and cookies
  live. Trusting an endpoint to tell the truth about its own chain is accepted. Trusting it with
  *every other* chain is not inherent; the shared origin causes it.
- **What it allows**, from a document on chain B served at `/<B>/…`:
  - read and write chain A's `localStorage`, `IndexedDB`, `sessionStorage` (same tab) and
    `document.cookie`, which lets it poison any state chain A's app reloads;
  - `fetch('/<A>/…')` and read the result, and `window.open('/<A>/')` and script that window's DOM
    directly (same origin);
  - frame chain A's root: `frame-ancestors 'self'` (`resolve.ts:40`) is satisfied because 'self' is
    the shared origin, so the root framing rule protects nothing between chains;
  - use the EIP-1193 wallet permission the visitor granted to chain A's app, because wallets key
    permissions by origin, and ask for signatures and transactions under the same origin string the
    visitor already approved;
  - `navigator.serviceWorker.getRegistration().then(r => r.unregister())`, which removes the gateway
    worker for every chain.
- **Reproduction:** `gw44.json` = `{"default":"1","contracts":{"1":"0xAAA…","11155111":"0xBBB…"}}`.
  The Sepolia contract's `request(["x"],[])` returns `(200, "<script>ethereum.request({method:'eth_sendTransaction',params:[…]});fetch('/1/').then(r=>r.text()).then(steal)</script>", [["content-type","text/html"]])`.
  A visitor who connected their wallet at `/1/` and then opens `/11155111/x` gets a transaction
  request from the origin they approved, and the chain-1 app's storage goes to the attacker. The same
  thing happens with no contract compromise at all if the first Sepolia endpoint in the chains file
  returns that ABI-encoded tuple as `result` for any `eth_call`.

### M1 — Unpinned host form: every contract is a sibling subdomain of one registrable domain, so contracts can toss and bomb each other's cookies, block each other's boot page and worker updates, and frame each other's sub-paths with unpartitioned state

- **Where:** `src/core/target.ts:78-95` (host form `<address>.<chain>.<any base>`); the effect lands
  on `src/adapters/sw/boot.ts` (boot page fetched from the static host) and on the worker update
  fetch of `/gw44-sw.js` (`boot.ts:90`, `updateViaCache: "none"`).
- **Severity: Medium.** "Every contract its own origin" holds, but every contract is the same *site*.
  Unless the base domain is on the Public Suffix List, a hostile contract on its own origin can do
  things that reach every other contract's origin and the project's own apex.
- **Effects:**
  1. **Cookie bombing → cross-contract DoS and a pinned stale worker.** The contract's own document
     sets `document.cookie` with `Domain=<base>`. Every later request from that browser to any
     `*.<base>` origin carries the cookies, including the static-host fetches the gateway depends on:
     the boot page on a first visit and the worker script on every update check. Once the cookie
     header is past the CDN's request-header limit, the static host refuses those requests.
     First visits to every other contract fail. Already-installed workers keep serving, but **their
     update checks fail, so the visitor is stuck on whatever worker version they had**, including
     one a security fix was meant to replace.
  2. **Cookie tossing.** Cookies with `Domain=<base>` are readable through `document.cookie` by every
     other contract's documents and are sent to any other service the project runs under `<base>`.
     That is session fixation or state injection for any app that uses cookies.
  3. **Same-site framing of sub-paths with real state.** A frame from contract A of
     `https://0xB….1.<base>/app` is same-site, so it gets B's *unpartitioned* storage and B's
     first-party worker registration. Only the root has a framing rule (`resolve.ts:63`), so a
     sub-path of B without its own `x-frame-options`/CSP can be clickjacked against the visitor's
     real B session. A cross-site framer would get partitioned storage instead.
  4. **WebAuthn `rp.id = "<base>"`** is valid on every contract origin, so passkeys one contract
     registers under the base domain can be asserted by any other contract.
  5. **Domain reputation:** Safe Browsing-style blocklists act at host or registrable-domain level, so
     one contract that serves phishing or a malicious download (`content-disposition` is passed,
     `resolve.ts:13`) can put a warning in front of every contract on the gateway.
- **Reproduction:** contract `0xAAA…` on chain 1 has `html()` return
  `<script>for(let i=0;i<180;i++)document.cookie='c'+i+'='+'x'.repeat(3900)+';domain=gw.example;path=/;max-age=31536000;secure'</script>`.
  After one visit to `https://0xaaa….1.gw.example/`, a first visit to `https://0xbbb….1.gw.example/`
  sends roughly 700 KB of `Cookie` header to the static host and gets a 4xx instead of the boot page,
  and the worker on any origin the visitor already uses can no longer update.

### L1 — Contract sub-path documents have no framing rule by default

- **Where:** `src/core/resolve.ts:60-65` (only `html()` gets `frame-ancestors`),
  `src/core/resolve.ts:67-88`, `src/adapters/sw/boot.ts:52` (the top-level check guards only the
  inline path; the worker path also installs inside a frame).
- **Severity: Low** for cross-site framers (with storage partitioning the frame gets fresh state).
  The same-site case is folded into M1.3 above.
- **Reproduction:** `https://evil.example/` contains `<iframe src="https://gw.example/app">`. The boot
  page loads in the frame, registers a partitioned worker and reloads (`boot.ts:85-101`; nothing on
  that path checks `window.top`). The worker then serves the contract's `/app` with only the headers
  the contract chose. If those don't include `x-frame-options` or CSP, the page is framed and can be
  clickjacked. A contract that serves its main UI from a sub-path, not from `html()`, gets no default
  protection.

### L2 — A hostile endpoint can make the worker allocate hundreds of MB per call inside the 16 MiB cap

- **Where:** `src/adapters/rpc/fetch.ts:70-71` (`readCapped` then `JSON.parse` of the whole body);
  the cap at `fetch.ts:30` counts wire bytes, not what they parse to.
- **Severity: Low.** This is resource exhaustion as the brief defines it. It is dominated by what a
  hostile endpoint can already do (serve a script-bearing document), so it adds availability damage
  only. It is not a wrong-document finding: the `result` can be correct and the document served
  correctly while the memory is still spent.
- **Reproduction:** the endpoint answers
  `{"jsonrpc":"2.0","id":1,"result":"0x<correct return data>","pad":[[[[…]]]]}` with about 8 M nested
  `[` / `]` filling the rest of 16 MiB. Each nesting level becomes one engine array (tens of bytes
  plus a backing store), so one call allocates on the order of 300–500 MB, against an expected
  ~16 MiB string and an 8 MiB buffer. A page with a dozen subresources does this a dozen times
  concurrently and the browser kills the worker. (`[{},{},…]` gives a similar blow-up. Engine numbers
  are estimates; I did not run them.)

### L3 — A broken endpoint whose error message contains "revert" turns every request into a 404 and skips failover

- **Where:** `src/adapters/rpc/fetch.ts:39-41` (`/revert/i` on any error message, or `code === 3`),
  `fetch.ts:73`, `fetch.ts:89` (an `RpcRevert` ends the endpoint loop), `src/core/resolve.ts:104-106`.
- **Severity: Low.** This is about a *broken* endpoint, not a lying one: a substring match on
  free-text provider errors stops the failover the endpoint list exists to provide.
- **Reproduction:** the first endpoint for chain 1 answers every call with
  `{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"internal error: state reverted, retry"}}`
  (or any message containing "revert", such as a provider's "…cannot revert to snapshot…"). Every URL
  on that chain becomes `404 gw44: the contract does not serve this resource`, and the second
  endpoint is never tried.

### L4 — A non-2xx endpoint response is never cancelled; its connection is held until the timeout fires

- **Where:** `src/adapters/rpc/fetch.ts:69` (throws on `!res.ok` without `res.body?.cancel()`).
- **Severity: Low.** The response is released only when `AbortSignal.timeout(timeoutMs)` aborts it
  10 s later. Meanwhile failover has moved on, so one call can hold a connection to every failed
  endpoint at once.
- **Reproduction:** the endpoint returns `HTTP 429` with a body that trickles one byte per second.
  Each gateway request leaves that response open for 10 s. A page with 30 subresources holds 30
  responses on the failing endpoint while the gateway is already on endpoint 2, which on HTTP/1.1
  uses up the 6-connection-per-host pool for that endpoint and queues later calls behind dead ones.

### L5 — Browsers with service workers but without `AbortSignal.timeout` fail every request, and the 502 blames the endpoints

- **Where:** `src/adapters/rpc/fetch.ts:62`. The `TypeError` is thrown inside `callOne`, swallowed at
  `fetch.ts:88-91`, and reported at `fetch.ts:93`.
- **Severity: Low** (availability, plus a misleading error). Safari 15.x has service workers and
  `fetch` but no `AbortSignal.timeout` (added in 16.0), and devices stuck on iOS 15 cannot update.
  Both the worker and the inline fallback (`boot.ts:54`) use this client.
- **Reproduction:** open `https://gw.example/` in iOS 15 Safari. Every endpoint "fails" before a byte
  is sent and the page shows `gw44: no RPC endpoint for chain 1 answered`. (Availability numbers are
  from memory; not checked here.)

### L6 — Nothing ties an endpoint to its chain: a chains-file mistake serves a contract the build did not configure

- **Where:** `tools/chains.ts:33-58` (validates the URL shape only), `tools/build.ts:54-61`,
  `src/adapters/rpc/fetch.ts:57-78` (`eth_chainId` is never asked, at build time or run time).
- **Severity: Low.** It needs a deployer error, but the build ships that error silently, and the
  effect is exactly "a URL reaches a contract the build did not configure". Contract addresses are
  not unique across chains: the same address on another chain may hold someone else's code (another
  deployer with the same nonce, or a CREATE2 factory and salt reused by a third party).
- **Reproduction:** `chains.json` = `{"1":["https://<an OP-mainnet RPC>"]}` and `GW44_PIN=1:0xAAA…`.
  The build succeeds and prints `pinned to 1:0xaaa…`, but every visitor is served whatever
  `0xAAA…` is on chain 10.

### L7 — The chains file lets loopback `http:` endpoints and credential-bearing URLs into a public deployable

- **Where:** `tools/chains.ts:44-55` (accepts `http:` on any loopback host, and any `https:` URL
  including userinfo and private addresses), `tools/build.ts:75` (compiled into both
  `gw44-sw.js` and the inline boot script in `index.html`/`404.html`).
- **Severity: Low.**
  - `http://localhost:8545` is valid for a dev build, and the build cannot tell a dev build from a
    deploy. Shipped, it makes every visitor's browser send `eth_call` to *their own* loopback first.
    Browsers treat localhost as potentially trustworthy, so mixed-content blocking doesn't stop it.
    Whatever listens there (a local anvil or hardhat node that answers CORS with `*`, or any local
    process) then decides the document.
  - A keyed endpoint (`https://…/v3/<API_KEY>`) is published in plaintext in two files. In an
    unpinned build, every contract on the gateway can then spend that key's quota from its own
    visitors' browsers.
  - `https://user:pass@rpc.example/` passes validation, but `fetch` refuses URLs with credentials
    (`TypeError`), so that endpoint is silently dead for every visitor.
- **Reproduction:** `chains.json` = `{"1":["http://localhost:8545","https://mainnet.infura.io/v3/abc123"]}`.
  `node tools/build.ts` succeeds. `dist/index.html` contains `abc123`, and a visitor with port 8545
  open is served from it.

### I1 — The reserved worker path is matched on the raw pathname, so a percent-encoded spelling reaches the contract

- **Where:** `src/adapters/sw/sw.ts:45` (`url.pathname === SW_PATH`) against
  `src/core/target.ts:66-73` (segments are percent-decoded afterwards).
- **Severity: Info.** The invariant in `config.ts:30-31` ("a contract's own resource of this name is
  shadowed rather than served") does not hold. I found no exploit: worker registration and update
  fetches bypass the worker, so this cannot plant a worker script.
- **Reproduction:** in a pinned build, `GET /%67w44-sw.js` is not caught at `sw.ts:45` (the WHATWG
  parser leaves `%67` encoded), decodes to resource `["gw44-sw.js"]`, and serves the contract's
  `request(["gw44-sw.js"])` bytes with the contract's content type.

### I2 — Status 300–399 is accepted, although the comment says 3xx without `Location` is not a document

- **Where:** `src/core/resolve.ts:70-73`. `location` is not in `PASSED_HEADERS`, so every 3xx a
  contract returns is a redirect status with no target.
- **Severity: Info.**
- **Reproduction:** `request()` returns `(302, "<html>…", [["content-type","text/html"]])`. It passes
  the range check and is served as a 302 with no `Location`. What the browser does with it is
  engine-defined (it renders the body, or shows a network error for the navigation).

### I3 — `access-control-allow-origin` and `cross-origin-resource-policy` are passed but cannot take effect

- **Where:** `src/core/resolve.ts:19-20`.
- **Severity: Info.** A cross-origin request to the gateway origin is never handled by the gateway's
  worker. It goes to the requesting client's own worker or to the network, and then to the static
  host. The worker only answers same-origin requests (`sw.ts:37`), where CORS doesn't apply. A
  contract that sets ACAO expecting other origins to read its resources gets the static host's
  `404.html` instead. This is harmless, but it reads as though cross-origin access were possible.

### I4 — The inline-boot escape is not meaning-preserving in every JavaScript context

- **Where:** `tools/inline.ts:23`.
- **Severity: Info.** `<\!--` is an invalid identity escape inside a regular expression with the `u`
  or `v` flag (a `SyntaxError` that kills the whole boot script), and inside `String.raw` it changes
  the string's value. Today the only inputs are the project's own code and JSON-stringified endpoint
  strings (where `\!` is harmless), so nothing breaks now. The escape is safe for HTML, and the
  question here is whether the JavaScript still means the same thing.
- **Reproduction:** boot code containing `/<!--/u.test(s)` becomes `/<\!--/u.test(s)` in
  `index.html`, and the page throws on load.

### I5 — An endpoint string is compiled as written, not as validated

- **Where:** `tools/chains.ts:46` (validates `new URL(endpoint)`), `tools/chains.ts:55` (stores the
  raw `endpoint`).
- **Severity: Info.** The URL parser strips tab and newline characters anywhere in the input, and
  `fetch` parses the same way, so there is no time-of-check/time-of-use gap. But a reviewer reading
  the chains file and the visitor's browser can see different hosts.
- **Reproduction:** `"https://rpc.example.com\n.attacker.net/"` shows on screen as `rpc.example.com`
  followed by a second line, and both the validator and the visitor's browser use
  `https://rpc.example.com.attacker.net/`.

### I6 — The loop guard is not a boundary against same-origin documents, and it misfires on quick forced reloads

- **Where:** `src/adapters/sw/fallback.ts:77-90`, `src/adapters/sw/boot.ts:27-36,85`.
- **Severity: Info.** A document on the origin can write any value, including a fresh
  `"0:<Date.now()>"`, which resets the counter. A document that wants a reload loop can call
  `location.reload()` itself, though, so nothing is gained. The guard prevents accidental loops,
  not hostile ones, and should be described that way. Separately, a visitor who force-reloads
  (shift-reload) a *sub-path* three times within 10 s in a browser *with* working service workers
  reaches `attempt() >= MAX_ATTEMPTS`, falls into `renderInline`, and is told
  `this page needs a service worker, and this browser is not providing one here`.
- The redirect at `boot.ts:77` runs before the guard and is not counted. A static host that
  canonicalises `/<chain>/` back to `/<chain>` (a trailing-slash-stripping host) would loop it
  forever. I don't know of a host in the README's list that does; I'm noting it because no guard
  covers that path.

### I7 — Dead pass-through in `handle`

- **Where:** `src/adapters/sw/sw.ts:20`.
- **Severity: Info.** `handle` is only called when `targetOf(url)` was non-null at `sw.ts:52`, and
  `targetOf` is deterministic, so `fetch(url)` is unreachable. If it were ever reached it would drop
  the request's method, headers, mode and credentials. It could be removed, or changed to forward
  `event.request`.

---

## Surfaces looked at, with what was checked (including clean results)

### Which contract a URL reaches

- **Unpinned** (`target.ts:86-105`). Host form needs label 0 to match `^0x[0-9a-f]{40}$` and label 1
  to match the chain rule. The browser has already lower-cased the hostname, and a leading-zero
  chain returns null, which falls through to the static host. So each contract has one canonical
  origin, apart from a trailing-dot variant, which is a separate origin holding the same contract
  (harmless). Path form is reached only when the hostname is loopback. On a public host it returns
  null and the static host answers. Percent-encoding in the path can change the resource but never
  the chain or address. `%2F` inside the address segment fails the address rule, and `%2e%2e` is
  collapsed by the URL parser before `segments` sees it.
- **One contract** (`target.ts:200-202`). The address is always `pins.default`, and a path in path
  form (`/5/0xBBB…/`) is only a resource of the pinned contract. Clean.
- **Several chains** (`target.ts:204-225`). The first decoded segment must be an own key of
  `pins.contracts`, and keys are validated digits (`target.ts:151`), so `__proto__` and friends can't
  occur. `/%31/` reaches chain 1, which is configured. Anything else throws `not-found` before any
  call. Clean.
- **What ships.** `__GW44_PINNED__` is a boolean define (`build.ts:78`), so each bundle carries one
  parser. Even without folding, the ternary at `config.ts:23-25` picks exactly one at load. The
  unpinned bundle ships the loopback path-form parser to production. Public visitors never present
  a loopback hostname, so it is unreachable there. I found no URL, in any shape, that reaches an
  unconfigured contract. **L6** is the one way an unconfigured contract gets served, and it comes
  from a build input, not a URL.

### Redirects built from a request URL

- `target.ts:103` (path form): `${url.pathname}/${url.search}`. The pathname must decode to
  `/<[1-9]…>/<address>`, so it cannot begin with `//` (`\` is already `/` for special schemes). It
  stays same-origin and is resolved against `url` at `sw.ts:22`.
- `target.ts:213,222` (several chains): the chain part is a configured key, and only the query is
  carried over. The root redirect drops whatever followed an empty first segment (`//x/y` →
  `/<default>/`). The browser keeps the fragment across the worker's redirect, and `boot.ts:77`
  appends it explicitly. Nothing found can leave the origin or the configured prefix.

### Status, headers and content type a contract chooses

- Header names go through an exact allowlist after `toLowerCase()`. Values must match
  `^[\t\x20-\x7e]*$` (`resolve.ts:30`), so CR, LF and NUL can't get in, and `Response` construction
  can't be made to throw. The fixed headers come after the contract's (`resolve.ts:43`) and aren't
  in the allowlist, so `cache-control` and `nosniff` can't be overridden. A contract-chosen
  `text/html` or `image/svg+xml` runs script on the serving origin. That matters only where the
  origin is shared (**H1**, and the same-site effects in **M1**). `content-disposition` can force a
  download with a contract-chosen filename from the gateway's domain (M1.5). See also **I2** and
  **I3**.

### Contract bytes written into the page (`boot.ts:48-62`)

- It renders only when the page is top-level (`boot.ts:52`), the target is the root (`boot.ts:53`),
  the status is 200 and the type is `text/html`, and every header is either honourable or exactly
  `frame-ancestors 'self'`. The script the written document contains runs with the same authority
  it would have under the worker. The same-origin concerns are the ones in H1 and M1. The headers
  that apply are the static host's, not `no-store`/`nosniff`, and with `404.html` the document
  renders under HTTP 404. Nothing else found.

### The worker's `fetch` listener (`sw.ts:34-58`)

- Cross-origin requests and anything other than GET or HEAD fall through to the network. The
  worker's own path is caught by an exact match, which a percent-encoded spelling gets past (**I1**).
  A malformed URL is answered by the worker. HEAD still makes the chain call. Request headers, mode
  and Range are ignored (a `<video>` gets a full 200). A contract can't register a worker of its own:
  registration bypasses the gateway worker and the static host serves only `gw44-sw.js` as script.
  It can still unregister the gateway's (H1, M1).

### The boot page's loop guard and `sessionStorage`

- See **I6**. When the stored value can't be read as a counter it counts as `MAX_ATTEMPTS`, which
  fails safe in the direction the comment intends.

### JSON-RPC client

- See **L2**, **L3**, **L4**, **L5**. The timeout signal is attached to the fetch, so it also bounds
  body reading. `n × timeoutMs` per call is documented (`fetch.ts:47-52`). Redirects are followed
  (no `redirect: "error"`), so an endpoint can bounce the POST to any `https` URL. That is the
  endpoint lying, so I'm noting it, not reporting it.

### ABI decoder (`abi.ts`)

- Clean. Every word read is bounds-checked (`abi.ts:109`). Values are limited to 48 bits, so
  `start + length` stays a safe integer. The body is a `subarray`, so nothing is allocated from a
  claimed length. There are at most 64 headers, and the header byte total is checked *before*
  decoding (`abi.ts:156-159`). Aliased offsets can't amplify, because of that total. `hexToBytes`
  allocates from the actual string length, which the response cap bounds, and makes a single pass.

### The build as an injection point

- `define` values are `JSON.stringify` output, which esbuild parses as JSON literals. No string in a
  chains or config file can become code. Chain ids, addresses and `frame` are validated. `inlineBoot`
  closes both HTML escape hazards for the bundle as it exists today (see **I4** for where the escape
  would change meaning). See **L6**, **L7** and **I5** for what a wrong or surprising input ships.

### Chains of one project sharing one origin

- See **H1**.
