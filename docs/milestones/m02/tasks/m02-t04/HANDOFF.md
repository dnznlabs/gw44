# m02-t04 — handoff

PR: #TBD · Branch: `m02/t04-carried` · 2026-11-21

Eight findings the two reviews left open are closed, each with a test that fails at the branch point and passes at the head, and the review ran once over the result. The changes are in `src/core/resolve.ts`, `src/core/target.ts`, `src/adapters/sw/{sw,boot,config,fallback}.ts`, `tools/build.ts` and two new files under review scope, `tools/inline.ts` and `tools/chains.ts`. The configuration file gains one key, `"frame"`, and nothing else about any URL form changed.

**Step 11 is not in this PR.** The redeploy goes through the workflow that m02-t02 put on `main`, so it follows the merge: one deploy run and `make check-site` in three engines, reported as a comment here and a Markdown-only amendment to this file, as m02-t01 and m02-t02 did it.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Each of the eight has a test that fails at the parent commit and passes at the head | pass, all eight | § The eight, one row each. Every "fails at the parent" figure below was produced by running the head's test file in a worktree of `0518587` |
| A root document is refused in a cross-origin frame in three engines by default, and loads with `"frame": "any"` | pass | `test/e2e/multi.e2e.ts`, "a cross-origin frame of a root document is refused by default" and "with `\"frame\": \"any\"` another origin may frame the root document", green in chromium, firefox and webkit. The pair differ in that one key and in nothing else: two builds of the same configuration, two origins, the same two stubs. At the parent the refusal case fails with `Missing expected rejection` — the document rendered inside the frame |
| `audits/<date>/AUDIT.md` exists with both legs non-empty, re-reporting none of the eight as open | pass | `audits/2026-11-21b/AUDIT.md` — leg 1 four findings, leg 2 sixteen, reducing to 18: 1 High, 2 Medium, 8 Low, 7 informational. **None of the eight is re-reported as open**; leg 1 confirmed six and leg 2 five, #73 and #82 silent in both, and neither leg repeated the `__proto__` claim the previous run corrected. § The review run |
| A one-contract configuration and the equivalent `PIN` still produce byte-identical output | pass | `diff -r` of the two output directories is empty; all three files hash equal, `gw44-sw.js` at `ec189a4e…`. A configuration that sets `"frame": "any"` is a different build and hashes differently (`8f572ef2…`), which is the point of the key |
| `devbox run -- make check` exits 0, three engines | pass | `devbox run -- make check` exits 0: 118 unit tests, 0 fail, and 28 e2e in chromium, 27 pass 1 skip. The other two engines were run **one at a time** as `make e2e ENGINES=<engine>`, both exit 0 — firefox and webkit 28 tests, 26 pass, 2 skips — because all three engines in one `make check` exceeded this machine's memory bound (6,065 MiB observed against a 6,016 MiB limit) and was killed. CI runs the three in one job on its own runner. Every skip is pre-existing and named: the CDP-only forced reload (firefox and webkit), and the fallback-inside-a-frame case that no engine can reach |
| `make verify` passes | pass | `devbox run -- make verify` exits 0: `verify: every comparison and every browser load passed`, including both pinned passes and both configured passes against the live Sepolia and Base Sepolia contracts |
| CI green in three engines | — | awaiting the push; recorded on the PR |
| Worker sizes: stop at +400 bytes or 12,000 | pass, +214 to +223 | § Sizes |

## The eight, one row each

