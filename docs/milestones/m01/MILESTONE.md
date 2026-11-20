# M01 — MVP

Status: in progress · updated 2026-11-20

The spike's prototype works in one browser engine on one machine. This milestone makes it something a stranger can clone, verify and deploy: the same behaviour proven in three engines and in CI, limits enforced rather than assumed, a build whose output can be checked against the source, and a security review of record. It comes first because M02 publishes whatever this leaves.

No new features. Everything here is a property the prototype claims and has not yet proven.

## Acceptance criteria

1. `devbox run -- make check` exits 0 on a fresh clone, and in CI on every push and pull request.
2. In CI, `make e2e ENGINES="chromium firefox webkit"` runs every case in all three engines. A case an engine cannot run is skipped by name with the reason in the test, not dropped; an engine that is named and cannot launch fails the run. On a machine without Firefox's and WebKit's system libraries, `make e2e` runs Chromium.
3. With `make serve` running, `http://localhost:8244/11155111/0x00a9f390a6010d045e0d34856048ddd6910d25ba/` shows the rake app in a browser, and the same on `84532`.
4. For that contract on both chains, `make get URL=<root>` and `make get URL=<root>widget.js` print bytes whose SHA-256 equals that of the decoded `cast call` to `html()` and to `request(["widget.js"],[])`. A `make verify` target does the comparison.
5. Two builds of the same commit on two machines produce byte-identical `dist/`, and `make build` prints the SHA-256 of each file.
6. `dist/` is `gw44-sw.js`, `index.html` and `404.html`; `gw44-sw.js` is at most 16,384 bytes; `npm ls --omit=dev` lists no package.
7. A response larger than the configured cap, an endpoint that never answers, and an endpoint that answers with a non-JSON body each produce a 502 within the timeout, shown by a test apiece; with two endpoints configured and the first failing, the second's answer is served.
8. The decoder fuzz test runs at least 1,000,000 inputs in CI and throws nothing but `GatewayError`.
9. The bare base URL, which names no contract, shows a page that says what gw44 is and how to form a URL, with no script beyond the shell's.
10. `SECURITY.md` records a two-leg review of `src/` at a named commit, with every finding dispositioned.
11. `docs/DEPLOY.md` takes a reader from `make build` to a working static host, for one named host, including the unknown-path rule and the wildcard DNS and certificate the host form needs. Checked by following it.

## Out of scope

- Any public deployment, domain or DNS: M02.
- A loader or an edge function for embeds: M03.
- Quorum or proof verification: M04.
- A cache: roadmap decision D3.
- Testing on physical phones and in-app wallet browsers: M02, where there is a public URL to open.

## Needs from the Product Owner

- Who builds, and when: the handbook's focus project is `rake`, so no task here is assigned or handed off until the Product Owner names an implementer for it.
- Rulings on [#2](https://github.com/dnznlabs/gw44/issues/2)–[#5](https://github.com/dnznlabs/gw44/issues/5). None gates this milestone.
- Optional: Firefox's and WebKit's system libraries on the development VM ([m01-t01](tasks/m01-t01/TASK.md), open question 1).

## Phases

### Phase 1 — Prove what is claimed

CI, three engines, and the limits. Finishes before phase 2, since the review should read tested code.

| Task | Goal | Status |
|:-----|:-----|:-------|
| [m01-t01](tasks/m01-t01/TASK.md) | CI running `make check`; Firefox and WebKit in `make e2e` (criteria 1, 2) | not started |
| [m01-t02](tasks/m01-t02/TASK.md) | Size cap, timeout and failover each under test; fuzz count raised (criteria 7, 8) | not started |
| m01-t03 | `make verify` against the live fixture; reproducible build with printed hashes (criteria 3, 4, 5, 6) | not started |

### Phase 2 — Make it handable

| Task | Goal | Status |
|:-----|:-----|:-------|
| m01-t04 | The base-URL page and `docs/DEPLOY.md` (criteria 9, 11) | not started |
| m01-t05 | Two-leg security review of `src/`, findings dispositioned (criterion 10) | not started |

Tasks run in order. `TASK.md` for m01-t03 onward is written while the task before it is being built.
