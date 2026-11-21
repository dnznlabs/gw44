# m02-t01 — handoff

PR: #81 · Branch: `m02/t01-test-site` · 2026-11-21 · steps 4 and 5 amended after the merge

`.github/workflows/pages-test.yml` builds the two-chain fixture and deploys it to Pages, by hand from `main` only, leaving the three hashes in its log. `tools/check-site.ts` checks a deployed gateway in a browser, seven cases per engine, each in a fresh context and each printing what it saw; `make check-site URL=… ENGINES="…"` runs it. `tools/verify.sh` gains a `site` pass under `VERIFY_SITE`, comparing the bytes a controlled page receives on a real host with the hashes `cast` already gave it. Nothing under `src/` or in `tools/build.ts` changed.

**Steps 4 and 5 were done after the merge**, as the plan requires, and are recorded in § Steps 4 and 5 below. The site is live at `https://gw-test.dnzn.dev`, deployed twice from `main` at `b721e5a`. **The stop condition was not met: the cold deep link recovers in all three engines.** Everything in the criteria table above the deploy was measured against `tools/serve.ts` on loopback, which is why one case failed there and should have.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Step 0's gate | pass | `node -e … resolveCname gw-test.dnzn.dev` prints `[ 'dnznlabs.github.io' ]`; `gh api repos/dnznlabs/gw44/pages --jq '.build_type, .cname, .https_enforced'` prints `workflow`, `gw-test.dnzn.dev`, `true`; #51 is `CLOSED` |
| Milestone criterion 1 — `make check-site` in three engines | **pass on the real host** (§ Steps 4 and 5); on loopback, six of seven, below | `make check-site URL=http://localhost:39097` on the correct two-chain build: six `ok`, one `FAIL` — "a cold deep link recovers from the host's own 404 page: first response **200**". That failure is correct here: `tools/serve.ts` answers an unknown path with `index.html` at 200 where Pages answers with `404.html` at 404, and the case asserts 404. It is the one case that can only pass against the real host, and it is the assumption this milestone rests on |
| Milestone criterion 2 — four `site … ok` lines | pass | `VERIFY_SITE=http://localhost:39097 devbox run -- make verify` prints **22** `ok` lines: the existing twelve comparisons, **four `site`**, and six browser. The four are `11155111 site root 64305 B`, `11155111 site widget 8509 B`, `84532 site root 64305 B`, `84532 site widget 8509 B`, each `chain=…` equal to `site=…` |
| Step 3's mismatch run | pass | a site built from a configuration whose `84532` is the **retired** `App` `0x00a90943…5bae` (which still answers there: `codesize` 7,155): `84532 site root chain=64305 B 847bb75bfe7750da… site=62261 B 96a557a04771eeae… MISMATCH`, `verify: a comparison failed`, exit 2. The other three lines stayed `ok` |
| Milestone criterion 5 — the favicon case | pass, with what it does not assert named | `the favicon is answered 404 on a controlled page (origin not asserted: a synthesised response leaves no trace to attribute): status 404, controlled true, 0 resource-timing entries ok`. § Deviations 1 says why the origin and the no-chain-call halves are not asserted here and what does hold them |
| The deploy log's hashes equal a local build's | **pass** (§ Steps 4 and 5) | the workflow runs `GW44_CONFIG=test/fixtures/gw44.two-chains.json node tools/build.ts` with no redirection, so the three lines are in the log. A local build of that configuration at `7b624b5` prints worker `a2d1c97f04e76ef06d45939074fbd10eef61d5d2165d925c7c4357ce304881c4` 7,460 B |
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
5. **The resource-timing entry count for the favicon fetch differs by engine** — **0** in Chromium, **1** in Firefox and WebKit — which is a second reason it was no use as an attribution instrument, and why the case asserts only the status. Found on the real host, after the loopback run had already shown the control problem.
6. **WebKit's no-worker path reports the document title as `app`, where Chromium and Firefox report `RAKE`.** The case passes, because it asserts a title that is neither empty nor the shell's rather than a particular string. Not investigated: it is the application's document and this task changes nothing in `src/`. Worth knowing before anyone asserts an exact title on that path.
7. **A service worker's own script fetch is invisible to Playwright's page-level events.** Measured three ways, all zero, while the worker was installing and controlling pages throughout. Together with m01-t07's finding that a synthesised response leaves no trace either, the rule for this repository is that the worker's own traffic cannot be observed from the page — only its effects can.

## Steps 4 and 5 — the real host

