# FINDINGS — following `docs/DEPLOY.md` as a project owner

Read: `docs/DEPLOY.md` at `/home/openclaw/src/gw44`, branch `m02/t03-deploy-guide`, HEAD `6ed7c21`.
Worked top to bottom. Everything that could be run locally or against `https://gw-test.dnzn.dev` was
run; no deploy, no dispatch, no settings change, no write inside the repository (checked: the repo's
`dist/` fingerprint is unchanged, § 4 case 22).

The guide is accurate where it can be checked. Of the claims I could falsify, **one** is wrong and
three are imprecise in a way that would mislead; the central integrity claim — that the three
`expect` hashes are the bytes the pinned commit produces and the bytes the live site serves —
reproduces exactly. What the guide is short of is the *reader's* side: it documents the deploy path
and omits the local one, so several steps are unrunnable as written from a project's own repository.

---

## 1 — Where I had to guess

| § | What I needed | What I did | What would have told me |
|:--|:--|:--|:--|
| 3 | The chains file's **name**. The heading is "The chains file" and no filename appears in the section. | Guessed `chains.json`, from § 5's `chains: chains.json`. Harmless — § 5's table says it is a path input, so any name works — but § 3 should say so. | One clause in § 3: "call it what you like; you name it in the workflow". |
| 3 | A contract address and chain ids. | By design mine ("Your contract. It is yours"), so not a gap. But see the next row. |  |
| 7 | `SITE_CONFIG` for the only site I could check. § 7 says "the configuration the site was built from" but nothing in the guide states what `gw-test.dnzn.dev` was built with — and the guide's own readings are all from that host. | Reconstructed it by reading the deployed worker: `grep -oE '.{200}11155111.{400}' sw.js` gave `{default:"11155111",contracts:{"84532":"0x00a9…25ba","11155111":"0x00a9…25ba"}}`. Later confirmed exactly right against `test/fixtures/gw44.two-chains.json`. | § 7 naming the fixture the quoted readings came from, or § 5 saying the `expect` block's config is `test/fixtures/gw44.two-chains.json`. |
| 7 | **Where to run `make` from.** §§ 3–6 are entirely about "your own repository" — two JSON files and a caller workflow, no Makefile. § 7 then hands over two `make` targets with no change of subject. | Guessed: clone `dnznlabs/gw44`, run them from its root with a `URL=` pointing at my site. Correct, but it is a guess, and it is the guide's largest hole: a reader who followed §§ 2–6 literally has no `make` anywhere. | One sentence at the top of § 7: "from a checkout of `dnznlabs/gw44`, not from your own repository." |
| 7 | What `ENGINES` defaults to. § 7 says "Run it once per engine with `ENGINES="chromium firefox webkit"`, or one at a time", which reads as if the bare command does all three. | Ran the bare command: it did **chromium only**. Found `ENGINES ?= chromium` in `mk/10-gateway.mk:23`. Then ran the other two explicitly; all three pass. | "`ENGINES` defaults to chromium." § 6 claims a measurement "in three engines", which the default command does not give you. |
| 7 | Playwright's browsers. `make check-site` needs them installed. | They were already present on this machine. A fresh checkout is not: `make browsers` exists (`mk/10-gateway.mk:46`) and the guide never mentions it. | A prerequisite line in § 7. |
| 9 | What `PIN=<chain>:<address>` *is*. § 9 offers it as an alternative to a configuration file with no command around it, and the guide never introduces a local build. | Read the Makefile. It is `make build PIN=…` → `node tools/build.ts` → `dist/`. Also found `GW44_CONFIG`, `GW44_CHAINS` and `GW44_OUT`, none of which appear in the guide. **Had to open `mk/10-gateway.mk` and `tools/build.ts` to proceed.** | A § 3 paragraph: "to check your configuration before you spend a deploy run, `devbox run -- make build CONFIG=gw44.json`". This is the omission that cost me the most. See also § 2.3 — through the workflow, `PIN` is not reachable at all. |
| 5 | Where the three `expect` lines are "printed". | Guessed: the deploy job's log in the Actions run. Could not confirm — no run. Reproduced them locally instead (§ 4, case 24), which also confirmed the printed format is `expect`'s format verbatim. | "the build step prints them; copy the three lines from the run log." |
| 6 | How to compute an `integrity` value. § 6 says the deploy "prints the snippet"; with no deploy log I had none. | `openssl dgst -sha384 -binary f \| openssl base64 -A`. Matched the guide's published hash exactly. Also learned from a Makefile comment that `tools/embeds.sh` is what prints it at deploy time — not named in the guide. | The one-line `openssl` recipe, for checking a published copy against a hash you were given. |
| 4 | Whether the certificate has been issued, before ticking Enforce HTTPS. | Guessed: watch the Pages settings page until the box enables. The `gh` reading given (`https_enforced`) only tells you something *after* you have ticked it, so it cannot answer "can I tick it yet". | A reading for certificate state, e.g. the `https_certificate.state` field of the same `pages` endpoint. |
| 2 | How to confirm the domain verification landed. § 2 is the step the guide insists on hardest and gives no reading for. | Inferred that § 4's `protected_domain_state: verified` is it. Probably right; the guide never connects them. | § 2 ending with the `protected_domain_state` reading instead of leaving it four paragraphs away in a different section's block. |
| 5 | Whether the YAML block in § 5 is the caller or the callee. The prose directly under it says "It is `workflow_call` only: there is nothing to dispatch here", while the block itself is `on: workflow_dispatch`. | Worked out that "it" is the *called* workflow and the block is mine. Confirmed against `deploy-pages.yml` (`on: workflow_call:` only). Correct but a stumble on first read. | Putting the sentence before the block, or a comment in the block saying "in your repository". |

