# Rollup prompt

The prompt that reconciles the legs into `audits/<date>/AUDIT.md`. `scripts/audit.sh` passes this
file verbatim and then appends a short `## This run` block naming the four paths the run produced —
the two leg directories, the provenance file and the output file — followed by
`audits/KNOWN_ANSWER.md` under `## Known answer`. Those are the only run-specific values; everything
above them is the method, and the method is the same every time. The scope is not substituted here:
it is in the provenance block, which is the record of what the legs read.

The rollup is a synthesis — deduplication across two vocabularies, severity reconciliation, deciding
what the legs actually agreed on — so a model writes it, not the shell. The shell's job is to run
the legs, put the bytes in the right directory, and record what happened.

The layout, the scope and the provenance spec are in [`../README.md`](../README.md).

---

Two independent adversarial reviews of the same files have finished. Reconcile them into one
document. You are not re-auditing the code; you are reading two reports and producing the artifact a
human will act on.

## Before anything else: check the legs are real

Read both leg directories. **An empty leg directory is a failed audit, not a clean one.** A rollup
assembled over nothing reads as "no findings", which is the most expensive lie this directory could
tell. So:

- If either leg directory is empty, or its `full-report.md` is missing or empty, **stop**. Write
  `AUDIT.md` containing the provenance block and a single line saying which leg produced nothing and
  that this audit is void. Do not summarise the surviving leg as if it were the audit.
- If a leg reports that part of its review could not run, that leg still counts — carry its own
  statement of what it could not run into § Legs below, verbatim enough to be checked.

Say in the document how many findings you read from each leg, before deduplication. A count is what
proves you read a non-empty input; "both legs reported findings" is not.

## The document

`AUDIT.md`, in this order.

**1. Provenance.** The block from the provenance file named in `## This run`, reproduced
**verbatim**. It was captured at run time by the runner. Do not retype it, do not reformat it, and
do not fill a field from your own knowledge — a value you supply is not an observed value. If a
field is absent from the provenance file, say `not reported`; never guess one.

**2. Findings.** One entry per distinct issue, most severe first. A finding is one issue even when
the two legs describe it in different words; a file and a line is what makes that recognisable. Each
entry carries:

- a title, the file and line, and the severity
- **which legs found it** — both, or which one alone
- **the severities each leg gave it**, where they differ, and which one this document adopts, with
  the reason. Do not average two severities. Do not quietly take the higher one either; say why.
- what it is and what it costs, in the shortest form that is still checkable against the code

**3. Agreement and disagreement.** What both legs found, what only one found, and — where you can
tell from the reports — whether the single-leg findings look like a genuine miss by the other leg or
like a false positive. Two legs from two labs is the whole independence claim this method makes, so
the overlap is a measurement worth recording rather than a preamble.

**4. Grading against the known answer.** The `## Known answer` section appended below is what the
project knew before any audit ran, found by hand. State, **per leg**, whether that leg found each
item, and at what severity. Judge it on the code location and the mechanism, not on wording — a leg
that reports the same gap under another name found it. Where an item says what counts as finding it,
and what counts as finding it and being wrong, follow that wording rather than your own judgement.

**A miss is a publishable result, not something to hide.** Whether a leg finds a bug that was
already known is evidence about the method that is not an assertion, and it costs nothing to record.
If both legs missed an item, say so plainly in this section and do not offset it with what they did
find.

**5. Legs.** One short paragraph per leg: what it ran, how many findings it produced, anything it
said it could not do. Link the leg directory.

## What this is not

This document does not fix anything and does not propose a patch. Triage and repair are a separate
task; every finding is carried on untouched. Do not edit any file other than `AUDIT.md`.

A past audit is never edited — this file's findings will be cited by the next one. A finding that
turns out to be wrong is corrected in the *next* audit's `AUDIT.md`, marked as superseding.


## This run

- leg 1 (codex) report directory: `/home/openclaw/src/gw44/audits/2026-11-21/gpt-5.6-sol`
- leg 2 (claude) report directory: `/home/openclaw/src/gw44/audits/2026-11-21/opus`
- provenance file, to reproduce verbatim: `/tmp/tmp.vkiz8XjH75/provenance.txt`
- write the document to: `/home/openclaw/src/gw44/audits/2026-11-21/AUDIT.md`


## Known answer

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
