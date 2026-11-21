# FINDINGS — following `docs/DEPLOY.md` as a project owner

Read: `/home/openclaw/src/gw44/docs/DEPLOY.md` at `3037d11` on `m02/t03-deploy-guide`.
Nothing in `/home/openclaw/src/gw44` was edited, staged, committed or pushed; every build wrote to
`/tmp/t03-reader-2/` via `GW44_OUT=`. No deploy and no workflow dispatch of any kind was attempted.

The guide is unusually checkable — almost every reading it quotes reproduced exactly. What follows
is the short list of places it left me working something out, the four places I found it wrong, and
where I ran out of permissions.

---

## 1 — Where I had to guess

**Intro.** It says the section→issue provenance is mapped in
`docs/milestones/m02/tasks/m02-t03/HANDOFF.md`, "committed with this guide". That file does not
exist (§ 2 below). I proceeded with no provenance map, so when a claim looked odd I tested it rather
than reading where it came from. *What would have told me:* the file, or no pointer to it.

**§ 3 — my own `gw44.json` and `chains.json`.** As a project owner I am expected to have a contract;
I don't. I copied § 3's example addresses verbatim (`0x00a9f390…25ba` on chain 1,
`0x00d19609…7f8e` on 8453) and chose endpoints myself —
`https://ethereum-rpc.publicnode.com`, `https://cloudflare-eth.com`,
`https://base-rpc.publicnode.com`, `https://mainnet.base.org`. That built clean. *Gap worth naming:*
the guide never tells you to confirm your contract actually answers before you deploy. A config
naming a contract that does not exist on that chain passes the local build in § 3 and fails only at
§ 7's `make verify`, which runs **after** the deploy. A "point `tools/get.ts` at your contract first"
line in § 3 would close it.

**§ 3 — the clone.** `git clone https://github.com/dnznlabs/gw44` is given bare, but the repository
is private (`gh repo view dnznlabs/gw44 --json isPrivate` → `{"isPrivate":true}`). It only worked
here because this machine has a `gh` credential helper configured. § 5 has a whole "While
`dnznlabs/gw44` is private" section, so the guide knows; § 3 doesn't mention needing access at all.
I guessed my local credentials were the intended path. *What would have told me:* one clause in § 3,
or the `git@` URL.

**§ 3 — `GW44_CHAINS` default.** To reproduce § 5's `expect` hashes I had to omit `GW44_CHAINS` and
rely on the checkout's own `./chains.json`. § 3's command always passes it explicitly and never
states the default; § 7 states the default for `make verify` but not for `make build`. I guessed
they were the same, and they are.

**§ 7 — which ref the *checking* checkout should be at.** § 7 says both targets run from "a checkout
of `dnznlabs/gw44` (§ 3)". § 3's clone gives the default branch (`main`, `bb8883f`); the live site
was deployed at `a0f6f09`. The guide never says the checker has to match the deployed `gw44-ref`.
I used `main` and everything passed, but that is luck, not instruction.

**§ 7 — the values for a site I did not build.** `SITE_CONFIG`, `VERIFY_ADDRESS` and
`VERIFY_CHAINS` all needed facts about `gw-test.dnzn.dev` that the guide's examples do not carry:
its examples use chains `1`/`8453`, the site runs `11155111`/`84532`. I **opened
`test/fixtures/gw44.two-chains.json`** (§ 7 points at it) to get the chain ids and the address.
Reasonable, but it means § 7's quoted commands cannot be run against the one site the guide quotes
without first opening another file.

**§ 6/§ 7 — the embed chain prefix.** § 6's bullet says `embeds: widget.js` writes `/1/widget.js`
and `/8453/widget.js`; the snippet three lines later uses `/84532/widget.js`. Adjacent paragraphs
use two different chain sets. I tested both of the site's real prefixes to find which existed — both
do, with the same hash.

**§ 7 — the `EMBED=` format.** Given as `EMBED="1/widget.js=sha384-…"` with the hash elided. I
guessed `<chain>/<path>=sha384-<base64>` and confirmed it against `mk/10-gateway.mk:81`'s help text.

**§ 5 — `expect` after a real run.** The guide says the three lines come from the deploy log. I never
ran the workflow, so I took them from a local build and verified they are identical to the ones the
guide quotes (§ 4 below). Not really a guess — the guide promises they match, and they do.