Added after the merge. `main` at **`b721e5a`**, deployed by the `pages-test` workflow twice: [run 44931679646](https://github.com/dnznlabs/gw44/actions/runs/44931679646) and [run 44932027211](https://github.com/dnznlabs/gw44/actions/runs/44932027211), both green. Two runs, which is what the redeploy measurement needed and no more.

### The deploy's hashes equal a local build's

The first deploy's log prints, and a local `GW44_CONFIG=test/fixtures/gw44.two-chains.json node tools/build.ts` at `b721e5a` prints the same three lines:

```
df3ffc2f42d3bf82eaa259aef345fdb87acac9a9be8c52d05f6afcc800d320cd     8912  404.html
a2d1c97f04e76ef06d45939074fbd10eef61d5d2165d925c7c4357ce304881c4     7460  gw44-sw.js
df3ffc2f42d3bf82eaa259aef345fdb87acac9a9be8c52d05f6afcc800d320cd     8912  index.html
```

After the second deploy, `curl https://gw-test.dnzn.dev/gw44-sw.js | sha256sum` is `a2d1c97f04e76ef06d45939074fbd10eef61d5d2165d925c7c4357ce304881c4` — the site serves the bytes the build produced.

### `make check-site`: seven cases, three engines, all pass

`make check-site URL=https://gw-test.dnzn.dev ENGINES="chromium firefox webkit"` — every case `ok` in every engine, exit 0. **The stop condition is not met.** The case it turns on:

```
chromium a cold deep link recovers from the host's own 404 page: first response 404, title "RAKE" ok
firefox  a cold deep link recovers from the host's own 404 page: first response 404, title "RAKE" ok
webkit   a cold deep link recovers from the host's own 404 page: first response 404, title "RAKE" ok
```

So the assumption this milestone rests on holds: Pages answers a path it has no file for with `404.html` at status **404**, that page is the shell, and the shell recovers to the application in all three engines. On loopback the same case reads `first response 200` and fails, because `tools/serve.ts` answers 200 — which is why it could only ever be settled here.

### `make verify` against the site

`VERIFY_SITE=https://gw-test.dnzn.dev devbox run -- make verify` exits 0 with four `site` lines, each hashing what a controlled page received on the real host against what `cast` returned:

```
11155111 site root 64305 B chain=009003a25ef2f15e… site=009003a25ef2f15e… ok
11155111 site widget 8509 B chain=8b6bbc8892657a88… site=8b6bbc8892657a88… ok
84532 site root 64305 B chain=847bb75bfe7750da… site=847bb75bfe7750da… ok
84532 site widget 8509 B chain=8b6bbc8892657a88… site=8b6bbc8892657a88… ok
```

### Step 5 — what Pages sends

Read with `curl -D -` on 2026-11-21, after the first deploy:

| Path | Status | `content-type` | `cache-control` |
|:--|--:|:--|:--|
| `/` | 200 | `text/html; charset=utf-8` | `max-age=600` |
| `/11155111/` (no file) | **404** | `text/html; charset=utf-8` | none sent |
| `/nope` (no file) | **404** | `text/html; charset=utf-8` | none sent |
| `/gw44-sw.js` | 200 | `application/javascript; charset=utf-8` | `max-age=600` |
| `/favicon.ico` (no file) | **404** | `text/html; charset=utf-8` | none sent |

**`access-control-allow-origin: *` is sent on every one of those responses**, including the two static files and the 404s. That is the header m02-t02's `integrity` snippet needs, and it is present without being asked for.

The 404 responses carry the same `etag` as `/` and no `cache-control`, which is consistent with Pages serving one `404.html` for every unknown path.

**A redeploy, measured across the two runs.** `gw44-sw.js` before and after, with byte-identical content both times:

```
before   last-modified: Sat, 21 Nov 2026 17:44:59 GMT   etag: "6b01d89b-1d24"   age: 143
after    last-modified: Sat, 21 Nov 2026 17:49:01 GMT   etag: "6b01d98d-1d24"   age: 0
```

So **Pages derives its etag from modification time and size rather than content** — `-1d24` is the size, 7,460 bytes, and unchanged; the first component moved with the deploy — and the edge's `age` resets to 0, so a deploy invalidates the CDN even when the bytes are the same.

**Whether a redeploy reaches a returning visitor on the next navigation: not measured, and the reason is worth more than a guess.** Two things block it. A second deploy at the same commit produces byte-identical files, so there is nothing to detect even in principle; and the worker's own script fetch is **not observable** from the page — three instruments returned nothing, namely Playwright `response` events on the page (0 requests for `/gw44-sw.js` on a first visit, on a returning navigation, and after an explicit `registration.update()`, although the worker demonstrably installed), resource timing, and the update call's own return. What can be said from the measurements above plus the registration's `updateViaCache: "none"`, stated as inference and not as a measurement: the script's `max-age=600` does not delay an update, because that option makes the registration bypass the HTTP cache; and the deploy resets the edge `age` to 0, so a returning visitor's navigation is not served a stale shell from the CDN. Measuring it properly needs a deploy whose bytes differ, which this task cannot produce without changing the build.

## Open questions

None.
