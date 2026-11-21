# m01-t05 — The configuration file: one project on several chains

Milestone: [M01](../../MILESTONE.md) · Phase: 2 — Make it handable

`make build CONFIG=<file>` builds a project's gateway from a file naming its contract on each chain it is deployed to. With several chains each contract is served under `/<chain>/` and `/` goes to the default; with one, the build is the pinned build m01-t04 made, byte for byte.

## Plan

Measured at scoping, 2026-11-20, on `main` at `45022ac`:

- The unpinned build is `gw44-sw.js` 7,567 bytes and `index.html` 8,448; pinned to one contract, 7,170 and 8,051. The limit on the worker is 16,384.
- One function decides which contract a URL names, `targetOf` in `src/adapters/sw/config.ts`, and `tools/get.ts` repeats its choice. `pinnedTarget(url, pin)` in `src/core/target.ts` takes a single `Pin`.
- `Target.redirect` exists and the worker answers it with a 308; `boot.ts` does not look at it.

1. **The configuration.** A JSON file, by convention `gw44.json` in the project's repository:

   ```json
   { "default": "1", "contracts": { "1": "0x…", "8453": "0x…" } }
   ```

   In `src/core/target.ts`: `export interface Pins { default: string; contracts: Record<string, string> }` and `parsePins(value: unknown): Pins`. It requires at least one contract; every key to match `CHAIN` and every address, lower-cased, to match `ADDRESS`; `default` to be one of the keys, and optional only when there is one contract; no other top-level key. Anything else throws `GatewayError("bad-target", …)` naming the offending key or value. `parsePin` stays and returns the one-contract `Pins`.
   - Unit tests in `test/target.test.ts`: one valid file of each size; a missing default with two contracts; a default not among the contracts; an unknown key; a bad chain; a bad address; an empty `contracts`; a value that is not an object.
2. **The target.** `pinnedTarget(url: URL, pins: Pins): Target` replaces the single-pin signature.
   - One contract: unchanged. The whole path is the resource.
   - Several: read the first path segment.
     - The path is `/`: the default contract, with `redirect` set to `/<default>/` plus the query.
     - It is a configured chain and the path is exactly `/<chain>`: that contract, with `redirect` set to `/<chain>/` plus the query.
     - It is a configured chain otherwise: that chain's contract, the rest of the path as the resource, trimmed as the root is today.
     - Anything else: throw `GatewayError("not-found", "no contract at this path")`.
   - It still never reads `url.hostname`.
   - Unit tests: each branch; a query carried through both redirects; `/8453/a/b` giving `["a","b"]`; `/8453/` giving the root; `/08453/`, `/widget.js` and `/favicon.ico` throwing not-found; a path of the path form (`/1/<other address>/`) reaching chain 1's configured contract with the address as a resource, never the other address.
