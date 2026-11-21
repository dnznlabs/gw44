# m01-t06 — The security review of record

Milestone: [M01](../../MILESTONE.md) · Phase: 2 — Make it handable

Two models in two harnesses read the code a project's gateway ships, independently, and a third pass reconciles them. `SECURITY.md` then names the commit, the method and the state of every accepted finding, where today it says the code has been reviewed by nobody but its authors.

## Plan

Runs after m01-t05 is merged, on `main` at that merge or later: the review reads the code that ships and reads it once.

The method is rake's, used there for its front end on 2026-11-17 (`rake/audits/README.md`, `rake/audits/prompts/frontend-leg.md`, `rake/audits/2026-11-17/frontend/AUDIT.md`, all read at rake `9784c0f`). No audit skill is involved: none exists for a browser gateway, and the leg prompt says so. Read on this machine at scoping, 2026-11-20: `codex-cli 0.158.0`, `claude 2.1.329`.

1. **`audits/README.md`.** The method in prose, shortened from rake's to what applies here: what an audit is and is not; that inputs are recorded and output is not deterministic; the layout below; that audits are append-only; the scope rule (named file by file, every exclusion with its reason); running blind. Link nothing outside this repository.

   ```
   audits/
     README.md
     SCOPE
     KNOWN_ANSWER.md
     prompts/leg.md
     prompts/rollup.md
     <YYYY-MM-DD>/
       AUDIT.md
       BLIND.md
       <codex model>/full-report.md
       <claude model>/full-report.md
       transcripts/
   ```
2. **`audits/SCOPE`.** One path per line: every file under `src/core/`, `src/adapters/rpc/` and `src/adapters/sw/` (including `shell.html`), and `tools/build.ts`, which compiles the endpoints and the contracts into the worker and substitutes a script into the page. Excluded, each with its reason in a comment: `test/`; `tools/get.ts`, `tools/serve.ts`, `tools/verify.sh` and `tools/verify-browser.ts`, which never reach a visitor; `chains.json`, which is data a deployer replaces.
3. **`audits/prompts/leg.md`**, from rake's `frontend-leg.md`: the same frame, the same two markers (`<!-- SCOPE -->`, `<!-- OUTDIR -->`), the same sections on what a finding must carry and what a leg is not. Rewrite § What this code is and § Surfaces for this project:
   - What it is: a service worker and a boot page on a static host, answering a project's own domain with bytes read from contracts over public JSON-RPC, in three builds (unpinned, one contract, several chains).
   - Surfaces, as places a leg must say something about, not a boundary:
     - which contract a URL reaches in each build, and whether any URL reaches one that is not configured (`targetOf`, `parseTarget`, `pinnedTarget`, and the unpinned parser that a pinned build still carries);
     - every redirect built from a request URL;
     - contract-chosen status, headers and content type, and the header allowlist;
     - contract bytes written into the page by `document.write` in the no-worker path;
     - the worker's `fetch` listener: what it answers, what it lets through, `/gw44-sw.js`, cross-origin requests, methods;
     - the boot page's reload loop guard and its use of `sessionStorage`;
     - the JSON-RPC client: the size cap, the timeout, failover order, what a hostile or broken endpoint can make the gateway do other than serve a wrong document (that it can serve a wrong document is known and is M04);
     - the ABI decoder on hostile return data;
     - the build as an injection point: values placed in the bundle by `define`, and the script substituted into `shell.html`;
     - chains of one project sharing an origin.
4. **`audits/prompts/rollup.md`**, rake's with the Solidity-specific lines removed. Keep the first section whole: an empty leg is a failed audit.
5. **`audits/KNOWN_ANSWER.md`.** Three things known before the run, to grade the legs, never shown to them: #18 (a page load can wait `n × timeoutMs`), #36 (under a one-contract build the browser's `/favicon.ico` is a call to the chain), #37 (a pinned build carries the unpinned parser). Given to the rollup only.
6. **`scripts/audit.sh` and `make audit`**, in `mk/20-audit.mk`. The two leg invocations and the rollup invocation are rake's `scripts/audit.sh:236-241`, `:265-270` and `:432-436`, unchanged but for the working directory. Around them:
   - Preflight: both CLIs present and `codex login status` succeeds; the tree is clean; `audits/<date>/` does not exist; every path in `SCOPE` exists.
   - **Blind tree.** Copy the scoped files, with their paths, into a new temporary directory outside the repository and run both legs there, so no leg can read `SECURITY.md`, a handoff, an issue reference or the other leg. Write `BLIND.md`: the review commit and the SHA-256 of every scoped file in the repository and in the blind tree.
   - Each leg writes `full-report.md` to its own directory outside both trees; harvest after both finish.
   - A provenance block in the shape of rake's front-end one: date, commit, `dirty: no`, scope, `skill none`, and per leg the model requested, the CLI version, the model observed, wall time and exit code.
   - Models are make variables, `CODEX_MODEL ?= gpt-5.6-sol` and `CLAUDE_MODEL ?= opus`, as rake's are.
   - `make audit` is not reachable from `make check` or the workflow.
