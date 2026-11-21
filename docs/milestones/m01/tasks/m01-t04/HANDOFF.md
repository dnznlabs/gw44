# m01-t04 — handoff

PR: #35 · Branch: `m01/t04-pin` · 2026-11-20

<!-- Addressing the review at `3821d4f`: `main` is merged in (`98c0423`) so the branch's `TASK.md` is
     the one on `main`, and the README sentence now states what a pinned host must do rather than
     pointing at a `docs/DEPLOY.md` that step 9's amendment moved to M02. The hashes below were
     measured at `be489d9` and still hold: `git diff --name-only be489d9..HEAD -- src tools
     chains.json package-lock.json devbox.lock` is empty, and a rebuild at the head prints the same
     six lines. -->

`parsePin` and `pinnedTarget` in `src/core/target.ts` turn `<chain>:<address>` into a target that never reads the hostname and takes the whole path as the resource; `tools/build.ts` reads `GW44_PIN`, defines it alongside the endpoint map for the pinned chain only, and says which build it made on its first line; `src/adapters/sw/config.ts` exports `targetOf`, the one place either adapter decides which contract a URL names, and `sw.ts` and `boot.ts` call it where they called `parseTarget`. `tools/get.ts` honours the same variable, so the pinned path is comparable with the chain without a browser, and `tools/verify.sh` and the CI reproducibility step both cover the pinned deployable as a second artefact with its own bytes. Steps 5 and 8 were done differently from the plan; both are below.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Milestone criterion 12 — step 2's checks | pass | `devbox run -- make build PIN=11155111:0x00a9f390a6010d045e0d34856048ddd6910d25ba` exits 0 and prints `built /tmp/t04-f-pin/ (pinned to 11155111:0x00a9f390a6010d045e0d34856048ddd6910d25ba):`. `PIN=5:0x00a9…25ba` exits 2 with `Error: pin 5:0x00a9f390a6010d045e0d34856048ddd6910d25ba names chain 5, which the chains file does not carry`; `PIN=nonsense` exits 2 with `GatewayError: pin must be <chain>:<address>; got "nonsense"` |
| Milestone criterion 12 — step 5's checks, and three engines | pass | `devbox run -- make e2e` locally: 14 tests, 14 pass, 0 fail. [Run 44865541997](https://github.com/dnznlabs/gw44/actions/runs/44865541997) on `be489d9`, green: 57 unit, then chromium 14 pass, firefox 13 pass 1 skipped, webkit 13 pass 1 skipped — the skip is the pre-existing forced-reload case, skipped by name with its reason (#11, out of scope) |
| Milestone criterion 12 — step 6's check | pass | `devbox run -- make verify`: eight `ok` comparison lines (`11155111 root`, `11155111 widget`, `84532 root`, `84532 widget`, then the same four as `pinned`) and four browser `ok` lines (`11155111 browser`, `11155111 pinned browser`, `84532 browser`, `84532 pinned browser`), `verify: every comparison and every browser load passed`, exit 0 |
| No URL makes a pinned build serve another contract | pass | step 1's unit tests: a host-form hostname naming `0x00d19609…7f8e` on chain 84532 returns the pinned chain and address, and `http://localhost:8244/84532/0x00d19609…7f8e/` returns `resource: ["84532", "0x00d19609…7f8e", ""]` of the pinned contract. Step 5's third and fourth cases in a browser: the host-form case asserts no call to the other address and that every call went to `0x00a9f390…25ba`; the path-form case asserts the chain received exactly `request(["1","0x00d19609…7f8e",""],[])` at the pinned address and nothing at any other address |
| Milestone criteria 5 and 6 for the pinned build | pass | [Run 44865541997](https://github.com/dnznlabs/gw44/actions/runs/44865541997) built `pinned-a` and `pinned-b`, `diff -r` silent, and printed `ba1e8ab5de179e5599702b2e0cafeb1ce2e0f74d7d148fcdc3fd273e825971fa 8051 404.html`, `b2c30fa5d1c8294ab083563480774dc30e290c2850004214bed344a9806c7dcc 7170 gw44-sw.js`, `ba1e8ab5…71fa 8051 index.html`; a local pinned build at `be489d9` printed the same three lines. The pinned `dist/` is those three files and the gate would fail on a fourth; the pinned `gw44-sw.js` is 7,170 B against the 16,384 B limit; `npm ls --omit=dev --parseable \| wc -l` is 1 |
| The unpinned build still passes everything it passed at `4ac4e64` | pass | `devbox run -- make check` exits 0 (57 unit tests, 0 fail; 14 e2e, 0 fail). `make verify`'s original four comparisons and two browser loads are the first four `ok` lines and `11155111 browser ok` / `84532 browser ok` of the run in the step 6 row. CI's unpinned pair printed `1d717ef5dc0fd5c5248f49004dc16d49fdb72205eddb3ed561917fb94078e504 8448 404.html`, `c7160c7b666ee47236d2b123b0da4101ee5dd0dd66cd2ef9e8216aada02826c7 7567 gw44-sw.js`, `1d717ef5…e504 8448 index.html`, equal to a local unpinned build at `be489d9` |
| `make verify` still unreachable from `make check` and the workflow | pass | `check: test e2e` (`mk/10-gateway.mk:57`); `grep -c verify .github/workflows/ci.yml` is 0 |
| #26, #28, #29, #30 each closed | pass | #26: `tools/verify.sh` has no `xxd` branch and no decoder line in its header output — the run in the step 6 row begins `verify: address 0x00a9f390… on chains [11155111 84532]`. #28: the gate's message is now `… ; run 'make clean'`. #29: the two failing runs are in § Deviations 2 and the size gate reads `sizes.get("gw44-sw.js")`, the bytes the hash loop measured. #30: the § Gotchas line is in `AGENTS.md` |

## Step 3 — what the pin cost the unpinned build

| File | At `a881db7` | After step 3 | Delta |
|:--|--:|--:|--:|
| `gw44-sw.js` | 7,393 | 7,567 | +174 |
| `index.html` (and its copy `404.html`) | 8,270 | 8,448 | +178 |

Both are under the 200-byte limit the plan set, and neither hash is the one it was. The pinned build is *smaller* than the unpinned one — 7,170 against 7,567 — so the question the plan asked about a larger pinned worker does not arise. The arithmetic: pinning replaces the embedded endpoint map with the pinned chain's entry alone, and `chains.json` carries nine chains, so the embedded JSON goes from 536 bytes to 60. That 476-byte saving against a 397-byte net shrink puts the pin's own cost at about 79 bytes.

## Deviations from the plan

1. **Step 5 copies the fake chain rather than moving it to `test/e2e/harness.ts`.** The plan allowed a move "only if that is a move with no change to what `gateway.e2e.ts` does". It is not: `gateway.e2e.ts` keeps the stub's state at module level and its tests mutate `calls` and read `rpcHits` directly, so sharing it means turning that state into something constructed and rewriting those call sites. The pinned cases also need something the existing stub does not record — the address each call was sent to, since what they prove is about `to` and not only about calldata — so `test/e2e/pinned.e2e.ts` carries its own stub with a `seen` array. Declared because it is a copy, which the plan asked to be told about.
2. **#29's status branch is demonstrated through a new `VERIFY_STATUS` variable, not a temporary edit.** The plan's preference was an environment variable "without new code", falling back to a temporary edit of the expected status. Neither was available as written: the fixture answers 200 for every resource reachable by `VERIFY_ADDRESS`, and a temporary edit proves the branch once and leaves it undemonstrable afterwards. `VERIFY_STATUS` is three lines and makes it permanently checkable. `VERIFY_STATUS=404 VERIFY_CHAINS=11155111 devbox run -- make verify` prints `11155111 widget: the chain answered status 200, not 404 — MISMATCH`, then `11155111 pinned widget: no reference hash — MISMATCH`, and exits 2. The second line is worth noting: the pinned pass reuses the unpinned reference hash, so a resource that failed upstream is reported rather than quietly skipped. The body half of #29: with `decodeRequestResult` made to drop the body's last byte, all four widget lines read `chain=8509 B 8b6bbc88…c368 served=8508 B 72d1e36a…dcaba MISMATCH` — unpinned and pinned, on both chains — and the run exits 2. `src/core/abi.ts` was restored, `git status --porcelain` empty; nothing from either run is committed.

## Decisions

- `parsePin` throws where `parseTarget` returns null. A URL naming no contract is ordinary and a malformed pin is a mistake, and a build should not be able to confuse the two; the message names the pin it was given.
- The pinned browser stage gets its own output directory and its own port rather than reusing `dist/` and the unpinned server. A pinned build's root *is* the contract, so the two cannot be served from one tree without one of them shadowing the other.
- The pinned verify pass compares against the reference hashes already computed rather than reading the chain again: a second read could differ for a reason that has nothing to do with the pin, and would make the comparison about the chain's stability instead of about the build.
- `tools/verify-browser.ts` now takes a URL rather than a port, chain and address, because a pinned build has no URL that names either.

## Discoveries

- **Under a pin, the browser's own `/favicon.ico` becomes an `eth_call` on every page load**, because every path is the contract's resource. Firefox and WebKit request it where the headless Chromium shell does not, which is what made step 5's path-form case fail in CI at `af602ea` while passing locally. The test now matches on calldata; the behaviour itself is real and a pinned deployment pays one reverting call per load unless the contract answers that path.
- The unpinned bundle still contains `parseTarget` and `isLoopback` in a pinned build — `grep -c localhost` is 1 in both — so the pin is enforced by `targetOf` at run time and not by the code being absent. The claim in the criteria rests on the tests, not on dead-code elimination.
- `make verify` now builds four deployables per run (the unpinned one plus a pinned one per chain) and starts three servers. It takes noticeably longer than it did; nothing measures that, and nothing gates on it.
- **The e2e suite's 8-second per-context timeout is thin enough to flake on a loaded runner.** [Run 44866382736](https://github.com/dnznlabs/gw44/actions/runs/44866382736) failed in Firefox on `gateway.e2e.ts`'s pre-existing "a relative subresource is ERC-5219 request()" case, which took 12,797 ms there against 884 ms in the same engine on the run before it; every case on that run was 3–5× its usual time. The commit changed only documentation, and a re-run of the same commit was green in all three engines. Not touched here: the timeout is `fresh()` in `gateway.e2e.ts`, outside this task.

## Open questions

None.
