# m02-t03 — handoff

PR: #TBD · Branch: `m02/t03-deploy-guide` · 2026-11-21

[`docs/DEPLOY.md`](../../../../DEPLOY.md) takes the owner of a project from nothing to a gateway on their own domain: ten sections, each a command or a setting and then the reading that shows it worked. **Two fresh sessions with no context followed it**, one before the fixes and one after, and both reports are committed beside this file unedited — [`reader-1.md`](reader-1.md) and [`reader-2.md`](reader-2.md). Between them they found one thing wrong, six imprecise or missing, and one defect in `tools/verify.sh` that is not the guide's (#110). `README.md` links the guide from § Documentation and from the pinned-build section. Markdown only: nothing outside `docs/` and `README.md` changed.

## Acceptance criteria

| AC | Result | Evidence |
|:---|:-------|:---------|
| Milestone criterion 6 — `docs/DEPLOY.md` exists with the planned sections | pass | Ten sections in the plan's order, plus a *Not in this guide* section in the runbook shape. § Section → source below maps each to the handoff or issue it came from |
| Step 2's list of guesses is empty after the fixes, or each remaining one is named with the reason | **pass, with four named** | § The two readers. Reader 1 raised twelve guesses and three imprecisions; reader 2, on the fixed text, raised **one that is self-resolving** (the pointer to this file, which did not exist at the commit it read) and **four that cannot be removed** — each needs a fact only the reader has, or a deploy. It found three further errors, all fixed |
| Every command and setting appears in a handoff or an issue that ran it | pass | § Section → source, line by line. The four commands the guide introduces that no earlier handoff had run, I ran before writing them: `protected_domain_state`, `https_certificate.state`, the `openssl` hash recipe, and `make get` against a configuration |
| Milestone criterion 7 — the phone readings are recorded | pass | § Phones, from Denizen's own report on [#106](https://github.com/dnznlabs/gw44/issues/106), with two gaps named rather than smoothed |
| #36 is closed by the sentence in the guide | **the sentence is in § 9; the issue was already closed** | Denizen closed #36 at 2026-11-21T18:32:07Z as `COMPLETED`, ahead of this work and with no closing comment. So this PR cannot carry `Closes #36`; the sentence the plan asked for — declare an icon, `<link rel="icon" href="data:,">` — is in § 9 with the measurement behind it |
| Markdown only | pass | `git diff --name-only main...HEAD` is four paths: `docs/DEPLOY.md`, `README.md`, and the two readers' reports |

## Section → source

