# gw44 · roadmap

gw44 is a static web gateway for contracts that serve their own front end: ERC-8244 `html()` at `/`, ERC-5219 `request()` at every other path, resolved in the visitor's browser with no gateway server. There is no separate spec; this file and the milestone documents are it, and [spike 001](spikes/001-static-gateway.md) is the evidence they rest on.

**Proposed, not approved.** No milestone starts until the Product Owner approves this file.

Milestones run in order. A milestone is done when every acceptance criterion in its `MILESTONE.md` is demonstrably met.

| Milestone | Goal | Status |
|:----------|:-----|:-------|
| [M01 — MVP](milestones/m01/MILESTONE.md) | The prototype hardened into something a stranger can deploy: three browser engines, CI, a reproducible build, a review of record | not started |
| M02 — Public deployment | `<contract>.<chain>.<base>` live for the chains rake uses, on static hosting, with the base domain on the Public Suffix List | not started |
| M03 — Embeds | A third-party page can load a contract's `widget.js` through gw44 | not started |
| M04 — Endpoint trust | A single lying RPC endpoint cannot change what a visitor is served | not started |
| M05 — Names and custom domains | A contract is reachable by name (`<name>.ens.<base>`, `<name>.wei.<base>`, `<name>.gwei.<base>`) and from its owner's own domain | not started |

`MILESTONE.md` for M02–M04 is written when the milestone before it is under way. The MVP is M01; M02 is what makes it usable in public.

## Order

M01 first because M02 publishes whatever M01 leaves, and a public gateway origin is hard to take back. M03 follows M02 because both of its options need the public base domain. M03's decision is wanted earlier than its work: see Decisions, D1.

M04 comes after the deployment because it is the only milestone that is real engineering rather than hardening, and nothing before it depends on it.

M05 is last and lower priority, scoped for after the public deployment (direction given 2026-11-20). It follows M04 because a name adds a second lookup to the same endpoints, and it is better added to endpoints that are already checked. Its scoping has three questions to answer before any task is written, listed under Findings carried forward.

## Decisions

Open. Each becomes a `decision` issue when this roadmap is approved.

**D1 — How a third-party page loads a contract's script.**
- *Question.* A static gateway cannot answer another site's `<script src>`; which mechanism does gw44 offer instead?
- *Options.* (1) A loader: the host page includes one small static gw44 script, pinned by hash, which reads the contract and injects the result. No server; the embed snippet changes shape, and the host's content policy must allow the RPC endpoint. (2) A stateless function at the edge running the same core. The URL keeps the shape rake's snippet has today; the gateway gains a server, though one with no cache and no state. (3) Both.
- *Recommendation.* The loader. It keeps the property the project exists for, and a host can pin it, which it cannot do with a mutable gateway URL.
- *Default and deadline.* The loader, built in M03. Blocks M03 only. It also decides the embed snippet rake publishes, so it is worth ruling before rake's mainnet release rather than at M03.
- *Record.* Here.

**D2 — The name and the base domain.**
- *Question.* Is `gw44` the name, and which domain is the public base?
- *Options.* (1) Keep `gw44` and register a domain for it. (2) Rename before M02.
- *Recommendation.* Decide before M02 starts; after it the name is in URLs other people have published.
- *Default and deadline.* None: M02 cannot start without a domain.
- *Record.* Here.

**D3 — A client-side cache.**
- *Question.* Should the worker cache documents at all?
- *Options.* (1) No cache. Every load is one `eth_call`, measured at 279 ms for a repeat visit; nothing can go stale. (2) A cache keyed by a validator the contract controls, checked before every use. Faster repeat visits by roughly the document's download; a new way to be wrong.
- *Recommendation.* No cache. The measured repeat visit already matches the hosted gateway's (279 ms against 327 ms). Reopen with a measurement that says otherwise.
- *Default and deadline.* No cache; nothing waits on it.
- *Record.* Here.

**D4 — How an owner's own domain reaches their contract.**
- *Question.* The working assumption is that an owner points a CNAME at their contract's gateway host. On static hosting that does not work by itself; which route does gw44 offer?
- *Options.* (1) A pinned build: the owner hosts the two files on their own domain, built to serve one contract at any hostname. No server, no dependence on the public gateway; the owner does a deploy rather than a DNS edit. (2) CNAME to the public gateway, with certificates issued on demand by the host. A DNS edit for the owner; a hosting service or a server for the operator, and a DNS lookup in the browser to learn which contract the hostname means. (3) Both.
- *Recommendation.* The pinned build first: it is the only route that keeps the gateway static, and it removes the operator from the owner's trust. CNAME if a host with on-demand certificates is chosen in M02 anyway.
- *Default and deadline.* The pinned build, in M05. Blocks M05 only, though the choice of host in M02 decides whether option 2 stays cheap.
- *Record.* Here.

Closed.

1. **TypeScript, not Rust and WebAssembly** (2026-11-20, from spike 001). The gateway's own work is 1.4 ms beside an RPC round trip of 120–500 ms. Reopened by M04 if proof verification is chosen there.
2. **`/` is `html()` and only `html()`.** A contract without it is not served at the root, even if its `request()` would answer. ERC-8244 is the scope; a fallback would make the gateway a general ERC-5219 one.
3. **The path form is loopback-only.** On a public host it would put every contract in one origin.
4. **RPC endpoints are compiled in.** Never taken from a URL, and never fetched at run time.

## Findings carried forward

For M05's scoping. None is measured; each is a question, not a design.

- **A CNAME needs a certificate for the owner's hostname.** A static host serves only the names it holds certificates for, so an arbitrary domain pointed at the gateway fails at TLS before any gateway code runs. And the page sees only its own hostname, with no contract in it, so it would have to look the mapping up itself.
- **A name does not say which chain.** ENS and WNS resolve on mainnet to an address; the contract may live elsewhere. The URL, a record on the name, or a mainnet-only rule has to supply the chain.
- **A wildcard certificate covers one label.** `<name>.ens.<base>` works for `name.eth`; a subname (`a.b.eth`) needs either an encoding into one label or no support.
- **A name's origin follows the name, not the contract.** Whoever holds the name can repoint it, and the origin's storage and granted permissions go with it. Same as DNS, and worth saying in `SECURITY.md` when it ships.

## Not on the roadmap

- **IPFS and the other `web3://` resolve modes.** Out by the project's definition.
- **A server-side cache of any kind.** It is the failure this project exists to remove.
- **Chain aliases** (`sep`, `basesep`). A second name for the same origin is a second origin; the chain id is the name.
- **Compressed `request()` bodies.** Refused with a 502 today. Nothing in scope uses them; add when something does.
- **ERC-8244's sandboxed rendering and wallet mediation.** That is a wallet's or an explorer's job. A gateway serves a top-level page; [SECURITY.md](../SECURITY.md) says what that gives up.
- **Server rendering for crawlers and link previews.** Needs a server.
