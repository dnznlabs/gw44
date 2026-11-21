# m01-t04 — The pinned build

Milestone: [M01](../../MILESTONE.md) · Phase: 2 — Make it handable

`make build PIN=<chain>:<address>` writes the same three files, built to serve that one contract at any hostname and no other contract at any URL. An owner can put it on a domain of their own without the public gateway existing.

## Plan

Measured at scoping, 2026-11-20, on `main` at `4ac4e64`:

- The unpinned build is `gw44-sw.js` 7,393 bytes and `index.html` 8,270 bytes, against the 16,384-byte limit on the worker.
- The contract is read from the URL in exactly three places: `src/adapters/sw/sw.ts` (twice, in `handle` and in the `fetch` listener), `src/adapters/sw/boot.ts` (twice, in `boot` and `renderInline`) and `tools/get.ts`. All call `parseTarget` in `src/core/target.ts`.
- `tools/build.ts` already passes one build-time constant, `__GW44_CHAINS__`, through the bundler's `define`.
- A service worker registers only in a secure context, so over plain HTTP a browser test can use loopback hostnames only. A hostname that is not loopback is covered by unit tests on the core.

1. **The pin in the core.** In `src/core/target.ts` add `export interface Pin { chain: string; address: string }`, `parsePin(text: string): Pin` and `pinnedTarget(url: URL, pin: Pin): Target`.
   - `parsePin` takes `<chain>:<address>`, validates with the file's existing `CHAIN` and `ADDRESS` patterns after lower-casing the address, and throws `GatewayError("bad-target", …)` on anything else.
   - `pinnedTarget` returns the pin's chain and address with the URL's path as the resource (`trimRoot(segments(url.pathname))`) and its query as the params. It never returns null, never sets `redirect`, and never reads `url.hostname`.
   - Unit tests in `test/target.test.ts`: the root and a nested path at `example.com`, at `localhost`, and at a hostname of the host form naming another address and chain; a path of the path form naming another chain and address, which must come back as a three-segment resource of the pinned contract; malformed percent-encoding throws; six bad pins throw (no colon, chain with a leading zero, a 39-digit address, an address without `0x`, an empty string, a trailing colon part).
   - Check: `devbox run -- make test` exits 0.
2. **The pin in the build.** `tools/build.ts` reads `GW44_PIN`. Unset or empty: today's build, with `__GW44_PIN__` defined as `null`. Set: `parsePin` it; fail if its chain is not a key of the chains file; define `__GW44_PIN__` as the pin and `__GW44_CHAINS__` as a map holding only the pinned chain's endpoints. The build's first line of output says which it is: `built <out>/ (pinned to <chain>:<address>):` or `built <out>/:` as now. In `mk/10-gateway.mk`, `PIN ?=` exported as `GW44_PIN`, and the `build` target's help text names it.
   - Check: `devbox run -- make build PIN=11155111:0x00a9f390a6010d045e0d34856048ddd6910d25ba` exits 0 and prints the pinned line; `PIN=5:0x00a9…25ba` (a chain not in `chains.json`) and `PIN=nonsense` each exit non-zero with a message naming the pin.
3. **The pin in the adapters.** `src/adapters/sw/config.ts` declares `__GW44_PIN__: Pin | null` and exports `PIN`, and one function `targetOf(url: URL): Target | null` that returns `pinnedTarget(url, PIN)` when `PIN` is not null and `parseTarget(url)` otherwise. `sw.ts` and `boot.ts` call `targetOf` wherever they call `parseTarget` today. Nothing else in either file changes: `/gw44-sw.js` stays reserved exactly as it is.
   - Check: the unpinned build's three hashes, before and after this step, go in `HANDOFF.md`. They may differ; the sizes must not grow by more than 200 bytes each. If the pinned `gw44-sw.js` is larger than the unpinned one, say why in `HANDOFF.md`.
4. **`tools/get.ts` honours the pin.** With `GW44_PIN` set it resolves through `pinnedTarget`; otherwise unchanged. This is how the pinned path is compared with the chain without a browser.
   - Check: `GW44_PIN=11155111:0x00a9f390a6010d045e0d34856048ddd6910d25ba node tools/get.ts https://example.com/ | sha256sum` prints the hash `make verify` prints for the Sepolia root.
5. **Browser test, three engines.** A second file, `test/e2e/pinned.e2e.ts`, with its own `before`: the same fake chain as `gateway.e2e.ts`, a build into a temporary directory with `GW44_PIN=31337:<ADDRESS>`, `tools/serve.ts` on a free port. Share the fake-chain and launch code by moving it to `test/e2e/harness.ts` only if that is a move with no change to what `gateway.e2e.ts` does; otherwise copy what is needed and say so in `HANDOFF.md`. Cases:
   - `http://localhost:<port>/` shows the document and runs `widget.js`.
   - `http://pinned.localhost:<port>/` does the same, on its own origin.
   - `http://<OTHER>.1.localhost:<port>/`, a host-form URL naming a different address and chain, shows the pinned contract's document, and the fake chain saw no call to `<OTHER>`.
   - `http://localhost:<port>/1/<OTHER>/` is answered by the pinned contract's `request(["1","<OTHER>",""],[])`: the fake chain receives exactly that calldata, to the pinned address.
   - A controlled navigation to the root is one `eth_call`.
   - Check: `devbox run -- make e2e` passes locally in Chromium; CI passes in three engines. A case an engine cannot run is skipped by name with the reason in the `test()` call, as criterion 2 requires.
