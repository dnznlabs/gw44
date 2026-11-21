# m01-t07 — Close what the review found

Milestone: [M01](../../MILESTONE.md) · Phase: 2 — Make it handable

Three findings of the m01-t06 review are fixed, each with a test that fails before the fix: a capped response can no longer decode to many times its size, a document the size cap admits can be decoded, and the no-worker fallback no longer renders a document whose headers it cannot honour. One more run of the review over the files touched finds none of the three.

## Plan

Runs after m01-t06's PR is merged: it edits the rows that PR writes in `SECURITY.md` and uses the runner it adds. The finding numbers are those of `audits/2026-11-20/AUDIT.md`.

Read at scoping, 2026-11-21, on `main` at `8dccf73`:

- **F3.** `decodeRequestResult` in `src/core/abi.ts` caps the number of headers at 64 and nothing else. Each pair's key and value offsets are checked against the data's bounds only, so all 128 may point at one string. The review's second leg measured a 4,196,608-byte return decoding to 536,870,912 characters. Read in the source by the architect, not re-run.
- **F4.** `hexToBytes` validates with `/^0x([0-9a-fA-F]{2})*$/`. Run by the architect under this project's Node: 3 MiB of bytes passes in 16 ms; 4, 5 and 8 MiB each throw `RangeError: Maximum call stack size exceeded`. The default cap of 16 MiB of reply text admits about 8 MiB of return data, so a document between 4 and 8 MiB fails at every endpoint in turn and is served as `502`.
- **F2.** `renderInline` in `src/adapters/sw/boot.ts` keeps `content-type` from the response and writes the body with `document.write`. No other header of the contract's reaches the browser on that path, and the function resolves whatever target the URL names although its comment says only the root. Neither leg showed the fallback being forced inside another site's frame; step 3 measures that before anything is changed.
- **F1.** Several chains of one project share an origin by decision 9, and `README.md` says so. The comment on `Pins` in `src/core/target.ts` says the project's storage stays separate by chain, which is the opposite.
- The fixture's root answers with one header, `Content-Type`.

1. **F3: bound the headers by size.** Tests first, in `test/abi.test.ts`: return data whose 64 pairs all alias one 64 KiB string must throw `GatewayError("bad-response", …)`; a response with 64 distinct small headers still decodes. Then in `decodeRequestResult`, add `MAX_HEADER_BYTES = 16_384` and sum the byte lengths of every key and value as they are read, throwing before any is decoded to text once the sum passes it. The count cap stays.
   - 16,384 is chosen, not measured: it is four times the largest header set the architect could name, a long content security policy. Stop and report if any fixture, or the live fixture on either chain, exceeds 2,048.
   - Check: the aliasing test fails at this step's parent commit and passes after; the decoder fuzz still passes.
2. **F4: validate hex without a regular expression.** Tests first: 8 MiB of bytes as hex decodes; a 5 MiB string with one non-hex character at its end throws `bad-response`, and so does an odd-length string and one without `0x`. Then `hexToBytes` checks the prefix and the length, and converts in one loop over character codes that throws on the first character that is not a hex digit. No `RangeError` can leave it.
   - Check: the 8 MiB test throws `RangeError` at the parent commit and passes after. `HANDOFF.md` quotes the time to decode 3 MiB before and after, and 8 MiB after. Stop and report if 3 MiB takes more than twice what it took before.
3. **F2: measure, then make the fallback refuse what it cannot honour.**
   - Measure first and change nothing: with a stub contract answering its root with `x-frame-options: DENY`, and separately with `content-security-policy: frame-ancestors 'none'`, load it inside a frame on another loopback origin in each engine. Record per engine whether the worker-served document is refused, and whether the fallback is reached inside the frame at all. The table goes in `HANDOFF.md`. Whatever it shows, the rest of this step is done; the table says how reachable the finding was.
   - Then `renderInline` writes the document only when all three hold: the page is the top-level one (`window.top === window.self`); the target's resource is the root of its contract; and the response carries none of `content-security-policy`, `content-security-policy-report-only`, `x-frame-options`, `cross-origin-opener-policy`, `cross-origin-embedder-policy`, `cross-origin-resource-policy`, `permissions-policy` or `content-disposition`. Otherwise it calls `say` with one sentence: the page needs a service worker and this browser is not providing one here. The function's comment is made true.
   - Browser tests with service workers blocked, three engines: a document with no such header still renders at the top level, as today; the same document with a content security policy shows the sentence and not the document; a non-root path shows the sentence; and, where an engine can reach the fallback in a frame, the framed load shows the sentence. A case an engine cannot run is skipped by name with the reason.
4. **F1: correct the comment** on `Pins` in `src/core/target.ts` to say what `README.md` says: the chains of one project share an origin, storage and wallet permissions, and an application separates its own state by chain. No behaviour changes.
5. **Sizes and hashes.** The three builds' sizes against `main` at this task's branch point, in `HANDOFF.md`. Stop and report if the unpinned worker grows by more than 300 bytes or any worker exceeds 12,000. CI's three pairs equal local builds at the same commit.
6. **One more run.** `make audit` over the files this task changed under `SCOPE`, by whatever narrower scope the runner offers; a full run if it offers none. Its directory is committed beside the first. F2, F3 and F4 must not be found again. Anything new follows m01-t06 step 8, including its stop.
7. **`SECURITY.md`.** The rows for F2, F3 and F4 gain the fixing commit and the test that covers each; no row is removed. § What it does not defend, or the section that fits, says that a contract setting any header of step 3's list has no fallback without a service worker, and that the fallback never renders inside a frame. § Review status names the second run. F1's row says the comment is corrected and the property stands.
8. **Docs.** `README.md` says the same about the fallback in one sentence where it describes a first visit. `AGENTS.md` § Gotchas: the header list in `boot.ts` is the list of headers the fallback cannot honour, and a header added to what the worker passes through is considered for it.

## Acceptance criteria

- No return data within the size cap decodes to more than `MAX_HEADER_BYTES` of header text: step 1's test, failing before and passing after.
- Return data of 8 MiB decodes, and malformed hex of any length is `bad-response` and never a `RangeError`: step 2's tests, the first failing before.
- Without a service worker, a document is rendered only at the top level, only at its contract's root, and only when it carries none of step 3's headers: step 3's cases in three engines, with the per-engine table of what was reachable before.
- The second run's `AUDIT.md` lists none of F2, F3 and F4, and every finding it accepts is dispositioned.
- `devbox run -- make check` exits 0, CI is green in three engines on the PR's head, and `make verify` prints its eighteen `ok` lines.
- Milestone criteria 5 and 6 still hold for all three builds: step 5.

## Out of scope

- Decision 9. The chains of one project share an origin; F1 is recorded, its comment corrected, and nothing else changes.
- Honouring a contract's headers in the fallback by translating them, for instance a policy into a `meta` element. That covers part of one header and none of the framing ones, and a fallback that honours some of what a contract asked for is worse than one that declines.
- #18, how long a page load can wait across endpoints, and any change to failover.
- Every other finding of m01-t06: each is a `carried` issue of its own.
- The size cap's value and the timeout's.

## Open questions

None.

## Context

- m01-t06's `HANDOFF.md`, `audits/2026-11-20/AUDIT.md` findings F1 to F4, and its `SECURITY.md` rows.
- m01-t06 `TASK.md` step 8, for what a new finding does.
- Roadmap decision 9.
