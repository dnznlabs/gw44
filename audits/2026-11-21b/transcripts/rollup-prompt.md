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

- leg 1 (codex) report directory: `/home/openclaw/src/gw44/audits/2026-11-21b/gpt-5.6-sol`
- leg 2 (claude) report directory: `/home/openclaw/src/gw44/audits/2026-11-21b/opus`
- provenance file, to reproduce verbatim: `/tmp/tmp.WSl2mhjyqV/provenance.txt`
- write the document to: `/home/openclaw/src/gw44/audits/2026-11-21b/AUDIT.md`


## Known answer

# Known answers

What this project knew by hand before the run, each with a file and a mechanism. **They are given to
the rollup only and never to a leg**: the runner reads this file from the repository, which the legs
cannot see, and appends it to the rollup prompt.

Grading against them is the only evidence about this method that is not an assertion. **A miss is a
publishable result** — it is recorded plainly in `AUDIT.md`, per leg, and not offset against what the
legs did find. Judge each on the code location and the mechanism, not on wording: a leg that reports
the same gap under another name found it.

**This run's eight are fixes, not open findings**, which is the opposite of the earlier runs' known
answers and is deliberate. The 2026-11-20 and 2026-11-21 runs found all eight; the code under review
closes them. So each item below grades a different question from before:

- **Silent:** the leg says nothing about it. For a fixed finding this is the ordinary outcome and
  not a miss, and is recorded as silent rather than graded.
- **Re-reported:** the leg reports the fixed finding as still open. Record it as a false positive
  with the file and line it cited, because a method that re-reports its own closed findings would
  make every run's count meaningless.
- **Confirmed:** the leg names the mechanism in its no-finding section, or reports a **narrower**
  gap left by the fix. That is the useful outcome and the reason these are graded at all.

A new finding in the same file is not a re-report: it is a finding, graded on its own.

The three known answers of the earlier runs (#18's accumulating timeout, #36's favicon call, #37's
build-time pin) are unchanged and are not re-graded here; their grades are in
`audits/2026-11-20/AUDIT.md` and `audits/2026-11-21/AUDIT.md`.

## 1. A root document's framing rule (#57)

**Where.** `src/core/resolve.ts`, `html()` and `ROOT_FRAME_POLICY`; the setting in
`src/core/target.ts`'s `parsePins` and `src/adapters/sw/config.ts`'s `FRAME`.

**What.** `html()` returns bytes and no headers, so a root document used to carry no framing rule at
all. The gateway now serves it `content-security-policy: frame-ancestors 'self'` unless the
configuration file says `"frame": "any"`, which omits the header; no other value is accepted, and a
`PIN=` build takes the default. Sub-paths are unchanged — their headers are the contract's.

**Re-report looks like.** "The root document cannot carry headers, so it is always frameable."
**Confirmed looks like.** Naming the default, or reporting something narrower: that `"any"` is an
opt-out a project can set, that the policy is one directive and not a full policy, or that
`frame-ancestors 'self'` permits same-origin framing by another contract's page on a shared origin.

## 2. The worker's own path (#62)

**Where.** `src/adapters/sw/sw.ts`, the `fetch` listener; `SW_PATH` in `src/adapters/sw/config.ts`.

**What.** The listener answers `/gw44-sw.js` with the gateway's own 404 and no chain call, in every
build. Under a pin every path is a resource of the contract, so without it a contract could serve
its own bytes from the gateway's origin at the worker's script URL. The browser fetches the worker's
script outside the fetch handler, so an update is unaffected.

**Re-report looks like.** "The worker does not reserve its own path" or "a contract can serve
`gw44-sw.js`". **Confirmed looks like.** Naming the reservation, or something narrower: that the
static host still serves the real file to the browser, or that no other gateway-owned path is
reserved.

## 3. The boot reload counter (#59)

**Where.** `src/adapters/sw/fallback.ts`, `attemptsFrom` and `attemptsValue`; used by `attempt()` in
`src/adapters/sw/boot.ts`.

