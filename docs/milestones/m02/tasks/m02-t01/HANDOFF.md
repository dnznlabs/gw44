# m02-t01 — handoff

PR: #80 · Branch: `m02/t01-test-site` · 2026-11-21

`.github/workflows/pages-test.yml` builds the two-chain fixture and deploys it to Pages, by hand from `main` only, leaving the three hashes in its log. `tools/check-site.ts` checks a deployed gateway in a browser, seven cases per engine, each in a fresh context and each printing what it saw; `make check-site URL=… ENGINES="…"` runs it. `tools/verify.sh` gains a `site` pass under `VERIFY_SITE`, comparing the bytes a controlled page receives on a real host with the hashes `cast` already gave it. Nothing under `src/` or in `tools/build.ts` changed.

**Steps 4 and 5 are not in this PR.** The workflow has to be on the default branch before it can be dispatched, so the first deploy follows the merge; the deploy, `make check-site` against the real host in three engines, and the host's recorded behaviour arrive as a comment here and a docs-only PR amending this file. Everything below was measured against `tools/serve.ts` on loopback, which is why one case fails and should.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Step 0's gate | pass | `node -e … resolveCname gw-test.dnzn.dev` prints `[ 'dnznlabs.github.io' ]`; `gh api repos/dnznlabs/gw44/pages --jq '.build_type, .cname, .https_enforced'` prints `workflow`, `gw-test.dnzn.dev`, `true`; #51 is `CLOSED` |
| Milestone criterion 1 — `make check-site` in three engines | **deferred to step 4**, and six of seven cases already pass on loopback | `make check-site URL=http://localhost:39097` on the correct two-chain build: six `ok`, one `FAIL` — "a cold deep link recovers from the host's own 404 page: first response **200**". That failure is correct here: `tools/serve.ts` answers an unknown path with `index.html` at 200 where Pages answers with `404.html` at 404, and the case asserts 404. It is the one case that can only pass against the real host, and it is the assumption this milestone rests on |
| Milestone criterion 2 — four `site … ok` lines | pass | `VERIFY_SITE=http://localhost:39097 devbox run -- make verify` prints **22** `ok` lines: the existing twelve comparisons, **four `site`**, and six browser. The four are `11155111 site root 64305 B`, `11155111 site widget 8509 B`, `84532 site root 64305 B`, `84532 site widget 8509 B`, each `chain=…` equal to `site=…` |
| Step 3's mismatch run | pass | a site built from a configuration whose `84532` is the **retired** `App` `0x00a90943…5bae` (which still answers there: `codesize` 7,155): `84532 site root chain=64305 B 847bb75bfe7750da… site=62261 B 96a557a04771eeae… MISMATCH`, `verify: a comparison failed`, exit 2. The other three lines stayed `ok` |
| Milestone criterion 5 — the favicon case | pass, with what it does not assert named | `the favicon is answered 404 on a controlled page (origin not asserted: a synthesised response leaves no trace to attribute): status 404, controlled true, 0 resource-timing entries ok`. § Deviations 1 says why the origin and the no-chain-call halves are not asserted here and what does hold them |
| The deploy log's hashes equal a local build's | **deferred to step 4** | the workflow runs `GW44_CONFIG=test/fixtures/gw44.two-chains.json node tools/build.ts` with no redirection, so the three lines are in the log. A local build of that configuration at `7b624b5` prints worker `a2d1c97f04e76ef06d45939074fbd10eef61d5d2165d925c7c4357ce304881c4` 7,460 B |
| `git diff 2147cac -- src tools/build.ts` names only m01-t07's own fixes | pass | against this branch's point, `git diff --name-only bae4265..HEAD -- src tools/build.ts` is **empty**, and so is `git status --porcelain -- src tools/build.ts`. Measured against `bae4265` rather than the plan's `2147cac`, which predates m01-t07: that task changed `src/core/abi.ts`, `src/core/target.ts`, `src/adapters/sw/boot.ts` and added `src/adapters/sw/fallback.ts`, so a diff from `2147cac` would name four files this task did not touch |
| `make check` exits 0; neither `check-site` nor `VERIFY_SITE` reachable from it or `ci.yml` | pass | `devbox run -- make check` exits 0. `check: test e2e` (`mk/10-gateway.mk:60`); `grep -cE 'check-site\|VERIFY_SITE' .github/workflows/ci.yml` is **0** |

