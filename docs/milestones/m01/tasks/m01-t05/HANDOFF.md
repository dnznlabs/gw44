# m01-t05 — handoff

PR: #46 · Branch: `m01/t05-config` · 2026-11-21

<!-- Addressing the review at `7947918`: step 3's amendment (#47, `f846885` on `main`,
     merged here at `2aa1937`) is applied — `boot.ts` carries `location.hash` into the first-visit
     redirect — and step 6's new fragment case is in `test/e2e/multi.e2e.ts`. The workers did not
     move, as predicted; every page gained 14 bytes and a new hash, and the figures below are the
     ones at `e6e8d0c`. The endpoint row is corrected: three endpoints, not two. -->

`parsePins` and the multi-chain `pinnedTarget` in `src/core/target.ts` turn a configuration file into a target per URL: one contract behaves exactly as the pin did, several put each contract under `/<chain>/` with `/` redirecting to the default. `tools/build.ts` reads `GW44_CONFIG`, refuses it alongside `GW44_PIN`, compiles in the configured chains' endpoints only, and defines `__GW44_PINNED__` so the bundler drops the parser each build does not use. `tools/get.ts` honours the same variable and reports a redirect rather than following it; `sw.ts` answers one with the target's status and `boot.ts` performs it before registering a worker. `test/e2e/multi.e2e.ts` runs two fake chains on two ports, each recording the address it was asked about. Step 4's stop condition was met on the first build and ruled on by the architect; that and three other departures are below.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Milestone criterion 13 — step 4's checks | pass | `make build CONFIG=/tmp/t05-one.json` and `make build PIN=11155111:0x00a9f390a6010d045e0d34856048ddd6910d25ba` print the same three hashes — `14327c63fe0a63077f30d10940611905125f1027180917abc1b838a2a428fc8e` 7,047 for the worker, `44b0a2373716b0666f92e4bebf5bb0ed5d79797344281d46c2ba21b8ebcc19dd` 7,992 for both pages. A two-chain file builds and names both contracts and the default on its first line. A file naming chain 5 exits 2 with `Error: … names chain 5, which the chains file does not carry`; `CONFIG` and `PIN` together exits 2 with `GW44_PIN and GW44_CONFIG both set; a build serves one configuration, so pick one` |
| Milestone criterion 13 — step 4's switch check | pass | `grep -c localhost gw44-sw.js` is **1** unpinned, **0** one-contract, **0** two-chain; workers 7,417 / 7,047 / 7,179 B. The reverse marker, `pinnedTarget`'s `no contract at this path`, is **0** unpinned and **1** in both pinned builds, so neither bundle carries the other's parser |
| Milestone criterion 13 — step 6's checks, three engines | pass | `devbox run -- make e2e` locally: 22 tests, 22 pass. [Run 44871363569](https://github.com/dnznlabs/gw44/actions/runs/44871363569) on `e6e8d0c`, green: 68 unit, chromium 22 pass, firefox 21 pass 1 skipped, webkit 21 pass 1 skipped — the skip is the forced-reload case, skipped by name (§ Deviations 3) |
| A redirect keeps the fragment on a first visit as on a later one | pass | step 6's last case, in three engines: a fresh context visiting `/#x` and `/31338#x` ends on `/31337/#x` and `/31338/#x`, and the same two URLs visited again in that context — now answered by the worker's 302 and 308 rather than by the script — end on the same two URLs |
| Milestone criterion 13 — step 7's check | pass | `devbox run -- make verify`: **18** `ok` lines — twelve comparisons (four unpinned, four `pinned`, four `config`) and six browser (`11155111`, `11155111 pinned`, `84532`, `84532 pinned`, `root → 11155111 config`, `84532 config`) — `verify: every comparison and every browser load passed`, exit 0 |
| A one-contract configuration and the equivalent `PIN` are byte-identical | pass | the two worker hashes in the first row are one value, counted with `sha256sum … \| uniq -c` giving `2` for a single hash |
| No URL reaches an unconfigured contract, and no prefix reaches another chain's | pass | step 2's unit tests: `/1/<other address>/` returns chain 1's configured contract with the address as a resource; `/08453/`, `/widget.js`, `/favicon.ico`, `/5/` and `/nope/x` each throw `not-found`. Step 6's cases in a browser: the other prefix's calls all went to the second stub's address and the first stub saw nothing; `/nope/x` and `/favicon.ico` are 404 with neither stub called; `fetch("/widget.js")` from the `B` document is 404 with neither stub called |
| A two-chain worker holds those two chains' endpoints only | pass | **three** endpoints, not two: chain 11155111 has one in `chains.json` and chain 84532 has two, and all three are compiled in — `https://ethereum-sepolia-rpc.publicnode.com` 1, `https://base-sepolia-rpc.publicnode.com` 1, `https://sepolia.base.org` 1. Counted the same way, every endpoint of the other seven chains (1, 10, 8453, 42161, 4326, 4663, 31337) is **0**. The first figure in this row said two until the review: it counted one endpoint per chain rather than every endpoint of each |
| Milestone criteria 5 and 6 for a multi-chain build | pass | [run 44870356377](https://github.com/dnznlabs/gw44/actions/runs/44870356377) built `config-a` and `config-b`, `diff -r` silent, printing `5dbed4fb8e45acf03c36601e329cf3f7c62782d120d58f8acfdb640d972665b0` 8,124 for both pages and `fcde4064bfc3d82fc86b979a974401663a688a6fd21c8c2d5fcff66743eb0627` 7,179 for the worker; a local build at `e6e8d0c` printed the same. Output is the three files, worker 7,179 B against the 16,384 B gate and the plan's 12,000 B ceiling, `npm ls --omit=dev --parseable \| wc -l` is 1 |
| Step 8 — CI and local agree for all three builds | pass | at `e6e8d0c`, CI and local print the same three lines for each: unpinned `55d0a577d5578aa295fa3ca869809c8f15440dd87ee89ee0d5da3472e3358cfe` 7,417 and `5e56b9250ae65fbb6d5299f8004c2546cf5949dbb2cf0ab199eeed8cfaa33c1c` 8,362; one-contract as in the first row; two-chain as in the row above. `e6e8d0c` is the branch's last commit that can change a build, and this file is the only one after it |
| Everything that passed at `45022ac` still passes | pass | `devbox run -- make check` exits 0 (68 unit, 22 e2e, 0 fail). `make verify`'s original eight comparisons and four browser loads are the first eight and first four of the eighteen in the step 7 row |
| `make verify` still unreachable from `make check` and the workflow | pass | `check: test e2e` (`mk/10-gateway.mk:60`); `grep -c verify .github/workflows/ci.yml` is 0 |
| #11, #27 and #38 each closed | pass | #11: § Deviations 3 and § Discoveries 1; the case is Chromium-only with the reason in `SECURITY.md` § What it does not defend. #27: `test/devbox-version.test.ts` passes, and with `$schema` set to 0.21.0 it fails with `devbox.json $schema is 0.21.0 and .github/workflows/ci.yml devbox-version is 0.22.0; the two must name one version, or CI runs a devbox the schema does not describe`, exit 1; `devbox.json` restored. #38: § Decisions 1 |

## Step 4 — the sizes, before and after the switch

Baseline is `main` at `e662bfd`: worker 7,567, pages 8,448.

| Build | Worker | vs baseline | Pages | `grep -c localhost` |
|:--|--:|--:|--:|--:|
| Unpinned | 7,417 | **−150** | 8,362 | 1 |
| One contract | 7,047 | −520 | 7,992 | 0 |
| Two chains | 7,179 | −388 | 8,124 | 0 |

The three workers are the same bytes before and after step 3's amendment; only the pages moved, by 14 each, because `boot.ts` is in the pages and not in the worker.

**The stop condition is not met with the switch in place**: the unpinned worker is smaller than it was, not 300 bytes larger, and the largest worker is 7,417 against the 12,000 ceiling. Without the switch it was met and was reported: the unpinned worker came out at 8,137, **+570**, of which 552 was `src/core/target.ts` alone, 18 `sw.ts`'s `redirectStatus` and 72 the pages' share of `boot.ts` — attributed by reverting each piece and rebuilding.

## Deviations from the plan

1. **Step 4's stop condition was met and the task was amended rather than the figure waived.** As first built the unpinned worker grew 570 bytes. Reported with the attribution above and with a measured alternative; the architect ruled for the `__GW44_PINNED__` switch and amended step 4 on `main` (`523fe14`), which this branch merged at `8707813`. The switch is a boolean because comparing the pins object with `null` folds in one direction only — the unpinned one — which is why both parsers were in every bundle to begin with.
2. **Step 6's `/nope/x` and `/favicon.ico` case asserts the status from the navigation rather than from a `fetch`.** The plan did not say which; `page.goto` returns the response, so the status is the document's own and not a subresource's, which is what a visitor would meet.
3. **Step 9 reached neither branch of its stated preference, and ended on its fallback.** Option (a), a context option or navigation giving a page with the worker installed but not controlling it, does not exist in Playwright's portable API. Option (b), the keyboard shortcut, was tried as both `Control+Shift+R` and `Meta+Shift+R` in all three engines and reached the state in none of them, Chromium included: a hard reload's shortcut is browser chrome, which a headless page never receives. A cache-busting navigation was tried too, with the same result. So the case stays Chromium-only and `SECURITY.md` § What it does not defend carries one line saying the recovery is proven there only and why. Per engine: chromium reached the state only through CDP; firefox and webkit reached it by no route tried.
4. **`tools/verify.sh`'s configured browser stage loads one URL per configured chain, not `/` plus every prefix.** The plan named `/` and `/84532/` for a two-chain fixture, which is one load per chain; written that way the count stays six whatever `VERIFY_CHAINS` holds, rather than growing by one.

## Decisions

- **#38's timeout is 20,000 ms**, from the slowest e2e case across the last ten successful runs on `main`: "first visit: the shell installs the worker and the contract's document replaces it" at **6,589 ms**, times three, rounded up to a whole second. The 9,597 ms case in that data is `test/abi.test.ts`'s decoder fuzz — a unit test, which `setDefaultTimeout` does not govern — and is excluded. For scale, the flake that opened #38 took 12,797 ms, so this absorbs it; the next four e2e cases are 5,404, 4,882, 2,784 and 894 ms.
- **`parsePins` requires `default` whenever it names more than one chain.** With two contracts and no default, `/` would mean whichever chain the JSON happened to list first — a silent dependence on key order in a file a person edits.
- **The `/` redirect is a 302 and the trailing-slash ones are 308s**, as the plan set, and the reason is in the code: a permanent redirect to the old default would outlive a change of default in every browser that cached it.
- **The configured verify pass compares against the reference hashes already computed**, as the pinned pass does, rather than reading the chain again; a second read could differ for reasons that have nothing to do with the configuration.
- **`test/devbox-version.test.ts` reads both files as text.** Parsing the workflow would mean a YAML dependency, which the project does not have and which the no-runtime-dependency rule makes a decision rather than a detail.

## Discoveries

1. **The forced-reload case had never tested a worker bypass, in any engine.** `Page.reload {ignoreCache: true}` bypasses the HTTP cache and not the service worker: measured on the reloaded page, `navigator.serviceWorker.controller` was non-null at document start, `PerformanceNavigationTiming.workerStart` was 0.6 ms, `deliveryType` was `cache`, and the fake chain saw the two calls the worker makes. The shell never entered the page — and the case's only assertion was `waitForSelector("#gw44", { state: "detached" })`, which an element that was never there satisfies. `Network.setBypassServiceWorker` is the instrument that produces a user's hard reload: `controller` null, `workerStart` 0, one call, registration still present. The case now records all of that at document start through `sessionStorage`, because the state exists only between the reload and the shell's recovery and the shell wins any race to read it afterwards, and asserts `{ controlled: "false", registrations: "1" }`. The rewritten case no longer waits on `#gw44` at all. `grep -rn detached test/ tools/` finds one other use, `tools/verify-browser.ts:43`, and it is sound: it is followed by a title check added in m01-t03 for this same reason, so a shell that was never present cannot pass it.
2. **A multi-chain build answers `/favicon.ico` itself, with a 404 and no call** — the first segment is not a configured chain. A one-contract build still asks the contract, because there every path is the contract's resource, so #36's cost applies to pinned builds only. In `AGENTS.md` § Gotchas.
3. **`make verify` now builds six deployables and starts four servers per run.** Nothing measures how long it takes and nothing gates on it, but it is the slowest thing in the repository by a wide margin.
4. **`parsePin` and `parsePins` were never in any worker bundle**, before the switch or after: esbuild already tree-shakes them, since only `tools/` imports them. Worth recording because it was my first explanation for the 570 bytes and it was wrong — `grep -c 'must be a JSON object'` is 0 in every bundle.

## Open questions

None.