**§ 9 — the favicon engines.** § 9 says the `/favicon.ico` ERC-5219 call is made by "Firefox and
WebKit" and not by the headless Chromium shell. The only instrument the guide offers is
`check-site`'s favicon case, and across three engines it reported `0 resource-timing entries` for
chromium, `1` for firefox and `0` for **webkit**. The case itself disclaims attribution ("a
synthesised response leaves no trace to attribute"), so this neither confirms nor refutes § 9 — I
could not confirm the WebKit half and have assumed § 9 is right and the instrument is blind.

**§ 4 — apex domains.** The guide says Pages wants `A`/`AAAA` and that it has only been run on a
subdomain. Stated honestly; I was on a subdomain, so nothing to guess, but an apex owner is on their
own here.

**§ 8 — update latency.** The guide states outright that the figure is unmeasured and pending
[#105]/[#85]. A stated gap, not a guess.

---

## 2 — Where the guide is wrong

### (a) The provenance file it says is committed with it isn't

Intro: "mapped in `docs/milestones/m02/tasks/m02-t03/HANDOFF.md`, committed with this guide."

Pinned to `3037d11`, the commit whose `docs/DEPLOY.md` carries the pointer
(`git cat-file -p 3037d11:docs/DEPLOY.md | sha256sum` → `a365bd36e4b0e39ca921afc21421d22e96918aa7593be54f41e2c2200e56d1fa`):

```
$ git ls-tree -r --name-only 3037d11 -- docs/milestones/m02/tasks/m02-t03/
docs/milestones/m02/tasks/m02-t03/TASK.md

$ git ls-tree -r --name-only 3037d11 | grep -ci handoff
10
$ git ls-tree -r --name-only 3037d11 | grep -i handoff
docs/milestones/m01/tasks/m01-t01/HANDOFF.md
… (m01-t01 … m01-t07, m02-t01, m02-t02, m02-t04)
```

Ten handoffs at that commit, and none of them is the one the guide names. Every other task in m01
and m02 has one; `m02-t03` has only `TASK.md`. The guide's first paragraph points at a file that
does not exist at the commit that contains the pointer.

### (b) "An empty object is accepted and serves nothing" describes a build you cannot produce

§ 3, the chains file: "An empty object is accepted and serves nothing."

The *validator* accepts `{}`, but no build can use it, because the very next sentence —
"Every chain named in `gw44.json` must appear here" — plus `contracts` requiring at least one entry
makes an empty chains file unreachable from every direction:

```
$ make build CONFIG=cases/cfg-one.json GW44_CHAINS=cases/chains-empty-obj.json GW44_OUT=…
Error: /tmp/t03-reader-2/cases/cfg-one.json names chain 1, which the chains file does not carry
  -> exit 2

$ make build CONFIG=cases/cfg-empty.json      # {"contracts":{}}
  -> exit 2

$ make build PIN=1:0x00a9f390…25ba GW44_CHAINS=cases/chains-empty-obj.json GW44_OUT=…
Error: pin 1:0x00a9f390a6010d045e0d34856048ddd6910d25ba names chain 1, which the chains file does not carry
  -> exit 2
```

A reader can take that sentence as "you may ship an empty chains file"; nothing can be built from
one. It belongs in the validator's own notes, not in a section telling an owner what to write.

### (c) § 6's hash-check command silently hashes error pages

§ 6: "To check a published copy against a hash you were given, without a deploy log:"

```bash
curl -sS https://your-host/1/widget.js | openssl dgst -sha384 -binary | openssl base64 -A
```

There is no `-f`, so on a wrong path it hashes the 404 shell and prints a confident `sha384-…` that
simply isn't the file's. Run exactly as written against the site the guide quotes — whose embeds are
under `/84532/` and `/11155111/`, not `/1/`:

```
$ curl -sS https://gw-test.dnzn.dev/1/widget.js | openssl dgst -sha384 -binary | openssl base64 -A
A9COs9LXp3y8z/2BJ5kMGEsawP6w+vFZ5BQYvY00Ql6fx2c+wHIkqhRoEMm2GwQX

$ curl -sS -o /dev/null -w '%{http_code}\n' https://gw-test.dnzn.dev/1/widget.js
404
```

The correct copy gives the guide's own snippet hash, so the command does work when pointed right:

```
$ curl -sS https://gw-test.dnzn.dev/84532/widget.js | openssl dgst -sha384 -binary | openssl base64 -A
YdiQK1VLmzn9EdOpTRan9r2NsUR+DnOwTJ/saTfdBDEkLxiyC2QiRFpVgJ/FQVtE
```

For a command whose entire job is detecting a byte difference, a mismatch that looks like a hash
rather than an error is the wrong failure mode. `curl -fsS` fixes it.

### (d) "once per checkout" — the engines are cached once per machine

§ 7: "The browser engines are a download of their own, once per checkout."

They are not per checkout. `make browsers` is a bare `npx playwright-core install $(BROWSER_PACKAGES)`
(`mk/10-gateway.mk:46-47`), no `PLAYWRIGHT_BROWSERS_PATH` is set anywhere in the repo, so Playwright
uses its shared per-user cache. On a clone made ~45 s earlier the three-engine install returned
immediately:

```
$ cd /tmp/t03-reader-2/gw44 && devbox run -- make browsers ENGINES="chromium firefox webkit"
npx playwright-core install chromium-headless-shell firefox webkit
exit=0

$ du -sh ~/.cache/ms-playwright
1.3G    /home/openclaw/.cache/ms-playwright
```

Small, but it misprices the step for a second checkout and hides where the 1.3G lives.

### (e) Precision, not error: § 10's "the build is not pinned" cannot come from `make build`

§ 3 tells you to run the build locally to catch mistakes "rather than in a deploy run", and § 10
lists `the build is not pinned; refusing to deploy an unpinned gateway`. That refusal exists only in
the workflow (`deploy-pages.yml:159`). Locally, a build with neither `CONFIG` nor `PIN` **succeeds**:

```
$ devbox run -- make build GW44_CHAINS=cases/chains-ok.json GW44_OUT=outs/unpinned
built /tmp/t03-reader-2/outs/unpinned/:
  acc1ef2b4c46b45ff52d1ac3170e80f10ac75a86f3a6ee67a4b7636a7c965f82     9100  404.html
  …
exit=0
```

Note the missing `(pinned to …)` clause — the only local signal. Worth one sentence in § 3, since
the whole point of that section is that the local build catches what the deploy would.

### Everything else I checked was right

For the record, because it is most of the guide:

- **§ 2/§ 4 readings** — `protected_domain_state: verified`, `build_type: workflow`,
  `cname: gw-test.dnzn.dev`, `https_enforced: true`, `https_certificate.state: approved`, and
  `resolveCname` → `[ 'dnznlabs.github.io' ]`. All five exactly as printed.
- **§ 3's no-header claim** — `curl -D - https://gw-test.dnzn.dev/` carries neither
  `content-security-policy` nor `x-frame-options`. Confirmed.
- **§ 5's `expect` block** — reproduced to the byte from `test/fixtures/gw44.two-chains.json` at
  `a0f6f09`, and the **live site serves exactly those bytes** (§ 4 below).
- **§ 5's input and secret names** — every one matches `deploy-pages.yml`'s `workflow_call` block,
  which is `workflow_call` only, as claimed.
- **§ 3's validator list** — all six refusals fire with clear messages (§ 4 below), `http:` on
  `127.0.0.1` and `localhost` are allowed, uppercase addresses are lower-cased (byte-identical
  output to the lowercase config), a credentialed URL *is* published verbatim into all three files,
  a missing `default` with two contracts is refused, and `frame` rejects anything but the two words.
- **§ 3's "unconfigured chains are dropped"** — adding chains `10`, `42161`, `11155111` to the chains
  file produced output byte-identical to the two-chain build. Confirmed.
- **§ 3's "endpoints are published"** — my endpoint strings appear in `index.html`, `404.html` and
  `gw44-sw.js`. Confirmed, and worth as much emphasis as the guide gives it.
- **§ 3's `frame` claim, which the guide ships no check for** — I wrote one. On a worker-served
  navigation the live site returns `content-security-policy: frame-ancestors 'self'` with
  `cache-control: no-store`, while the host's first response carries neither. Both halves true.
- **§ 6's integrity snippet** — the published copy hashes to the snippet's `sha384-` exactly.
- **§ 7's nine cases** — 9/9 on chromium, firefox and webkit, 27 for 27, including the embed
  integrity-refusal case and the worker-vs-host header case (`no-store`/no etag vs
  `max-age=600`/etag present, which I also confirmed by `curl`).
- **§ 7's `ENGINES` default** — `ENGINES ?= chromium` (`mk/10-gateway.mk:23`); the bare command ran
  one engine.
- **§ 7/§ 10's #110** — reproduced precisely, including the misblamed stage (see § 4 below).
- **§ 9's byte-identical claim** — `PIN=1:0x…` and a one-entry config file produced identical trees
  (`diff -r` clean).
- **§ 10's output-directory message** — verbatim.
- **§ 4's "do not commit a `CNAME`"** — the repo has none.
- **§ 5's description of `pages-test.yml`** — accurate, including the two-fixture dispatch choice.

---

## 3 — Where I stopped, and why

**Furthest point reached:** everything in §§ 1–4, 6, 7, 9 and 10 that does not require a GitHub
setting or a deploy. Concretely: the § 3 local build of my own config; reproduction of § 5's
`expect` hashes; byte-comparison of the live site against that build; § 6's published-copy hash
check; § 7's `make check-site` on all three engines and `make verify` on two chains and on one; and
all of § 3's validator and § 9/§ 10 message claims.

Not done, with what I would have done and what I would have read:

| Stopped at | Why | What I would have done |
|:--|:--|:--|
| § 2, verifying the domain | Needs org settings. Out of scope. | *Settings → Pages → Add a domain* on `dnznlabs`, add the `TXT`, then re-read `.protected_domain_state`. Already `verified` for this host, so I read the end state instead. |
| § 4, the DNS record and Pages settings | No DNS, no repo settings. | `CNAME` → `<owner>.github.io`, Source: GitHub Actions, custom domain, Enforce HTTPS. All four confirmed already in place by reading the API. |
| § 5, the deploy key | "No secrets." I did not generate a keypair or touch Deploy keys. | `ssh-keygen`, public half on `dnznlabs/gw44`, private half as `GW44_READ_KEY`, then the `ssh -i gw44-read -o IdentitiesOnly=yes -T git@github.com` proof and check the hostname in the reply. Would have read [#92]. |
| § 5, the org access setting, and its reading | Both need admin on `dnznlabs/gw44`, which this token lacks. | `gh api repos/dnznlabs/gw44/keys` → `404 Not Found`; `gh api repos/dnznlabs/gw44/actions/permissions/access` → `404 Not Found`. The guide flags the first as admin-only; it does not say the second has no reading for a non-admin. Would have read [#86]. |
| § 5, `gh secret list -R <your-repo>` | I have no repository of my own and must not create one. | Nothing to run. |
| § 5/§ 7, the deploy itself and `verify-only: true` | **Explicitly forbidden** — a deploy replaces a live site, and `verify-only` is still a workflow dispatch. | A `verify-only: true` run from a branch is the guide's own answer for exercising the path without replacing a site; it is the one thing I most wanted and least could do. The whole `expect` → build → compare loop is therefore untested by me *through the workflow*, though I verified both ends of it locally. |
| § 8, the update-latency figure | The guide says it is unmeasured and pending [#105]/[#85]. | Nothing; it correctly refuses to print a number nobody measured. |
| § 9, the favicon engine split | `check-site`'s favicon case cannot attribute the request, and its resource-timing counts disagree with § 9 for WebKit. | A worker-less page load per engine with request interception at the HTTP layer, which is beyond anything the guide ships. Would have read [#36]. |

---

## 4 — What I actually ran

In order. Output trimmed to the part that mattered.

**1. Orient, and read the guide.**
```
$ cd /home/openclaw/src/gw44 && git branch --show-current && git log --oneline -3
m02/t03-deploy-guide
3037d11 docs(deploy): the reader's half, and what verify really checks
6ed7c21 docs(deploy): from nothing to a gateway on your own domain
a0f6f09 Merge pull request #103 from dnznlabs/m02/t02-step4
```

**2. § 2 and § 4 readings, all five.**
```
$ gh api repos/dnznlabs/gw44/pages
{"cname":"gw-test.dnzn.dev","build_type":"workflow","protected_domain_state":"verified",
 "pending_domain_unverified_at":null,
 "https_certificate":{"state":"approved",…,"expires_at":"2027-02-18"},"https_enforced":true}

$ gh api repos/dnznlabs/gw44/pages --jq '.build_type, .cname, .https_enforced, .protected_domain_state'
workflow / gw-test.dnzn.dev / true / verified
$ gh api repos/dnznlabs/gw44/pages --jq '.https_certificate.state'
approved

$ node -e 'require("node:dns").promises.resolveCname("gw-test.dnzn.dev").then(console.log)'
[ 'dnznlabs.github.io' ]
```

**3. § 3's no-header reading on the live root.**
```
$ curl -sS -D - -o /dev/null https://gw-test.dnzn.dev/
HTTP/2 200
cache-control: max-age=600
etag: "6b01f7db-242c"
content-length: 9260
# no content-security-policy, no x-frame-options — as § 3 says
```

**4. § 3's clone, and the private-repo surprise.**
```
$ git clone https://github.com/dnznlabs/gw44        # worked — local gh credential helper
$ gh repo view dnznlabs/gw44 --json visibility,isPrivate,defaultBranchRef
{"defaultBranchRef":{"name":"main"},"isPrivate":true,"visibility":"PRIVATE"}
$ gh api repos/dnznlabs/gw44/keys --jq '.[]|[.title,.read_only]'
gh: Not Found (HTTP 404)                             # admin-only, as § 5 says
```

**5. § 3's local build, with my own two files.**
```
$ devbox run -- make build CONFIG=/tmp/t03-reader-2/my/gw44.json \
    GW44_CHAINS=/tmp/t03-reader-2/my/chains.json GW44_OUT=/tmp/t03-reader-2/out-my
built /tmp/t03-reader-2/out-my/ (pinned to 1:0x00a9f390…25ba 8453:0x00d19609…7f8e, default 1):
  9506833c22b245e3a1c7180eeceea99a6b40e71ed4b8120b4fbb7b56ec164863     9263  404.html
  65a1923d774efba3e075274a9dde398b822473e0f52560f052738f28eb58bbf9     7781  gw44-sw.js
  9506833c22b245e3a1c7180eeceea99a6b40e71ed4b8120b4fbb7b56ec164863     9263  index.html
exit=0
```

**6. § 5's `expect` block, reproduced at `a0f6f09`.**
```
$ git clone -q gw44 gw44-a0f6f09 && cd gw44-a0f6f09 && git checkout -q a0f6f097134e6b96f97f35f1d1797bf062784cab
$ devbox run -- make build CONFIG=test/fixtures/gw44.two-chains.json GW44_OUT=…/out-fixture
  809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40     9260  404.html
  58d03a039c58672d8e8a63d4c75caa6b70789c3c7ed5894a28d63399f941b7e0     7778  gw44-sw.js
  809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40     9260  index.html
```
Identical to the three lines § 5 prints, including the sizes.

**7. The live site is those bytes.**
```
$ for f in index.html 404.html gw44-sw.js; do curl -sS "https://gw-test.dnzn.dev/$f" | sha256sum; done
809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40  -   # index.html
809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40  -   # 404.html
58d03a039c58672d8e8a63d4c75caa6b70789c3c7ed5894a28d63399f941b7e0  -   # gw44-sw.js

$ curl -sS -o /dev/null -w '%{http_code}\n' https://gw-test.dnzn.dev/zzz-nope/deep/link
404                                                   # § 7's design assumption, from outside
```

**8. § 6, the embeds.**
```
$ curl → openssl dgst -sha384 … on /84532/widget.js   -> sha384-YdiQK1VLmzn9EdOpTRan9r2NsUR+DnOwTJ/saTfdBDEkLxiyC2QiRFpVgJ/FQVtE
$ … on /11155111/widget.js                            -> same hash (both 200)
$ … on /1/widget.js  (the guide's literal path)        -> A9COs9LXp3y8z/2BJ5kMGEsawP6w+vFZ5BQYvY00Ql6fx2c+wHIkqhRoEMm2GwQX
$ curl -sS -o /dev/null -w '%{http_code}' …/1/widget.js -> 404          # ← finding (c)

$ curl -sS -D - -o /dev/null https://gw-test.dnzn.dev/84532/widget.js
content-type: application/javascript; charset=utf-8
etag: "6b01f7db-213d"
cache-control: max-age=600                            # the host half of § 7's last case
```

**9. § 5's inputs against the real workflow.** `sed -n '1,80p' .github/workflows/deploy-pages.yml`
at `a0f6f09`: `on: workflow_call` only; inputs `gw44-ref` (required), `config` (required),
`chains` (required), `embeds`, `expect`, `verify-only`; secret `gw44-read-key`. Every name in § 5's
table and YAML block matches.

**10. § 7, `make browsers` then `make check-site`.**
```
$ devbox run -- make browsers ENGINES="chromium firefox webkit"
npx playwright-core install chromium-headless-shell firefox webkit        # returned at once — finding (d)

$ devbox run -- make check-site URL=https://gw-test.dnzn.dev \
    SITE_CONFIG=test/fixtures/gw44.two-chains.json \
    EMBED="84532/widget.js=sha384-YdiQK1VLmzn9EdOpTRan9r2NsUR+DnOwTJ/saTfdBDEkLxiyC2QiRFpVgJ/FQVtE"
check-site: https://gw-test.dnzn.dev on chromium, chains [84532 11155111], default 11155111
  … 9 cases … ok
check-site: every case passed on chromium
exit=0
```
Then with `ENGINES="chromium firefox webkit"`: `every case passed on chromium` /
`… on firefox` / `… on webkit`. 27 for 27. The favicon case reported `0` resource-timing entries on
chromium, `1` on firefox, `0` on webkit.

**11. § 7, `make verify` — two chains, clean.**
```
$ VERIFY_SITE=https://gw-test.dnzn.dev VERIFY_ADDRESS=0x00a9f390a6010d045e0d34856048ddd6910d25ba \
  VERIFY_CHAINS="11155111 84532" devbox run -- make verify
verify: address 0x00a9f390a6010d045e0d34856048ddd6910d25ba on chains [11155111 84532]
  11155111 root 64305 B chain=009003a25ef2f15e… served=009003a25ef2f15e… ok
  … 16 comparisons, all ok …
  … 6 browser loads, all ok, title "RAKE" …
verify: every comparison and every browser load passed
exit=0
```
The first line names the contract it read, as § 7 says it would.

**12. § 7/§ 10's #110 — one chain, reproduced exactly.**
```
$ … VERIFY_CHAINS="11155111" devbox run -- make verify
  11155111 site widget 8509 B … ok
  11155111 config root: tools/get.ts failed — MISMATCH (x-content-type-options: nosniff)
  11155111 config widget: tools/get.ts failed — MISMATCH (x-content-type-options: nosniff)
verify: browser stage
  11155111 browser ok / 11155111 pinned browser ok / root → 11155111 config browser ok
verify: the browser stage failed
exit=2
```
Only the `config` passes fail, every browser line says `ok`, and the summary blames the browser
stage. Precisely what § 7 and § 10 describe. (One nuance: the explanation says it "gets a 404", but
the message you actually see is `MISMATCH (x-content-type-options: nosniff)` — a reader matching text
to § 10's table will find it, but not from the word "404".)

**13. § 3's validator, sixteen cases.** `bash /tmp/t03-reader-2/scripts/validator-cases.sh`:
```
"mainnet" key   -> the chains file has "mainnet" as a key, which is not a chain id        exit 2
"01" key        -> the chains file has "01" as a key, which is not a chain id             exit 2
bare string     -> the chains file gives chain 1 a string instead of a list               exit 2
null            -> the chains file gives chain 1 null instead of a list                   exit 2
empty array     -> the chains file gives chain 1 an empty list of endpoints               exit 2
http, non-loop  -> … "http://rpc.example.com" on chain 1: endpoints are https, or http on loopback   exit 2
http 127.0.0.1  -> built                                                                  exit 0
http localhost  -> built                                                                  exit 0
chains {}       -> cfg-one.json names chain 1, which the chains file does not carry        exit 2   # finding (b)
chain missing   -> cfg-one.json names chain 1, which the chains file does not carry        exit 2
user:pass@ url  -> built, and published verbatim                                          exit 0
2 chains, no default -> refused                                                           exit 2
frame:"any"     -> built                                                                  exit 0
frame:"none"    -> refused                                                                exit 2
UPPERCASE addr  -> built, d27925864fcf8e63… — identical to the lowercase config's output   exit 0
contracts: {}   -> refused                                                                exit 2
```

**14. § 9 and § 10 claims.**
```
$ # PIN vs one-entry config
built …/pin/   -> d27925864fcf8e63… 9128 / 13987f67379b4f2d… 7646 / d27925864fcf8e63… 9128
built …/cfg1/  -> d27925864fcf8e63… 9128 / 13987f67379b4f2d… 7646 / d27925864fcf8e63… 9128
$ diff -r outs/pin outs/cfg1  ->  byte-identical: yes                      # § 9 confirmed

$ # stray file in the output directory
Error: /tmp/t03-reader-2/outs/stray/ holds README.txt; the deployable is only 404.html, gw44-sw.js, index.html; run 'make clean'

$ # no CONFIG, no PIN — succeeds locally
built /tmp/t03-reader-2/outs/unpinned/:  (no "pinned to" clause)           exit 0        # finding (e)
$ grep -rn "not pinned" .github/workflows/
deploy-pages.yml:159:  echo "the build is not pinned; refusing to deploy an unpinned gateway" >&2
```

**15. Unconfigured chains are dropped.** Chains `10`, `42161`, `11155111` added to the chains file,
same `gw44.json`:
```
built …/outs/extra/  -> 9506833c22b245e3… / 65a1923d774efba3… / 9506833c22b245e3…
$ diff -r outs/extra out-my  ->  byte-identical: unconfigured chains are dropped
$ grep -c optimism outs/extra/gw44-sw.js  ->  0
```

**16. Endpoints are published; the `frame` flag is all that differs.**
```
$ grep -o ethereum-rpc.publicnode.com out-my/{index.html,404.html,gw44-sw.js}   -> present in all three
$ grep -o 'https://user:pass@rpc.example.com' outs/credentialed-url/gw44-sw.js  -> present
$ # diff of the self vs any workers — the only difference:
  self: …contracts:{"1":"0x00a9f390…25ba"}};var X={…
  any : …contracts:{"1":"0x00a9f390…25ba"},frame:"any"};var X={…
```
So "`any` omits the header" is a runtime decision, not a build-time one — the constant
`"frame-ancestors 'self'"` is in both bundles. Which is why I tested the header itself:

**17. The § 3 `frame` claim, in a browser** (`/tmp/t03-reader-2/scripts/csp-probe.mjs`, mine — the
guide ships no check for this):
```
$ devbox run -- env PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node …/csp-probe.mjs
controlled: true | title: RAKE
status: 200
content-security-policy: frame-ancestors 'self'
x-frame-options: (absent)
cache-control: no-store
```
First load from the host: no CSP (step 3). Worker-served navigation: `frame-ancestors 'self'`. Both
halves of § 3's paragraph confirmed.

**18. The guide's own links.**
```
docs/milestones/m02/tasks/m02-t03/HANDOFF.md  -> MISSING (only TASK.md)        # finding (a)
.github/workflows/pages-test.yml              -> present, and as described
test/fixtures/gw44.two-chains.json            -> present
README.md / SECURITY.md / docs/ROADMAP.md     -> present
CNAME anywhere in the tree                    -> none, as § 4 instructs
$ gh api repos/dnznlabs/gw44/actions/permissions/access  -> gh: Not Found (HTTP 404)
```

**19. Housekeeping, and a caveat about the working tree.** I made no writes of any kind to
`/home/openclaw/src/gw44` — only `git`, `ls`, `stat` and `read`. But **that working tree changed
under me during the session, by something other than me**, so a word on what my evidence rests on.

At the start:
```
$ git branch --show-current && git log --oneline -1
m02/t03-deploy-guide
3037d11 docs(deploy): the reader's half, and what verify really checks
$ git status --porcelain
?? returning.local.mjs
```
Near the end, without any action of mine, first ` M .github/workflows/deploy-pages.yml` with
`returning.local.mjs` gone, and then:
```
$ git log --oneline -1 && git branch --show-current
d9f86c2 fix(pages): three deploy attempts in one job, and say which one deployed
m02/t02-deploy-retry
$ git status --porcelain          # clean
$ sha256sum docs/DEPLOY.md
sha256sum: docs/DEPLOY.md: No such file or directory
```
Another session is evidently working in that checkout; `m02/t02-deploy-retry` has no `docs/DEPLOY.md`
at all. Flagging it because it is someone's work in progress, not because it affected my reading.

**It does not weaken the findings.** Everything I built, ran or hashed came from my own clones under
`/tmp/t03-reader-2/` (`gw44` at `main` `bb8883f`, `gw44-a0f6f09` at `a0f6f09`), never from that
working tree. The only evidence drawn from it is commit-addressed and so immutable: the guide text I
read is `3037d11:docs/DEPLOY.md`, sha256
`a365bd36e4b0e39ca921afc21421d22e96918aa7593be54f41e2c2200e56d1fa`, and finding (a) is re-verified
above against `3037d11` rather than against a moving `HEAD`. The link-existence checks in step 18
were run while `HEAD` was still `3037d11`; `.github/workflows/pages-test.yml`, the fixture and the
absent `CNAME` are all also present-or-absent in my `/tmp` clones, which agree.
