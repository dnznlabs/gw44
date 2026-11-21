# M02 — Dedicated deployment

Status: in progress · updated 2026-11-21

A project deploys its own gateway to GitHub Pages from its own repository by calling one workflow, and `rake.dnzn.dev` is the first to do it. It comes now because M01 leaves a build nobody has put on a real static host: every claim so far was measured against `tools/serve.ts` on loopback.

The milestone starts when M01 is done. Its last criterion closes in rake's repository, on rake's schedule: the first deploy serves rake's two testnets and no longer waits for mainnet addresses (decision 11 as amended 2026-11-21), and the criterion is met when the mainnet chains are on the site.

## Acceptance criteria

1. **A real host serves it.** A test site, deployed from this repository to GitHub Pages on its own hostname, serves a two-chain build of the rake fixture (`11155111` the default, `84532`). In Chromium, Firefox and WebKit, against that hostname over HTTPS: `/` ends on `/11155111/` showing the application; `/84532/` shows the application; a deep link opened cold (`/84532/` in a fresh profile) recovers from Pages' 404 status to the document; `/nope` is a 404. A script in `tools/` runs the four checks against a URL and exits non-zero on any failure.
2. **What it serves is the chain's.** For the test site, `make verify` with the site's URL as the compared side prints `ok` for the root and `widget.js` on both chains.
3. **One workflow deploys any project.** `.github/workflows/deploy-pages.yml` is callable from another repository (`workflow_call`). Its inputs are a full commit SHA of this repository, the path of the caller's `gw44.json`, the path of the caller's chains file, and an optional list of resources to publish as static copies. It builds at that commit, prints the three hashes, fails if they differ from hashes the caller passes, and deploys. The test site of criterion 1 is deployed by this workflow called from this repository.
4. **Static copies for embeds.** The deploy reads each listed resource from each configured chain and publishes it at `<chain>/<path>` (amended 2026-11-21: the workflow makes the copies itself, so a copy cannot differ from the chain by construction; the first wording had the caller supply them). A request from another origin for `https://<host>/<chain>/widget.js` returns the file with a JavaScript content type, and its SHA-256 equals that of the chain's `request(["widget.js"],[])` body. The deploy fails if any copy's hash differs from the chain's at deploy time. The chain stays the source and the file is a copy of it: the snippet a project documents carries an `integrity` attribute computed from the chain's bytes, so a browser refuses a copy that differs, and the deploy prints that snippet. Shown on the test site, with a page on a second origin that loads the widget by `<script src>` with the attribute, and refuses it when one byte of the attribute is changed. Whether Pages sends the cross-origin header that `integrity` needs is this criterion's first check.
5. **The browser's own requests cost no call.** On a deployed multi-chain site `/favicon.ico` is answered without an `eth_call`. A one-contract build asks its contract for every path, that one included, so `docs/DEPLOY.md` tells its owner to declare an icon in the document, which stops the browser asking; #36 closes with that sentence. Amended 2026-11-20: the first wording asked the same of a one-contract build, which needs a change to reviewed code for one call per page load.
6. **`docs/DEPLOY.md`** takes the owner of a project from nothing to a deployed gateway on their own domain: the configuration file, the chains file and choosing endpoints, the DNS record, the Pages settings, the workflow call, the static copies, and how to check the result. Checked by following it for the test site, by someone who did not write it.
7. **Phones.** The test site opens and shows the application in the in-app browser of one mobile wallet and in mobile Safari, recorded with the date, the device and the versions.
8. **`rake.dnzn.dev`.** Deployed from rake's repository by the workflow of criterion 3, serving rake's `App` on every mainnet chain rake is deployed to, with the static widget copies of criterion 4; criterion 1's script and criterion 2's comparison pass against it. Amended 2026-11-21: the site may be deployed first with rake's two testnets and gain each mainnet chain as rake deploys to it (decision 11 as amended); a mainnet chain is the default from the first one configured, and the criterion is met when every mainnet chain is served. This criterion is met by rake's m05-t04 and is checked there.

## Out of scope

- The public gateway, `gw44.link`, the Public Suffix List and opening the repository: M05.
- The loader for embeds read from the chain: M03. Criterion 4's static copies are what a project uses until then.
- Quorum or proof verification of endpoints: M04. `docs/DEPLOY.md` says what a deployer is trusting when they pick endpoints.
- Any host but GitHub Pages. The build is three static files and runs elsewhere; this milestone proves one.
- Testnet contracts on a project's mainnet origin where their owner is not the mainnet one. Decision 11.
- rake's own work: its `gw44.json`, its chain list, its workflow file and its DNS are rake's m05-t04.

## Needs from the Product Owner

The first is filed. The others become issues assigned to the Product Owner when the task that needs them is next.

