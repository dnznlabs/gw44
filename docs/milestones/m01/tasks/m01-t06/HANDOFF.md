# m01-t06 — handoff

PR: #65 · Branch: `m01/t06-audit` · 2026-11-21

`audits/` carries the method in prose, the scope file by file with every exclusion's reason, the known answers, and the two prompts; `scripts/audit.sh` runs it behind `make audit` in `mk/20-audit.mk`. The legs run in a tree outside the repository holding the scoped files alone, `git init`-ed because `codex exec` refuses a non-repository, so no leg can reach `SECURITY.md`, a handoff, an issue or the other leg; `BLIND.md` records the review commit and every scoped file's hash in both trees. The run of 2026-11-20 accepted sixteen findings, and `SECURITY.md` now has a row for each, a review-status block, what the review did not cover, and the reviewed commit with the hashes a reader compares. Nothing in `SCOPE` was touched.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Milestone criterion 10 — `SECURITY.md` names date, method, commit and scope, and has a row per accepted finding | pass | § Review status gives 2026-11-20, the method in one sentence linking `audits/README.md`, scope commit `be92f1f7fcb34121bd7c05203411850fbb64dd5f`, the twelve files with the three exclusion groups and their reasons, and the result by severity. § Findings — disposition has **16 rows, F1 to F16**, one per finding `AUDIT.md` accepts, and none was rejected |
| `AUDIT.md` exists, provenance names the review commit with `dirty: no`, both leg directories hold a non-empty `full-report.md` | pass | `audits/2026-11-20/AUDIT.md` § 1 reproduces the runner's block: `code commit be92f1f7fcb34121bd7c05203411850fbb64dd5f  (dirty: no)`. `gpt-5.6-sol/full-report.md` is 12,749 B and `opus/full-report.md` 23,707 B, as the rollup's own count records; the runner's `harvest` refuses an empty or missing report and the completion check refuses an empty leg directory |
| `BLIND.md`'s repository hashes equal `sha256sum` at the review commit | pass | extracted the twelve scoped files from `be92f1f` with `git archive` and diffed `sha256sum` against `BLIND.md`'s repository block: **identical, 12 lines**, no difference. The runner also asserts repository and blind-tree hashes equal before the legs start |
| The rollup's grading against `KNOWN_ANSWER.md` is in `AUDIT.md`, per leg | pass | § 4, one subsection per item plus a summary table. #18: leg 1 found it (Medium), leg 2 found it weakly (Low, restated rather than reported). #36: **both missed**, recorded plainly with why leg 2's nearest item does not meet the criterion. #37: both found it and both were right, reading the build-time selection off `tools/build.ts`; no leg claimed a pinned build ships the unpinned parser, so the item's false-positive case produced nothing |
| No file in `SCOPE` differs between the review commit and the PR's head | pass | `git diff --name-only be92f1f..HEAD -- <the twelve paths>` is empty. Four findings were reported rather than fixed and are m01-t07's — § Deviations 2 |
| `make check` exits 0; `make audit` unreachable from it or the workflow | pass | `devbox run -- make check` exits 0 (68 unit, 22 e2e, 0 fail). [Run 44874706176](https://github.com/dnznlabs/gw44/actions/runs/44874706176) on `04e558a` green in three engines: 68 unit, chromium 22, firefox 21+1 skip, webkit 21+1 skip. `check: test e2e` (`mk/10-gateway.mk:60`) does not reach `audit`, and `grep -c audit .github/workflows/ci.yml` is 0 |
| #37 closed by one sentence saying how the pin is enforced | pass | `SECURITY.md` § What the gateway defends: enforced **at build time** by `__GW44_PINNED__`, with `grep -c localhost` 1/0/0 and `pinnedTarget`'s marker 0/1/1 across the three builds, and the statement that reading `src/` alone cannot show it |

## The run

```
leg 1   codex gpt-5.6-sol · effort high · 1 pass · 360 s · exit 0 · 46,997 tokens ·  7 findings
leg 2   claude opus-5-5   ·              1 pass · 355 s · exit 0 ·                  14 graded + 9 info
rollup  claude opus-5-5   ·                       233 s · exit 0
```

Sixteen distinct findings after deduplication, six found by both legs. The dispositions:

- **Fix in m01-t07**, whose plan is #52, merged to `main` 2026-11-21: **F2, F3, F4**, and the comment half of **F1**. These were reported to the architect before anything else in this task was written, and he classed them: F3 trips step 8's stop; F4 goes with it as the same file and the same re-run; F2 does not trip step 8 as worded — it is script inside the right origin without the headers the contract asked for — but blocks M01 because that is not shippable for a wallet application; F1's shared origin is decision 9 working as ruled, so only the comment is corrected. One task rather than three, because a fix under `SCOPE` needs one more review run over the files it touches and one run over `abi.ts`, `boot.ts` and `target.ts` is cheaper than three. The four issues I had filed (#53, #54, #55, #56) are **closed as superseded**, each pointing at #52; the findings' record is `AUDIT.md`.
- **Limit**, dispositioned in the row with where it is stated: **F1**'s shared origin (decision 9, and § Trust model), **F5** and **F11** (stated at `src/adapters/rpc/fetch.ts:47-51`, pinned by a test, open as #18 for M04), **F6** (§ What it does not defend; closing it needs the Public Suffix List), **F14** (how ERC-5219 carries parameters, now stated).
- **Carried**, `carried` + `m01`: **F7, F8, F9, F10, F12, F13, F15, F16** — #57, #58, #59, #60, #61, #62, #63, #64, each read back from GitHub as `OPEN` before this file was written.

## Deviations from the plan

1. **`KNOWN_ANSWER.md`'s third item is not #37 as filed.** The issue says a pinned build "still carries the unpinned URL parser" and that the pin holds at run time only; m01-t05 made that false of the artifact, and the architect's dispatch said to write the prompt and step 10 for the code as it is. So the item states what is true at the review commit, says explicitly that the issue's own wording is now wrong, and grades three outcomes rather than two: found and right, found and wrong (a leg that trusts the source over the build), or missed. Recording the false-positive case was the point — it would have been evidence that a source-only review cannot see a build-time guarantee. No leg produced it, so the run gives no evidence either way.
2. **Four findings were reported rather than dispositioned in a row alone, and the architect was told before anything else was written.** Step 8's second bullet covers anything that defeats the size cap or the timeout, or lets a contract run script outside its own origin's document. F3 defeats the cap — 64 header offsets may alias one multi-MiB string, measured at 509 MB of RSS from a 4.2 MB return value — and F4 turns a value inside the cap into a download from every endpoint in turn. **F2 I referred without deciding**, because whether dropping a contract's CSP meets "outside its own origin's document" turns on a shared-origin build that decision 9 sanctioned; the architect ruled it does **not** trip step 8 as worded and is blocking anyway, which is the answer I could not give myself. All four are m01-t07's (#52). No file in `SCOPE` changed.
3. **`src/adapters/rpc/memory.ts` is in `SCOPE` although it does not ship.** Step 2 names every file under the three directories, so it is kept rather than argued away, with the fact recorded in `SCOPE`'s comments: only `test/resolve.test.ts` imports it and `grep -c memory` on the built worker is 0. It defines the `Rpc` contract every other adapter meets, which is worth a read.
4. **`scripts/audit.sh` is not rake's with a changed working directory.** The three invocations are rake's `:236-241`, `:265-270` and `:432-436` as the plan requires, and the rest is new: rake's runner has no blind-tree stage and no front-end mode — its own front-end pass of 2026-11-17 was run by hand — and its `harvest` reads `.solidity-auditor/runs/`, which does not exist where there is no skill. So harvesting is the `<!-- OUTDIR -->` marker plus a non-empty check, and the blind tree, `BLIND.md` and the provenance block are this project's.

## Decisions

- **The known answer never enters the blind tree.** The runner reads `KNOWN_ANSWER.md` from the repository, which the legs cannot see, and appends it to the rollup prompt alone.
- **Transcripts are committed in their own commit, after the leg reports and the rollup.** Nothing that could read them was still running when they landed, which is the property the method asks for; two commits is how that becomes visible in the log.
- **The runner refuses a dirty tree outright** rather than recording `dirty: yes`. An audit of an uncommitted tree cannot be re-run by anyone else. The flag is still printed, because a reader should not have to trust that the refusal worked.
- **`SECURITY.md` keeps the trust model and corrects it in two places** rather than replacing it: trust in the contract is now "for its own origin and nothing else — except where an origin holds more than one contract", and the defence of one contract from another names the several-chain build as the deliberate exception.

## Discoveries

1. **Leg 2's line numbers are wrong for five of the twelve files, and the rollup caught it.** Every citation into `resolve.ts`, `fetch.ts`, `config.ts`, `sw.ts` and `tools/build.ts` points past the end of the file — `fetch.ts:212-219` in a 96-line file, `config.ts:110-112` in a 28-line one — while its citations into `boot.ts`, `target.ts` and `abi.ts` are correct, and its quoted code and identifiers are accurate throughout. `BLIND.md` shows it read the same bytes. The rollup placed each finding at the real line and kept the leg's own citation in brackets. Nothing explains it; it is worth knowing before the next run, because a reader checking a citation would conclude the finding was invented.
2. **The claude CLI printed a credential warning during the rollup**: "this sign-in can end at any time from now until 2026-11-22. Renewing it does not move that date. Run `claude auth login` now, or use `claude setup-token` for unattended jobs." It did not affect the run. It affects every unattended job on this machine, so it is outside this task and has been raised separately.
3. **Both legs volunteered that they could not inspect a built bundle**, and said so rather than assuming. That is the degradation the leg prompt asks for, and it is the reason § What the review did not cover now names the artifact: the legs read source, and where the build removes code they reasoned about it from `tools/build.ts`.
4. **An informational item answers the question the review most needed answered:** no route was found by which a URL reaches a contract the build did not configure, in any of the three shapes, including `/%31/` and `//evil.com`. It is informational because it is the absence of a finding, which is exactly why it is worth recording.

## Open questions

None.
