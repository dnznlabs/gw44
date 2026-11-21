# m01-t02 — handoff

PR: #16 · Branch: `m01/t02-limits` · 2026-11-20

`test/rpc-fetch.test.ts` is new and covers the fetch adapter's three limits — the body cap, the per-endpoint timeout and ordered failover — in 18 tests that each substitute the `fetch` option, open no socket and sleep no longer than 200 ms. Step 2's two expected findings were both real: `callOne` never looked at `res.ok`, so a non-2xx response whose body happened to parse as JSON-RPC was believed and failover never ran, and nothing bounds the walk across endpoints, which is now stated in `createFetchRpc`'s doc comment and pinned by a test. The decoder fuzz reads `GW44_FUZZ_RUNS`, defaulting to 20,000 so `make test` stays under a second, and the workflow's typecheck-and-unit-tests step sets it to a million.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Milestone criterion 7 — `node --test test/rpc-fetch.test.ts` passes, with a test apiece for the cap, the never-answering endpoint, the non-JSON body and the failover | pass | `devbox run -- node --test test/rpc-fetch.test.ts` → **18 pass, 0 fail**. The four named cases are `a body one byte over maxBytes is upstream, and the stream is cancelled rather than drained`; `a fetch that never settles until its signal aborts is upstream within timeoutMs`; `a non-JSON body is upstream`; and five `failover: the second endpoint answers when the first gives …` cases, one per failure mode |
| Milestone criterion 8 — the CI run on the PR's head shows the fuzz passing at `GW44_FUZZ_RUNS=1000000` | pass | [run 44842073855](https://github.com/dnznlabs/gw44/actions/runs/44842073855) on `ce5bfe2`, all steps `success`. Its `Typecheck and unit tests` step logs `GW44_FUZZ_RUNS: 1000000` and `✔ no bytes a contract can return make the decoders throw anything but GatewayError (7892.804416ms)`, 50 pass / 0 fail. **This file cannot count itself:** every commit after `ce5bfe2` is this handoff, and `git diff --name-only db04735..HEAD -- . ':!docs'` lists the five code and config files (`.github/workflows/ci.yml`, `SECURITY.md`, `src/adapters/rpc/fetch.ts`, `test/abi.test.ts`, `test/resolve.test.ts`) plus the new `test/rpc-fetch.test.ts`, and not it. Locally the same value is `6.507 s` for the whole of `make test` |
| `make check` exits 0, and `make test` completes in under 10 seconds at the default count | pass | `make check` exit **0**; `make test` exit **0** in **0.949 s** (`time`, warm), **50** unit tests and **9** browser. The budget is 10 s and the default count uses a tenth of it |
| `HANDOFF.md` names, for each of the three limits, the test that failed when it was disabled | pass | § Discoveries is not the place; the three are in the table below, each measured by editing `src/adapters/rpc/fetch.ts`, running the suite, and restoring. Nothing from that step is committed — `git status --porcelain` is empty and `git diff --stat src/` shows only the committed `res.ok` change |
| `dist/gw44-sw.js` stays under 16,384 bytes | pass | `make build` → **7,144 bytes**, 44% of the cap. Unchanged by this task: nothing here touches `src/adapters/sw/` |

### Step 3 — each limit disabled, and the test that caught it

| Limit | How it was disabled | The test that failed |
|:--|:--|:--|
| Body cap | Deleted the `seen > maxBytes` check and `reader.cancel()` from `readCapped` | `a body one byte over maxBytes is upstream, and the stream is cancelled rather than drained` — hung on the endless body until the 16,380 ms test timeout, instead of failing in under a millisecond |
| Per-endpoint timeout | Deleted `signal: AbortSignal.timeout(timeoutMs)` from the request | **Two** failed, which is the point of having both: `a fetch that never settles until its signal aborts is upstream within timeoutMs` and `a body that stalls after the headers is upstream too: the timeout covers the read`, each hanging to the 6,000 ms test timeout |
| Ordered failover | `for (const endpoint of endpoints.slice(0, 1))`, so only the first is tried | **Six** failed: all five `failover: …` cases, and `the timeout is per endpoint: two stalling endpoints cost two timeouts, not one` |

## Deviations from the plan

None.

## Decisions

- **The `n × timeoutMs` bound is documented and pinned, not fixed.** Step 2 asks for the bound to be stated and asserted, and a global deadline would be a behaviour change that the plan puts in M04 ("Health tracking, retries, backoff, racing endpoints, quorum"). The test asserts the cost is *at least* two timeouts, so adding a budget later fails it and is a visible decision rather than a silent one.
- **The non-2xx check sits before the body is read.** A failed endpoint's body is never decoded at all, so a 500 with a 20 MiB body costs nothing and cannot reach the cap path. It also means `res.ok` is the first thing a reader of `callOne` sees.
- **`GW44_FUZZ_RUNS` validates rather than falls back.** An unparseable value fails the test with the value quoted. A silent fallback to 20,000 would let a typo in the workflow turn the million into the default, and criterion 8 would still read as satisfied.
- **The run index in the assertion message is `run i of runs`.** With a configurable count, `run 912345` alone does not say which run count produced it, and the pair is what makes a CI failure reproducible locally.

## Discoveries

1. **The `res.ok` gap was worse than "a 429 would be believed".** Because failover swallows every non-`RpcRevert` error, a first endpoint returning a rate-limit page that parsed as JSON-RPC would be *returned as the chain's answer* — the second endpoint was never consulted and nothing logged. The five `failover:` cases now cover one failure mode each, so a regression names which one.
2. **Nothing in the suite opened a socket, and that was worth the care.** `AbortSignal.timeout` and a `ReadableStream` that only errors on abort reproduce both stall shapes — a connect that never answers and a body that stops after its headers — in 50 ms each. The whole of `test/rpc-fetch.test.ts` is 323 ms.
3. **The strict typecheck caught dead test scaffolding.** A helper I wrote and then replaced with an inline stream failed `make test` with `TS6133: 'stallingBody' is declared but its value is never read`. Worth knowing that the four tsconfigs police tests as hard as `src/`; it is a feature, and it means a test file cannot carry commented-out alternatives.
4. **The two defaults look right and are left alone,** as the plan's out-of-scope line asks. 16 MiB is about 8 MiB of document after hex-decoding, against a 16,384-byte worker; 10 s per endpoint is generous but the `n × timeoutMs` bound is the thing that will bite first, and that is M04's.
5. **`make test` is now 0.949 s against a 10 s budget, and the million-run fuzz is 6.5 s of a 7.5 s CI step.** m01-t02's own out-of-scope list hands the fuzz count to this task; if a later task raises it again, the CI step and not the local one is where the cost lands.

## Open questions

None.
