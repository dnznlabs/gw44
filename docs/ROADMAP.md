# gw44 · roadmap

gw44 is a static web gateway for contracts that serve their own front end: ERC-8244 `html()` at `/`, ERC-5219 `request()` at every other path, resolved in the visitor's browser with no gateway server. There is no separate spec; this file and the milestone documents are it, and [spike 001](spikes/001-static-gateway.md) is the evidence they rest on.

Approved 2026-11-20. Reordered the same day: dedicated gateways on a project's own domain come first, and the public gateway moves behind them.

Milestones run in order. A milestone is done when every acceptance criterion in its `MILESTONE.md` is demonstrably met.

| Milestone | Goal | Status |
|:----------|:-----|:-------|
| [M01 — MVP](milestones/m01/MILESTONE.md) | The prototype hardened and reviewed, and a pinned build that serves one project's contracts, on every chain it is deployed to, from the project's own domain | in progress |
| M02 — Dedicated deployment | A project deploys its own gateway to GitHub Pages from its own repository with one reusable workflow; `rake.dnzn.dev` is the first | not started |
| M03 — Embeds | A third-party page can load a contract's `widget.js` through a project's gateway | not started |
| M04 — Endpoint trust | A single lying RPC endpoint cannot change what a visitor is served | not started |
| M05 — Public gateway | The repository is public and `gw44.link` serves any contract, on static hosting, with the base domain on the Public Suffix List | not started |
| M06 — Names | A contract is reachable by a name its owner already holds (`<name>.ens.<base>`, `<name>.wei.<base>`, `<name>.gwei.<base>`) | not started |
| M07 — Registry | A paid on-chain registry gives a contract a short name (`<name>.<base>`) or an outside domain, with certificates for registered domains issued by automation off chain, and payment through Dues | not started |

`MILESTONE.md` for each later milestone is written when the one before it is under way. The MVP is M01; M02 is what puts it in front of users. Milestones were renumbered on 2026-11-20: the public gateway was M02 and is M05, names were M05 and are M06, the registry was M06 and is M07.

The repository stays private until M05. Until then nobody outside can check a served bundle against its source, so the claim that a visitor can verify what they are served waits for M05 too.

## Order

Dedicated gateways first (direction given 2026-11-20). A project's own domain needs no wildcard certificate, no Public Suffix List entry, no answer for strangers' contracts and no decision on the public host form, and the host can change later without the URL changing. The public gateway needs all four, so it waits until the dedicated path has run in production.

M01 first because M02 deploys whatever M01 leaves, and the security review should read the code that ships. M02's first step is a throwaway GitHub Pages site: no real static host has been tested, and Pages answers a deep link with the shell under a 404 status.

M03 follows M02 because the loader is served from a deployed origin. A static host cannot answer another site's `<script src>` on a project's own domain any more than on a public one, so embeds need the loader either way (Decisions, 6). If rake's mainnet release needs the embed snippet, M03 is the next thing after `rake.dnzn.dev` is up.

M04 before anything public: on an official deployment one lying endpoint decides what the project's domain shows. It is the only milestone that is real engineering rather than hardening.

