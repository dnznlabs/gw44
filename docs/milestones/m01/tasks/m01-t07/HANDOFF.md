# m01-t07 — handoff

PR: #75 · Branch: `m01/t07-fixes` · 2026-11-21

F3 is bounded by size and not only by count: `decodeRequestResult` sums each key and value's byte length and throws past `MAX_HEADER_BYTES` **before** either is decoded, because decoding is where the copy is paid for. F4's regular expression is gone; `hexToBytes` checks the prefix and length, then converts in one pass that rejects the first character that is not a hex digit. F2's fallback renders only at the top level, only at the contract's root, and only when the response carries no header it cannot honour — the two pure conditions are in `src/adapters/sw/fallback.ts` so they can be tested without a browser. F1's comment on `Pins` now says what decision 9 decided. Each fix has a test that fails at its parent commit, the second review run found none of the three again, and the three builds' workers each grew 281 bytes.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| No return data within the cap decodes to more than `MAX_HEADER_BYTES` of header text | pass | `test/abi.test.ts` "headers that alias one string are refused before any of them is decoded" — 64 pairs aliasing one 64 KiB string. **Failed at `a830140`'s parent** (`✖`, the decoder returned 64 headers of 65,536 characters) and passes at `a830140`. Two companion cases hold the bound in place: a 64-pair aliased set of 64-byte strings still decodes, and 64 distinct small headers still decode |
| 8 MiB decodes, and malformed hex of any length is `bad-response` and never a `RangeError` | pass | `test/abi.test.ts` "eight mebibytes of hex decode, where the regular expression overflowed" and "one bad character at the end of a large string is bad-response, never a RangeError". **Both failed at the parent commit**; the second threw `RangeError` instead of `GatewayError`. Measured at the parent: 3 MiB ok in 75 ms, 4/5/8 MiB each `RangeError`. After: 3 MiB **14 ms**, 4 MiB 19 ms, 5 MiB 22 ms, 8 MiB 39 ms — faster, so step 2's "no more than twice" stop is not met |
| Without a worker, a document renders only at the top level, only at the root, and only with honourable headers | pass | three engines on [run 44927468674](https://github.com/dnznlabs/gw44/actions/runs/44927468674): "without service workers the root document is still rendered, at the same URL" still passes, and the new "without service workers a non-root path is declined, not rendered" passes — it asserts `#gw44` carries the sentence and that `#v` is absent. The top-level condition is the browser's; the root and header conditions are `test/fallback.test.ts`, 5 cases including every header on its own and both cases of a contract choosing the header's case. The per-engine table of what was reachable before is below |
| The second run lists none of F2, F3, F4, and every finding it accepts is dispositioned | pass | `audits/2026-11-21/AUDIT.md` § 1: "Neither leg re-reports 2026-11-20 F2, F3 or F4 … both legs' no-finding sections state the corresponding code is now bounded or restricted", recorded as the legs' reading rather than the document's verdict. Its 20 findings are dispositioned in `SECURITY.md` and as issues: new #69, #70, #71, #72, #73, #74; a correction on #63; an extension on #58; the rest repeat rows already there. **None is in m01-t06 step 8's stop class** — the only High is decision 9's shared origin, and both Medium were already recorded |
| `make check` exits 0, CI green in three engines, `make verify` prints eighteen `ok` | pass | `devbox run -- make check` exits 0 (78 unit, 24 e2e). Run 44927468674 on `1170777`: 78 unit, chromium 23 pass 1 skip, firefox 22 pass 2 skips, webkit 22 pass 2 skips. `devbox run -- make verify` prints **18** `ok` lines and exits 0 |
| Milestone criteria 5 and 6 still hold for all three builds | pass | the table below; and CI's three pairs `diff -r` clean with workers `53a0696b…f4b0` 7,698, `cc590ca2…3bc1` 7,328 and `a2d1c97f…81c4` 7,460, each equal to a local build at `1170777`. `grep -c localhost` is still 1 / 0 / 0 |

## Step 5 — sizes, and the stop condition that was met once

Baseline is `main` at the branch point, `f620f83`.

| Build | Worker at `f620f83` | Now | Delta | Page |
|:--|--:|--:|--:|--:|
| Unpinned | 7,417 | 7,698 | **+281** | 9,150 |
| One contract | 7,047 | 7,328 | +281 | 8,780 |
| Two chains | 7,179 | 7,460 | +281 | 8,912 |

**The first version of the two `abi.ts` fixes exceeded the 300-byte stop, and the fix was made cheaper rather than the number waived.** Attributed by rebuilding with `main`'s `abi.ts` and then each change alone:

| Worker | Bytes | Delta |
|:--|--:|--:|
| `main`'s `abi.ts`, every other change of this task | 7,417 | 0 |
| plus the header bound alone | 7,522 | +105 |
| plus the hex loop alone, as a 128-entry lookup table | 7,749 | +332 |
| both, lookup table | 7,854 | **+437 — over the stop** |
| both, arithmetic `nibble` instead of the table | 7,723 | +306 — still over |
| both, arithmetic plus one shared thrower | **7,698** | **+281 — under** |

The first row is worth keeping: the worker does not bundle `boot.ts`, so the fallback work and the new `fallback.ts` cost it nothing, and all 281 bytes are the two decoder fixes. No worker is near the 12,000 ceiling.

## Step 3 — what was reachable before the fix, per engine

Measured at `7f1cf00`'s parent with nothing changed, through Playwright's frame API. A cross-origin frame on `127.0.0.1` holding `localhost`'s gateway; the control is the same blocked-worker context at the top level.

| Engine | Framing header on a worker-served sub-path, framed | Shell reached in the frame | Fallback rendered in the frame | Control: fallback at the top level |
|:--|:--|:--|:--|:--|
| chromium | blocked (response arrived, HTTP 200) | yes, gateway `/` 200 | **no** | rendered |
| firefox | blocked (no response observed) | yes, gateway `/` 200 | **no** | rendered |
| webkit | blocked (response arrived, HTTP 200) | yes, gateway `/` 200 | **no** | rendered |

So the headers a contract sets on a worker-served document **do** bind in a frame in all three engines, and **no engine reaches the fallback inside a cross-origin frame**, although the shell loads there. The route leg 2 proposed for forcing the fallback from a third party does not work, which is what the rollup said would make leg 1's Medium the right grade for F2; the next run should carry that as a superseding entry. The mechanism was not established — the shell loads and `renderInline` does not complete — so the claim is bounded to these three engines, this instrument and a passing control.

## Deviations from the plan

1. **Step 3's "same document with a content security policy" browser case cannot be built, and the header condition is unit-tested instead.** `resolve()` sends the root to `html()`, which builds its response with fixed headers only, so **no contract header can reach a root response** — that is F7 of the first run, carried as #57. Since the fallback now serves only the root, the header condition cannot be exercised from a browser at all. Rather than drop the criterion, the two pure decisions moved to `src/adapters/sw/fallback.ts` and `test/fallback.test.ts` covers the header condition directly, every header on its own. The condition is correct and **inert until #57**, and both the module and `AGENTS.md` say so.
2. **A new file under review scope, `src/adapters/sw/fallback.ts`**, added to `audits/SCOPE` and so covered by the second run. The alternative was to export a predicate from `boot.ts`, which a unit test cannot import: `boot.ts` runs `void boot()` at module load.
3. **Step 3's framed browser case is a named skip rather than a test.** No engine reaches the fallback in a frame, so there is nothing to assert; the skip carries the measurement and its date as its reason, so it shows in the run output rather than only here.
4. **Step 6 ran the full scope, not a narrower one.** The runner offers no narrowing, which the step allows, and a full run also re-reads the nine files this task did not touch.

## Decisions

- **`notHex()` is a shared thrower** rather than two identical `throw` sites. It began as a size reduction, which is declared above, and it is also the only way the prefix, length and per-character checks give one message.
- **`nibble` is arithmetic, not a lookup table.** The table was 131 bytes larger in the worker and measured no faster at any size tried.
- **`UNHONOURABLE_HEADERS` includes `content-security-policy-report-only`**, which the core's allowlist does not pass. The list is what the fallback cannot honour, not what can reach it, and the two should not have to be read together to be safe. A test asserts the pairing for the seven the core does pass.
- **The header bound is checked inside the existing `try`**, so a `GatewayError` it throws is rethrown rather than relabelled "header is not UTF-8" — the existing `catch` already distinguishes them.

## Discoveries

1. **The codex leg regressed on two of the three known answers between the two runs**, with the same model, the same effort and the same prompt: it found #18 at Medium and #37 correctly on 2026-11-20, and missed both on 2026-11-21. The claude leg went the other way on #18, reporting it as a finding this time. This is the first measurement of this method's run-to-run variance, and it says a finding absent from one run is not evidence the code is sound. In `SECURITY.md` § What the review did not cover.
2. **Both legs missed #36 for the second run running** — the browser's own `/favicon.ico` reaching the contract. Two runs, four leg-attempts, zero. The known answer about run-time behaviour is the one this method does not reach.
3. **My own 2026-11-20 F15 was wrong about `__proto__`.** It said the key "survives into the `define`d literal and sets `CHAINS`'s prototype". The second run's leg 2 reported otherwise and I verified it: esbuild emits `["__proto__"]:`, a computed key, so it is an own property and the prototype is untouched — measured both ways, computed leaves the prototype and a literal changes it. On #63; the row is not edited, because audits are append-only and the correction belongs to the newer `AUDIT.md`.
4. **Leg 2's line numbers were correct throughout this run**, where on 2026-11-20 every citation into five of the twelve files pointed past the end of the file. So that anomaly was not a standing property of the leg, which is worth knowing before anyone writes a tool to check citations.
5. **The fixture answers `/favicon.ico` with a 404 rather than reverting**, measured on both chains while checking the header-byte stop. #36 assumed a revert. The cost is the same one `eth_call`; only the mechanism differs.
6. **The live fixture's header text is 49 bytes at most**, on both chains — `Content-Type` alone on the root and on `widget.js`, nothing on `favicon.ico`. Step 1's stop was 2,048, so the chosen 16,384 has three orders of magnitude of headroom over what the only real contract returns.

## Open questions

None.
