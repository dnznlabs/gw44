# m02-t02 — One workflow any project can call

Milestone: [M02](../../MILESTONE.md) · Phase: 2 — A workflow anyone can call

A project deploys its gateway from its own repository by calling `deploy-pages.yml` here with a commit of this repository and its own configuration. The deploy also publishes copies of the scripts other sites embed, each checked against the chain, and prints the snippet that pins them.

## Plan

Measured on the test site by m02-t01, 2026-11-21 ([handoff](../m02-t01/HANDOFF.md) § Steps 4 and 5): Pages answers an unknown path with `404.html` at status 404 and the shell recovers in three engines; it sends `access-control-allow-origin: *` on every response; `gw44-sw.js` is served with `cache-control: max-age=600`. Not measured: whether a redeploy reaches a returning visitor.

This task changes nothing under `src/` and nothing in `tools/build.ts`. Changes to reviewed files wait for m02-t04, which makes them together and runs the review once.

1. **`.github/workflows/deploy-pages.yml`**, triggered by `workflow_call` only.
   - Inputs: `gw44-ref` (required; must match `^[0-9a-f]{40}$`, a branch or tag name is refused), `config` (required; path in the caller's repository to its `gw44.json`), `chains` (required; path to the caller's chains file), `embeds` (optional; space-separated resource paths, such as `widget.js`, to publish as static copies), `expect` (optional; the three hash lines a build of `gw44-ref` with this configuration must print), `verify-only` (boolean, default false; build and check, deploy nothing).
   - Secret: `gw44-read-key` (optional; a read-only deploy key for this repository, needed by a caller in another repository while this one is private).
   - Permissions `contents: read`, `pages: write`, `id-token: write`; environment `github-pages`; `concurrency` group `pages`, never cancelled.
   - Every value from an input or from the event reaches a shell through `env:`, never by `${{ }}` inside a `run:` line (#83).
   - Steps: check out the caller's repository; check out `dnznlabs/gw44` at `gw44-ref` into `gw44/`, with `ssh-key` when the secret is set; fail if `config` or `chains` is empty or names no file; devbox and `npm ci` inside `gw44/`; build with `GW44_CONFIG` and `GW44_CHAINS` pointing at the caller's files and `GW44_OUT` at a new directory; print the three hashes; if `expect` is set, compare and fail on any difference; the embeds of step 2; unless `verify-only`, configure, upload and deploy.
   - A guard that fails the job if the build's first line does not say `pinned to`: an unpinned gateway must never reach a project's domain by this workflow (the deployment half of #73).
2. **Static copies for embeds.** New `tools/embeds.sh <site dir>`, run by the workflow after the build. For each configured chain and each path in `embeds`: read the resource twice, once through `tools/get.ts` under the configuration and once with `cast` cut apart by hand as `tools/verify.sh` does; fail unless the two agree byte for byte and the chain answered status 200; write the bytes to `<site dir>/<chain>/<path>`, or to `<site dir>/<path>` for a one-contract configuration. Then print, per copy, the snippet a host page uses:

   ```html
   <script src="https://<host>/<chain>/widget.js" integrity="sha384-…" crossorigin="anonymous"></script>
   ```

   `<host>` comes from an environment variable the workflow sets from the Pages site's URL. The script refuses a path that is not a plain relative path (no `..`, no leading `/`, no scheme), and refuses to overwrite one of the three built files.
   - The copies are written into the site directory after `tools/build.ts` has finished and checked its own output, so the build's three-file gate is untouched.
   - Check, locally against `tools/serve.ts`: with the two-chain fixture and `embeds=widget.js`, two files are written whose SHA-256 are the `8b6bbc88…` `make verify` prints; with a chain's address pointed at a contract that does not answer `widget.js`, the script exits non-zero and writes nothing for that chain.
3. **The test site through the workflow.** `pages-test.yml` becomes a caller: `workflow_dispatch` on `main`, one job that `uses: ./.github/workflows/deploy-pages.yml` with this repository's own commit, the two-chain fixture, `chains.json`, `embeds: widget.js` and `secrets.GW44_READ_KEY` passed as `gw44-read-key`, so the key path is the one exercised even though the token would do here. Gate for this step: [#86](https://github.com/dnznlabs/gw44/issues/86) closed. If it is not, do steps 1, 2, 5 and 6, open the PR saying so, and stop there.
4. **On the real host**, after the merge, as m02-t01 did it (a comment on the PR and a Markdown-only amendment to `HANDOFF.md`). Keep to three deploy runs.
   - Deploy. `make check-site` in three engines still passes. Extend `tools/check-site.ts` with one case: a page on a second origin (a `data:` or loopback page will do if it is a different origin) loads `https://gw-test.dnzn.dev/84532/widget.js` by `<script src>` with the printed `integrity` and `crossorigin`, and the script runs; with one character of the hash changed, the browser refuses it. Milestone criterion 4.
   - The same URL requested by the application's own document, on a controlled page, is still answered by the service worker from the chain: assert the response did not come from the network. If no engine can tell, say so and assert it in Chromium only.
   - **A redeploy reaching a returning visitor.** Visit the site in a persistent browser profile. Deploy again with a configuration whose default chain is `84532`, which changes the worker's bytes. In the same profile, navigate to `/` once more, then once again: record on which navigation `/` first ends on `/84532/`, and how long after the deploy that was (the worker's file is served `max-age=600`, and the registration uses `updateViaCache: "none"`). Then deploy the original configuration back. Three runs in all. Stop and report if a returning visitor is still on the old default 15 minutes after the deploy.
5. **`test/devbox-version.test.ts` reads every workflow file** that pins a devbox version, not `ci.yml` alone, and fails naming the file that differs (#83).
6. **Docs.** `README.md`: the test site section says it is deployed by the reusable workflow and carries the widget copies. `AGENTS.md` § Commands: `tools/embeds.sh`. Nothing in `docs/DEPLOY.md`, which is m02-t03.
7. `Closes #83` in the PR.

## Acceptance criteria

- Milestone criterion 3: the test site is deployed by `deploy-pages.yml` called from `pages-test.yml` at a full commit SHA; a call with a branch name as `gw44-ref`, with an empty `config`, and with an `expect` that differs by one character each fail before anything is deployed, shown by three `verify-only` runs or, to spare the runs, by a local script that feeds the same inputs to the same shell steps. Say which.
- Milestone criterion 4: step 4's embed case passes in three engines, including the refusal.
- The redeploy measurement of step 4 is recorded, with the navigation on which the new default was seen and the time since the deploy.
- No file under `src/` and not `tools/build.ts` differs from `main` at the branch point.
- `devbox run -- make check` exits 0; the deploy workflow is not reachable from `ci.yml`.

## Out of scope

- A call from a second repository. The workflow is written for it and the key path is exercised here, but that GitHub lets another private repository resolve `uses: dnznlabs/gw44/…@<sha>` is only proven by one doing it: it is the first step of rake's m05-t04.
- rake's `gw44.json`, chains file, workflow and endpoints.
- `docs/DEPLOY.md` and the phone check: m02-t03.
- Any change to a reviewed file: #57, #58, #59, #62, #63, #73 (the build's half), #74 and #82 are m02-t04.
- Deploying on push or on a schedule, in this workflow or in the test caller.
- Caching the embed copies in the service worker, or serving them from it: the worker answers same-origin requests from the chain as it does today.

## Open questions

None.

## Context

- [M02](../../MILESTONE.md) criteria 3 and 4; roadmap decision 10.
- [m02-t01's `HANDOFF.md`](../m02-t01/HANDOFF.md), § Steps 4 and 5 and § Discoveries 7 (a worker's own traffic cannot be seen from the page; assert its effects).
- #83, #73, #86.