**One place I went to the web:** none. No web search was needed.
**Files I had to open that the guide did not send me to:** `Makefile`, `mk/10-gateway.mk`, `tools/build.ts`,
`tools/verify.sh`, `.github/workflows/deploy-pages.yml`, `.github/workflows/pages-test.yml` (this one
is linked from § 5), `test/fixtures/`, `docs/ROADMAP.md` (linked), `docs/milestones/m02/tasks/m02-t03/`.

---

## 2 — Where the guide is wrong

### 2.1 — § 7's `make verify` does not verify *your* contract (wrong as written)

> `VERIFY_SITE=https://your-host make verify`
> "it reads your contract through the endpoints in the chains file"

It reads **this repository's fixture contract**, on **two hardcoded chains**, and never looks at your
`gw44.json` at all. `tools/verify.sh:20-23`:

```bash
# The fixture of spike 001 § Evidence: the redeployed `App`, the same address on both testnets.
FIXTURE=0x00a9f390a6010d045e0d34856048ddd6910d25ba
VERIFY_CHAINS=${VERIFY_CHAINS:-"11155111 84532"}
VERIFY_ADDRESS=${VERIFY_ADDRESS:-$FIXTURE}
```

The command in § 7 has no slot for a contract or a chain set, and `VERIFY_ADDRESS` / `VERIFY_CHAINS`
— the actual controls, documented in the script's own header comment — are not in the guide. The run
announces whose contract it checked:

```
$ VERIFY_SITE=https://gw-test.dnzn.dev devbox run -- make verify
verify: address 0x00a9f390a6010d045e0d34856048ddd6910d25ba on chains [11155111 84532]
  …16 byte comparisons and 6 browser loads…
verify: every comparison and every browser load passed
```

It passed here only because the test site happens to serve that fixture. A project owner who follows
§ 7 literally gets one of two useless answers: a pass that measured somebody else's contract, or a
failure that says nothing about their deploy. Also, "the chains file" supplies *endpoints* only — the
chain set is `VERIFY_CHAINS`, and the file it reads is `./chains.json` (or `GW44_CHAINS`), not the
`chains` input you named in the workflow.

### 2.2 — § 3's framing claim is false for the first load (imprecise)

> `"self"` serves it with `content-security-policy: frame-ancestors 'self'`

The header is set by the **service worker**, not by the host, so the cold first load of your root —
the one that arrives before any worker is registered — carries no framing protection. GitHub Pages
cannot send custom headers at all. Measured on the live site:

```
$ curl -sS -D- -o /dev/null https://gw-test.dnzn.dev/
HTTP/2 200
server: GitHub.com
content-type: text/html; charset=utf-8
cache-control: max-age=600
etag: "6b01f7db-242c"
…no content-security-policy, and no x-frame-options…
```

and in the deployed worker, the CSP is attached in the root handler, conditional on `frame`:

