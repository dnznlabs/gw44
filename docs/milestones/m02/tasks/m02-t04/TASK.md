# m02-t04 — The carried changes to reviewed code, and one review run

Milestone: [M02](../../MILESTONE.md) · Phase: 2 — A workflow anyone can call

Eight findings the reviews left open are closed in one change to the files under review scope, each with a test that fails before its fix, and the review is run once over the result. It runs before `docs/DEPLOY.md` is written and before any project deploys, so the guide and rake's site describe the code that ships.

## Plan

Runs after m02-t02 is merged. Finding numbers are the issues'; each issue names its file and lines. Read every issue and its comments before starting: two carry corrections made after filing (#58, #63).

1. **#57, a root document can be framed by any site.** `html()` returns bytes and no headers, so the root response carries no framing rule. In `src/core/resolve.ts`, the response for a root document gains `content-security-policy: frame-ancestors 'self'` unless the build says otherwise. The configuration file gains one optional key, `"frame": "self" | "any"`, default `"self"`; `PIN=` builds take the default. `"any"` omits the header. No other value is accepted, and no free-form policy: a project that needs more serves its page from `request()`.
   - `src/adapters/sw/fallback.ts`'s `headersAreHonourable` (m01-t07) now meets a root document that carries a header. Decide from m01-t07's table what the no-worker fallback does with it: a document write cannot apply `frame-ancestors`, but the fallback already renders at the top level only, which is what the header asks for. If that reasoning holds in the code as written, the fallback keeps rendering a root document whose only policy is this default, and declines one with any other directive. Say in `HANDOFF.md` which lines make it hold.
   - Tests: unit tests for the header on the root with each setting and its absence on sub-paths; in `test/e2e/multi.e2e.ts`, a page on a second origin frames the root and the frame is refused in three engines, and with `"frame": "any"` it loads; the no-worker root still renders at the top level.
2. **#62, the worker's own path.** `sw.ts`'s fetch listener answers `/gw44-sw.js` itself with a 404 and no call, in every build, so the comment in `config.ts` becomes true. A browser test: a controlled document's `fetch("/gw44-sw.js")` is a 404 and the chain saw nothing.
3. **#59, the boot loop counter.** `attempt()` in `boot.ts` accepts only a stored value of the exact shape `<integer 0–9>:<integer>` with a time not in the future, and treats anything else as the maximum, so a document that writes the key can stop a reload and cannot cause a loop. Unit-test the parser by moving it to `fallback.ts` beside the other pure decisions.
4. **#82, the sentence on an unconfigured path.** `boot.ts` reports `pinnedTarget`'s not-found as `gw44: no contract at this path`; `tools/check-site.ts`'s case asserts that sentence.
5. **#58, the script guard in the build.** `tools/build.ts` escapes `</script` without regard to case and escapes `<!--`, at the one place the boot bundle is inlined. A unit test feeds a bundle containing `</SCRIPT`, `</Script ` and `<!--` and parses the output with the repository's existing tooling or a ten-line state check; say which.
6. **#63, the chains file.** One validator, used by the build and by `tools/get.ts`: an object whose keys match `CHAIN` and whose values are non-empty arrays of `https:` URLs (`http:` allowed for loopback hosts only), nothing else. The correction on the issue stands: the `__proto__` sentence is wrong and needs no fix beyond the key check rejecting it.
7. **#73, an empty `GW44_PIN` or `GW44_CONFIG`.** Set but empty is an error naming the variable.
8. **#74, the build checks before it writes.** The size gate and the unexpected-file check run before any file is written; a failed build leaves the output directory as it found it. Test: a build into a directory holding a fourth file exits non-zero and that directory's `index.html` is unchanged.
9. **Sizes and hashes.** The three builds' sizes against `main` at the branch point. Stop and report if any worker grows by more than 400 bytes or exceeds 12,000.
10. **One review run.** `devbox run -- make audit` over `audits/SCOPE` at the head, committed as its own dated directory. `audits/KNOWN_ANSWER.md` for this run: the eight findings above, to see whether a leg re-reports a fixed one. Disposition as m01-t06 step 8 has it: a finding that breaks contract isolation, script containment, the size cap or the timeout is a stop-and-report; the rest get a `SECURITY.md` row and a `carried` issue.
11. **Redeploy the test site** after the merge, through the workflow of m02-t02 (one run), and run `make check-site` in three engines: all cases pass, including the two this task changes.
12. **Docs.** `SECURITY.md`: the eight rows marked fixed with this PR; § What it does not defend loses the framing line and gains what `"frame": "any"` means. `README.md`: the `frame` key. `AGENTS.md` § Gotchas: `/gw44-sw.js` is answered by the worker.
13. `Closes #57 #58 #59 #62 #63 #73 #74 #82` in the PR.

## Acceptance criteria

- Each of the eight has a test that fails at its parent commit and passes at the head, named in `HANDOFF.md`.
- A root document is refused in a cross-origin frame in three engines by default, and loads with `"frame": "any"`.
- `audits/<date>/AUDIT.md` exists for the run of step 10 with both legs non-empty, and re-reports none of the eight as open.
- A one-contract configuration and the equivalent `PIN` still produce byte-identical output.
- `devbox run -- make check` exits 0, CI is green in three engines, and `make verify` passes.
- After step 11, `make check-site` passes against `https://gw-test.dnzn.dev` in three engines.

## Out of scope

- The `m04` findings (#18, #60, #61, #69–#72) and the `m05` ones (#64, #66).
- A content security policy beyond `frame-ancestors`, or any header a project writes freely into the configuration.
- #36: a sentence in `docs/DEPLOY.md`, m02-t03.
- Anything in the deploy workflows beyond what step 11 runs.

## Open questions

None.

## Context

- Roadmap decision 13; `SECURITY.md` § Findings; `audits/2026-11-20/AUDIT.md` and `audits/2026-11-21/AUDIT.md`.
- [m01-t07's `HANDOFF.md`](../../../m01/tasks/m01-t07/HANDOFF.md), step 3's table, and `src/adapters/sw/fallback.ts`.
- #57, #58, #59, #62, #63, #73, #74, #82.
