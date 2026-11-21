# Leg prompt

The prompt one independent adversarial review receives. Two substitutions are made before a harness
sees it — the marker line in § What to review becomes the contents of [`../SCOPE`](../SCOPE), one
path per line, and the marker in § Where to leave it becomes the directory that leg writes to.
Nothing else is substituted, so what you read here, plus those two values, is what the model read.

It lives in prose, outside the runner, on purpose: a heredoc inside a shell script is not something
a human can disagree with.

The method, the scope and the reasoning behind both are in [`../README.md`](../README.md).

---

You are running one leg of a two-leg security review of a web gateway. Another model, in another
harness, is reviewing the same files independently; a third pass reconciles the two. Do not soften a
finding because it might be wrong — a false positive costs a paragraph in the rollup, a miss costs
the project.

## What to review

**Exactly these files, named explicitly.** Read each one in full.

```
<!-- SCOPE -->
```

Files that are not listed are out of scope on purpose (`../README.md` § Scope); do not add them
back. You are in a tree that holds the scoped files and nothing else, so there is no wider
repository to explore: no tests, no documentation, no issue history, no previous audit. That is
deliberate. Review what is in front of you.

There is **no skill for this leg.** Nothing equivalent to a Solidity auditor skill exists for a
browser gateway, and inventing an orchestration is not what is wanted here. Read the code and review
it.

Assume **no network**. Do not fetch a dependency, a CVE feed or a page; every claim must come from
the bytes in front of you.

## What this code is, and where it runs

A **service worker and a boot page on a static host**. They are served from a project's own domain
and answer every request on that origin by reading bytes out of a smart contract over public
JSON-RPC, then serving them as if the origin held files. There is no server: the static host serves
three files — a worker, a page, and a copy of that page for unknown paths — and everything else a
visitor sees comes from a contract.

The first visit has no worker yet, so the page registers one and the worker takes over; where a
browser has no service workers at all, the page fetches the root document and writes it into itself.

It is built in **three shapes**, and which one is being reviewed changes what a URL means:

- **Unpinned.** The contract comes from the URL, in one of two forms: `<address>.<chain>.<host>/`,
  where every contract gets its own origin, and `<loopback>/<chain>/<address>/`, which is accepted on
  loopback hosts only.
- **One contract, compiled in.** Every path on the origin is that one contract's resource and the
  hostname is not read at all.
- **Several chains of one project, compiled in.** Each chain's contract is served under
  `/<chain>/`, the root redirects to a configured default, and any other first path segment is
  answered without calling a chain.

Which shape a build is, which contracts it serves and which endpoints it believes are all decided at
**build time** by `tools/build.ts`, which substitutes values into the bundle and into the page. That
file is in scope for exactly that reason.

Review it as code that runs on a static host that cannot be configured, answering strangers, with a
contract and an RPC endpoint as its only inputs — not as code that runs on a server anybody operates.

## Surfaces this project wants looked at

Not a checklist to tick, and not a boundary: a finding outside this list is still a finding. These
are the places this project already knows are load-bearing, so a leg that says nothing about them
has not finished.

- **Which contract a URL reaches, in each of the three shapes.** Follow every path through
  `targetOf` and the parsers it chooses between, and decide whether any URL can reach a contract
  that the build did not configure — a hostname, a path, a percent-encoded segment, a redirect, a
  path that looks like one shape's form while the build is another shape. The build decides which
  parser is in the bundle; say what you think that means for what ships.
- **Every redirect built from a request URL.** Where the destination comes from the URL, what is
  carried across and what is dropped, and whether a redirect can be made to leave the origin or the
  configured prefix.
- **Status, headers and content type chosen by a contract.** The contract supplies all three for
  every resource but the root. Find what a hostile contract can put in a header, what the allowlist
  lets through, and what a chosen content type makes the browser do with the bytes.
- **Contract bytes written into the page.** In the no-worker path the root document's bytes are
  written into the live page. Ask what that means for a document a contract chose.
- **The worker's `fetch` listener.** What it answers, what it lets through to the host, how it
  treats the worker's own path, cross-origin requests, and methods other than GET.
- **The boot page's loop guard and its use of `sessionStorage`.** It counts attempts to avoid
  reloading forever. Ask what a visitor or a document can do to that counter.
- **The JSON-RPC client.** The response size cap, the timeout, the order endpoints are tried in, and
  what a hostile or broken endpoint can make the gateway do **other than serve a wrong document** —
  that an endpoint which lies produces a wrong document is known, is inherent to trusting an
  endpoint, and is somebody else's milestone. Resource exhaustion, a hang, a response that is never
  released, something written outside the response: those are findings.
- **The ABI decoder on hostile return data.** Every length and offset in it comes from the same
  bytes being decoded. Look for a read past the end, an allocation chosen by the input, a loop whose
  bound the input sets.
- **The build as an injection point.** Values placed into the bundle by `define` and the script
  substituted into the page. Ask what a wrong, hostile or merely surprising input to the build puts
  into the deployable, and what the substitution would let through.
- **Chains of one project sharing one origin.** In the several-chains shape, two contracts on two
  chains are served from one origin, so the browser gives them one storage area, one worker
  registration and one set of permissions. Say what that allows.

## Where to leave it

Write **`full-report.md`** into this directory, which already exists:

```
<!-- OUTDIR -->
```

It is outside the tree you are reading on purpose: the other leg must not be able to read yours.
Write nothing into the tree you are reviewing, and leave it exactly as you found it — no fixes, no
formatting, no scratch files. A leg that dirties the tree costs the runner a cleanup it cannot
distinguish from a real change.

If part of this is something your harness cannot do, **do the review anyway, still write
`full-report.md`**, and say plainly at the top what you could not run. A leg that degrades and says
so is evidence. A leg that produces nothing is a failed pass, and it will be treated as one.

## What a finding must carry

- **A `file:line`.** The rollup deduplicates across two legs that share no vocabulary; a location is
  what makes two descriptions of one bug recognisable as one bug.
- **A severity you would defend.** The other leg's severity for the same finding will be put beside
  yours, and a disagreement is reported rather than averaged.
- **A one-line reproduction** — the URL, the contract value or the endpoint response that produces
  the effect. "Unsanitised data reaches the DOM" is a category; "a contract whose `request()`
  returns content type `text/html` for `/x.js` makes the browser execute it at `sw.ts:NN`" is a
  finding.

State the severity scale you used.

## What this leg is not

It does not fix anything. No edit to the code, a test or the build. Triage and repair are a separate
step, and a finding is worth more untouched than it is worth quietly fixed.

It also does not rank the project. No summary posture, no score, no "overall the code is sound" —
the rollup decides what the two legs together mean.
