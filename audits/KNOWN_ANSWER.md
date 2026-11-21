# Known answers

Three things this project knew by hand before any audit ran, each with a file, a line and a
mechanism. **They are given to the rollup only and never to a leg**: the runner reads this file from
the repository, which the legs cannot see, and appends it to the rollup prompt.

Grading against them is the only evidence about this method that is not an assertion. **A miss is a
publishable result** — it is recorded plainly in `AUDIT.md`, per leg, and not offset against what
the legs did find. Judge each on the code location and the mechanism, not on wording: a leg that
reports the same gap under another name found it.

Two of the three are open issues; the third was open at scoping and has since been answered by the
code, which is why its statement below is not the issue's.

## 1. One page load can wait `n × timeoutMs` when endpoints hang (#18)

**Where.** `src/adapters/rpc/fetch.ts`, `createFetchRpc`.

**What.** The timeout is per endpoint and nothing spans the call. A chain with two endpoints that
never answer keeps a visitor on the shell for the sum of the timeouts before the 502 — at the
defaults, twenty seconds for two endpoints — rather than for one timeout. It is deliberate and
pinned by a test, so that changing it is a visible decision, and it is stated in the adapter's own
doc comment.

**What counts as finding it.** Any statement that the per-endpoint timeout accumulates across the
endpoint list, so that total latency scales with the number of endpoints. A leg that only observes
"there is a timeout" has not found it.

## 2. The browser's own `/favicon.ico` is a chain call where every path is the contract's (#36)

**Where.** `src/core/target.ts`, `pinnedTarget`, in the one-contract branch; reached through
`targetOf` in `src/adapters/sw/config.ts`.

**What.** In a build pinned to one contract, every path on the origin is that contract's resource,
so the browser's unprompted `/favicon.ico` request becomes an ERC-5219 call. A contract that does
not answer that path costs one reverting `eth_call` per page load against the owner's endpoint.
Measured: Firefox and WebKit request it, the headless Chromium shell does not. A build configured
with several chains does **not** have this shape, because `/favicon.ico`'s first path segment is not
a configured chain and is answered as a 404 with no call.

**What counts as finding it.** Any statement that a browser-initiated request the application never
asked for reaches the contract in the one-contract build, with the cost named. Naming `favicon.ico`
specifically is not required; naming the asymmetry between the two builds is a stronger answer.

## 3. How the pin is enforced, and what a source reader will get wrong (#37)

**Where.** `src/adapters/sw/config.ts`, `targetOf` and the `__GW44_PINNED__` declaration;
`tools/build.ts`, the `define` block.

**Restated for this run, and the restatement is the point.** #37 as filed says a pinned build
"still carries the unpinned URL parser" and that the pin holds at run time only. **That was true
when the issue was filed and is false of the code being reviewed.** m01-t05 added a boolean
`__GW44_PINNED__` to the build's `define`, and `targetOf` selects on that constant alone, so the
bundler folds the branch away and each build ships one parser. Measured at the review commit:
`grep -c localhost` on the built `gw44-sw.js` is 1 for the unpinned build and 0 for the one-contract
and several-chain builds, and `pinnedTarget`'s own marker is 0 in the unpinned worker and 1 in both
others.

**Why it is still a known answer.** The legs read source, not the artifact, and
`src/core/target.ts` contains both parsers at the review commit. A leg that reports "a pinned build
also carries the parser that reads a contract out of the URL" has read the source correctly and
reached a conclusion that is wrong about what ships. So this item grades two different things:

- **Found, and right:** the leg notices `__GW44_PINNED__` and says the unused parser is eliminated
  at build time — or asks what the define does to the bundle rather than assuming it does nothing.
- **Found, and wrong:** the leg claims a pinned build ships the unpinned parser, or that the pin is
  enforced only at run time. Record this as a false positive **and** as having located the right
  code, because it is the more useful outcome to know about: it says a source-only review cannot see
  a build-time guarantee, which is a limit of the method and not of the leg.
- **Missed:** the leg says nothing about which parser a given build contains.

A leg that recommends removing one parser from the source, or splitting the module, is making a
design suggestion rather than reporting a defect; note it as such.
