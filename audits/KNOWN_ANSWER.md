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
