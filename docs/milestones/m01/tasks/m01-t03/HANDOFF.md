# m01-t03 — handoff

PR: #23 · Branch: `m01/t03-verify` · 2026-11-20

`tools/verify.sh` pulls the fixture's root document and its `widget.js` out of `cast call`'s raw return data with shell arithmetic and `xxd`, importing nothing from `src/`, and compares the SHA-256 of those bytes against what the gateway serves for the same URL on both chains; it then loads each chain's root in headless Chromium through `tools/serve.ts` and passes only when the contract's document has replaced the shell. `tools/build.ts:48-67` prints a hash and byte count per file written and refuses a `dist/` holding anything but the three deployable files or a worker over 16,384 bytes, and a new workflow step builds twice into separate directories outside the checkout, diffs them, and asserts the deployable has no runtime dependencies. The plan was followed except for the two entries below.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Milestone criterion 3 — browser stage, both chains | pass | `devbox run -- make verify` at `cb99d05`: `verify-browser: 11155111 shell replaced, title "RAKE"` and `verify-browser: 84532 shell replaced, title "RAKE"`, then `11155111 browser ok` / `84532 browser ok`; exit 0 |
| Milestone criterion 4 — four `ok` lines, exit 0 | pass | same run, four comparisons: `11155111 root 64305 B … ok`, `11155111 widget 8509 B … ok`, `84532 root 64305 B … ok`, `84532 widget 8509 B … ok`; exit 0. Step 3's mismatch run, with `decodeString` dropping its last byte: `11155111 root chain=64305 B 009003a2…2622 served=64304 B b1b89d34…ad97 MISMATCH` and `84532 root chain=64305 B 847bb75b…7f6f served=64304 B fbecfb78…0585 MISMATCH`, `verify: a comparison failed`, exit 2; `src/core/abi.ts` reverted, `git status --porcelain` empty |
| Milestone criterion 4 — negative, address with no code | pass | `VERIFY_ADDRESS=0x…dEaD devbox run -- make verify`: `the chain returned no usable body — MISMATCH (Warning: Contract code is empty)`, exit 2 |
| Milestone criterion 5 — reproducible, and equal across machines | pass | [run 44848689700](https://github.com/dnznlabs/gw44/actions/runs/44848689700) on `cb99d05`, step "The build is reproducible, and has no runtime dependencies": `diff -r` of `dist-a` and `dist-b` silent, `npm ls --omit=dev --parseable` one line. CI and a local `GW44_OUT=… node tools/build.ts` at `cb99d05` printed the same three lines: `07d3c27d7963d7e132181c843195436208cf63a55ed50048e5a0e8df1754d17a 8021 404.html`, `b359f39c5994943f9437a6109382f848ea140fe2f9e4ce00e75da79b335f1bb0 7144 gw44-sw.js`, `07d3c27d…d17a 8021 index.html`. `cb99d05` is the branch's last commit that can change the build; this file is the only one after it, and `git diff --name-only cb99d05..HEAD` names it alone |
| Milestone criterion 6 — a fourth file fails | pass | a `stray.txt` placed in the output directory: `Error: /tmp/t03-neg/ holds stray.txt; the deployable is only 404.html, gw44-sw.js, index.html`, exit 1; nothing committed |
| Milestone criterion 6 — the size limit fails | pass | `SW_LIMIT` temporarily `4_096`: `Error: gw44-sw.js is 7144 B, over the 4096 B limit`, exit 1; `tools/build.ts` reverted, `git status --porcelain` empty. The worker is 7,144 B against the 16,384 B limit in the branch |
| `make check` exits 0; CI green in three engines; host-check variable gone from the workflow | pass | `devbox run -- make check` locally: 50 unit tests pass, 0 fail, then `==> e2e: chromium` 9 pass; exit 0. Run 44848689700: 50 unit, chromium 9, firefox 8, webkit 8, 0 fail in each (the forced-reload case is chromium-only — #11, out of scope). `grep -c PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS .github/workflows/ci.yml` = 0, same grep on `mk/10-gateway.mk` = 2, the variable and the comment giving its reason |
| `make verify` unreachable from `make check` and the workflow | pass | `check: test e2e` (`mk/10-gateway.mk:53`); `grep -n verify .github/workflows/ci.yml` prints nothing; `verify` appears only at `mk/10-gateway.mk:14,56-57` |

## Cost of `foundry` in CI (step 1)

The devbox install step is the only one that moved. Cold, on the first run after re-locking — [44847328195](https://github.com/dnznlabs/gw44/actions/runs/44847328195) — it took 67 s and the job 244 s. Cached, it took 26 s on 44848271244 and 18 s on 44848689700, against 17 s, 18 s and 22 s on the three most recent pre-foundry runs on `main` (44844612097, 44845124518, 44845437513); those jobs took 126 s, 202 s and 194 s, and the two cached runs here took 176 s and 182 s. So the cached run grows by single-digit seconds on the step that changed and the job totals stay inside the pre-foundry spread. The 60-second stop condition is not met.

## Deviations from the plan

1. **Step 4's gate broke the e2e harness, and the harness was fixed rather than the gate.** `test/e2e/gateway.e2e.ts` built into `GW44_OUT` and wrote its `chains.json` fixture into that same directory, so the new "nothing but the three files" check failed every e2e test in [44848271244](https://github.com/dnznlabs/gw44/actions/runs/44848271244) with `holds chains.json`. The fixture now gets its own temporary directory (`cb99d05`, `test/e2e/gateway.e2e.ts:80-84`). The alternative was to list `chains.json` in `EXPECTED`, which would have weakened the criterion to buy back a test's convenience; a chain map is a build input, not an artefact. The task put `src/` out of scope but said nothing about `test/`, so this is declared rather than assumed.
2. **Step 7's title test is not sufficient on its own, so the stage waits on the shell element first.** The plan asked the browser stage to fail "unless the document's title stops being the shell's". Chromium reports the page URL as the tab title while a load is in flight, so a title that merely differs from `gw44` can be `Loading http://localhost:…` — an earlier draft passed that way without the document ever rendering. The stage now waits for the shell's `#gw44` to detach, the signal `test/e2e/gateway.e2e.ts:206` uses, and then additionally requires a title that is neither empty nor the shell's (`tools/verify-browser.ts:36-55`). The 20-second budget is `VERIFY_TIMEOUT_MS`, default 20000.

## Decisions

- The reference side reads only the low 8 bytes of each 32-byte ABI word, through `word_at` (`tools/verify.sh:45`), because bash arithmetic is 64-bit. A length or offset needing more would not fit in memory; the comment says so at the function.
- The script prints which hex decoder it used — `hex decoded with xxd` in the header line — so a run on another machine is self-describing rather than silently different (`tools/verify.sh:31-39`).
- The browser stage uses Playwright's API only, no `page.evaluate`, so that `tsconfig.json` needs no DOM lib for a file that lives outside the test tree.

## Discoveries

- The step 3 mismatch lands on the root resource only: `widget.js` reaches the page through the ERC-5219 `request` decoder, not `decodeString`, so the four comparisons exercise two independent paths and none of them is redundant.
- `xxd` is not a devbox package — it comes from the host on this machine — so `make verify` is not hermetic. The `node -e` fallback exists for a devbox-only machine but nothing has run it, and nothing will, since verify is deliberately out of CI.
- `devbox.json`'s `$schema` had drifted from the version the workflow pins (corrected under step 8). Nothing asserts the two agree, so they can drift again silently.
- `make serve` depends on `build`, which now fails on a stray file in `dist/`. A leftover from an older build in a working `dist/` turns `make serve` into an error until `make clean`; harmless but surprising.

## Open questions

None.
