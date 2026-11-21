# M02 — Dedicated deployment

Status: not started · updated 2026-11-20

A project deploys its own gateway to GitHub Pages from its own repository by calling one workflow, and `rake.dnzn.dev` is the first to do it. It comes now because M01 leaves a build nobody has put on a real static host: every claim so far was measured against `tools/serve.ts` on loopback.

The milestone starts when M01 is done. Its last criterion closes in rake's repository, on rake's schedule, because it needs rake's mainnet addresses.

## Acceptance criteria

1. **A real host serves it.** A test site, deployed from this repository to GitHub Pages on its own hostname, serves a two-chain build of the rake fixture (`11155111` the default, `84532`). In Chromium, Firefox and WebKit, against that hostname over HTTPS: `/` ends on `/11155111/` showing the application; `/84532/` shows the application; a deep link opened cold (`/84532/` in a fresh profile) recovers from Pages' 404 status to the document; `/nope` is a 404. A script in `tools/` runs the four checks against a URL and exits non-zero on any failure.
2. **What it serves is the chain's.** For the test site, `make verify` with the site's URL as the compared side prints `ok` for the root and `widget.js` on both chains.
3. **One workflow deploys any project.** `.github/workflows/deploy-pages.yml` is callable from another repository (`workflow_call`). Its inputs are a full commit SHA of this repository, the path of the caller's `gw44.json`, the path of the caller's chains file, and an optional directory of extra static files. It builds at that commit, prints the three hashes, fails if they differ from hashes the caller passes, and deploys. The test site of criterion 1 is deployed by this workflow called from this repository.
4. **Static copies for embeds.** With the extra directory holding `<chain>/widget.js` for each configured chain, a request from another origin for `https://<host>/<chain>/widget.js` returns the file with a JavaScript content type, and its SHA-256 equals that of the chain's `request(["widget.js"],[])` body. The deploy fails if any copy's hash differs from the chain's at deploy time. The chain stays the source and the file is a copy of it: the snippet a project documents carries an `integrity` attribute computed from the chain's bytes, so a browser refuses a copy that differs, and the deploy prints that snippet. Shown on the test site, with a page on a second origin that loads the widget by `<script src>` with the attribute, and refuses it when one byte of the attribute is changed. Whether Pages sends the cross-origin header that `integrity` needs is this criterion's first check.
5. **The browser's own requests cost no call.** On a deployed multi-chain site `/favicon.ico` is answered without an `eth_call`. A one-contract build asks its contract for every path, that one included, so `docs/DEPLOY.md` tells its owner to declare an icon in the document, which stops the browser asking; #36 closes with that sentence. Amended 2026-11-20: the first wording asked the same of a one-contract build, which needs a change to reviewed code for one call per page load.
6. **`docs/DEPLOY.md`** takes the owner of a project from nothing to a deployed gateway on their own domain: the configuration file, the chains file and choosing endpoints, the DNS record, the Pages settings, the workflow call, the static copies, and how to check the result. Checked by following it for the test site, by someone who did not write it.
7. **Phones.** The test site opens and shows the application in the in-app browser of one mobile wallet and in mobile Safari, recorded with the date, the device and the versions.
8. **`rake.dnzn.dev`.** Deployed from rake's repository by the workflow of criterion 3, serving rake's `App` on every mainnet chain rake is deployed to, with the static widget copies of criterion 4; criterion 1's script and criterion 2's comparison pass against it. This criterion is met by rake's m05-t04 and is checked there.

## Out of scope

- The public gateway, `gw44.link`, the Public Suffix List and opening the repository: M05.
- The loader for embeds read from the chain: M03. Criterion 4's static copies are what a project uses until then.
- Quorum or proof verification of endpoints: M04. `docs/DEPLOY.md` says what a deployer is trusting when they pick endpoints.
- Any host but GitHub Pages. The build is three static files and runs elsewhere; this milestone proves one.
- Testnet contracts on a project's mainnet origin. Decision 11.
- rake's own work: its `gw44.json`, its chain list, its workflow file and its DNS are rake's m05-t04.

## Needs from the Product Owner

Each becomes an issue assigned to the Product Owner when M01 closes, not before; none is actionable today.

- **Decision: the test site's hostname.** *Question:* which hostname does the test site live on? *Options:* (1) a name under `dnzn.dev`, such as `gw-test.dnzn.dev`: nothing new is published about `gw44`; (2) `test.gw44.link`: uses the registered domain, and puts the name in a public URL before M05. *Recommendation:* (1), while the repository is private. *Default:* (1) with `gw-test.dnzn.dev`, taken when m02-t01 starts. *Record:* `docs/ROADMAP.md` § Decisions.
- **Action: DNS and Pages for the test site.** A `CNAME` for the chosen hostname to `dnznlabs.github.io`, and Pages enabled on this repository with that custom domain and HTTPS enforced. Needed by m02-t01. The site is public even though the repository is not.
- **Action: let another repository call the workflow and read this one.** While `gw44` is private, a caller needs (a) this repository's Actions access set to allow the organisation's repositories, and (b) a read-only deploy key on `gw44` held as a secret in the caller. Needed by m02-t02; whether (a) alone is enough is that task's first check.
- **Action: criterion 7**, on a phone.
- **Focus.** Criterion 8 is work in rake's repository. It starts when rake's mainnet addresses exist and the focus allows work there.

## Phases

### Phase 1 — A real host

The build on GitHub Pages under a real hostname, checked in three engines. Finishes first: if Pages cannot serve this, everything after it changes.

| Task | Goal | Status |
|:-----|:-----|:-------|
| [m02-t01](tasks/m02-t01/TASK.md) | The test site, deployed by hand once, and the check script (criteria 1, 2, 5) | not started |

### Phase 2 — A workflow anyone can call

| Task | Goal | Status |
|:-----|:-----|:-------|
| m02-t02 | The reusable workflow, the static copies and their hash check; the test site redeployed through it (criteria 3, 4) | not started |
| m02-t03 | `docs/DEPLOY.md`, followed by a second reader; the phone check (criteria 6, 7) | not started |

### Phase 3 — The first project

| Task | Goal | Status |
|:-----|:-----|:-------|
| rake m05-t04 | `rake.dnzn.dev` (criterion 8), planned and tracked in rake | not started |

Tasks run in order. `TASK.md` for m02-t01 is written while m01-t06 is being built.

## One-way doors

- **The test site's hostname**, mildly: it is public from the first deploy. Chosen under `dnzn.dev` by default so that it says nothing about `gw44`.
- **`rake.dnzn.dev` as an official URL.** Visitors' wallet permissions and stored state attach to the origin. The host behind it can change; the name and the path layout (`/<chain>/`) cannot without costing users. It closes in rake's m05-t04, not here.
