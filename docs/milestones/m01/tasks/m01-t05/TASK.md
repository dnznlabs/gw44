# m01-t05 — The base-URL page

Milestone: [M01](../../MILESTONE.md) · Phase: 2 — Make it handable

A visitor to the gateway's bare URL sees what gw44 is and how to form a URL, where today they see one line saying there is no contract. Two carried gaps close with it: the forced-reload path in Firefox and WebKit, and the devbox version that can drift between two files.

## Plan

Runs after m01-t04, and uses its `targetOf` and its `PIN`. Read at scoping, 2026-11-20, on `main` at `a881db7`:

- `src/adapters/sw/boot.ts` already stops before registering a worker when the URL names no contract, and prints `gw44: no contract in this URL` into `#gw44`.
- `src/adapters/sw/shell.html` is 14 lines; the built `index.html` is 8,270 bytes.
- `tools/build.ts` already substitutes one marker in the shell, `/*@boot@*/`.

1. **The page.** New file `src/adapters/sw/about.html`: a fragment, no `<script>`, no external resource, no inline event handler, wrapped in one element with `id="gw44-about"` and the `hidden` attribute. It says, in this order and in under 120 words: what gw44 is (one sentence, from the README's first line); the host form, with the host written as a `<span id="gw44-host">` that holds the literal text `this-host` in the source; the path form, in an element with `id="gw44-path-form"` and `hidden`; that the page is read from the chain in the visitor's browser and nothing is stored on the gateway; a link to `https://github.com/dnznlabs/gw44`.
2. **The build.** `shell.html` gains the marker `<!--@about@-->` after `#gw44`. `tools/build.ts` replaces it with `about.html`'s contents in an unpinned build and with nothing in a pinned one, by the same function-replacement the boot marker uses.
   - Check: `grep -c gw44-about` is 1 on an unpinned `index.html` and 0 on a pinned one; the unpinned `index.html` grows by at most 1,500 bytes over the size m01-t04 left, both sizes in `HANDOFF.md`; `gw44-sw.js` does not change, shown by its hash before and after.
3. **The boot script.** Where `boot()` now says `gw44: no contract in this URL`, it instead removes `#gw44`, sets `#gw44-host` to `location.host`, unhides `#gw44-path-form` when `isLoopback(location.hostname)`, and unhides `#gw44-about`. It still returns before any worker is registered and before any RPC call. The malformed-URL branch is unchanged.
4. **Browser test, three engines**, in `test/e2e/gateway.e2e.ts`: at `http://localhost:<port>/` the about element is visible, contains the port in `#gw44-host`, shows the path form, and the fake chain's hit counter has not moved; `navigator.serviceWorker.getRegistration()` resolves to `undefined`. A second case with JavaScript disabled in the context asserts the `<noscript>` text is what shows.
   - Check: `devbox run -- make e2e` passes in Chromium locally; CI passes in three engines.
5. **#11, forced reload in Firefox and WebKit.** In the forced-reload case, replace the DevTools-protocol reload with a way every engine has, in this order of preference: (a) a second context option or navigation that loads the page with the worker installed but not controlling it; (b) the keyboard shortcut for a hard reload. The case counts only if, on the reloaded page before recovery, `navigator.serviceWorker.controller` is `null` while a registration exists; assert that. If neither reaches that state in an engine, leave the case Chromium-only as it is and add one line to `SECURITY.md` § What it does not defend saying the forced-reload recovery is proven in Chromium only and why. Either outcome closes #11; `HANDOFF.md` says which, per engine.
6. **#27, the devbox version.** New `test/devbox-version.test.ts`: reads `devbox.json`'s `$schema` and `.github/workflows/ci.yml`'s `devbox-version`, extracts the version from each, and asserts they are equal, failing with both values in the message. It runs under `make test`.
   - Check: edit one of the two versions, see the test fail, restore; the failing output goes in `HANDOFF.md`.
7. **Docs.** `README.md` § URLs says the bare URL shows this page. `AGENTS.md` § Gotchas: the about fragment is compiled into unpinned pages only, and must stay free of script.
8. `Closes #11` and `Closes #27` in the PR.

## Acceptance criteria

- Milestone criterion 9: step 4's cases pass in three engines in CI, and the built `index.html` contains exactly one `<script>` element, shown by a count in `HANDOFF.md`.
- A pinned build contains none of the about fragment (step 2's check).
- `gw44-sw.js` is byte-identical before and after this task.
- #11 is closed by a passing case in each engine or by the `SECURITY.md` line, engine by engine.
- #27's test fails when the versions differ and passes when they agree.
- `devbox run -- make check` exits 0; CI is green in three engines.

## Out of scope

- `docs/DEPLOY.md` and anything about a host, DNS or certificates: M02, where the deployment it describes is made.
- The host form itself. [#33](https://github.com/dnznlabs/gw44/issues/33) asks whether it becomes one label; this page prints whatever form the code honours, so a ruling changes one line of `about.html` in the task that changes `parseTarget`.
- Styling beyond what makes the text readable on a phone without a stylesheet file: a few inline declarations at most.
- Translations, a logo, a list of chains, a form that builds a URL.
- The worker, the core, and `tools/verify.sh`.

## Open questions

None.

## Context

- Milestone criterion 9; #11; #27.
- [m01-t04](../m01-t04/TASK.md), for `targetOf` and the pinned build's markers.
- [#33](https://github.com/dnznlabs/gw44/issues/33), the host-form decision.