| § | Source |
|:--|:--|
| 1 — what you are deploying, and what you are trusting | `SECURITY.md` § Trust model; `src/adapters/rpc/fetch.ts`'s own doc comment for ordered failover and one endpoint's word being taken; roadmap decisions 9 and 11, quoted as they read |
| 2 — before you start | [#51](https://github.com/dnznlabs/gw44/issues/51), both settings and why verification precedes the DNS record; m02-t01 `HANDOFF.md` § Step 0. **The `protected_domain_state` reading is new here**, run while writing it |
| 3 — the configuration | `README.md` § Several chains for the file's shape; m02-t04 for `frame` and what `"any"` gives up; `tools/chains.ts` and [#63](https://github.com/dnznlabs/gw44/issues/63) for the validator's five rules; [#94](https://github.com/dnznlabs/gw44/issues/94) for the endpoint shapes it cannot judge. The local-build subsection is `mk/10-gateway.mk` and `tools/build.ts`, run here; the `make get` check is new here and run |
| 4 — DNS and Pages | m02-t01 `HANDOFF.md` § Step 0 for both readings and for "no `CNAME` file"; [#51](https://github.com/dnznlabs/gw44/issues/51) for the settings. **The `https_certificate.state` reading is new here**, run while writing it |
| 5 — the workflow | m02-t02 `HANDOFF.md` and `deploy-pages.yml`'s own header for the inputs, the double pin and `expect`; [#86](https://github.com/dnznlabs/gw44/issues/86) for the two private-repository settings **and their order**; [#92](https://github.com/dnznlabs/gw44/issues/92) for the key mistake and the `ssh -T` proof |
| 6 — embeds | m02-t02 `HANDOFF.md` § step 2 and `tools/embeds.sh`; the live `integrity`, reproduced three ways here. The `openssl` recipe is new here and run |
| 7 — checking a deployment | m02-t01 for `check-site`'s cases; m02-t02 step 4 and this task for the two embed cases; `tools/verify.sh`'s own header for `VERIFY_ADDRESS`/`VERIFY_CHAINS`; [#110](https://github.com/dnznlabs/gw44/issues/110), filed from this work |
| 8 — updating | m02-t01 § Step 5 for Pages' `etag` and `age`; `src/adapters/sw/boot.ts` and `sw.ts` for `updateViaCache`, `skipWaiting` and `clients.claim`. **No figure**: see § The one number this guide does not carry |
| 9 — one contract on one chain | [#36](https://github.com/dnznlabs/gw44/issues/36) for the favicon measurement, Firefox and WebKit against headless Chromium; `deploy-pages.yml`'s inputs for `config` being required, which is why `PIN=` is named as a local build only |
| 10 — when it goes wrong | Each row is a message this project has met: the checkout failure from run 44936196476, the four guards from `deploy-pages.yml`, the two build gates from m02-t04, [#110](https://github.com/dnznlabs/gw44/issues/110)'s pair, the artifact lookup from runs 44943072153, 44943264179, 44944097999 and 44947443048, and the certificate and unclaimed-hostname rows from [#51](https://github.com/dnznlabs/gw44/issues/51) |

## The two readers

Both were fresh sessions with no context: given the repository, the guide, and the boundary that they could not deploy, change a setting or ask anyone anything. Neither was coached, and neither was told about the other.

**Reader 1, at `6ed7c21`** ([`reader-1.md`](reader-1.md)) — twelve guesses, one error, three imprecisions:

| What it found | Disposition |
|:--|:--|
| **The guide never introduces a local build at all.** §§ 3–6 are about "your own repository" — two JSON files and a caller — then § 7 hands over `make` targets with no change of subject. It had to open `mk/10-gateway.mk` and `tools/build.ts` to check a configuration without spending a deploy run. *"This is the omission that cost me the most."* | **fixed**: § 3 gained *Check the two files before you spend a deploy run*, with the clone, `CONFIG`, `GW44_CHAINS`, `GW44_OUT`, and the sentence that everything in §§ 7 and 9 starting with `make` runs from that checkout |
| **`make verify` does not verify *your* contract.** `tools/verify.sh` hardcodes this repository's fixture and two chains; the guide's command has no slot for a contract, and `VERIFY_ADDRESS`/`VERIFY_CHAINS` were not in it | **fixed**, and it found a defect while proving it: § 7 now shows all three variables, says they are not optional, and says to read the `verify: address … on chains […]` line first. The defect is [#110](https://github.com/dnznlabs/gw44/issues/110) |
| **The framing claim is false for the first load.** The header is the worker's, Pages cannot send one, so the cold first response carries no framing rule | **fixed**: § 3 now says the guarantee is every worker-served navigation, with the `curl` reading, and prices it that way |
| **§ 9 offered a `PIN` deploy the deploy path cannot do.** `config` is required and `PIN` is not an input | **fixed**: § 9 leads with the one-entry configuration file and names `PIN=` as a local build |
| **§ 3 overstated what the chains file publishes** — only configured chains' entries reach the files | **fixed**, in the reader's favour: § 3 says which entries are published and that the rest are dropped |
| `ENGINES` defaults to chromium; `make browsers` is a prerequisite; where the three `expect` lines are printed; how to compute an `integrity`; the chains file's name; the certificate reading; the domain-verification reading; which file § 7's `SITE_CONFIG` means | **all fixed**, each in its own section |
| The dangling pointer to this handoff | **self-resolving**: this file is committed in the same PR. Both readers raised it, which is the lesson — a forward reference in the present tense reads as a defect to everyone who is not the author |

**Reader 2, at `3037d11`** ([`reader-2.md`](reader-2.md)) — three errors, four irreducible guesses:

| What it found | Disposition |
|:--|:--|
| **"An empty object is accepted and serves nothing"** describes a build you cannot produce: it proved all three routes fail — a config naming any chain, an empty `contracts`, and `PIN=` — so the sentence invites something impossible | **fixed**: the sentence is gone, replaced by what happens to a chain named in neither file |
| **§ 6's hash recipe silently hashes error pages**: no `-f`, so a wrong path prints a confident `sha384-…` of the 404 shell | **fixed**: `curl -fsS`, with a line saying `-f` is load-bearing and what a failure looks like |
| **The clone in § 3 needs access of its own** while `dnznlabs/gw44` is private; § 5 knows this and § 3 did not | **fixed**: one clause, plus the `GW44_CHAINS` default it also asked for |
| **Nothing tells you to confirm your contract answers before you deploy.** A config naming a contract that is not there builds clean and fails only at § 7, after the deploy | **fixed**: § 3 ends with `make get` against the configuration, the reading it prints, and the warning that a 404 still exits 0 |
| § 7 never says the checking checkout should be at the deployed commit | **fixed**: § 7 says to check out the commit in `gw44-ref` |
| § 7's quoted commands cannot be run against the one site the guide quotes without opening the fixture | **fixed**: § 7 carries the test site's chains, address and default inline |
| **Irreducible, with reasons:** its own contract and endpoints (the guide cannot supply those); the deploy itself and `verify-only` (a dispatch); the private-repository settings and `ssh -T` (admin, and the private half of a key it cannot have); § 8's figure (not measured — see below) | **named rather than fixed.** Reader 2 also recorded that `gh api …/keys` answers a non-admin with **404, not 403**, so the refusal reads as "no such thing": worth a clause the next time § 5 is touched, and not worth a Markdown-only round trip now |

**What both readers confirmed, which is the other half of the evidence:** the three `expect` lines rebuild byte for byte from the pinned commit and equal what the live site serves; all nine `check-site` cases pass on chromium, firefox and webkit, twice over, 27 for 27 each time; every validator rule refuses what the guide says it refuses; § 8's `etag` claim decomposes exactly into mtime and size; the `integrity` matches; the `PIN`-versus-one-entry builds are identical by `diff -r`; and every citation resolves.

**One place a reader's own record is imprecise**, checked rather than copied: reader 1's confirmation list names `#83` and `#103` among the guide's citations. The guide cites neither — `grep` gives ten numbers, `#36 #51 #85 #86 #92 #94 #96 #105 #110 #451`, and it was nine before #110. Its count was right and two of its items were not.

## The one number this guide does not carry

§ 8 says how a redeploy reaches a returning visitor **mechanically** — the worker script's `max-age=600`, `updateViaCache: "none"`, `skipWaiting` and `clients.claim`, and Pages' `etag` and `age` behaviour — and then says plainly that how soon is not yet measured, naming [#85](https://github.com/dnznlabs/gw44/issues/85) and the task that will measure it.

That is deliberate and the architect confirmed it: m02-t02 step 4's measurement is blocked behind the artifact-lookup failure of `actions/deploy-pages`, now [#111](https://github.com/dnznlabs/gw44/pull/111). **A measured number arrives later by a Markdown-only amendment**; a number nobody measured does not go in a runbook. Both readers reached § 8 and both recorded that declining to print one is the right call.

## Phones

Milestone criterion 7, from Denizen's own report, collected on [#106](https://github.com/dnznlabs/gw44/issues/106) between 14:19 and 14:36 CST on 2026-11-21 and closed there at 20:43:43Z by the architect, who recorded the readings as they came in. Device **iPhone 14, iOS 27.2.1**.

| Browser | Reading |
|:--|:--|
| Mobile Safari | loads `https://gw-test.dnzn.dev` and shows the application. Connect reports no wallet found |
| Chrome on iOS | the same, both halves |
| MetaMask **8.20.2** in-app browser | loads the site, **Connect finds the wallet**, and `/84532/` opened directly also loads the application — reporting that the network is not set up, because Base Sepolia is not added in that wallet |

**What the Connect result is and is not.** It is the application, not the gateway: rake's dapp looks for an injected provider only, and neither mobile Safari nor Chrome on iOS has one. The same page behind any gateway would say the same. The gap is captured outside this repository (design-base#4, rake#318) and is not this task's.

**Two gaps, named rather than smoothed:** Chrome's version was not reported, and **a reload inside MetaMask's browser was not tried** — which is the one case where the service worker's second-visit path meets a wallet's embedded WebKit view, so it is the reading I would most want next.

## Deviations from the plan

1. **#36 was already closed** by the Product Owner at 18:32Z, ahead of this work, so the PR does not carry `Closes #36`. The sentence it asked for is in § 9.
2. **The readers' reports are committed** as `reader-1.md` and `reader-2.md` in this directory rather than quoted inside this file. The plan says the transcript's list of guesses goes in `HANDOFF.md`; the architect asked for the record verbatim, and 29 KB twice over belongs beside the handoff rather than inside it. The dispositions are here, one row each.
3. **A second reader was run**, which the plan does not ask for. One reader finds what a guide is missing; it cannot show that the fixes landed. Reader 2 is why the "list of guesses is empty" row above is evidence rather than an assertion — and it found three more errors, including a recipe that would have hashed a 404 page.
4. **Two sections carry a reading the plan did not ask for**: § 2's `protected_domain_state` and § 4's `https_certificate.state`. Both exist because a reader asked the obvious question — *how do I know it worked?* — and the plan's sections had no answer for the two settings that gate everything else.
5. **`docs/DEPLOY.md` is 10 sections but § 3 and § 7 are longer than planned**, because the local build had to go somewhere and § 3 is where a reader is deciding what to write.

## Decisions

- **A guide says what has been run.** Four commands in it had no prior handoff behind them, so I ran each before writing it, and the outputs quoted are those runs'. The one place this bit: § 7's `make verify` form, which I ran and which **failed** — that failure is #110 and is now in the guide as a row of § 10 rather than a surprise for the reader.
- **The readers are not coached and not told about each other.** Each brief gives the repository, the guide, the boundary, and the instruction to write down every guess and carry on. Nothing about the first run reached the second.
- **§ 8 ships without its figure** rather than holding the guide or inventing one.
- **`PIN=` is named as a local build, not a deployment**, because `config` is required on the called workflow. The byte-identity claim stays, as a claim about two local builds, which is what was measured.
- **The framing paragraph prices the property as "every worker-served navigation".** It would have been easy to leave the absolute form; a reader deciding whether `"self"` is enough needs the window named.

## Discoveries

1. **`make verify` cannot pass for a one-chain project**, and its own header advertises the form that fails: the config pass asks `/<chain>/` of a configuration that, with one chain, is a one-contract build where the whole path is the contract's resource. The summary then blames the browser stage, which passed. [#110](https://github.com/dnznlabs/gw44/issues/110), with the reduction.
2. **A `gh api` refusal for a missing permission is a 404, not a 403** (reader 2), so "you are not admin" reads as "no such thing".
3. **A forward reference in the present tense reads as a defect.** Both readers independently flagged the guide's pointer to this file. The pointer is now phrased as what it is — a file committed with the guide — and the lesson is cheap: write forward references as forward references.
4. **The two readers disagreed about nothing**, which is worth recording for a method that uses blind readers elsewhere: every claim one checked and the other also checked came out the same, and their findings did not overlap except on the dangling pointer.

## Open questions

1. **A reload inside a wallet's in-app browser** is the one phone reading not taken, and it is the one that exercises the worker's second-visit path inside an embedded WebKit view. One line on #106 if Denizen is willing; not a blocker for criterion 7, which is met on what he did report.
2. **Whether `docs/DEPLOY.md` should carry a worked example end to end** — one project, one chain, from `gh repo create` to a green `check-site` — rather than ten sections a reader assembles. Both readers assembled it successfully, so this is a question about the next reader rather than a gap in this one.