M05 is the public release: the repository opened, `gw44.link`, the Public Suffix List, the base-URL page, and the host-form decision ([#33](https://github.com/dnznlabs/gw44/issues/33)). It follows M04 because a public gateway serves contracts nobody here has read.

M06 follows because a name adds a second lookup to the same endpoints. Its scoping has questions to answer before any task is written, listed under Findings carried forward.

M07 is the first milestone with a contract, a fee and a job that runs off chain, so it is scoped as its own piece of work with its own review. It follows M06 because the name forms there need no contract and settle how a named origin resolves, which the registry then reuses.

## Decisions

Open. Each is a `decision` issue, linked from its title.

**The public host form: one label or two** ([#33](https://github.com/dnznlabs/gw44/issues/33)). `<contract>.<chain>.gw44.link` as built, or `<contract>-<chain>.gw44.link`. Recommended: one label. No default, since the public URL shape is a one-way door at M05. Parked until M05 is scoped; nothing before it waits on it.

Closed.

1. **TypeScript, not Rust and WebAssembly** (2026-11-20, from spike 001). The gateway's own work is 1.4 ms beside an RPC round trip of 120–500 ms. Reopened by M04 if proof verification is chosen there.
2. **`/` is `html()` and only `html()`.** A contract without it is not served at the root, even if its `request()` would answer. ERC-8244 is the scope; a fallback would make the gateway a general ERC-5219 one.
3. **The path form is loopback-only.** On a public host it would put every contract in one origin.
4. **RPC endpoints are compiled in.** Never taken from a URL, and never fetched at run time.
5. **An owner's own domain is served by a pinned build** (2026-11-20, [#5](https://github.com/dnznlabs/gw44/issues/5)). The owner hosts the two files on their own domain, built to serve one contract at any hostname. It ships in M01, moved forward from M05 on 2026-11-20: it needs no public gateway, so a project such as rake can run on its own domain with no public gateway at all. Pointing an outside domain at the public gateway is M07: a paid on-chain registry, with certificates issued by automation off chain. Rejected for now: certificates on demand with no registry, which makes the operator answerable for any domain anyone points at it.

6. **A third-party page loads a contract's script through a loader** (2026-11-20, [#2](https://github.com/dnznlabs/gw44/issues/2)). The host page includes one small static gw44 script, pinned by hash, which reads the contract and injects the result. Built in M03, served from a project's own gateway first. It changes the shape of the embed snippet a project such as rake publishes, and the host's content policy must allow the RPC endpoint. Rejected: a stateless function at the edge, which keeps today's snippet and gives the gateway a server.
7. **The name is `gw44` and the public base domain is `gw44.link`** (2026-11-20, [#3](https://github.com/dnznlabs/gw44/issues/3)). The domain is registered. A one-way door from M05 on, when the name is in URLs other people publish.
8. **No client-side cache** (2026-11-20, [#4](https://github.com/dnznlabs/gw44/issues/4)). Every load is one `eth_call`, measured at 279 ms for a repeat visit against the hosted gateway's 327 ms. A cache keyed by a validator the contract controls may be taken up after production, as work of its own, and only with a measurement that argues for it and tests that show it cannot serve a stale document.
9. **One origin per project, and the chain in the path** (2026-11-20). A project's gateway serves that project's contracts and no other's. Built for one chain it serves the contract at `/`; built for several it serves each under `/<chain>/` and sends `/` to the default chain, so an absolute URL in a document fails instead of reading another chain's contract. Chains of one project share an origin, so the project keeps its own storage apart by chain. Rejected: one shared instance for every project (`gw.<domain>/<project>/<chain>/`), which puts every project's storage, service worker and wallet permission in one origin.

## Findings carried forward

For M02's scoping.

- **GitHub Pages takes one custom domain per repository**, which is why each project deploys from its own. Both `gw44` and `rake` are private and the organisation's plan allows Pages from a private repository; the deployed site is public either way.
- **A project's workflow has to read this repository while it is private**: a deploy key or a release artefact, pinned to a commit, with the build's printed hashes checked.
- **Pages answers an unknown path with `404.html` and status 404.** The shell should still start the worker; unproven.
- **`docs/DEPLOY.md` is written here**, by making the deployment; moved from M01's criterion 11.
- **Where testnet deployments are served** is an open question for this milestone's scoping: under the project's own origin they share it with mainnet.

For M05's scoping. From the hosts' documentation, read 2026-11-20; nothing here has been deployed.

- **The host must serve a wildcard hostname.** GitHub Pages takes named subdomains and an apex only, and Cloudflare Pages lists wildcard custom domains as not possible. CloudFront takes wildcard alternate names, each covered by a name on the one certificate a distribution holds. A pinned build has no such need and runs on any of them.
- **Two labels cost a certificate name per chain.** A wildcard certificate name covers one label, so `<contract>.<chain>.<base>` needs `*.<chain>.<base>` on the certificate for every chain served. One label needs `*.<base>` once. This is decision #33.
- **The base-URL page** (what gw44 is, how to form a URL) belongs here; it was M01's criterion 9, and its plan is in the history at `a88c3f8`.

For M06's scoping. None is measured; each is a question, not a design.

- **A CNAME needs a certificate for the owner's hostname.** A static host serves only the names it holds certificates for, so an arbitrary domain pointed at the gateway fails at TLS before any gateway code runs. And the page sees only its own hostname, with no contract in it, so it would have to look the mapping up itself.
- **A name does not say which chain.** ENS and WNS resolve on mainnet to an address; the contract may live elsewhere. The URL, a record on the name, or a mainnet-only rule has to supply the chain.
- **A wildcard certificate covers one label.** `<name>.ens.<base>` works for `name.eth`; a subname (`a.b.eth`) needs either an encoding into one label or no support.
- **A name's origin follows the name, not the contract.** Whoever holds the name can repoint it, and the origin's storage and granted permissions go with it. Same as DNS, and worth saying in `SECURITY.md` when it ships.

For M07's scoping. A direction, not a design; none of it is measured. The discussion is on [#5](https://github.com/dnznlabs/gw44/issues/5).

- **What the registry holds.** A name or a domain, mapped to a chain id and a contract address, with an owner who can repoint it. Storing the chain answers the question a `.wei` or ENS name leaves open.
- **Short names need no certificate; outside domains do.** `<name>.<base>` is one label under the base's wildcard. A registered outside domain needs a certificate of its own.
- **Certificate automation stays out of the serving path.** A job reads the registry, obtains and renews a certificate per registered domain and installs it on the static host. A page load still touches only the static host and the RPC endpoint. If the job stops, existing sites keep loading; new domains wait and renewals eventually lapse.
- **It constrains M05's host.** Hostnames and certificates must be addable by API, and the host's limit on hostnames per deployment is the ceiling on registered domains. To be checked when M05's options are laid out.
- **Payment through Dues.** A registration is a subscription to a Dues plan, and the registry reads whether the holder is paid up. 0.005 ETH was the example price. What happens to a name whose payment lapses (a grace period, release, who may take it next) is a decision.
- **Reserved labels.** `ens`, `wei`, `gwei`, `www`, anything numeric and anything starting `0x` cannot be registered, or a name could shadow a gateway form.
- **Abuse lands on the base domain.** A lookalike name serving a phishing document can get the whole base flagged. A fee slows that and does not stop it; the base on the Public Suffix List (M05) limits the damage to one name. The registry needs a way to take a name down, and who holds it is a decision.
- **A second call per page load.** A named origin resolves the name before it can ask for `html()`.
- **One-way doors.** The registry's deployment, and the first name sold: after that, changing the rules changes them for someone who paid.

## Not on the roadmap

- **IPFS and the other `web3://` resolve modes.** Out by the project's definition.
- **A server-side cache of any kind.** It is the failure this project exists to remove.
- **Chain aliases** (`sep`, `basesep`). A second name for the same origin is a second origin; the chain id is the name.
- **Compressed `request()` bodies.** Refused with a 502 today. Nothing in scope uses them; add when something does.
- **ERC-8244's sandboxed rendering and wallet mediation.** That is a wallet's or an explorer's job. A gateway serves a top-level page; [SECURITY.md](../SECURITY.md) says what that gives up.
- **Server rendering for crawlers and link previews.** Needs a server.