7. **Run it once.** `devbox run -- make audit`. A leg that exits non-zero or writes nothing is a failed audit: fix the runner, move the directory aside, run again, and say so in `HANDOFF.md`. Commit the leg reports, `AUDIT.md`, `BLIND.md` and the transcripts, transcripts last.
8. **Disposition.** For every finding the rollup accepts, one row in `SECURITY.md`, never removed later:
   - *Low or informational, or a limit already stated*: dispositioned in the row, with the test or the `SECURITY.md` section that covers it.
   - *Anything that lets a URL reach a contract that is not configured, lets a contract or an endpoint run script outside its own origin's document, or defeats the size cap or the timeout*: stop, do not fix, and report to the architect with the finding. The fix is its own task, and a fix to a file in `SCOPE` is followed by one more run over the files it touched.
   - *Everything else*: an issue labelled `carried` and `m01`, linked from the row. The architect decides at review which block the milestone.
   A finding the rollup rejects is listed with the reason, once, in `AUDIT.md`; it gets no row.
9. **`SECURITY.md`**, to the handbook's template where it applies to something that is not a contract: § Review status (date, method in one sentence linking `audits/README.md`, scope commit, scope with exclusions, result by severity, external audit: none); § Findings — disposition; § What the review did not cover (the static host, the endpoints' honesty, the contracts served, the browser, the build's dependencies, anything the scope excluded); § The reviewed commit (the commit, `make build`, and the hashes a reader compares). It calls the review what it is, a two-model agent review, and not an independent audit. The existing trust-model sections stay, corrected where the review shows them wrong.
10. **#37.** `SECURITY.md` says in one sentence how the pin is enforced: at run time by `targetOf`, with the unpinned parser still in the file, or at build time if m01-t05 left it so. `Closes #37`.
11. **Docs.** `README.md` § Documentation links `audits/README.md`; `AGENTS.md` § Commands lists `make audit` and that it costs rate limit and wall clock, tens of minutes.

## Acceptance criteria

- Milestone criterion 10: `SECURITY.md` names the review's date, method, commit and scope, and has a row for every finding `AUDIT.md` accepts.
- `audits/<date>/AUDIT.md` exists, its provenance block names the review commit with `dirty: no`, and both leg directories hold a non-empty `full-report.md`.
- `BLIND.md`'s hashes for the repository's scoped files equal `sha256sum` run on them at the review commit.
- The rollup's grading against `KNOWN_ANSWER.md` is in `AUDIT.md`: which of the three each leg found.
- No file in `SCOPE` differs between the review commit and the PR's head. If one does, the PR says why and step 8's second bullet applied.
- `devbox run -- make check` exits 0, and `make audit` is not reachable from it or from the workflow.

## Out of scope

- Fixing a finding. Step 8 says what happens to each kind.
- An external audit, a bounty, or publishing anything: the repository is private until M05.
- Static analysis tooling, dependency scanning, mutation testing.
- The contracts a gateway serves, and rake's front end.
- A shared audit skill or a change to the organisation's shared tooling. If the method runs a second time on another project, that is when it is extracted.

## Open questions

None.

## Context

- Milestone criterion 10; #18, #36, #37.
- rake at `9784c0f`: `audits/README.md`, `audits/prompts/frontend-leg.md`, `audits/prompts/rollup.md`, `scripts/audit.sh`, `audits/2026-11-17/frontend/AUDIT.md`, and m04-t04's `HANDOFF.md` on running the front-end pass beside the Solidity runner.
- The handbook's `templates/SECURITY.md`.