3. **Redirect status.** Add `redirectStatus?: 302 | 308` to `Target`. The redirect from `/` to the default is 302, because the default is a setting that can change; the trailing-slash redirects stay 308. `sw.ts` uses the field, defaulting to 308. `boot.ts`, straight after its `targetOf` check, does `location.replace(target.redirect)` when a redirect is set, so a first visit to `/` moves before a worker is registered and the no-worker fallback never renders the wrong path. That call carries the fragment: `location.replace(target.redirect + location.hash)` (amended 2026-11-20, at review). A browser keeps the fragment across the worker's 302 and 308 by itself, and a script navigation does not, so without it the first visit to `/#/docs` lands on `/<default>/` and every later visit lands on `/<default>/#/docs`. Measured by the architect at `7947918` on a two-chain build: first visit to `/#/docs` ended on `/11155111/`, the same URL once the worker controlled the page ended on `/11155111/#/docs`; `/84532#/docs` behaved the same way.
4. **The build.** `tools/build.ts` reads `GW44_CONFIG` (a path). Set together with `GW44_PIN` it fails. It parses the file with `parsePins`, fails if any configured chain is missing from the chains file, defines `__GW44_PINS__` (renamed from `__GW44_PIN__`; `null` in an unpinned build) and compiles in the endpoints of the configured chains only. The first output line lists every `chain:address` and the default. In `mk/10-gateway.mk`, `CONFIG ?=` exported as `GW44_CONFIG`, named in the `build` target's help.
   - Check: a one-contract file and `PIN=<the same chain>:<the same address>` print the same three hashes. A two-contract file builds; a file naming a chain absent from `chains.json` and one with both `CONFIG` and `PIN` set each exit non-zero with a message that says why.
   - **One switch the bundler can fold** (added 2026-11-20, after the stop below was met). A second define, `__GW44_PINNED__`, `true` or `false`. `targetOf` in `src/adapters/sw/config.ts` chooses between `parseTarget` and `pinnedTarget` on that constant and on nothing else, so each bundle carries only the parser it uses. As first built, steps 1 to 3 grew the unpinned worker by 570 bytes (engineer's figure, 8,137 against 7,567), because `targetOf` read an exported constant and both parsers stayed in every bundle. Measured by the architect on `main` at `e662bfd`, single-pin code with this switch: unpinned worker 7,403 (164 smaller), pinned 6,464 (706 smaller), `grep -c localhost` 0 in the pinned worker and 1 in the unpinned one. A comparison of the pins object with `null` folds in one direction only; the boolean folds in both.
   - Check: `grep -c localhost` on `gw44-sw.js` is 0 for the one-contract build and for the two-chain build, and 1 for the unpinned build; the three figures and the three workers' sizes in `HANDOFF.md`.
   - Stop and report if, with the switch in place, the unpinned `gw44-sw.js` grows by more than 300 bytes or any worker exceeds 12,000.
5. **`tools/get.ts`** honours `GW44_CONFIG` as it honours `GW44_PIN`, and prints a redirect as its status and `location` rather than following it.
6. **Browser test, three engines.** New `test/e2e/multi.e2e.ts`. Two fake chains, `31337` and `31338`, each its own JSON-RPC stub on its own port, each recording the `to` of every call; the first serves `ADDRESS` with a document titled `A`, the second serves a different address with one titled `B`, each with a relative `widget.js`. One build from a two-contract file with `31337` the default. Cases:
   - `/` ends on `/31337/` showing `A`, and its widget ran.
   - `/31338/` shows `B`, its widget ran, and every call for it went to the second stub and the second address.
   - `/31338` ends on `/31338/`.
   - `/nope/x` and `/favicon.ico` are 404 and neither stub saw a call for them.
   - From the `B` document, `fetch("/widget.js")` is 404 with no call: an absolute URL does not reach the default chain.
   - A controlled navigation to `/31338/` is one `eth_call`.
   - With service workers blocked, `/` still ends on `/31337/` showing `A`.
   - A first visit in a fresh context to `/#x` ends on `/31337/#x`, and to `/31338#x` on `/31338/#x`; the same two URLs visited again in that context end on the same two URLs.
   - Check: `devbox run -- make e2e` passes in Chromium locally; CI passes in three engines.
7. **`make verify`.** After the pinned pass, one more: a configuration file written to the work directory with the fixture on `11155111` (default) and `84532`; `GW44_CONFIG=… node tools/get.ts https://pinned.invalid/<chain>/` and `…/<chain>/widget.js` compared with the reference hashes already computed, labelled `config`; then one build from that file, served on its own port, loaded at `/` and at `/84532/` by `tools/verify-browser.ts`.
   - Check: twelve `ok` comparison lines and six browser `ok` lines, exit 0.
8. **Reproducibility in CI.** A third pair in the workflow's reproducibility step, built from `test/fixtures/gw44.two-chains.json` (the fixture on both testnets), `diff -r`'d, hashes printed. The CI hashes equal a local build's at the same commit, both quoted in `HANDOFF.md`; if they differ, stop and report.
9. **Carried #11, forced reload in Firefox and WebKit.** In the forced-reload case of `test/e2e/gateway.e2e.ts`, replace the DevTools-protocol reload with a way every engine has, in this order of preference: (a) a context option or navigation that loads the page with the worker installed but not controlling it; (b) the keyboard shortcut for a hard reload. The case counts only if, on the reloaded page before recovery, `navigator.serviceWorker.controller` is `null` while a registration exists; assert that. If neither reaches that state in an engine, leave the case Chromium-only and add one line to `SECURITY.md` § What it does not defend saying the recovery is proven in Chromium only and why. Either outcome closes #11; `HANDOFF.md` says which, per engine.
10. **Carried #27, the devbox version.** New `test/devbox-version.test.ts`: reads `devbox.json`'s `$schema` and the workflow's `devbox-version`, asserts the two versions are equal, and fails with both in the message. Show it failing once with one edited; the output goes in `HANDOFF.md`.
11. **Carried #38, the 8-second timeout.** Collect the slowest time per case from the last ten CI runs on `main` (`gh run view --log`), quote the table in `HANDOFF.md`, and set the per-context timeout in every e2e file's `fresh()` to three times the slowest observed, rounded up to a whole second, with the figure it came from in a comment. No retry of failed tests.
12. **Docs.** `README.md`: the pinned-build section gains the configuration file, the URL layout for one chain and for several, that an application under `/<chain>/` must use relative URLs, and that chains of one project share an origin, so the application keeps its storage apart by chain. `AGENTS.md` § Commands lists `CONFIG`; § Gotchas says a multi-chain build answers `/favicon.ico` itself with a 404 while a one-contract build still asks the contract (#36).
13. `Closes #11`, `Closes #27`, `Closes #38` in the PR.

## Acceptance criteria

- Milestone criterion 13: the checks of steps 4, 6 and 7 pass, and CI is green in three engines on the PR's head.
- A one-contract configuration and the equivalent `PIN` produce byte-identical output (step 4).
- A redirect keeps the URL's fragment on a first visit as it does on a later one: step 6's last case, in three engines.
- No URL reaches a contract that is not configured, and no URL under one chain's prefix reaches another chain's contract: step 2's unit tests and step 6's second, fourth and fifth cases.
- The worker of a two-chain build holds the endpoints of those two chains only: shown by a `grep` for an unconfigured chain's endpoint in `HANDOFF.md`.
- Milestone criteria 5 and 6 for a multi-chain build: step 8 passes in CI, the output is the three files, the worker is within the limit.
- Everything that passed at `45022ac` still passes: `devbox run -- make check`, and `make verify`'s existing eight comparisons and four browser loads.
- A configured build's worker does not contain the unpinned URL parser, and the unpinned worker does not contain the configured one: step 4's `grep` figures.
- #11, #27 and #38 are each closed by what steps 9 to 11 name.

## Out of scope

- More than one project in a build, a listing page, or a project name in the path: roadmap decision 9.
- Chain names or aliases in the path (`/base/`): the chain id is the name.
- A default chain served at `/` alongside prefixed ones.
- Endpoints in the configuration file. They stay in the chains file (`GW44_CHAINS`).
- YAML. JSON needs no dependency.
- Any deployment, workflow for GitHub Pages, or `docs/DEPLOY.md`: M02.
- #36 for a one-contract build: M02 takes it. #37 stays open: step 4 takes the unused parser out of each bundle, and the review of m01-t06 still reads `targetOf` and writes what `SECURITY.md` says.
- The unpinned URL forms and `src/core/resolve.ts`, `src/core/abi.ts`.

## Open questions

None.

## Context

- Roadmap decision 9 and milestone criterion 13, both by #39.
- [m01-t04](../m01-t04/TASK.md) and its `HANDOFF.md`, for `targetOf`, the pinned pass of `make verify` and the pinned e2e harness.
- #11, #27, #36, #38.
