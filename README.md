# DNZN // GW44

A web gateway built specifically for contract-hosted, on-chain dapps: front ends a contract serves itself through [ERC-8244](https://eip.tools/eip/8244) `html()` and [ERC-5219](https://eips.ethereum.org/EIPS/eip-5219) `request()`.

by **Denizen.** // dxnzn.wei

## How it Works

The gateway is two static files. A page shell installs a service worker, and from then on the worker answers every `GET` for a URL on the contract's origin by calling the contract from the visitor's browser, straight to a public RPC endpoint: `html()` for the page, `request()` for each file the page loads from that origin. Where service workers are unavailable, the shell makes the `html()` call itself.

That is the only time the gateway's RPC endpoint is used: to load the dapp. Once the dapp is running, its chain traffic is its own. Calls through a connected wallet go to the wallet's endpoint, calls the dapp makes directly go wherever it sends them, and the worker passes both through untouched.

There is no gateway server, so there is nothing between the chain and the reader that can hold a stale copy: nothing is cached, and a document the owner changes is what the next reload shows. Each contract gets its own origin, `<contract>.<chain>.<base>`, so one contract's document cannot touch another's.

```mermaid
sequenceDiagram
    participant B as Browser
    participant H as Static Host / CDN
    participant W as Service Worker
    participant R as RPC Endpoint

    B->>H: GET / (first visit)
    H-->>B: shell
    B->>H: register /gw44-sw.js
    H-->>W: worker installed, page reloads
    B->>W: GET /
    W->>R: eth_call html()
    R-->>W: document
    W-->>B: the contract's page
    B->>W: GET /widget.js
    W->>R: eth_call request()
    R-->>W: status, headers, body
    W-->>B: widget.js
    Note over B,R: Dapp loaded. Its own chain traffic does not pass through the gateway.
```

**Where a browser has no service workers**, the boot page fetches the contract's root document and writes it into itself, so a first visit still shows the dapp at the same URL. That path can only serve the root, and it declines rather than mislead: a page whose real headers are the static host's cannot honour a `content-security-policy`, `x-frame-options` or similar that the contract set, so a contract that sets one gets a short message there instead of its document, and the worker's path instead.

## Motivation

Gateways are where decentralization breaks down for on-chain dapps. The whole point of ERC-8244 is that the code lives on-chain, with no backend. But a browser cannot read a chain, so the page arrives through a gateway, and a hosted gateway is a backend again: a server between the user and the contract that has to be trusted.

gw44 complements ERC-8244 and ERC-5219 by stripping the gateway down to two static files, about 16 KB in total, that can be self-hosted or distributed globally through a CDN.

No backends. Minimal trust boundaries between the user and the on-chain dapp.

## Release Info

### Project Status

| STATUS | VERSION | AUDIT |
|:---|:---|:---|
| `mvp`, test site deployed | `0.0.0` | two-model agent review, 2026-11-20 and 2026-11-21; no external audit; see [SECURITY.md](SECURITY.md) |

The MVP: the spike's prototype hardened, tested in three browser engines and reviewed, with a pinned build that serves one project's contracts from its own domain. What the spike measured and what it could not do are in [docs/spikes/001-static-gateway.md](docs/spikes/001-static-gateway.md).

Alpha software is alpha, act accordingly. See [Disclaimer](#disclaimer).

### The test site

**`https://gw-test.dnzn.dev`** serves a two-chain build of the rake fixture — the same contract on Sepolia (`11155111`, the default) and Base Sepolia (`84532`), from [`test/fixtures/gw44.two-chains.json`](test/fixtures/gw44.two-chains.json). So `/` redirects to `/11155111/`, `/84532/` serves that chain's document, and any other first path segment is a 404 with no chain call.

It also carries a static copy of each chain's `widget.js`, at `/<chain id>/widget.js`, for host pages that embed the widget with a `<script src>` — a service worker can only answer pages on its own origin, so an embed needs a real file. Each copy is written only after the bytes have been read twice, through the gateway's core and through `cast`, and the deploy prints the `integrity` snippet that pins it.

It exists to be checked, not to be depended on: it is a testnet fixture on a hostname that may be rebuilt or repointed without notice, and it is deployed by a workflow somebody runs by hand, never on a push. That workflow ([`.github/workflows/pages-test.yml`](.github/workflows/pages-test.yml)) is itself only a caller of the reusable [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) — the same workflow any project calls to deploy its own gateway from its own repository — so the path a project takes is the path this site is built by. `make check-site URL=https://gw-test.dnzn.dev` checks a deployed gateway in a browser, and `VERIFY_SITE=https://gw-test.dnzn.dev make verify` compares the bytes it serves with what the chain returns.

### Disclaimer

Alpha software. Nothing here has been reviewed by anyone but its authors, and there is no external audit ([SECURITY.md](SECURITY.md)). No warranty. gw44 shows what a contract and an RPC endpoint return and vets neither: the document is the contract owner's, not ours, and one endpoint's answer is taken as the chain's. A dapp loading through gw44 says nothing about whether it is safe to connect a wallet to.

### URLs

| FORM | URL | WHERE |
|:---|:---|:---|
| host | `https://<contract>.<chain>.<base>/<path>` | anywhere; the public form |
| path | `http://localhost:8244/<chain>/<contract>/<path>` | loopback only |

`<chain>` is the decimal chain id and `<contract>` the 0x address. The path form puts every contract on one origin, so the gateway refuses it on any host that is not loopback. The host form also works locally: `http://<contract>.<chain>.localhost:8244/`.

### What it does not do

- **Answer another site's `<script src>`.** A service worker serves its own pages only. A third-party page that embeds `https://<contract>.<chain>.<base>/widget.js` gets the page shell, not the script. This is the limit of having no server, and [the roadmap](docs/ROADMAP.md) carries the decision it forces.
- **Answer `curl`, crawlers or link previews.** They get the shell too. `make get URL=<url>` resolves a gateway URL through the same code without a browser.
- **Verify the RPC endpoint.** One endpoint's answer is taken as the chain's.
- Names and custom domains yet; they are the roadmap's last milestone.
- IPFS, the other `web3://` resolve modes, compressed `request()` bodies.

## Documentation

| DOCUMENT | DESCRIPTION |
|----------|-------------|
| [Roadmap](docs/ROADMAP.md) | Milestones, decisions and status |
| [Spike 001](docs/spikes/001-static-gateway.md) | Whether a gateway with no backend works, measured |
| [Security](SECURITY.md) | Trust model, the review of record and its findings, what the gateway defends and what it does not |
| [Audits](audits/README.md) | How the code is reviewed: two blind adversarial legs and a rollup, and what the method does not claim |
| [Working Conventions](AGENTS.md) | Layout, commands and gotchas for contributors, human or agent |

## Development

### Common Helpers

```bash
make init           # Initialize the development environment (devbox, git hooks)
make serve          # Build, then serve on http://localhost:8244/<chain>/<contract>/
make check          # Typecheck, unit tests, browser tests
make verify         # Prove the gateway serves what a live chain returns (network)
make browsers       # Install Playwright's browsers for ENGINES
make get URL=<url>  # Resolve one gateway URL without a browser
make build PIN=…    # Build for one contract only (see The pinned build)
make build CONFIG=… # Build for one project's contract on each of several chains
make help           # List every command
```

Node 24 and `process-compose` come from `devbox`; run the targets through `devbox shell` or `devbox run -- make <target>`.

**Browser engines.** `make e2e` runs the browser suite once per engine in `ENGINES`, in order, stopping at the first failure; the default is `ENGINES=chromium`. The names are `chromium`, `firefox` and `webkit`, and any other name fails rather than being skipped. `make browsers` downloads them into Playwright's cache — Chromium arrives as `chromium-headless-shell`.

**Only Chromium is expected to run on a plain checkout.** Firefox and WebKit need system libraries that are not part of `devbox`, so on a machine without them `make e2e ENGINES=firefox` fails at launch with Playwright's "Host system is missing dependencies" and a list. That is a failure and not a skip, deliberately. The three engines all run in CI, which installs the libraries with `playwright-core install --with-deps`.

To run them locally, `sudo npx playwright-core install-deps firefox webkit` once. That install is enough **because** `make e2e` sets `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` (`mk/10-gateway.mk`): Playwright's pre-launch check shells out to `ldd`, and under `devbox run --` that is nix's `ldd`, which cannot see system libraries however they were installed. Without the skip the install would make no difference and the engines would still refuse to start.

### The pinned build

```bash
make build PIN=11155111:0x00a9f390a6010d045e0d34856048ddd6910d25ba
```

The same three files, built to serve **one** contract at **every** URL on the origin you host them on — so `https://your-domain.example/` is that contract's document and `https://your-domain.example/widget.js` is its `widget.js`. The pin is compiled in, exactly as the endpoints are: there is no URL on a pinned build that reaches a second contract, and the hostname is never read, so neither the `<address>.<chain>.<host>` form nor the `/<chain>/<address>/` form means anything there. A path that looks like the second form is just a path, and is asked of the pinned contract as a resource of that name.

Only the pinned chain's endpoints are compiled in. Point `GW44_CHAINS` at a file of your own to use your own endpoints rather than the public ones in [`chains.json`](chains.json):

```bash
GW44_CHAINS=my-chains.json make build PIN=11155111:0x00a9f390a6010d045e0d34856048ddd6910d25ba
```

### Several chains: the configuration file

A project deployed to more than one chain names its contract on each, by convention in a `gw44.json` in its own repository:

```json
{
  "default": "1",
  "contracts": {
    "1": "0x00a9f390a6010d045e0d34856048ddd6910d25ba",
    "8453": "0x00d19609f2349d4160d2babaf46b0cd1ec6d7f8e"
  }
}
```

```bash
make build CONFIG=gw44.json
```

One more key is accepted, and no others:

| Key | Values | Default | What it does |
|:--|:--|:--|:--|
| `frame` | `"self"`, `"any"` | `"self"` | Who may put a root document in a frame. `"self"` serves it with `content-security-policy: frame-ancestors 'self'`, so only the project's own pages may frame it; `"any"` omits the header and lets any site frame it. |

`"any"` is for a project whose page is meant to be embedded. The setting is those two words and not a policy of its own: a project that needs more serves its page from `request()`, where it sets its own headers. A `PIN=` build has no configuration file and takes the default.

The URL layout follows the count, and only the configured chains' endpoints are compiled in:

| Configuration | `/` | `/<chain>/` | anything else |
|:--|:--|:--|:--|
| One contract | the contract's `html()` | a resource of that contract | a resource of that contract |
| Several | redirects to `/<default>/` (302) | that chain's contract | 404, with no call to any chain |

With one contract the build is byte-identical to the equivalent `PIN=<chain>:<address>`, so a project that grows a second chain changes its configuration file and nothing else.

**An application served under `/<chain>/` must use relative URLs.** An absolute `/widget.js` leaves the prefix, reaches no configured chain and is answered with a 404 rather than being quietly served from the default chain — which is the point: a document must not be able to read another chain's contract by accident.

**The chains of one project share an origin**, so the browser gives them one storage area, one service worker registration and one set of wallet permissions. An application that keeps per-chain state must separate it by chain id itself; nothing in the origin does that for it. One project per origin is the deliberate boundary — two projects never share one, so no project's storage is reachable from another's document.

An owner can put the result on a domain of their own, with no dependence on a public gateway existing. What the host has to do is serve those three files over HTTPS and answer every unknown path with `index.html` — on GitHub Pages, `404.html` already does this. No wildcard DNS and no wildcard certificate are needed, because one pinned deployment is one hostname.

**`make verify` is the one target that reaches a live chain**, and it is not part of `make check` and not in CI. It reads the fixture contract on Sepolia and Base Sepolia through the endpoints in [`chains.json`](chains.json), decodes the ABI with `cast` and shell arithmetic rather than with anything under `src/`, and compares both hashes with what `tools/get.ts` serves; it finishes by loading the document in headless Chromium. So it needs the network and those two chains reachable. `VERIFY_CHAINS` and `VERIFY_ADDRESS` override what it checks, and `VERIFY_STATUS` the status an ERC-5219 resource must answer. It checks the pinned build too: per chain, the same bytes resolved through a pin from a URL that names no contract, and the pinned document loaded in a browser on its own port.

The RPC endpoints are [`chains.json`](chains.json), compiled into the worker at build time. To serve another chain, add it there and rebuild; `GW44_CHAINS=<file> make build` uses a different file. Chain `31337` points at `http://127.0.0.1:8545`.

Deploying is copying `dist/` to a static host that answers unknown paths with `index.html` (`404.html` is the same file, for hosts that use that name).

## Development Team

| Name | GPG Key | GitHub | EOA |
|:-----|:--------|:-------|:----|
| Denizen. | [`0DC6C60CFBD5E456`](https://keys.openpgp.org/search?q=CD435BB6A7BED718D95616450DC6C60CFBD5E456) | [`dxnzn`](https://github.com/dxnzn) | [`0x3578...902B`](https://etherscan.io/address/0x357836fFcB45307FA7ff2A574F505753c961902B) *dxnzn.wei* |
| Elanik. | [`70B6B0BB5F26178A`](https://keys.openpgp.org/search?q=DC49D48844590FA752780FFE70B6B0BB5F26178A) | [`elanikk`](https://github.com/elanikk) | [`0x5A15...C50d`](https://etherscan.io/address/0x5A158aF8DC28FE756dB81Ef669e4Db2536bBC50d) *elanik.wei* |
| Lakos. | [`591DE0ECA387697A`](https://keys.openpgp.org/search?q=B7EABCBD80422BCC1AE0B23F591DE0ECA387697A) | [`lakkoss`](https://github.com/lakkoss) | [`0x9a54...4529`](https://etherscan.io/address/0x9a5489bB67d68ABABdA050A3b52d4F98Fe224529) *lakos.wei* |

## License

MIT — see [LICENSE](LICENSE).