**What.** The counter lives in session storage, which a rendered contract document shares with the
shell. Only `<digit>:<integer>` with a time not in the future is read as a counter; anything else is
`MAX_ATTEMPTS`. So a document can stop a reload — one page renders inline instead — and cannot
license one or drive a loop. The old arithmetic read 13 of 14 values a document can write as a
licence, including `-1:<now>`, which never reaches the maximum.

**Re-report looks like.** "The loop counter is unvalidated and writable by any document."
**Confirmed looks like.** Naming the strict parse, or something narrower: that a document can still
deny the reload, that the storage key itself is not namespaced per contract, or that the clamp to one
digit is what keeps the written value readable.

## 4. The inlined boot bundle (#58)

**Where.** `tools/inline.ts`, `inlineBoot` and `isScriptSafe`; called once from `tools/build.ts`.

**What.** The one place a bundle is inlined into `shell.html`. `</script` is escaped in any case and
`<!--` is escaped, and the replacement inserts nothing but backslashes, so the program is unchanged.
The guard used to be case-sensitive and did not handle `<!--`.

**Re-report looks like.** "The `</script` escape is case-sensitive" or "the inlined script can end
the element". **Confirmed looks like.** Naming the escaping, or something narrower: that the output
is not parsed by an HTML parser, that a function replacement is what keeps `$&` in the bundle
literal, or that the shell's marker is a comment the bundle could contain.

## 5. The chains file (#63)

**Where.** `tools/chains.ts`, `parseChains` and `readChains`; used by `tools/build.ts` and
`tools/get.ts`.

**What.** One validator for the file both programs read: keys that are decimal chain ids, values
that are non-empty arrays of `https:` URLs, `http:` for loopback hosts only, nothing else. Before it,
an `http:` endpoint on a public host, a string where a list belongs, `null`, and a `__proto__` key
all passed into the bundle.

**Re-report looks like.** "The chains file is never validated." Note separately, and as a false
positive, any claim that a `__proto__` key in the chains file sets the bundled object's prototype:
esbuild emits the key computed and `JSON.parse` keeps it an own property, measured both ways.
**Confirmed looks like.** Naming the validator, or something narrower: that an API key embedded in
an endpoint URL is still published in the deployable, that the endpoint list is trusted once
validated, or that `chains.json` itself remains a deployer's file.

## 6. An empty `GW44_PIN` or `GW44_CONFIG` (#73)

**Where.** `tools/build.ts`, the loop over the two variable names.

**What.** Set but empty is an error naming the variable. Unset is still the unpinned build. CI
templating a value that was not provided used to produce an unpinned build with every chain in the
chains file, distinguishable only by the log's first line.

**Re-report looks like.** "An empty variable is treated as unset and silently ships an unpinned
build." **Confirmed looks like.** Naming the check, or something narrower about the build's inputs.

## 7. The build's gates run before it writes (#74)

**Where.** `tools/build.ts`, the size gate and the unexpected-file check.

**What.** Both run before any file is written, so a failed build leaves the output directory as it
found it. They used to run after the write, so a build that failed either had already replaced
`index.html` and `404.html`.

**Re-report looks like.** "The build writes the deployable before checking it." **Confirmed looks
like.** Naming the ordering, or something narrower: that the three writes are not atomic as a set,
so a crash between them can still leave a mixed directory.

## 8. The sentence on an unconfigured path (#82)

**Where.** `src/adapters/sw/boot.ts`, the `catch` around `targetOf`.

**What.** A configured build throws `not-found` for a first segment it has no contract for, and the
shell reported it as `gw44: malformed URL`. It now shows the gateway's own message, `gw44: no
contract at this path`, and anything that is not a `GatewayError` keeps the old sentence.

**Re-report looks like.** "The shell reports a missing contract as a malformed URL." **Confirmed
looks like.** Naming the distinction, or something narrower: that a `GatewayError`'s message is
shown to a visitor at all, and that it is set in this repository rather than by a contract.