## Deviations from the plan

1. **Step 2's favicon case asserts the status and names three instruments that do not work.** The plan allowed the fallback — "if an engine cannot report where a response came from, assert the first half in Chromium only and say so in the test's name" — and the reason turns out not to be the engine. A response the worker synthesises without touching the network **raises no Playwright response event at all**, so `fromServiceWorker` is never reported; `performance.getEntriesByName` returns **0** entries for the fetch, and **also 0** in a control page with service workers blocked, so an absence of entries distinguishes nothing; and counting requests to `chains.json`'s endpoints during the fetch cannot work either, because the application polls its own chains while it runs — **13** endpoint requests arrive in any window of that length whether the favicon is fetched or not. The no-chain-call property is held by `test/target.test.ts`'s "a first segment that is not a configured chain is a 404 that costs no call" and `test/e2e/multi.e2e.ts`'s fourth case, both against a stub that records every call. This case adds that a deployed site answers the same status, and its name says what it does not show.
2. **A second tool, `tools/site-hash.ts`.** Step 3 asks `verify.sh` to fetch and hash inside a controlled page, which needs Playwright and the DOM library; `verify.sh` is shell. So the browser work is one small program that prints `<path> <sha256> <bytes>` and nothing else, and `verify.sh` compares. It hashes with `crypto.subtle` inside the page, so a 64 KB document does not cross the harness boundary twice.
3. **Both new tools are excluded from `tsconfig.json` and added to `tsconfig.e2e.json`.** The plan says `check-site.ts` is typechecked by the e2e configuration so it may use `page.evaluate`; `tsconfig.json` includes `tools`, so without the exclusion each file would be typechecked twice, once without the DOM library, and fail.
4. **The acceptance line's commit is read against this branch's point.** Named in the criteria row above rather than only here, because the figure a reviewer checks is the diff.

## Decisions

- **The `site` pass runs before the comparison guard, not after it.** Placed after, as I first wrote it, a site mismatch skipped `verify: a comparison failed` and was reported by the browser stage's guard as `verify: the browser stage failed` — a true failure under a false name. Caught by running the mismatch demonstration and reading the message rather than the exit code.
- **No `CNAME` file.** With Actions as the Pages source the custom domain is the repository's setting, and a committed `CNAME` is a second place for it to be wrong.
- **`concurrency` on the deploy is `cancel-in-progress: false`.** A cancelled deploy leaves the site serving a mixture of two builds, which is worse than waiting.
- **The workflow refuses any ref but `main`** in its first step, although `workflow_dispatch` is only offered on the default branch. It costs one `if` and it documents the intent where someone changing the trigger will see it.
- **`check-site` reads the chains and the default from the configuration file**, passed as an argument, so the check and the site cannot disagree about what was built without the check failing.

## Discoveries

1. **A fully synthesised service-worker response is invisible to every instrument tried** — no Playwright response event, no resource-timing entry, nothing to attribute it with. Worth knowing before anyone writes another check that tries to prove where a response came from; the measurement is in § Deviations 1 with the control that shows an absence proves nothing here.
2. **The retired M04 `App` still serves a document on Base Sepolia** — `codesize` 7,155, a 62,261-byte document — which is what made step 3's mismatch demonstration a real hash mismatch rather than a fetch failure. Its `widget.js` is byte-identical to the live one (`8b6bbc88…`), so the widget line stayed `ok` while the root mismatched: one resource agreeing is not evidence the site serves the right contract.
3. **`/nope` reaches the gateway's 404 through the "malformed URL" branch**, not a not-found message: the body reads `gw44: malformed URL`. That is `boot.ts` catching `pinnedTarget`'s `not-found` and reporting it as malformed, which is informational item I-9 of the 2026-11-20 review. The case passes because it asserts the gateway's own text rather than a particular sentence, but the sentence is wrong.
4. **A background `tools/serve.ts` started with `&` inside a foreground command dies with its shell**, so the first mismatch run failed with a navigation timeout rather than a comparison. Started as a proper background process afterwards. Recorded because the failure looked like a defect in the new code and was not.

## Open questions

None.