6. **`make verify` covers the pinned build.** In `tools/verify.sh`, after the existing comparisons and for each chain: compare `GW44_PIN=<chain>:<address> node tools/get.ts https://pinned.invalid/` and `…/widget.js` with the reference hashes already computed, one line each, labelled `pinned`. Then in the browser stage, build with the pin into a temporary directory, serve it on a second free port, and load `http://localhost:<port>/` with `tools/verify-browser.ts`, which takes the URL to open in place of building it from chain and address.
   - Check: `devbox run -- make verify` prints eight `ok` comparison lines and four browser `ok` lines and exits 0.
7. **Reproducibility in CI.** The workflow's reproducibility step also builds twice with `GW44_PIN=11155111:0x00a9f390a6010d045e0d34856048ddd6910d25ba` into two more directories under `$RUNNER_TEMP` and `diff -r`s them. The log then carries six hashes.
   - Check: the pinned hashes CI prints for the PR's head equal a local pinned build's at the same commit; both quoted in `HANDOFF.md`. If they differ, stop and report, as in m01-t03 step 6.
8. **Fold in #26, #28, #29 and #30**, since this task already edits each file they name.
   - #26: `tools/verify.sh` decodes hex with the `node -e` path only; remove the `xxd` branch and the line that prints which ran.
   - #28: `tools/build.ts`'s unexpected-file error ends with `; run 'make clean'`. The gate stays.
   - #29: the size gate reads the byte length of `gw44-sw.js` from disk, which the hash loop already has. `tools/verify.sh` reads word 0 of `request()`'s return and reports `MISMATCH` unless it is 200. Run `make verify` once with `decodeRequestResult` in `src/core/abi.ts` made to drop the body's last byte, confirm `MISMATCH` on the widget lines and a non-zero exit, restore, and name the output in `HANDOFF.md`; commit nothing from that run. For the status word, run with `VERIFY_ADDRESS` and a resource the fixture answers with a status other than 200 if one can be reached by an environment variable without new code; if not, show the branch failing by a temporary edit of the expected status and say so.
   - #30: one line in `AGENTS.md` § Gotchas, as the issue words it, extended to say a pin changes all three files too.
   - `Closes #26`, `Closes #28`, `Closes #29`, `Closes #30` in the PR.
9. **Docs.** `README.md` gains a short section on the pinned build: the command, what it serves, that the chains file can be the owner's own (`GW44_CHAINS`), and what the host must do: serve the three files over HTTPS and answer every unknown path with `index.html` (on GitHub Pages, `404.html` does this). No wildcard DNS or certificate is needed. `AGENTS.md` § Commands lists `PIN`.

## Acceptance criteria

- Milestone criterion 12: the checks of steps 2, 5 and 6 pass, and CI is green in three engines on the PR's head.
- No URL makes a pinned build serve another contract: shown by step 1's unit tests and step 5's third and fourth cases.
- Milestone criteria 5 and 6 for the pinned build: step 7's comparison passes in CI, the pinned `dist/` is the three files, the pinned `gw44-sw.js` is at most 16,384 bytes, and `npm ls --omit=dev` lists no package.
- The unpinned build still passes everything it passed at `4ac4e64`: `devbox run -- make check` exits 0, and `make verify`'s original four comparisons and two browser loads still print `ok`.
- `make verify` is still not reachable from `make check` or from the workflow.
- #26, #28, #29 and #30 are each closed by what step 8 names, with the two failing runs of #29 in `HANDOFF.md`.

## Out of scope

- Deploying a pinned build anywhere, for rake or anything else, and `docs/DEPLOY.md`, which M02 writes: the owner deploys, from the README section of step 9.
- A pin on more than one contract, a pin by name, or a pin read at run time from a file, a header or the URL. The pin is compiled in, as the endpoints are.
- Changing what `/gw44-sw.js`, `/index.html` or `/404.html` do on a contract's origin.
- Any change to the unpinned URL forms, to `isLoopback`, or to `src/core/resolve.ts` and `src/core/abi.ts` beyond the temporary edit in step 8.
- #11 (forced reload in Firefox and WebKit) and #27 (the devbox version check): m01-t05.
- `SECURITY.md`: the review of m01-t06 reads this code and writes what a pinned origin means there.

## Open questions

None.

## Context

- Roadmap decision 5 and milestone criterion 12, as amended by #24.
- [m01-t03's `HANDOFF.md`](../m01-t03/HANDOFF.md) § Deviations 1 and 2 (the build's output directory holds only the deployable; what the browser stage waits on) and § Discoveries.
- #26, #28, #29, #30.
