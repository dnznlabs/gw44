# Audits

How this project reviews the code a gateway ships. The method lives here, in prose, deliberately: a
reader must be able to see what was run and why without running it.

What is specific to this project — the files read, the reasons for every exclusion, the answers
known before a run — lives in [`SCOPE`](SCOPE) and [`KNOWN_ANSWER.md`](KNOWN_ANSWER.md), never in
this file or the prompts.

## What an audit here is, and is not

An audit is **two independent adversarial reviews of the same code, captured separately, then
reconciled into one document**. Independence is the point: two harnesses, two labs, two sets of
blind spots. A single review that agrees with itself tells you nothing.

It is **not** an independent audit, and nobody should cite it as one — it is two language models and
a third pass, commissioned and run by the people who wrote the code. It does not replace the tests
either. Where a property can be asserted, a test beats a finding: a finding gets fixed once, a test
refuses to let it come back.

There is **no skill** for this review. The method it comes from runs a Solidity auditor skill;
nothing equivalent exists for a browser gateway, and inventing an orchestration is not what is
wanted. The legs read the code and review it, and the prompt says so.

### What "reproducible" means here

**The inputs are recorded; the output is not deterministic.** Re-running an audit does not reproduce
it — these are language models, and two runs of the same prompt over the same code return different
prose and sometimes different findings. Saying otherwise would be the most expensive lie in this
directory.

What is reproducible is the *setup*: anyone can re-run the same models over the same commit with the
same scope, because every audit records all three. A later disagreement is then about findings, not
about what was run.

## Layout

```
audits/
  README.md                     this file — the method
  SCOPE                         the files audited, one per line
  KNOWN_ANSWER.md               what was known before a run, to grade the legs
  prompts/
    leg.md                      the prompt each independent review receives
    rollup.md                   the prompt that reconciles the legs
  <YYYY-MM-DD>/
    AUDIT.md                    the rollup — findings, severities, provenance
    BLIND.md                    the review commit, and every scoped file's hash in both trees
    <codex model>/full-report.md
    <claude model>/full-report.md
    transcripts/                everything each leg printed, tool calls included
```

The transcripts are the only evidence of what a leg read, so they are committed with the findings.
They land last, after the rollup, and never while a leg or the rollup could read them.

One directory per audit date. **Audits are append-only: a past audit is never edited**, because the
rollup of a later audit cites it. A finding that turns out to be wrong is corrected in the *next*
audit's `AUDIT.md`, marked as superseding, the same way decisions are. `make audit` enforces that
rather than trusting it: preflight refuses to start if `audits/<date>/` already exists. To re-run on
a date that already has one, move the directory aside or pass `AUDIT_DATE`.

## Scope

**The scope is [`SCOPE`](SCOPE): one repo-relative path per line, `#` comments and blank lines
ignored.** The runner reads it, names it to each leg, and records it in the provenance block as the
file list actually passed. It refuses to start without one, or with one that names a missing file.

**Scope is named file by file, never left to a leg's own file discovery.** A leg pointed at a
directory decides for itself what matters, and that decision is then unrecorded and unrepeatable.
Naming the files makes the scope a reviewable artifact: a reader can disagree with it.

**Every exclusion is written down with its reason**, in `SCOPE`'s own comment block, so the next
reader does not have to re-derive it. "Not shipped", "covered by a test" and "data a deployer
replaces" are reasons; "not important" is not.

## Running it

```
make audit
```

One pass per leg, in order: **the codex leg, then the claude leg, then the rollup**. The rollup is a
synthesis — deduplication across two vocabularies, severity reconciliation, deciding what the legs
actually agreed on — so a model writes it, not the shell. The shell's job is to run the legs, put
the bytes in the right directory, and record what happened.

Both CLIs are subscription-authenticated here, so an audit costs **rate limit and wall clock, tens
of minutes, not money**. Neither credential is pinned by this repository: `~/.codex` and `~/.claude`
belong to the machine's user. That is why the provenance block records the **observed** CLI version
and model rather than asserting the requested ones.

Models are overridable, so a model choice is never relitigated in prose:

```
make audit CODEX_MODEL=gpt-5.6-sol CLAUDE_MODEL=opus
```

`opus` is an alias for the latest Opus rather than a pinned version string; the provenance block
records what it resolved to. The codex leg runs at `model_reasoning_effort=high`, which is a `-c`
override rather than a flag.

