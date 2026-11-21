# m02-t02 — handoff

PR: #89 · Branch: `m02/t02-reusable` · 2026-11-21

`.github/workflows/deploy-pages.yml` is the workflow a project calls with a commit of this repository and its own configuration: `workflow_call` only, pinned by a 40-hex SHA that a branch name cannot satisfy, every input reaching a shell through `env:` and never by `${{ }}` in a `run:` line, and four guards that fail before anything is deployed. `tools/embeds.sh` writes the static copies a host page embeds — each read twice, through the gateway's core and through `cast`, and refused unless both agree — and prints the `integrity` snippet that pins them. `pages-test.yml` is now a caller of that workflow, passing `GW44_READ_KEY` so the path a project elsewhere depends on is the one exercised here. `test/devbox-version.test.ts` reads every workflow that pins devbox rather than `ci.yml` alone. Nothing under `src/` or in `tools/build.ts` changed.

**Step 4 is not in this PR.** A `workflow_call` workflow can only be called once it is on the default branch, so the deploy, the embed case in three engines and the redeploy measurement follow the merge, as m02-t01 did it: a comment on this PR and a Markdown-only amendment here. Three deploy runs, and the stop condition is a returning visitor still on the old default fifteen minutes after a deploy.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Milestone criterion 3 — the three refusals | pass, **by a local script rather than three `verify-only` runs**, to spare the Actions budget; the plan allows either and asks which. The script extracts each `run:` body from `deploy-pages.yml` **by step name and executes that body**, so it cannot drift from the workflow | ten cases, five refusals and five controls, all correct: a branch name as `gw44-ref` → exit 1 `gw44-ref must be a full 40-character commit SHA; got 'main'`; an empty `config` → exit 1 `CONFIG is empty; both config and chains are required`; a `config` naming no file → exit 1 `CONFIG names no file in this repository: nope.json`; an `expect` differing by one character (`a2d1c97f` → `a2d1c97e`) → exit 1 `the build does not match expect; nothing is deployed`; an unpinned build → exit 1. The controls: a 40-hex ref, both files present, a matching `expect` (`the build matches expect, line for line`), no `expect` at all, and a pinned build each exit 0 |
| Milestone criterion 3 — the test site is deployed by the reusable workflow at a full SHA | **deferred to step 4**; the caller is written and passes `gw44-ref: ${{ github.sha }}` | `.github/workflows/pages-test.yml` is one `uses: ./.github/workflows/deploy-pages.yml` job with the two-chain fixture, `chains.json`, `embeds: widget.js` and `secrets.GW44_READ_KEY` |
| Milestone criterion 4 — the embed case in three engines | **deferred to step 4** | — |
| Step 2's local checks | pass | with the two-chain fixture and `embeds=widget.js`, two files are written and both hash `8b6bbc8892657a88…`, the value `make verify` prints for `widget.js`; the printed snippets carry `integrity="sha384-YdiQK1VLmzn9EdOpTRan9r2NsUR+DnOwTJ/saTfdBDEkLxiyC2QiRFpVgJ/FQVtE"`. With `84532` pointed at `0xb611ff19…5199`, a `Distribution` that does not answer `request()`, the script prints `84532 widget.js: the chain returned nothing usable — FAILED (… execution reverted)`, **exits 1, and writes nothing for that chain** — `find` shows only `11155111/widget.js` beside the three built files |
| #83 closed, both halves | pass | the interpolation is **gone rather than rewritten**: `pages-test.yml` is now a `uses:` job, which cannot carry steps, so the `${{ github.ref }}` line it lived in no longer exists. `deploy-pages.yml` passes every input through `env:`. And `test/devbox-version.test.ts` now reads every workflow: with `deploy-pages.yml` set to 0.21.0 it fails with `devbox.json $schema is 0.22.0; .github/workflows/deploy-pages.yml pins 0.21.0`, exit 1, restored after |
| No file under `src/` and not `tools/build.ts` differs from the branch point | pass | `git diff --name-only 6efdddb..HEAD -- src tools/build.ts` is empty, and so is `git status --porcelain -- src tools/build.ts` |
| `make check` exits 0; the deploy workflow is not reachable from `ci.yml` | pass | `devbox run -- make check` exits 0 (78 unit including the two new version cases, 24 e2e with the one named skip). `grep -cE 'deploy-pages\|pages-test' .github/workflows/ci.yml` is **0** |

## Deviations from the plan

1. **The three refusals are shown by a local script, not by `verify-only` runs.** The plan offers both and asks which; the Actions budget is spent for the month, so the script. It is not a copy of the workflow's logic: it finds each step by name in the YAML, slices out the `run:` block, dedents it and executes it with the case's environment, which is why it is evidence about the workflow rather than about itself. It also runs **five controls**, because a guard that refuses everything would pass a test that only checks refusals.
2. **`pages-test.yml` loses its `main`-only guard, and that is forced rather than chosen.** A job that `uses:` a reusable workflow cannot also have `steps`, so the guard had nowhere to live. `workflow_dispatch` is offered on the default branch alone, which is what the guard restated. The guard's line is also where #83's interpolation was, so the first half of #83 closes by deletion.
3. **`configure-pages` runs before the embeds step, not after the build as the step order in the plan implies.** The snippet needs the site's own URL and that step is what resolves it. A `verify-only` run skips it, so the snippet's host prints as `https://<host>` and the script says so on its last line — a verify-only run must work where Pages is not enabled at all.
4. **The guard against an unpinned build reads the build log's first line** rather than the configuration, because that line is what `tools/build.ts` already prints and no new code in a reviewed file was allowed.

## Decisions

- **`gw44-ref` is checked before the checkout**, not after. A ref that is not a commit cannot be pinned, and failing first means a caller's mistake costs no network.
- **`ssh-key` is passed unconditionally**, because an empty value behaves exactly as an absent one. One step then covers a caller in this repository, whose token can read it, and a caller elsewhere, whose cannot.
- **The embed copies are written after `tools/build.ts` has finished**, so the build's three-file gate sees only the three files and the copies cannot be mistaken for part of the deployable.
- **`embeds.sh` refuses a path that is not plain and relative, and refuses the three built names.** The destination is built by joining the path to the site directory, so `..`, a leading slash or a scheme would write outside it; and a copy landing on `index.html` would replace the deployable with a contract's bytes, which is the one thing the build's gate exists to prevent.
- **The `expect` comparison normalises whitespace on both sides**, so a caller can paste the build's own three lines without reformatting them, and sorts both, so the file order the build happens to print in is not part of the contract.
- **The version test asserts which workflows pin devbox**, not only that the pins agree. Without it the check would pass by reading nothing if the regex or the directory ever changed — the shape of the first review's F29.

## Discoveries

1. **The pre-commit YAML check caught a real error I would otherwise have pushed.** `run: echo "verify-only: built and checked, deployed nothing"` is invalid YAML: an unquoted scalar containing `: ` reads as a mapping. Fixed with a block scalar, and then checked across all three workflows for the same shape — none other has an inline `run:` scalar containing a colon.
2. **`cast` reports a revert from `request()` as `execution reverted`, which `embeds.sh` reads as "nothing usable" rather than as a status.** The message is accurate and the refusal is right, but a reader of the output might expect a status line. Left as it is: the alternative is parsing an error string, which is worse.
3. **Both chains' `widget.js` are byte-identical**, so the two copies share one `integrity` value. That is a property of this fixture, not of the mechanism, and a reader comparing the two snippets should not conclude the hash is per-resource rather than per-bytes.

## Open questions

None.