```js
rt="frame-ancestors 'self'"
…return E(200,"text/html; charset=utf-8",r,n==="any"?[]:[["content-security-policy",rt]])
```

So the guarantee is "every worker-served navigation", not "your root document". Worth saying, because
§ 3 is where a reader decides whether `"self"` is enough, roadmap decision 13 states the default in
the same absolute terms, and § 7's nine cases contain **no framing case** — nothing in the guide's
evidence covers this claim either way.

### 2.3 — § 9 offers a `PIN` deploy that the deploy path cannot do (wrong as written)

> Either a one-entry configuration file, or `PIN=<chain>:<address>` with no file at all.

In a deploy guide, in a section about deploying one contract, this reads as two ways to deploy. It is
not: `config` is `required: true` on the called workflow (`deploy-pages.yml`, inputs block), `PIN` is
not an input at all, and § 10 confirms an empty path is rejected before the build —
`<name> is empty; both config and chains are required`. `PIN` is a **local build** option only. The
"byte-identical" claim beside it is therefore about two local builds, and I could not check it
against a deploy.

### 2.4 — The intro points at a document that does not exist (dangling reference)

> the source of each section is mapped in m02-t03's `HANDOFF.md`

```
$ ls docs/milestones/m02/tasks/m02-t03/
TASK.md
$ find . -iname HANDOFF.md | grep m02
./docs/milestones/m02/tasks/m02-t01/HANDOFF.md
./docs/milestones/m02/tasks/m02-t02/HANDOFF.md
./docs/milestones/m02/tasks/m02-t04/HANDOFF.md
```

m02-t03's is absent on this branch. Plainly it is written at the end of the task, so this is a
forward reference stated in the present tense rather than a mistake of fact — but as the branch
stands, the first paragraph's offer of provenance for every section leads nowhere.

### 2.5 — § 3 overstates what the chains file publishes (imprecise, in the reader's favour)

> the chains file's contents are compiled into `gw44-sw.js`, and anyone can read them

Only the entries for **configured** chains are. The repository's `chains.json` carries nine chains;
the two-chain build publishes three endpoints:

```
$ grep -oE 'https?://[a-zA-Z0-9._:/-]+' dist-a0f6f09/gw44-sw.js | sort -u
https://base-sepolia-rpc.publicnode.com
https://ethereum-sepolia-rpc.publicnode.com
https://sepolia.base.org
$ for h in ethereum-rpc.publicnode.com optimism-rpc.publicnode.com base-rpc.publicnode.com \
           arb1.arbitrum.io mainnet.megaeth.com robinhood-rpc.publicnode.com 127.0.0.1; do
      grep -l "$h" gw44-sw.js index.html 404.html; done
(no match for any)
```

"published in all three files" is right for the chains you configured — the same three URLs appear in
`index.html` and `404.html` too — and wrong for the rest of the file. A reader who keeps one
API-keyed endpoint in a shared chains file for a chain this build does not serve is being told it
leaks, and it does not.

### 2.6 — Everything else I checked held