| # | What changed | The test, and what it does at the parent |
|:--|:-------------|:-----------------------------------------|
| #57 | `src/core/resolve.ts` serves a root document `content-security-policy: frame-ancestors 'self'`; `"frame": "self" \| "any"` in the configuration file, default `"self"`, `"any"` omits the header, no other value accepted. A `PIN=` build takes the default. Sub-paths are untouched | `test/resolve.test.ts` (four cases: the header with each setting, its absence on a sub-path with either, a contract's own policy on a sub-path still passed), `test/target.test.ts` (the key kept, left absent, and five rejected values), `test/e2e/multi.e2e.ts` (the two framing cases, three engines). At the parent the key is unknown to `parsePins` and the refusal case renders the document in the frame |
| #62 | `src/adapters/sw/sw.ts`'s fetch listener answers `/gw44-sw.js` with the gateway's 404 and no call, in every build, **by its decoded spelling as well** after the review found `/%67w44-sw.js` past the first fix; `config.ts`'s comment is now true | `test/e2e/pinned.e2e.ts`, "the worker answers its own path, in either spelling, with a 404 and no call", against a stub that **does** answer `gw44-sw.js` with a script. At the parent: status **200**, the contract's script served from the gateway's own script URL. With the raw comparison alone, the encoded spelling is also 200 |
| #59 | The counter parser moved to `src/adapters/sw/fallback.ts` as `attemptsFrom`/`attemptsValue`: only `<digit>:<integer>` with a time not in the future is a counter, anything else is the maximum | `test/fallback.test.ts`, six cases. Measured against the parent's expression, copied verbatim: **13 of 14 values a document can write license a reload there, 0 here**, including `-1:<now>`, which never reaches the maximum |
| #82 | `src/adapters/sw/boot.ts` reports a configured build's `not-found` as the worker does, `gw44: no contract at this path`; anything that is not a `GatewayError` keeps `gw44: malformed URL`. `tools/check-site.ts` asserts the sentence rather than the `gw44:` prefix | `test/e2e/multi.e2e.ts`, "a cold visit to an unconfigured chain says no contract at this path". At the parent: `gw44: malformed URL` |
| #58 | `tools/inline.ts` is the one injection site: `</script` escaped in any case, `<!--` escaped, nothing inserted but backslashes | `test/inline.test.ts`, five cases, all passing. Against the parent's expression `boot.replaceAll("</script", "<\\/script")`, **three of the five fail** |
| #63 | `tools/chains.ts` validates the chains file for both readers — chain-id keys, non-empty arrays of `https:` URLs, `http:` on loopback only, nothing else | `test/chains.test.ts`, 17 cases. And end to end: a file with `{"mainnet":["http://rpc.example.com"],"1":"https://…","31337":null}` **builds clean at the parent** and ships `http://rpc.example.com` in the worker (`grep -c` is 1); at the head the build exits 1 with `the chains file gives chain 1 a string instead of a list` |
| #73 | `tools/build.ts` rejects a set-but-empty `GW44_PIN` or `GW44_CONFIG` naming the variable; unset is still unpinned. `mk/10-gateway.mk` exports neither unless given a value | `test/build.test.ts`, three cases. At the parent both empty-variable cases fail: exit **0**, an unpinned build |
| #74 | The size gate and the unexpected-file check run before any file is written | `test/build.test.ts`, two cases: a fourth file in the output directory, and a chains file large enough to push the worker over 16,384 B. At the parent both fail **on the sentinel**, not on the exit code — `index.html` had already been replaced by the new page |

## #57's two judgement calls

**The fallback keeps rendering a root document that carries the new header, and declines any other policy.** `src/adapters/sw/fallback.ts`'s `headersAreHonourable` compares the value, not just the name: `content-security-policy: frame-ancestors 'self'` is honourable and every other directive is not. What makes that sound is where the page renders — `renderInline` returns `NEEDS_WORKER` unless `window.top === window.self`, before the chain read (`src/adapters/sw/boot.ts`, the two guards above `const res = await resolve(…)`). A page that only ever renders at the top level is **stricter** than `frame-ancestors 'self'` asks for, so nothing is being dropped; a wider `frame-ancestors`, or any other directive, would be, and is declined. The no-worker root is still proven to render: `test/e2e/multi.e2e.ts`'s "without service workers the root still ends on the default chain's prefix" is green in three engines with the header present.

**`#58`'s check is a ten-line state check, not a parser** — the plan allowed either and asked which. `test/inline.test.ts`'s `scriptBody` takes the text from the first `<script>` to the first `</script` after it, case-insensitively, which is where an HTML parser would end the element; the repository has no HTML parser and this does not justify one. The decisive assertion is that stripping the inserted backslashes gives the bundle back byte for byte, which caught a first fix of mine that lower-cased the bundle's own text: `</SCRIPT` became `<\/script`, rewriting a string literal in the program.

## Sizes

Three build shapes, against `main` at the branch point `0518587`. The gate is the worker; the page is recorded beside it.

| Build | Worker, before → after | Page, before → after |
|:--|:--|:--|
| Unpinned | 7,698 → **8,007** (+309) | 9,150 → 9,492 |
| One contract (`PIN=` or the equivalent configuration) | 7,328 → **7,646** (+318) | 8,780 → 9,128 |
| Two chains (`test/fixtures/gw44.two-chains.json`) | 7,460 → **7,778** (+318) | 8,912 → 9,260 |

