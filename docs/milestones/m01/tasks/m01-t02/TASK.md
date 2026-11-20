# m01-t02 — Limits under test

Milestone: [M01](../../MILESTONE.md) · Phase: 1 — Prove what is claimed

The RPC adapter's size cap, timeout and failover each have a test that fails when the limit is removed, and the decoder fuzz runs a million inputs in CI. Today all four exist in the code and none is exercised.

## Plan

Measured at scoping, 2026-11-20, on `main` at `7f5344f`: `src/adapters/rpc/fetch.ts` implements a per-endpoint timeout (`timeoutMs`, default 10,000), a body cap (`maxBytes`, default 16 MiB) and ordered failover; no test imports the file. The fuzz in `test/abi.test.ts` runs 20,000 inputs in 123 ms, so a million is about six seconds.

Every test here substitutes the adapter's `fetch` option. None opens a socket and none sleeps longer than 200 ms.

1. **`test/rpc-fetch.test.ts`**, Arrange-Act-Assert, one behaviour per test:
   - a result is decoded and returned, and the request carries `eth_call`, the address, the calldata and `latest`;
   - a body one byte over `maxBytes` is `GatewayError("upstream")`, and the stream is cancelled rather than read to the end;
   - a `fetch` that never settles until its `signal` aborts is `upstream` within `timeoutMs` plus a margin, with `timeoutMs` set to 50;
   - a body that stalls after the headers is the same: the timeout covers the read, not only the connect;
   - a non-JSON body, a JSON body with neither `result` nor `error`, and a `result` that is not hex are each `upstream`;
   - an HTTP 429 and an HTTP 500 are each `upstream`;
   - with two endpoints, the first failing in each of the ways above, the second's answer is returned and the first was called once;
   - a revert (`error.code` 3, and separately a message containing `revert`) is `RpcRevert`, and the second endpoint is **not** called;
   - an unconfigured chain is `unknown-chain` and calls nothing.
2. **Fix what those tests find.** Two things are expected. `callOne` never looks at `res.ok`, so a 429 whose body happens to be JSON with a `result` would be believed: make a non-2xx status a failure of that endpoint. And nothing bounds the total: `n` endpoints can take `n × timeoutMs`. State that bound in the `createFetchRpc` doc comment and assert it in a test with two stalling endpoints. Anything else found is fixed if it is a limit not being enforced, and reported if it is a design question.
3. **Each limit is shown to bite.** For the cap, the timeout and failover in turn: disable it locally, run the suite, confirm a test fails, restore. `HANDOFF.md` names the failing test for each. Nothing from this step is committed.
4. **End to end, once.** One case in `test/resolve.test.ts` wires `createFetchRpc` with a failing `fetch` into `resolve()` and asserts the response is 502, `text/plain`, with the fixed message and nothing from the endpoint's body in it.
5. **The fuzz count.** `test/abi.test.ts` reads `GW44_FUZZ_RUNS`, default 20,000; a value that is not a positive integer fails the test. The CI workflow's `make test` step sets it to `1000000`. The assertion message keeps the run index so a failure is reproducible.
6. **Docs.** `SECURITY.md` § What the gateway defends gains the limits with the tests that hold them, and § What it does not defend keeps the line on endpoint availability, corrected if step 2 changed what is true.

## Acceptance criteria

- Milestone criterion 7: `devbox run -- node --test test/rpc-fetch.test.ts` passes, with a test apiece for the cap, the never-answering endpoint, the non-JSON body and the failover.
- Milestone criterion 8: the CI run on the PR's head shows the fuzz test passing with `GW44_FUZZ_RUNS=1000000`.
- `devbox run -- make check` exits 0, and `devbox run -- make test` completes in under 10 seconds with the default run count.
- `HANDOFF.md` names, for each of the three limits, the test that failed when it was disabled.
- `dist/gw44-sw.js` stays under 16,384 bytes.

## Out of scope

- Health tracking, retries, backoff, racing endpoints, quorum: M04, or not at all.
- Changing the default `timeoutMs` or `maxBytes`. If a default looks wrong, say so in the handoff with the reason.
- The service worker and the boot script.

## Open questions

None.

## Context

- Depends on m01-t01 for the workflow file that step 5 edits.
- [SECURITY.md](../../../../../SECURITY.md) § Trust model, item 2.