`make audit` is **not** reachable from `make check` or from the workflow, and must not become so: it
needs two authenticated CLIs and tens of minutes, and a gate that depends on somebody's rate limit
is a decision rather than a detail.

### Running blind

**The legs run outside this repository, in a tree holding only the scoped files.** This is not a
precaution against a careless leg; it is the only thing that works. A prompt cannot make a leg blind
to the filesystem it is pointed at — in the project this method comes from, a leg started inside the
checkout grepped the task file 62 times and the previous audit 60 times, then reported no findings,
which is indistinguishable from a leg that simply agreed with a document it read.

So the runner copies the scoped files, with their paths, into a temporary directory outside the
repository, `git init`s it because `codex exec` refuses a non-repository, and runs both legs there.
No leg can reach `SECURITY.md`, a handoff, an issue, this file, or the other leg's output.

Three things make it hold:

- **The known answer stays out of that tree.** The runner reads `KNOWN_ANSWER.md` from this
  repository and passes it to the rollup only, so no leg can open it.
- **The blind tree's commit is not this project's.** [`BLIND.md`](README.md) records the review
  commit and the SHA-256 of every scoped file in both trees. The hashes, not the commit, are what
  tie a run to the source it read.
- **Each leg writes outside both trees.** A leg's `full-report.md` goes to its own directory under
  the runner's scratch, and both move into `audits/<date>/` only after the second leg has finished.
  Harvesting leg 1 into the tree before leg 2 ran is how the method learned this: leg 2 grepped it.

`make audit` is complete when `audits/<date>/AUDIT.md` exists and every leg directory under it is
non-empty. **An empty leg directory is a failed audit, not a clean one** — a rollup assembled over
nothing would otherwise read as "no findings".

## Provenance

Every `AUDIT.md` opens with a block recording what ran. Observed values, captured at run time, never
copied from this file:

```
audit date        <YYYY-MM-DD>
code commit       <git rev-parse HEAD>  (dirty: yes/no)
scope             <the file list actually passed, one per line>
skill             none — web-security prompt, audits/prompts/leg.md
leg 1 requested   codex <model> · effort high · 1 pass
leg 1 cli         <codex --version>
leg 1 observed    <the model the session header reported>
leg 1 wall        <seconds> (exit <code>)
leg 1 tokens      <as the harness reported them, or not reported>
leg 2 requested   claude <model> · 1 pass
leg 2 cli         <claude --version>
leg 2 observed    <the model the stream reported>
leg 2 wall        <seconds> (exit <code>)
leg 2 tokens      <as the harness reported them, or not reported>
```

`code commit` carries a dirty flag because an audit of an uncommitted tree cannot be re-run by
anyone else, and that fact belongs in the artifact rather than in someone's memory. The runner
refuses a dirty tree outright, so the flag should always read `no`; it is recorded because a reader
should not have to trust that the refusal worked.

A field the runner could not capture says `not reported`. A missing figure and a zero figure must
not read alike.

## Known limits

- **Two legs from two labs is the whole independence claim.** Both are language models trained on
  overlapping public JavaScript and web-security writing; correlated blind spots are likely and
  unmeasured. The mitigation is method diversity — the test suite, a browser suite in three engines,
  a person reading the diff — not more models.
- **A leg could still read outside its tree.** Both run with write access and no sandbox on reads,
  so a leg that went looking in `TMPDIR` could find the other's staged output. One has reached
  outside its tree, and the transcripts showed it: in the 2026-11-21 run a leg read `esbuild` from
  a checkout's `node_modules` to run an experiment, which is how F13's correct finding was
  produced, and the same directory listing named other checkouts of this project on the machine.
  Neither transcript shows a leg opening one, and neither run shows one leg reading the other's
  output. The mitigation is where the legs start and reading the transcripts after each run, not
  a sandbox ([#77](https://github.com/dnznlabs/gw44/issues/77)).
- **A leg is only graded against a known answer.** [`KNOWN_ANSWER.md`](KNOWN_ANSWER.md) holds what
  was known by hand before a run, with file, line and mechanism, and the rollup records per leg
  whether each was found. Whether a leg finds a bug that was already known is the only evidence
  about this method that is not an assertion. **A miss is a publishable result**: it is recorded
  plainly and not offset against what the legs did find.
- **The review reads source, not the artifact.** The legs read `src/` and `tools/build.ts`; nobody
  disassembles `gw44-sw.js`. Where the build removes code — which it does, per build — a leg reading
  source sees code that does not ship, and `KNOWN_ANSWER.md` is written knowing that.