- § 4's two readings, verbatim, both exact: `[ 'dnznlabs.github.io' ]`; `workflow` / `gw-test.dnzn.dev` / `true` / `verified`.
- § 1 "its copy `404.html`": identical sha256 to `index.html`, live and in every local build.
- § 5's `uses:`/`gw44-ref` pin `a0f6f097134e…`: `git cat-file -t` → `commit`.
- § 5's input table matches `deploy-pages.yml`'s six inputs and one secret exactly.
- § 5's `expect` block **reproduces byte for byte** from the pinned commit, and equals what the live site serves (§ 4, case 24).
- § 6's published `integrity` matches the live `/84532/widget.js` exactly; `/11155111/widget.js` exists as the several-chains rule predicts; `/widget.js` is 404 as it predicts.
- § 7's nine cases: all nine pass, on chromium **and** firefox **and** webkit.
- All five of § 3's validator rules refuse what the guide says they refuse, with clear messages (§ 4, case 23); "an empty object is accepted" is also true.
- § 8's etag claim: `etag: "6b01f7db-242c"` → `0x6b01f7db` = Sat, 21 Nov 2026 19:58:19 GMT = the `last-modified`, `0x242c` = 9260 = the `content-length`. Derived from mtime and size, as stated.
- § 8's `max-age=600` on the worker script: confirmed on the wire.
- Roadmap decisions 9 and 11 say what § 1 says they say.
- Every one of the ten issue/PR numbers cited resolves, and each is the kind of thing the guide calls it (#36, #51, #83, #86, #92 issues closed; #85, #94, #96 issues open; #103 PR closed; #105 PR open — the guide calls #105 a PR and it is one).
- No `CNAME` is committed, as § 4 instructs.

---

## 3 — Where I stopped, and why

**Furthest point reached:** the whole guide was read and every locally runnable step executed. The
configuration of §§ 3 and 9 was written and **built** (into `/tmp`, never the repo's `dist/`); §§ 4,
6, 7 and 8 were verified against the live deploy; § 5's `expect` block was reproduced from the pinned
commit. What is untouched is exactly the set of things that change the world.

| Stopped at | Why | What I would have done | What I would have read |
|:--|:--|:--|:--|
| § 2 — domain verification, `TXT` record | Out of scope: no DNS, no account settings. | Verified `dnzn.dev` under the org's *Settings → Pages → Add a domain*, added the `TXT`, waited for `protected_domain_state: verified` **before** creating the `CNAME`. | § 2; GitHub's "Verifying your custom domain" and "Managing a custom domain for your Pages site". |
| § 4 — `CNAME`, Pages source, custom domain, Enforce HTTPS | Same. Already in the desired state for `gw-test.dnzn.dev`, which is how I could check the readings at all. | `CNAME` → `<owner>.github.io`; Source: GitHub Actions; custom domain; tick Enforce HTTPS once the certificate exists. | § 4, § 10's last two rows. |
| § 5 — org Actions access, deploy key, `GW44_READ_KEY` | No GitHub settings, no secrets. `ssh -T` is unrunnable without the private half: `git@github.com: Permission denied (publickey)`. `gh api repos/dnznlabs/gw44/keys` → `{"message":"Not Found",…,"status":"404"}` — I am not admin there. Worth noting that the refusal is a **404, not a 403**, so it reads as "no such thing" rather than "not allowed"; the guide warns the reading needs admin but not what the denial looks like. | Set org access first, generated the pair, public half on `dnznlabs/gw44` with write unticked, private half as `GW44_READ_KEY`, then proved it with § 5's `ssh -T` and checked the hostname in the answer before spending a run. | § 5's private-repository block, #86, #92. |
| **The deploy itself** — § 5, and `verify-only` | Forbidden by my instructions, and a deploy would replace a live site. This is the one thing I was asked not to do, so I did not do it, including no `verify-only` run (it deploys nothing, but it is still a dispatch). | Dispatched the caller with `verify-only: true` first, read the three printed hash lines, compared them with a local `make build` of the same config, then dispatched for real with those lines in `expect`. | § 5's `expect` and `verify-only` rows; § 10's `Found 0 artifact(s)` row — **do not re-run, dispatch a new run** — and #105. |
| § 6 — publishing an embed | Needs a deploy. | Taken the printed snippet, put it on a host page, then run § 7's two embed cases against it. | § 6; #94 on what the validator will not catch. |
| § 8 — how soon a returning visitor sees an update | The guide itself says this is unmeasured and pending on #105/#85, and measuring it needs a redeploy. Not a gap in the guide: declining to print a figure nobody measured is the right call, and it says so. | Nothing. It is correctly left open. | #85, #105, m02-t02 step 4. |
| § 9 — the "byte-identical" claim for `PIN` vs a one-entry file | Checkable locally, but it is a claim about the *deploy* path, where `PIN` is unreachable (§ 2.3). I built both shapes locally and did not pursue the equivalence, since the guide's framing is what needs fixing first. | `GW44_OUT` two builds, one `PIN=`, one one-entry `CONFIG=`, and `sha256sum` both sets. | § 9; `tools/build.ts`. |

---

## 4 — What I actually ran

In order. Output trimmed to the part that mattered.

**1. Repository state (read-only).**
```
$ cd /home/openclaw/src/gw44 && git log --oneline -1 && git status --porcelain
6ed7c21 docs(deploy): from nothing to a gateway on your own domain
(clean)
```

**2. § 4, reading 1.**
```
$ node -e 'require("node:dns").promises.resolveCname("gw-test.dnzn.dev").then(console.log)'
[ 'dnznlabs.github.io' ]            ← matches the guide verbatim
```

**3. § 4, reading 2.**
```
$ gh api repos/dnznlabs/gw44/pages --jq '.build_type, .cname, .https_enforced, .protected_domain_state'
workflow / gw-test.dnzn.dev / true / verified      ← matches the guide verbatim
```

**4. § 5's `ssh -T`, with no key available.**
```
$ ssh -T git@github.com
git@github.com: Permission denied (publickey).
```

**5. § 5's pin, and the workflow files.**
```
$ git cat-file -t a0f6f097134e6b96f97f35f1d1797bf062784cab
commit
$ git log --oneline -1 a0f6f09
a0f6f09 Merge pull request #103 from dnznlabs/m02/t02-step4
$ ls -a .github/workflows
ci.yml  deploy-pages.yml  pages-test.yml
```

**6. § 1 and § 8, on the wire.**
```
$ curl -sS -D- -o /dev/null https://gw-test.dnzn.dev/
HTTP/2 200 … cache-control: max-age=600 … etag: "6b01f7db-242c" … content-length: 9260
  (no content-security-policy — § 2.2)
$ curl -sS -D- -o sw.js https://gw-test.dnzn.dev/gw44-sw.js
HTTP/2 200 … content-type: application/javascript … cache-control: max-age=600   (7778 bytes)
```

**7. The three deployed files, hashed.**
```
$ curl -sS -o index.html https://gw-test.dnzn.dev/ ; curl -sS -o 404.html https://gw-test.dnzn.dev/no-such-path-xyz
$ curl -o /dev/null -w '%{http_code}\n' https://gw-test.dnzn.dev/no-such-path-xyz
404                                     ← § 7's "unknown path → 404.html at status 404"
$ sha256sum index.html 404.html sw.js
809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40  index.html
809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40  404.html   ← the copy, identical
58d03a039c58672d8e8a63d4c75caa6b70789c3c7ed5894a28d63399f941b7e0  sw.js
   all three, with 9260/9260/7778 bytes, are § 5's `expect` block exactly
```

**8. Recovering the live site's configuration from the worker (§ 1 guess row).**
```
$ grep -oE '.{200}11155111.{400}' sw.js
…{"84532":["https://base-sepolia-rpc.publicnode.com","https://sepolia.base.org"],
   "11155111":["https://ethereum-sepolia-rpc.publicnode.com"]};
  var l={default:"11155111",contracts:{"84532":"0x00a9f390…25ba","11155111":"0x00a9f390…25ba"}};
$ grep -oE '.{120}frame-ancestors.{80}' sw.js
…rt="frame-ancestors 'self'"…                       ← § 2.2
```

**9. § 6, the embed copies and the published hash.**
```
$ for p in 84532/widget.js 11155111/widget.js widget.js; do curl -o … -w 'status=%{http_code} len=%{size_download}\n' "https://gw-test.dnzn.dev/$p"; done
status=200 len=8509     /84532/widget.js
status=200 len=8509     /11155111/widget.js
status=404 len=9260     /widget.js          ← no bare path on a several-chains build, as § 6 says
$ openssl dgst -sha384 -binary w-84532_widget.js | openssl base64 -A
YdiQK1VLmzn9EdOpTRan9r2NsUR+DnOwTJ/saTfdBDEkLxiyC2QiRFpVgJ/FQVtE   ← the guide's value, exactly
```

**10. Wrote my configuration** (§ 3): `/tmp/t03-reader/gw44.json` and `/tmp/t03-reader/chains.json`.

**11. Found the make targets** (§ 1 guess rows 4, 5, 7): `grep -nE '^[a-zA-Z0-9_.-]+:' Makefile mk/*.mk`
→ `build serve typecheck test e2e check get clean browsers verify check-site`.

**12. § 7, first command, default engines.**
```
$ devbox run -- make check-site URL=https://gw-test.dnzn.dev \
    SITE_CONFIG=/tmp/t03-reader/gw44.json \
    EMBED="84532/widget.js=sha384-YdiQK1VLmzn9EdOpTRan9r2NsUR+DnOwTJ/saTfdBDEkLxiyC2QiRFpVgJ/FQVtE"
check-site: https://gw-test.dnzn.dev on chromium, chains [84532 11155111], default 11155111
  …nine cases, every one "ok"…
  chromium 84532/widget.js … is answered by the worker, not by the host: worker: 200 cache-control
    no-store, etag none, controlled true | host control: 200 cache-control max-age=600, etag present
check-site: every case passed on chromium            ← one engine, not three (§ 1 guess row 5)
```

**13. § 5's input table against the callee.** `git show a0f6f09:.github/workflows/deploy-pages.yml`
→ `on: workflow_call:` only; inputs `gw44-ref`(req) `config`(req) `chains`(req) `embeds` `expect`
`verify-only`, secret `gw44-read-key`. Matches the table. `config: required: true` is § 2.3.

**14. § 7, second command.**
```
$ VERIFY_SITE=https://gw-test.dnzn.dev devbox run -- make verify
verify: address 0x00a9f390a6010d045e0d34856048ddd6910d25ba on chains [11155111 84532]
  11155111 root 64305 B chain=009003a25ef2f15e… served=009003a25ef2f15e… ok
  … 16 comparisons, then 6 browser loads, all "ok" …
verify: every comparison and every browser load passed
```
Passed — but see § 2.1: it never read my `gw44.json`.

**15. Why.** `sed -n '1,40p' tools/verify.sh` → `FIXTURE=0x00a9f390…`,
`VERIFY_CHAINS=${VERIFY_CHAINS:-"11155111 84532"}`, `VERIFY_ADDRESS=${VERIFY_ADDRESS:-$FIXTURE}`.
`mk/10-gateway.mk` → `ENGINES ?= chromium`, `SITE_CONFIG ?= test/fixtures/gw44.two-chains.json`.

**16. Every number the guide cites.**
```
$ for n in 36 51 83 85 86 92 94 96 103 105; do gh api repos/dnznlabs/gw44/issues/$n \
    --jq '[(if .pull_request then "PR" else "issue" end), .state, .title]|@tsv'; done
#36 issue closed  … /favicon.ico is an eth_call on every page load
#51 issue closed  action: enable Pages for gw-test.dnzn.dev and verify dnzn.dev …
#83 issue closed  pages-test.yml: the ref is interpolated into a shell line …
#85 issue open    Whether a redeploy reaches a returning visitor … has not been measured
#86 issue closed  action: a read-only deploy key for gw44, and Actions access …
#92 issue closed  action: the gw44 deploy key is refused; re-add the pair
#94 issue open    … the chains validator admits endpoints unfit for a public deployable
#96 issue open    … a contract whose UI lives at a sub-path has no framing rule by default
#103 PR  closed   m02-t02 step 4: a second configuration to deploy …
#105 PR  open     fix(pages): wait for the artifact instead of racing deploy-pages' lookup
```
All ten resolve, and each matches the use the guide puts it to.

**17. § 4's "do not commit a `CNAME`", and § 5's caller.**
```
$ git ls-files | grep -i cname
(none)
$ git show a0f6f09:.github/workflows/pages-test.yml
… on: workflow_dispatch: inputs: config: type: choice, two committed fixtures …
  uses: ./.github/workflows/deploy-pages.yml ; gw44-ref: ${{ github.sha }}
```
§ 5's description of its own caller is accurate.

**18. § 7 on the other two engines.**
```
$ devbox run -- make check-site URL=… SITE_CONFIG=… EMBED=… ENGINES="firefox webkit"
check-site: every case passed on firefox
check-site: every case passed on webkit
```
Nine cases each. (Both engines report `1 resource-timing entries` for the favicon case where chromium
reports `0` — consistent with § 9's note that the headless Chromium shell does not make the request.)

**19. § 5's `gh api …/keys` reading, and § 8's etag claim.**
```
$ gh api repos/dnznlabs/gw44/keys --jq '.[]|[.title,.read_only]'
{"message":"Not Found", … "status":"404"}        ← no admin; a 404, not a 403
$ node -e 'console.log(new Date(0x6b01f7db*1000).toUTCString(), 0x242c)'
Sat, 21 Nov 2026 19:58:19 GMT 9260               ← = last-modified, = content-length. § 8 confirmed.
```

**20. Found the local build.** `grep -nE 'GW44_|dist' tools/build.ts` → `GW44_OUT`, `GW44_CHAINS`,
`GW44_PIN`, `GW44_CONFIG`. None are in the guide; `GW44_OUT` is what let me build without writing to
the repository.

**21. My configuration, built.**
```
$ GW44_OUT=/tmp/t03-reader/dist GW44_CONFIG=…/gw44.json GW44_CHAINS=…/chains.json node tools/build.ts
built /tmp/t03-reader/dist/ (pinned to 84532:0x00a9f390…25ba 11155111:0x00a9f390…25ba, default 11155111):
  90e63753…  9273  404.html
  4cbbb511…  7791  gw44-sw.js
  90e63753…  9273  index.html
```
13 bytes larger per file than the `expect` block, because HEAD is `6ed7c21` and not `a0f6f09` — which
is the legitimate difference § 5 warns about.

**22. The repository was not written to.**
```
$ sha256sum dist/* | sha256sum        before any build: a5a8b8ac7216cf42853d39b924186e6cba62d9512f6c99683046085eced2ce2c
$ sha256sum dist/* | sha256sum        after all of them: a5a8b8ac7216cf42853d39b924186e6cba62d9512f6c99683046085eced2ce2c
```

**23. § 3's validator rules, one case each. All five hold.**
```
{"mainnet":[…]}            → Error: … the chains file has "mainnet" as a key, which is not a chain id
{"01":[…]}                 → Error: … the chains file has "01" as a key, which is not a chain id
{"1":"https://x.example"}  → Error: … the chains file gives chain 1 a string instead of a list
{"1":["http://evil.example"]} → Error: … "http://evil.example" on chain 1: endpoints are https, or http on loopback
{"31337":["http://127.0.0.1:8545"]} → built … (loopback http allowed, as stated)
{}                         → built … (accepted, as stated)
gw44.json naming 84532 with a chains file that omits it
                           → Error: …/gw44.json names chain 84532, which the chains file does not carry
"frame":"none"             → GatewayError: configuration "frame" must be "self" or "any"; got "none"
no CONFIG and no PIN       → built /tmp/t03-reader/dist-bad/   ← the *local* build does not refuse an
                              unpinned deployable; § 10's "refusing to deploy an unpinned gateway" is
                              the workflow's check, which is consistent with § 10's wording
```

**24. § 5's `expect` block, reproduced from the pinned commit.** Exported `a0f6f09` to `/tmp` with
`git archive` (no checkout, no worktree in the repo), symlinked `node_modules`, built the two-chain
fixture:
```
$ git archive a0f6f097134e6b96f97f35f1d1797bf062784cab | tar -x -C /tmp/t03-reader/src-a0f6f09
$ GW44_OUT=/tmp/t03-reader/dist-a0f6f09 GW44_CONFIG=test/fixtures/gw44.two-chains.json node tools/build.ts
built … (pinned to 84532:0x00a9f390…25ba 11155111:0x00a9f390…25ba, default 11155111):
  809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40     9260  404.html
  58d03a039c58672d8e8a63d4c75caa6b70789c3c7ed5894a28d63399f941b7e0     7778  gw44-sw.js
  809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40     9260  index.html
```
Identical to § 5's `expect` block **and** to what `gw-test.dnzn.dev` serves (case 7). The guide's
whole reviewable-bytes argument checks out, and the printed format is `expect`'s format verbatim.
It also confirms the live site's configuration is `test/fixtures/gw44.two-chains.json`, which I had
reconstructed by hand in case 8 because the guide does not say so.

**25. What the build actually publishes** (§ 2.5): `grep -oE 'https?://…' dist-a0f6f09/*` → the three
configured-chain endpoints in all three files, and none of the other six chains in `chains.json`.

**26. The guide's own references.**
```
$ ls docs/milestones/m02/tasks/m02-t03/
TASK.md                                  ← no HANDOFF.md; § 2.4
$ grep -n '^9\.\|^11\.' docs/ROADMAP.md
9.  One origin per project, and the chain in the path …
11. Testnet contracts are not served from a project's mainnet origin …
$ ls README.md SECURITY.md docs/ROADMAP.md
all present
```

---

### In one line

The guide's facts are sound — every reading it quotes reproduced, the `expect` hashes rebuild byte
for byte from the commit it pins, all nine site cases pass in all three engines, and all ten issue
references are right. What it is missing is the reader's half of the work: there is no local build in
it (§ 1 rows 7, 11, 20), § 7's `make` targets arrive with no checkout to run them in, and one of
those two targets does not do what § 7 says it does (§ 2.1).
