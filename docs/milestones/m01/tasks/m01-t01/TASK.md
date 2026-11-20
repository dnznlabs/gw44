# m01-t01 — CI and three browser engines

Milestone: [M01](../../MILESTONE.md) · Phase: 1 — Prove what is claimed

Every push runs `make check` in CI, and the browser suite runs in Chromium, Firefox and WebKit there. Today the suite has run in one Chromium build on one machine, and nothing runs on a push.

## Plan

Measured at scoping, 2026-11-20, on `main` at `7f5344f`: `devbox run -- make check` exits 0 (31 unit, 9 browser). `npx playwright-core install --dry-run` names `chromium-headless-shell` 1255, `firefox` 1572 and `webkit` 2388 for the pinned `playwright-core@1.65.1`. On the development VM (Debian 13, aarch64) Chromium launches; **Firefox and WebKit do not**, for missing system libraries. So how the suite behaves in those two engines is not known, and CI is where this task finds out unless the libraries are installed first (open question 1).

1. **Let Playwright find its own browsers.** In `test/e2e/gateway.e2e.ts`, delete `findChromium` and its imports and launch with no `executablePath`. Remove `GW44_CHROMIUM` from the file header, `mk/10-gateway.mk` and `README.md`. Add a `browsers` target to `mk/10-gateway.mk` running `npx playwright-core install $(ENGINES)`, with `chromium` installing as `chromium-headless-shell`. Check: `make browsers && make e2e` passes with `~/.cache/ms-playwright/chromium_headless_shell-1243` moved aside.
2. **Parameterise the engine.** The suite reads `GW44_ENGINE` (`chromium`, `firefox`, `webkit`; default `chromium`; anything else exits non-zero) and launches that type. `make e2e` runs the suite once per name in `ENGINES`, default `chromium`, stopping at the first failure. An engine that is named and cannot launch is a failure, never a skip. Check: `make e2e ENGINES=nope` exits non-zero; `make e2e` still passes.
3. **Skip by name, with the reason, what an engine cannot do.** One is known: the forced-reload case drives the Chrome DevTools Protocol, so outside Chromium it is `test.skip` with that reason in the call. Any other skip this task adds takes the same form and is listed in `HANDOFF.md`.
4. **The secret scan needs a whole-tree mode.** In `.pre-commit-config.yaml`, beside the existing `betterleaks` hook, add a second with `alias: betterleaks-tree`, `entry: betterleaks dir . --redact --verbose`, `pass_filenames: false`, `stages: [manual]`. The existing hook scans the staged diff, which under `--all-files` is nothing. Check: `devbox run -- pre-commit run betterleaks-tree --hook-stage manual --all-files --verbose` prints `scanned ~` followed by a six-digit or longer byte count.
5. **The workflow.** `.github/workflows/ci.yml`, on `push` and `pull_request`, `permissions: contents: read`, one job on `ubuntu-latest`:
   - `actions/checkout@v7`; `jetify-com/devbox-install-action@v0.15.0` with `devbox-version: 0.18.0` and `enable-cache: true`.
   - The scan from step 4, failing unless the log matches `scanned ~[1-9][0-9]{5,} bytes`.
   - `devbox run -- npm ci`, then `devbox run -- npx playwright-core install --with-deps chromium-headless-shell firefox webkit`.
   - `devbox run -- make test`, then `devbox run -- make e2e ENGINES="chromium firefox webkit"`.
   - Last: fail if `git status --porcelain` prints anything.
6. **Make the two new engines pass.** A failure in Firefox or WebKit is one of three things, and each has one answer. A defect in `src/adapters/sw/`: fix it here if the fix is under about 30 lines and changes no behaviour Chromium's cases pin; otherwise skip the case by name and report it. A test that assumed Chromium: fix the test. Something the engine cannot do under Playwright: skip by name with the reason. Every one of these goes in `HANDOFF.md` § Discoveries, including what was fixed.
7. **Docs.** `README.md` § Development and `AGENTS.md` § Commands and § Gotchas say how the engines are chosen and that only Chromium is expected to run on a machine without the system libraries.

## Acceptance criteria

- Milestone criterion 1: the workflow run on the PR's head commit is green, and `devbox run -- make check` exits 0 locally.
- Milestone criterion 2: that run's log shows the suite executed under `chromium`, `firefox` and `webkit`, and every skipped case appears with its reason.
- `make e2e ENGINES=nope` exits non-zero.
- The workflow fails when a tracked file is modified by the build: shown once, by a throwaway commit on a scratch branch whose run is linked in `HANDOFF.md`.
- `grep -rn GW44_CHROMIUM .` outside `docs/` prints nothing.

## Out of scope

- New test cases, the fuzz count, timeouts and size caps: m01-t02.
- `make verify` and anything that reaches a live chain from CI: m01-t03. CI stays offline.
- Any change to `src/core/`. If an engine failure points there, stop and report it.
- Installing system packages on the development VM.

## Open questions

1. **Question.** Should Firefox's and WebKit's system libraries be installed on the development VM?
   **Options.** (a) Yes: `sudo npx playwright-core install-deps firefox webkit`, once, by whoever administers the VM. Engine failures are then debugged locally in seconds. (b) No: the two engines run in CI only, and each attempt at a fix is a push and a wait.
   **Recommendation.** Yes; step 6 is where this task's time goes, and it is far cheaper with a local loop.
   **Default.** No install. The engineer works step 6 through CI. Gates nothing.
   **Record.** This file, and `AGENTS.md` § Gotchas.

## Context

- [Spike 001](../../../../spikes/001-static-gateway.md) § Not measured.
- The whole-tree scan and the workflow's shape follow the ones `rake` already runs.
