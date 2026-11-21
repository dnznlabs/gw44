# m01-t03 — Verify against the chain, and a build that can be checked

Milestone: [M01](../../MILESTONE.md) · Phase: 1 — Prove what is claimed

`make verify` proves that what the gateway serves for a live contract is byte-for-byte what the chain returns, using a decoder that is not the gateway's. `make build` prints the hash of each file it writes, and CI proves the build is reproducible.

## Plan

Measured at scoping, 2026-11-20, on `main` at `d4fe4c9`, fixture `0x00a9f390a6010d045e0d34856048ddd6910d25ba` on Sepolia:

- `make get` on the root and on `widget.js` gives SHA-256 `009003a2…` and `8b6bbc88…`; the same bytes cut out of `cast call`'s raw hex with shell arithmetic give the same two hashes (64,305 and 8,509 bytes). So criterion 4 holds today and this task makes it a command.
- Two builds on one machine into different directories are byte-identical. Across machines is not known: nothing prints a hash in CI yet.
- Criterion 6 already passes: `dist/` is the three files, `gw44-sw.js` is 7,077 bytes, `npm ls --omit=dev` is empty. This task gates it rather than achieves it.
- `cast` and `xxd` are not in this project's `devbox.json`.

1. **`cast` in devbox.** Add `foundry@1.7.1` to `devbox.json` and re-lock with the devbox version CI pins. Report in `HANDOFF.md` what it adds to a cold and a cached CI run. If the cached run grows by more than 60 seconds, stop and say so before going further.
2. **`tools/verify.sh`**, bash, `set -euo pipefail`. For each chain in `VERIFY_CHAINS` (default `11155111 84532`) and the address in `VERIFY_ADDRESS` (default the fixture), with the chain's first endpoint read from `chains.json` by `node -e`:
   - root: `cast call $A 'html()' --rpc-url $R`, then in shell take the length word at hex offset 66 and that many bytes from offset 130, to raw bytes, to SHA-256. Compare with `node tools/get.ts http://localhost:8244/$CHAIN/$A/ | sha256sum`.
   - widget: `cast call $A 'request(string[],(string,string)[])' '["widget.js"]' '[]'`, body offset from the second word, length and bytes from there, same comparison against `…/widget.js`.
   - one line per comparison with chain, resource, byte count, both hashes and `ok` or `MISMATCH`; exit non-zero on any mismatch, on a zero-length body, or if either side fails.
   The script must not import or call anything under `src/` for the reference side. Use `xxd -r -p` if present, else `node -e` reading hex from stdin; say which in a comment. `make verify` runs it. Check: it prints four `ok` lines and exits 0; with `VERIFY_ADDRESS` set to an address with no code it exits non-zero.
3. **Show it can fail.** Temporarily make `decodeString` in `src/core/abi.ts` drop the last byte, run `make verify`, confirm `MISMATCH` and a non-zero exit, restore. Name the output in `HANDOFF.md`; commit nothing from this step.
4. **Hashes from the build.** `tools/build.ts` prints, after writing, one line per file in `dist/`: SHA-256, byte count, name, sorted by name. It fails if `gw44-sw.js` exceeds 16,384 bytes or if `dist/` holds any file other than the three.
5. **Reproducibility in CI.** A new workflow step after the unit tests: build into two directories (`GW44_OUT`), `diff -r` them, fail on any difference; fail if `npm ls --omit=dev --parseable` prints more than the root line. The step's log carries the hashes from step 4.
6. **Across machines.** Compare the hashes CI printed for the PR's head with a local `make build` at the same commit. If they are equal, record both in `HANDOFF.md`. If they differ, find the cause (the bundler's platform binary, a path, a timestamp) and fix it if the fix is a build option; otherwise stop and report, because criterion 5 then needs a ruling.
7. **Criterion 3, scripted.** `make verify` ends by starting `tools/serve.ts` on a free port, loading the fixture's root for each chain in headless Chromium, and failing unless the document's title stops being the shell's within 20 seconds with no page error. Reuse the launch code shape from `test/e2e`; do not add it to `make check`.
8. **Fold in #10 and #12.** Set `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` in the `e2e` recipe in `mk/10-gateway.mk`, with the reason as a comment there, and remove the workflow's copy and its comment; correct the local-install sentences in `README.md` and `AGENTS.md`. Make `devbox.json`'s `$schema` name the version the workflow pins. `Closes #10` and `Closes #12` in the PR.
9. **Docs.** `README.md` § Development gains `make verify` and what it needs (network, the fixture's chains). `AGENTS.md` § Commands says verify is not part of `make check` and why: CI is offline.

## Acceptance criteria

- Milestone criterion 3: `make verify`'s browser stage passes for both chains.
- Milestone criterion 4: `devbox run -- make verify` prints four `ok` lines and exits 0; `HANDOFF.md` shows the mismatch run from step 3.
- Milestone criterion 5: the CI run on the PR's head passes the two-directory comparison, and the hashes it printed equal those of a local build at the same commit, both quoted in `HANDOFF.md`.
- Milestone criterion 6: a build with a fourth file in `dist/`, and one with the size limit lowered below the worker's size, each fail; shown locally and reverted.
- `devbox run -- make check` exits 0 and CI is green in three engines, with the host-check variable no longer in the workflow file.
- `make verify` is not reachable from `make check` or from the workflow.

## Out of scope

- Running `make verify` in CI, on a schedule or otherwise. A gate that depends on public endpoints is a decision, not a detail.
- Mainnet, or any contract but the fixture.
- Signing or publishing build hashes anywhere: M02.
- #11, the forced-reload case in Firefox and WebKit.
- Anything under `src/` beyond the temporary edit in step 3.

## Open questions

None.

## Context

- Runs after m01-t02; both edit `.github/workflows/ci.yml`.
- #10, #12, and #8's `HANDOFF.md` § Discoveries 1 and 4.
- [Spike 001](../../../../spikes/001-static-gateway.md) § Evidence, for the fixture's sizes.
