# M01 — MVP

Status: in progress · updated 2026-11-20

The spike's prototype works in one browser engine on one machine. This milestone makes it something a stranger can clone, verify and deploy: the same behaviour proven in three engines and in CI, limits enforced rather than assumed, a build whose output can be checked against the source, and a security review of record. It comes first because M02 publishes whatever this leaves.

One new feature, the pinned build (criteria 12 and 13), moved here on 2026-11-20 because it needs no public gateway. Since the roadmap was reordered that day it is the thing this milestone exists to ship: M02 deploys it. Everything else is a property the prototype claims and has not yet proven.

## Acceptance criteria

1. `devbox run -- make check` exits 0 on a fresh clone, and in CI on every push and pull request.
2. In CI, `make e2e ENGINES="chromium firefox webkit"` runs every case in all three engines. A case an engine cannot run is skipped by name with the reason in the test, not dropped; an engine that is named and cannot launch fails the run. On a machine without Firefox's and WebKit's system libraries, `make e2e` runs Chromium.
3. With `make serve` running, `http://localhost:8244/11155111/0x00a9f390a6010d045e0d34856048ddd6910d25ba/` shows the rake app in a browser, and the same on `84532`.
4. For that contract on both chains, `make get URL=<root>` and `make get URL=<root>widget.js` print bytes whose SHA-256 equals that of the decoded `cast call` to `html()` and to `request(["widget.js"],[])`. A `make verify` target does the comparison.
5. Two builds of the same commit on two machines produce byte-identical `dist/`, and `make build` prints the SHA-256 of each file.
6. `dist/` is `gw44-sw.js`, `index.html` and `404.html`; `gw44-sw.js` is at most 16,384 bytes; `npm ls --omit=dev` lists no package.
7. A response larger than the configured cap, an endpoint that never answers, and an endpoint that answers with a non-JSON body each produce a 502 within the timeout, shown by a test apiece; with two endpoints configured and the first failing, the second's answer is served.
8. The decoder fuzz test runs at least 1,000,000 inputs in CI and throws nothing but `GatewayError`.
9. Moved to M05 on 2026-11-20. It asked for a page at the bare base URL saying what gw44 is and how to form a URL, which is a page for the public gateway. A pinned build has no bare URL.
10. `SECURITY.md` records a two-leg review of `src/` at a named commit, with every finding dispositioned.
11. Moved to M02 on 2026-11-20. It asked for `docs/DEPLOY.md`, checked by following it, and following it is a public deployment, which this milestone rules out. The guide is written in M02 by making the deployment it describes. A pinned build's instructions for this milestone are the README section m01-t04 adds.
12. A pinned build, made by one documented `make` invocation naming a chain id and an address, writes the same three files and serves that contract's `html()` at `/` and its `request()` at every other path on any hostname, loopback or not. It honours neither the host form nor the path form, so no URL makes it serve another contract. Shown by a browser test in three engines on a hostname that is not of the host form, and by `make verify` comparing the pinned build's bytes with the chain's for the fixture. Criteria 5 and 6 hold for it.
13. A pinned build made from a configuration file naming one project's contract on each of several chains, with one chain marked the default, serves each contract under `/<chain>/` (its `html()` at `/<chain>/`, its `request()` below it), redirects `/` to the default chain's prefix and `/<chain>` to `/<chain>/`, and answers any other first path segment with a 404 that makes no call to any chain. The worker carries the endpoints of the configured chains and no others. A configuration with one contract behaves exactly as criterion 12. Shown by unit tests, by a browser test in three engines with two chains that record which address each call went to, and by `make verify` for the fixture on both of its chains. Criteria 5 and 6 hold for it.

## Out of scope

- Any deployment, domain or DNS: M02. This milestone ships the build and its instructions.
- A pinned build that serves more than one project, or that takes its contract from a name. One origin per project is roadmap decision 9; names are M06.
- A loader or an edge function for embeds: M03.
- Quorum or proof verification: M04.
- A cache: ruled out, roadmap decision 8.
- Testing on physical phones and in-app wallet browsers: M02, where there is a deployed URL to open.

## Needs from the Product Owner

Nothing open. The engineer is named (focus set to `gw44` on 2026-11-20), the four roadmap decisions are ruled ([#2](https://github.com/dnznlabs/gw44/issues/2)–[#5](https://github.com/dnznlabs/gw44/issues/5)), and Firefox and WebKit launch on the development VM with no install ([#9](https://github.com/dnznlabs/gw44/issues/9)).

## Phases

### Phase 1 — Prove what is claimed

CI, three engines, and the limits. Finishes before phase 2, since the review should read tested code.

| Task | Goal | Status |
|:-----|:-----|:-------|
| [m01-t01](tasks/m01-t01/TASK.md) | CI running `make check`; Firefox and WebKit in `make e2e` (criteria 1, 2) | done ([#8](https://github.com/dnznlabs/gw44/pull/8)) |
| [m01-t02](tasks/m01-t02/TASK.md) | Size cap, timeout and failover each under test; fuzz count raised (criteria 7, 8) | done ([#16](https://github.com/dnznlabs/gw44/pull/16)) |
| [m01-t03](tasks/m01-t03/TASK.md) | `make verify` against the live fixture; reproducible build with printed hashes (criteria 3, 4, 5, 6) | done ([#23](https://github.com/dnznlabs/gw44/pull/23)) |

### Phase 2 — Make it handable

| Task | Goal | Status |
|:-----|:-----|:-------|
| [m01-t04](tasks/m01-t04/TASK.md) | The pinned build: one contract at any hostname (criterion 12) | done ([#35](https://github.com/dnznlabs/gw44/pull/35)) |
| [m01-t05](tasks/m01-t05/TASK.md) | The configuration file: one project on several chains (criterion 13); carried #11, #27 and #38 | done ([#46](https://github.com/dnznlabs/gw44/pull/46)) |
| [m01-t06](tasks/m01-t06/TASK.md) | Two-leg security review of what a gateway ships, findings dispositioned (criterion 10); carried #37 | not started |
| [m01-t07](tasks/m01-t07/TASK.md) | The review's three blocking findings fixed and read again: header amplification, hex above 4 MiB, the no-worker fallback (criterion 10) | not started — after m01-t06 |

Tasks run in order. `TASK.md` for m01-t03 onward is written while the task before it is being built.