The stop condition was +400 on any worker or 12,000 absolute; the largest growth is +318 and the largest worker is 8,007. **Of that, 95 bytes are the review's A12** — the eight fixes alone measured +214, +223 and +223, and reserving the worker's path by its decoded spelling as well cost the rest. Head hashes: unpinned `01dade03…`/`7bdf2cf0…`, one contract `03669683…`/`4fe5be00…`, two chains `58d03a03…`/`80970531…`. The pages are unchanged by A12: it is in the worker only.

## Deviations from the plan

1. **The audit directory is `audits/2026-11-21b`.** The second run already owns `audits/2026-11-21`, and `scripts/audit.sh` refuses to merge into an existing dated directory — correctly, since it is append-only. The run letter is the smallest change that keeps both runs readable in order.
2. **`audits/SCOPE` gained the two new files**, `tools/chains.ts` and `tools/inline.ts`, with the reason recorded beside the excluded tools: both decide what ships. So this run read 15 files where the second read 13.
3. **`mk/10-gateway.mk` is in the diff**, which `src/` and `tools/build.ts` are not alone in — it exported `GW44_PIN` and `GW44_CONFIG` unconditionally, so every `make build` handed the build an empty value and #73's own fix would have refused every build. It is #73's fix, not a separate change.
4. **`tools/get.ts` is in the diff** for the same reason twice: it reads the chains file (#63) and it resolves a root document (#57). Both are the task's "one validator, used by the build and by `tools/get.ts`" and "a build's framing setting".
5. **#57's rows in `SECURITY.md` § What it does not defend.** The plan says that section loses the framing line; there was no framing line in it to lose — the claim lived in F7's row of the findings table, which is now marked fixed. The section **gains** what `"frame": "any"` means, and § What the gateway defends gains the default, which is where the new property belongs.
6. **`SECURITY.md` gained a second table** for the 2026-11-21 run, holding the four rows this PR acts on (F14, F15, the `__proto__` correction, and I-9 from the first run). The run's other findings stay in its own `AUDIT.md`; tabulating all twenty is not this task's.

## The review run

`devbox run -- make audit AUDIT_DATE=2026-11-21b` at `e289e67`, over fifteen files — the thirteen of the previous run plus `tools/chains.ts` and `tools/inline.ts`. Leg 1 `gpt-5.6-sol` at high effort, leg 2 `opus`, rollup `opus`; the provenance block in `AUDIT.md` § 1 has the observed models, wall times and token counts as the run printed them.

**The known answer was inverted for this run.** The earlier runs' three items were open findings and graded found/missed. This run's eight are closed ones, so each item states what a **re-report** would look like, what a **confirmation** would look like, and that silence is the ordinary outcome for a fixed finding rather than a miss. The result is the one the method most needed: **no leg re-reported any of the eight**, and neither repeated the `__proto__` claim that the previous run's F13 corrected. Leg 1 confirmed six, leg 2 five; both were silent on #73 and #82, which are a build-input check and a sentence.

**What the run is worth reading for is five narrower gaps inside the fixes**, which is what a review run over one's own fixes is for:

| | Gap | Disposition |
|:--|:--|:--|
| A12 | `/%67w44-sw.js` got past #62's reservation and reached the contract — the invariant `config.ts` states was still one percent-escape wide | **fixed here**, `5abe39d`, with the test asking for both spellings; with the raw comparison alone the encoded one is answered 200 by the contract |
| A13 | #58's escaping is not meaning-preserving inside a `u`-flagged regular expression or `String.raw` | **claim narrowed where it is made** (`tools/inline.ts`, and the test's name), carried as #99. No bundle this repository produces contains such a context |
| A1 | `frame-ancestors 'self'` names the shared origin, so #57's default does not stop one chain of a project framing another's root | the stated limit of decision 9; § What the gateway defends now says what the default does **not** reach, and the sub-path half is #96 |
| A14 | A same-origin document can write a well-formed `0:<now>` and reset the counter, so #59's "cannot license a reload" is too strong | carried as #100, with the property restated: the guard bounds this page's own reloads and was never a defence against a document that can reload the page itself |
| A5 | #74's pre-write gate compares entry names, so a planted symlink named `index.html` is followed | carried as #95 |

**One finding is a stop-and-report candidate and is the architect's call: A7.** The rule for this run is that a finding breaking contract isolation, script containment, the size cap or the timeout stops the task and is reported. A7 says a 16 MiB reply that is mostly nesting costs the worker far more than its wire bytes, which is the size cap's business, and the leg graded it Low with its figures unmeasured. **So I measured it before filing** (#93): 15.3 MiB of wire text, inside the cap, allocates **443 MiB of heap and 616 MiB of RSS in 658 ms**, about 29× the bytes, from one call. That is the same magnitude as F3 — 509 MB from 4.2 MB — which was graded Medium and fixed under review scope in m01-t07. The fix belongs in `src/adapters/rpc/fetch.ts`, which this task does not touch and whose concurrency half is already #69, so **the eight fixes are not held for it**; what is asked is whether A7 is read as a stop-and-report against this task or as M04's with #69 and #18.

Everything else got a row in `SECURITY.md` § Third run, 2026-11-21b and a carried issue: #93 (A7), #94 (A4), #95 (A5), #96 (A6), #97 (A10), #98 (A11), #99 (A13), #100 (A14), #101 (A15–A18). A3, A8 and A9 went to the issues that already hold them — #18, #61 and #60 — and A1 and A2 are stated limits.

## Decisions

- **The framing setting is two words, and a root document only.** `"frame": "self" | "any"`, nothing else accepted, no free-form policy: a project that needs more serves its page from `request()`, where it sets its own headers within the allowlist. A gateway that let a configuration file write arbitrary headers would become the place a project's security headers live, which is the opposite of one project per origin.
- **`resolve` takes the setting as a third positional argument** with a default of `"self"`, rather than on the `Target` or in an options object. The `Target` is what a URL names and this is what a build chose; an options object would carry a property name into every minified bundle for one boolean.
- **The chains validator lives in `tools/`, not `src/`.** The endpoints are compiled into the worker, so nothing validates them at run time and nothing should: the check belongs to the two programs that read the file. It is in `audits/SCOPE` all the same.
- **`parsePins` leaves `frame` absent when the file omits it**, and `config.ts`'s `FRAME` is the one place that says absent means `"self"`. Two defaults would be one too many.
- **The counter's parse and its write are a pair**, and a test asserts the pair closes: every value `attemptsValue` writes is one `attemptsFrom` reads back. A guard whose own value it rejected would reset itself on every load.

## Discoveries

1. **A `make` variable exported unconditionally is indistinguishable from a CI template that forgot its value**, which is exactly #73's shape one level up. `export GW44_PIN = $(PIN)` with `PIN ?=` hands the build an empty string on every ordinary build, so the first run of #73's own fix failed `make build`. Fixed with `ifneq ($(strip …),)` around each export.
2. **The three writes are not atomic as a set.** #74 moves both gates before the write, so a *rejected* build leaves the directory untouched; a crash between the three `writeFile`s still can't. Worth a line in the next review's informational items rather than a fix here: the deployable is uploaded as a directory, and a partial one fails the `expect` guard m02-t02 added.
3. **`Object.entries` orders integer-like keys first**, so a chains file whose errors include both a bad key and a bad value reports the value first (`{"mainnet":…,"1":"https://…"}` → chain `1`). Harmless, but it means the first error a deployer sees is not the first line of their file.
4. **`typeof null` is `"object"`**, and a message built from `typeof` names the wrong mistake at the one place a chains file is most likely to make it. `tools/chains.ts` has a four-line `kindOf` for exactly this.

## Open questions

1. **Is A7 a stop-and-report against this task, or M04's?** The measurement is in #93 and above; the fix is in `src/adapters/rpc/fetch.ts` beside #69 and #18. This is the one question in this handoff that wants an answer before the next task is planned rather than at review.
2. **Does `frame-ancestors 'self'` want to be `'none'` on a several-chain build?** On a shared origin, `'self'` lets chain A's document frame chain B's, which is the same origin and so the same weakest-link property decision 9 already states; leg 2 reported it too (A1). Narrower than this task and not obviously an improvement — a project's own pages framing each other is ordinary — so it is recorded here rather than acted on.
3. **An API key in an endpoint URL is still published in two deployed files** (2026-11-21 F13's remaining half). The validator rejects the shapes that break the gateway; it cannot tell a key from a path. That is a deployer's property and wants a line in `docs/DEPLOY.md`, m02-t03.
