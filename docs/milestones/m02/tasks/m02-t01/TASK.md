# m02-t01 — A real host: the test site

Milestone: [M02](../../MILESTONE.md) · Phase: 1 — A real host

A two-chain build of the rake fixture is live on GitHub Pages under a real hostname, deployed by a workflow run by hand, and one script checks a deployed gateway in three browser engines. It is the first time this build is served by anything but `tools/serve.ts`.

## Plan

Read at scoping, 2026-11-20, on `main` at `2147cac`:

- `test/fixtures/gw44.two-chains.json` is the fixture on `11155111` (default) and `84532`.
- `tools/verify-browser.ts <url> [timeoutMs]` loads one URL in Chromium and uses no `page.evaluate`, because it is typechecked without the DOM library.
- `AGENTS.md` § Gotchas: a multi-chain build answers `/favicon.ico` itself with a 404 and no call.
- Latest releases of the Pages actions: `actions/configure-pages` v6.0.0, `actions/upload-pages-artifact` v5.0.0, `actions/deploy-pages` v5.0.1; the workflow here already uses `actions/checkout@v7`.
- This repository is private and has no Pages site. The agents' accounts have push access and not admin, so Pages and its custom domain are the Product Owner's to set.

This task changes nothing under `src/` and nothing in `tools/build.ts`. The security review of m01-t06 names a commit; a change to a reviewed file would cost a second run.

0. **Gate.** The action issue for the test site is closed: the hostname resolves to GitHub Pages and Pages is enabled on this repository with **GitHub Actions** as the source, the custom domain set and HTTPS enforced. Check: `dig +short CNAME <host>` prints `dnznlabs.github.io.` and `gh api repos/dnznlabs/gw44/pages --jq '.build_type, .cname, .https_enforced'` prints `workflow`, the hostname and `true`. Do not start step 2 before both.
1. **The deploy workflow, run by hand.** `.github/workflows/pages-test.yml`, triggered by `workflow_dispatch` only, on `main` only. Permissions `contents: read`, `pages: write`, `id-token: write`; environment `github-pages`; `concurrency` so two runs cannot overlap. Steps: checkout, devbox as `ci.yml` installs it, `npm ci`, `GW44_CONFIG=test/fixtures/gw44.two-chains.json node tools/build.ts` with the three hashes left in the log, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5` with `dist/`, `actions/deploy-pages@v5`. No `CNAME` file: with Actions as the source the custom domain is the repository's setting.
   - Check: the run is green and its log carries three hashes equal to a local build of the same commit with the same configuration.
2. **`tools/check-site.ts <base URL>`**, typechecked by `tsconfig.e2e.json` so it may use `page.evaluate`. Engines from `GW44_ENGINE`, as the e2e suite takes them; a `make check-site URL=<base URL> ENGINES="…"` target runs it once per engine. Each case in a fresh context, each printing one line with `ok` or `FAIL` and what was seen; exit non-zero on any `FAIL`:
   - `/` ends on `/11155111/` and the application's document has replaced the shell.
   - `/84532/` opened cold: the first response has status 404 (Pages' `404.html`), and the page still ends on the document. Print the status seen, so the handoff records what Pages actually does.
   - `/84532` ends on `/84532/`.
   - `/nope` shows the gateway's 404 text and the document is not the application.
   - `/#/docs` opened cold ends on `/11155111/#/docs`.
   - On a controlled page, the response for `/favicon.ico` is a 404 that came from the service worker, and no request left the page for any endpoint in `chains.json` while it was fetched. If an engine cannot report where a response came from, assert the first half in Chromium only and say so in the test's name.
   - With service workers blocked, `/` still ends on `/11155111/` showing the document.
   The chains and the default are read from the same configuration file the site was built from, passed as a second argument, not written into the script.
3. **`make verify` against a deployed site.** With `VERIFY_SITE=<base URL>` set, `tools/verify.sh` adds one pass after the existing ones: for each chain, in a controlled Chromium page on the site, `fetch` the chain's root and its `widget.js`, hash the bytes received, and compare with the reference hashes already computed from `cast`. One line each, labelled `site`. The existing passes are unchanged and still run.
   - Check: `VERIFY_SITE=https://<host> devbox run -- make verify` prints four `site … ok` lines and exits 0. Then show it can fail: point `VERIFY_SITE` at a site built from a configuration whose `84532` address is another contract (a second manual run of step 1's workflow from a branch is not allowed; use `tools/serve.ts` on loopback with such a build), see `MISMATCH`, and name the output in `HANDOFF.md`.
4. **Deploy and check.** Run the workflow from `main` once this task's PR has a green CI run (the workflow file has to be on the default branch to be dispatched: say in the PR that the first deploy follows the merge, and do steps 4 and 5 on `main` straight after, reporting in a follow-up comment on the PR and an amended `HANDOFF.md` in a docs-only PR). Then `make check-site URL=https://<host> ENGINES="chromium firefox webkit"` from CI's runner image or this machine, whichever launches all three, and `VERIFY_SITE=… make verify`.
   - Stop and report if the cold deep link does not recover in any engine. That is the unproven assumption this milestone rests on, and the answer changes the milestone, not this task.
5. **Record what the host does.** In `HANDOFF.md`: the status and the `content-type` Pages sends for `/`, for an unknown path and for `/gw44-sw.js`; its cache headers for `gw44-sw.js` (the worker registers with `updateViaCache: "none"`, so say whether a redeploy reaches a returning visitor on the next navigation, measured by deploying twice); whether Pages sends `access-control-allow-origin` on a static file, which m02-t02's `integrity` snippet needs.
6. **Docs.** `README.md` § Release Info names the test site and what it serves. `AGENTS.md` § Commands lists `make check-site` and `VERIFY_SITE`.

## Acceptance criteria

- Milestone criterion 1: `make check-site` passes against the test site in three engines; the output is in `HANDOFF.md`.
- Milestone criterion 2: `VERIFY_SITE=… make verify` prints four `site … ok` lines, and the mismatch run of step 3 is shown.
- Milestone criterion 5, as amended with this plan: the favicon case of step 2 passes on the test site.
- The hashes in the deploy run's log equal a local build's at the same commit.
- `git diff 2147cac -- src tools/build.ts` is empty at the PR's head, or names only what m01-t06's own fixes changed.
- `devbox run -- make check` exits 0; neither `check-site` nor `VERIFY_SITE` is reachable from it or from `ci.yml`.

## Out of scope

- A workflow another repository can call, inputs, a pinned commit, hash comparison against caller-supplied values: m02-t02.
- Static copies of `widget.js` and the `integrity` snippet: m02-t02. Step 5 only measures the header they depend on.
- `docs/DEPLOY.md` and the phone check: m02-t03.
- Deploying on push, on a schedule, or from a branch.
- Any change under `src/` or to `tools/build.ts`. A defect found on the real host is reported, with the measurement, and becomes its own task.
- A one-contract build's `/favicon.ico` (#36): closed by documentation in m02-t03.

## Open questions

None for the engineer. The hostname is the Product Owner's, by the decision issue this milestone opens; step 0 waits for it.

## Context

- [M02](../../MILESTONE.md) criteria 1, 2 and 5; roadmap decisions 9 to 11.
- [m01-t05](../../../m01/tasks/m01-t05/TASK.md) and its `HANDOFF.md`, for the multi-chain build, the first-visit redirect and the fragment.
- #36.