- **Action: Pages for the test site** ([#51](https://github.com/dnznlabs/gw44/issues/51)). The hostname is `gw-test.dnzn.dev` (roadmap decision 12) and its DNS record is in place, as is `rake.dnzn.dev`'s (both read 2026-11-21). Still to do: Pages enabled on this repository with GitHub Actions as the source, that custom domain and HTTPS enforced; and `dnzn.dev` verified for the organisation, because a record pointing at GitHub Pages with no site behind it can be claimed by anyone's. Needed by m02-t01.
- **Action: a read-only deploy key and Actions access** ([#86](https://github.com/dnznlabs/gw44/issues/86)). While `gw44` is private, a workflow running in another repository cannot check it out with its own token or call a workflow here without them. Needed by m02-t02 step 3.
- **Action: criterion 7**, on a phone.
- **Focus.** Criterion 8 is work in rake's repository. It starts on rake's two testnets when the focus allows work there, and closes when rake's mainnet chains are on the site.

## Where it stands

Updated 2026-11-21. Criteria 1 to 7 are met on the test site, `https://gw-test.dnzn.dev`. Open before the milestone can close:

- **Criterion 8, `rake.dnzn.dev`**, which is rake's m05-t04. Its first deploy can run now on rake's two testnets; it closes when rake's mainnet chains are served.
- **[#85](https://github.com/dnznlabs/gw44/issues/85), and a section of the deploy guide to correct.** Roadmap decision 14 (2026-11-21): a redeploy does reach a returning visitor by navigating, and nothing is built for it. `docs/DEPLOY.md` § 8 and m02-t02's handoff still say the opposite and are corrected in one Markdown change; one reading on GitHub Pages with the browser left open is taken at the next deploy that changes the worker.
- **The deploy step fails more often than it should**: three of eight runs through the reusable workflow deployed, for a reason inside GitHub's deploy action that an in-job retry now covers ([#111](https://github.com/dnznlabs/gw44/pull/111)). The two runs since both deployed on the first attempt; two is not a rate.
- **Carried issues labelled `m02`** that are not yet placed: [#77](https://github.com/dnznlabs/gw44/issues/77), [#107](https://github.com/dnznlabs/gw44/issues/107), [#109](https://github.com/dnznlabs/gw44/issues/109), [#110](https://github.com/dnznlabs/gw44/issues/110). Each is fixed, moved or dropped with a reason at the close-out.

## Phases

### Phase 1 — A real host

The build on GitHub Pages under a real hostname, checked in three engines. Finishes first: if Pages cannot serve this, everything after it changes.

| Task | Goal | Status |
|:-----|:-----|:-------|
| [m02-t01](tasks/m02-t01/TASK.md) | The test site, deployed by hand once, and the check script (criteria 1, 2, 5) | done ([#81](https://github.com/dnznlabs/gw44/pull/81), [#84](https://github.com/dnznlabs/gw44/pull/84)); live at `https://gw-test.dnzn.dev` |

### Phase 2 — A workflow anyone can call

| Task | Goal | Status |
|:-----|:-----|:-------|
| [m02-t02](tasks/m02-t02/TASK.md) | The reusable workflow, the static copies and their hash check; the test site redeployed through it (criteria 3, 4) | done ([#89](https://github.com/dnznlabs/gw44/pull/89), [#103](https://github.com/dnznlabs/gw44/pull/103), [#105](https://github.com/dnznlabs/gw44/pull/105), [#111](https://github.com/dnznlabs/gw44/pull/111), [#113](https://github.com/dnznlabs/gw44/pull/113)) |
| [m02-t04](tasks/m02-t04/TASK.md) | The carried changes to reviewed files, made together, and one review run over them: #57, #58, #59, #62, #63, #73, #74, #82 | done ([#102](https://github.com/dnznlabs/gw44/pull/102)) |
| [m02-t03](tasks/m02-t03/TASK.md) | `docs/DEPLOY.md`, followed by a second reader; the phone check (criteria 6, 7) | done ([#112](https://github.com/dnznlabs/gw44/pull/112)); phone check on [#106](https://github.com/dnznlabs/gw44/issues/106) |

### Phase 3 — The first project

| Task | Goal | Status |
|:-----|:-----|:-------|
| rake m05-t04 | `rake.dnzn.dev` (criterion 8), planned and tracked in rake | not started |

Tasks run in the order listed: m02-t04 before m02-t03, so the guide describes the code that ships. `TASK.md` for m02-t01 is written while m01-t06 is being built.

## One-way doors

- **The test site's hostname**, mildly: it is public from the first deploy. Chosen under `dnzn.dev` by default so that it says nothing about `gw44`.
- **`rake.dnzn.dev` as an official URL.** Visitors' wallet permissions and stored state attach to the origin. The host behind it can change; the name and the path layout (`/<chain>/`) cannot without costing users. It closes in rake's m05-t04, not here.
