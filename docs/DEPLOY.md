# DEPLOY — a gateway on your own domain

Three static files on a domain you control, serving your contract's pages out of the chain. This takes you from nothing to a deployed gateway, and every command and setting here is one that has been run: the readings quoted are from `gw-test.dnzn.dev`, deployed by this repository's own caller. Which handoff or issue each section comes from is mapped in `docs/milestones/m02/tasks/m02-t03/HANDOFF.md`, committed with this guide.

Work top to bottom the first time. Each step is a command or a setting, then the reading that shows it worked; if a reading does not match, stop there rather than continuing.

## Not in this guide

- **Any host but GitHub Pages.** The deployable is three files and a host that answers unknown paths with `404.html`; S3 and CloudFront can be pointed at `index.html` instead, and nobody here has run that.
- **A public gateway, or names.** This deploys *your* project to *your* domain.
- **Your contract.** It is yours, and the gateway serves whatever it returns.

## 1 — What you are deploying, and what you are trusting

Three files: `index.html`, its copy `404.html`, and `gw44-sw.js`. The first visit loads the page, which registers the service worker and reloads; from then on the worker answers every navigation on the origin by reading your contract over JSON-RPC and serving what it returns. Nothing is server-side: the host only ever sends those three files.

**What your visitors trust, in order.** Your domain, because what it serves is a page of your contract's bytes. Your contract. And **the RPC endpoints you name in the chains file**, because the worker believes the first one that answers: an endpoint that lies decides what your domain shows, and no visitor can tell. So name endpoints you would answer for, and name more than one — the list is tried in order and a dead first entry only costs latency, while a single lying entry costs everything. There is no quorum and no proof verification.

Two boundaries worth knowing before you choose what to put on the domain:

- **The chains of one project share one origin** (roadmap decision 9). Built for several chains, the gateway serves each under `/<chain>/`. That is a path, not a browser boundary: the chains share storage, the service worker registration and any wallet permission the visitor has granted. Each chain is only as safe as the weakest contract configured beside it.
- **Testnet contracts do not belong on a project's mainnet origin** (roadmap decision 11). They would share all of the above with the mainnet application, under a key usually held more loosely. Deploy testnets to a separate hostname.

## 2 — Before you start

| You need | Why |
|:--|:--|
| A repository for the site | GitHub Pages takes **one** custom domain per repository, so one hostname is one repository. |
| The domain verified for the account or organisation, **before** the DNS record exists | A record pointing at Pages with no site behind it can be claimed by another GitHub account, which can then serve anything on your hostname. Verify first, then point the record. |
| Admin on that repository | Pages, deploy keys, secrets and the Actions access setting are all admin-only settings; push access is not enough. |

Verify the domain under *Settings → Pages → Add a domain* on the account or organisation (not the repository), and add the `TXT` record it shows. This is the step that is easy to postpone and expensive to postpone: while `yourname.example` resolves to `*.github.io` with no site attached, it is unclaimed (#51).

**The reading that shows the verification landed** is on the repository's Pages endpoint, once § 4 has set the custom domain:

```bash
gh api repos/<owner>/<repo>/pages --jq '.protected_domain_state'
# verified
```

Before the domain is verified the same field reads `unverified`, and `pending_domain_unverified_at` carries the deadline after which Pages stops serving the name.

## 3 — The configuration

Two files in your own repository. Call them what you like — both reach the build as paths you name in the workflow, and this guide uses `gw44.json` and `chains.json` because that is what the test site's caller passes.

Neither is secret, and what the build publishes is **the entries for the chains you configured**: those endpoint URLs are compiled into `gw44-sw.js` and into both pages, where anyone can read them. A chain in your chains file that `gw44.json` does not name is dropped by the build and appears in none of the three files.

### `gw44.json`

```json
{
  "default": "1",
  "contracts": {
    "1": "0x00a9f390a6010d045e0d34856048ddd6910d25ba",
    "8453": "0x00d19609f2349d4160d2babaf46b0cd1ec6d7f8e"
  },
  "frame": "self"
}
```

| Key | Required | Meaning |
|:--|:--|:--|
| `contracts` | yes | Chain id to contract address, at least one. Chain ids are decimal with no leading zeros; addresses are `0x` and 40 hex digits, any case, lower-cased by the build. |
| `default` | when there are several | Which chain `/` redirects to. It may be omitted only with one contract, because with two a missing default would mean whichever chain the JSON happened to list first. |
| `frame` | no, defaults to `"self"` | Who may put your **root** document in a frame. `"self"` serves it with `content-security-policy: frame-ancestors 'self'`; `"any"` omits the header. No other value is accepted. |

**What `"any"` gives up.** With `"self"`, only your own pages can frame your root document; another site cannot put it in an iframe and overlay its own content on your Connect or Sign button. `"any"` allows exactly that, and it is the right choice only for a page meant to be embedded.

**What it does not cover, and this is worth knowing before you decide `"self"` is enough.** The header is on the response the **service worker** builds, so it protects every navigation the worker answers — which is every navigation after the first. The **first** load of a visitor's session is the static page from the host, and GitHub Pages cannot send a custom header at all, so that one response carries no framing rule. Measured on the live site: `curl -D - https://gw-test.dnzn.dev/` returns no `content-security-policy` and no `x-frame-options`. What a framer gets in that window is the shell, which renders nothing of your contract and then reloads itself out of the frame's control — but if framing is a threat you are pricing, price it as "every worker-served navigation", not "your root document". The setting is those two words and nothing else: a project that needs a policy of its own serves its page from `request()` at a sub-path, where it sets its own headers. A sub-path document gets no framing rule from the gateway at all ([#96](https://github.com/dnznlabs/gw44/issues/96)).

### The chains file

```json
{
  "1": ["https://your-endpoint.example", "https://your-second-endpoint.example"],
  "8453": ["https://base-endpoint.example"]
}
```

Validated by the build, which refuses anything else:

- keys are decimal chain ids; a name like `"mainnet"` is refused, and so is `"01"`;
- values are **non-empty arrays** of URLs — a bare string where a list belongs is refused, and so is `null`;
- `https:` only, except `http:` for a loopback host (`localhost`, `*.localhost`, `127.0.0.0/8`, `[::1]`) so that a development build can point at an anvil.

Every chain named in `gw44.json` must appear here, or the build fails naming the chain — and a chain you name in neither is simply absent from the deployable.

Two things the validator cannot decide for you: an endpoint with an API key in its URL is **published** in all three files if its chain is configured, and a credentialed `https://user:pass@…` endpoint cannot work at all, because `fetch` rejects it ([#94](https://github.com/dnznlabs/gw44/issues/94)).

### Check the two files before you spend a deploy run

The build is a command, so run it on your own machine first. It comes from a **checkout of `dnznlabs/gw44`**, not from your repository — your repository holds the two JSON files and the caller workflow, and nothing else:

```bash
git clone https://github.com/dnznlabs/gw44 && cd gw44
devbox run -- make build CONFIG=/path/to/your/gw44.json GW44_CHAINS=/path/to/your/chains.json
```

While `dnznlabs/gw44` is private the clone needs access of its own — a `gh auth login` on that machine, or the deploy key of § 5. `GW44_CHAINS` defaults to the checkout's own `./chains.json`, which is this project's endpoints and not yours, so pass your file.

It prints one line per file — a sha256, a size and a name — and those three lines are exactly what `expect` takes in § 5. A mistake in either file fails here, in seconds, with the message § 10 lists, rather than in a deploy run. `GW44_OUT=<dir>` puts the output somewhere other than `dist/`, and `PIN=<chain>:<address>` builds for one contract with no configuration file at all (§ 9).

**And point it at your contract before you deploy anything**, because a configuration naming a contract that is not there builds perfectly well and fails only once a visitor arrives:

```bash
devbox run -- make get URL="https://anything.invalid/<chain>/" CONFIG=/path/to/your/gw44.json
# 200 64305 B 298 ms
# content-type: text/html; charset=utf-8
# content-security-policy: frame-ancestors 'self'
```

The hostname is ignored under a configuration, so any URL will do; what you are reading is the status and the size. **The command exits 0 either way**, so read the status line rather than the exit code — and the two failures look different, which is useful:

| Reading | What it is |
|:--|:--|
| `404 0 B` with `application/octet-stream` | your contract answered 404 itself for that path. The status and the type are the contract's; the gateway passed them through |
| `404 47 B` with `text/plain` and a body of `gw44: the address does not serve this resource` | nothing answered at that address on that chain — no code, or a contract that does not implement the call. The sentence is the gateway's own |

The second is the one that means your configuration names the wrong address or the wrong chain.

Everything in §§ 7 and 9 that starts with `make` is run from that checkout too.

## 4 — DNS and Pages

1. **The DNS record.** A `CNAME` for your hostname pointing at `<owner>.github.io`. For an apex domain, Pages wants `A`/`AAAA` records instead; this guide has only ever been run on a subdomain.
2. **Pages.** *Settings → Pages → Source: **GitHub Actions***, then *Custom domain*: your hostname, then **Enforce HTTPS** once the certificate has been issued. The certificate takes a few minutes and the tick box stays disabled until it exists.

Do not commit a `CNAME` file. With Actions as the source the custom domain is the repository's setting, and a committed `CNAME` is a second place for it to be wrong.

**The readings that confirm it**, all three of which were run for `gw-test.dnzn.dev`:

```bash
node -e 'require("node:dns").promises.resolveCname("gw-test.dnzn.dev").then(console.log)'
# [ 'dnznlabs.github.io' ]

gh api repos/dnznlabs/gw44/pages --jq '.build_type, .cname, .https_enforced, .protected_domain_state'
# workflow
# gw-test.dnzn.dev
# true
# verified
```

`build_type` must be `workflow`; if it says `legacy`, the source is still "Deploy from a branch" and the workflow below will upload an artifact that nothing deploys.

**Whether you can tick Enforce HTTPS yet** is a reading of its own, on the same endpoint — `https_enforced` only tells you what you have already done:

```bash
gh api repos/<owner>/<repo>/pages --jq '.https_certificate.state'
# approved
```

Until it says `approved` the tick box stays disabled; the certificate is issued a few minutes after the custom domain is set.

## 5 — The workflow

**The block below goes in your repository**, as `.github/workflows/deploy-gateway.yml`. The workflow it calls is `workflow_call` only — there is nothing to dispatch in `dnznlabs/gw44` — so the deploy runs in your repository, from your branch, under your token.

```yaml
# .github/workflows/deploy-gateway.yml, in your repository
name: deploy-gateway

on:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write
  actions: read      # see below; the called workflow lists this run's artifacts

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    uses: dnznlabs/gw44/.github/workflows/deploy-pages.yml@3ee50fe2de7073f8dac66898e83f961bc88b8b8b
    with:
      gw44-ref: 3ee50fe2de7073f8dac66898e83f961bc88b8b8b
      config: gw44.json
      chains: chains.json
      embeds: widget.js
    secrets:
      gw44-read-key: ${{ secrets.GW44_READ_KEY }}
```

This repository's own caller is [`.github/workflows/pages-test.yml`](../.github/workflows/pages-test.yml); it adds a dispatch input to choose between two committed fixtures, which a project does not need.

| Input | Meaning |
|:--|:--|
| `gw44-ref` | The gw44 commit to build from, as a **full 40-character SHA**. A branch or a tag is refused, because a project that deploys from a moving branch has no way to say what it shipped. |
| `config` | Path **in your repository** to your `gw44.json`. |
| `chains` | Path in your repository to your chains file. |
| `embeds` | Space-separated resource paths to publish as static copies. See § 6. Omit it if no other site embeds anything of yours. |
| `expect` | Optional. The three hash lines the build must print, verbatim. Any difference fails the run **before** anything is deployed. |
| `verify-only` | Optional. Build and check, deploy nothing. The way to exercise the whole path without replacing a live site. |

**`actions: read` is not optional, and it is the one a caller forgets.** The called workflow lists this run's artifacts to wait for the one it just uploaded, and a called workflow's token is capped by its caller's grant — so a caller that grants only the other three gets a failure inside the wait, about an artifacts call, which does not read as a permissions problem. It is needed from commit `3ee50fe` of this repository onwards.

**Pin the commit twice.** `uses:` pins the workflow; `gw44-ref` pins the source it builds. They should be the same commit, and nothing inside the workflow can check that — `uses:` is resolved by GitHub before the job starts and is not readable from inside it.

**`expect`, once you have deployed once.** The build step prints the three lines in the run's log, and § 3's local build prints the same three; copy them verbatim and pass them back — the ones below are this repository's two-chain fixture at `a0f6f09`, so they are an example and not a value to copy; the next run then refuses to deploy anything whose bytes differ from what you reviewed:

```yaml
      expect: |
        809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40     9260  404.html
        58d03a039c58672d8e8a63d4c75caa6b70789c3c7ed5894a28d63399f941b7e0     7778  gw44-sw.js
        809705314a35aa4273d5fba461bec33555765c1aeb6d7e0c3f9f255406e50b40     9260  index.html
```

### While `dnznlabs/gw44` is private

Two settings are needed, **in this order**, and both need admin ([#86](https://github.com/dnznlabs/gw44/issues/86)):

1. **Organisation access, first.** *`dnznlabs/gw44` → Settings → Actions → General → Access*: "Accessible from repositories in the `dnznlabs` organization". Without it a workflow elsewhere cannot call this one at all, and the failure is about the workflow not being found rather than about permissions.
2. **A read-only deploy key**, because a caller's own token cannot check out a private repository it does not belong to.

```bash
ssh-keygen -t ed25519 -N "" -C gw44-read -f gw44-read
```

- the **public** half, `gw44-read.pub`, goes on *`dnznlabs/gw44` → Settings → **Deploy keys** → Add deploy key*, with **Allow write access** left unticked;
- the **private** half, `gw44-read`, goes in your repository's *Settings → Secrets and variables → Actions* as `GW44_READ_KEY`;
- delete both files afterwards, and keep the private half in a password manager if another repository will need the same pair.

**Prove the pair before you spend a run on it.** This is the mistake that cost three runs on 2026-11-21: the private half was in the secret and the public half had never been added to the repository, so the checkout failed with `git@github.com: Permission denied (publickey)` and `fatal: Could not read from remote repository` ([#92](https://github.com/dnznlabs/gw44/issues/92)).

```bash
ssh -i gw44-read -o IdentitiesOnly=yes -T git@github.com
# Hi dnznlabs/gw44! You've successfully authenticated, but GitHub does not provide shell access.
```

The hostname in that answer is the check: a deploy key authenticates as **one repository**, so if the line names another repository or says `Hi <your-username>!`, the key in your hand is not the one on `dnznlabs/gw44`.

Readings for the other two, which need admin on `dnznlabs/gw44`:

```bash
gh api repos/dnznlabs/gw44/keys --jq '.[]|[.title,.read_only]'   # the key, read_only true
gh secret list -R <your-repo>                                     # names GW44_READ_KEY
```

## 6 — Embeds

A service worker can only answer pages on its own origin, so a `<script src>` on somebody else's site cannot be served out of the chain. The `embeds` input writes the bytes the chain returned as **plain files** beside the deployable and prints the snippet that pins them.

Each resource is read twice during the deploy — once through the gateway's own core and once with `cast`, cut apart by hand — and no copy is written unless both reads agree byte for byte and the chain answered 200. One segment of letters, digits, `.`, `_` or `-`; a nested path is refused, and so is any of the three built file names.

Where the copies land, and the snippet:

- **several chains:** `/<chain>/<path>`, so `embeds: widget.js` writes `/1/widget.js` and `/8453/widget.js`;
- **one contract:** `/<path>`.

```html
<script src="https://gw-test.dnzn.dev/84532/widget.js"
        integrity="sha384-YdiQK1VLmzn9EdOpTRan9r2NsUR+DnOwTJ/saTfdBDEkLxiyC2QiRFpVgJ/FQVtE"
        crossorigin="anonymous"></script>
```

The host page then trusts the **bytes**, not your site: if the file differs from that hash by one byte the browser refuses to run it, which was measured on the deployed site in three engines. Both attributes are needed — without `crossorigin` the browser will not check `integrity` on a cross-origin script.

To check a published copy against a hash you were given, without a deploy log:

```bash
curl -fsS https://your-host/1/widget.js -o /tmp/embed.js \
  && openssl dgst -sha384 -binary /tmp/embed.js | openssl base64 -A
# the base64 after `sha384-` in the snippet
```

**Two bytes of that command are load-bearing.** Without `-f`, a wrong path hashes the host's 404 page — which on this host is the shell, so you get a confident `sha384-…` of the wrong bytes. And **a pipeline is not enough even with `-f`**: `curl` exits non-zero but `openssl` still runs, on nothing, and prints `OLBgp1GsljhM2TJ+sbHj…`, which is the sha384 of the empty string and looks like any other answer. Hence the file and the `&&`: on a wrong path you get `curl: (22) The requested URL returned error: 404` and **no hash at all**.

**So a contract whose script changes needs a redeploy and a new snippet.** The copies are taken at deploy time and do not follow the chain: publish the new bytes, take the new `integrity`, and update every host page that embeds it. Until they are updated those pages run nothing, which is loud rather than silent.

## 7 — Checking a deployment

Both targets are run from a **checkout of `dnznlabs/gw44`** (§ 3), against the site you deployed. Check it out at the **same commit you deployed** — the one in `gw44-ref` — so that what checks the site is what built it; `git clone` gives you the default branch, which may have moved since. The browser engines are a download of their own — into Playwright's shared cache, `~/.cache/ms-playwright`, so once per **machine** rather than per checkout, and about 1.3 GB for three:

```bash
devbox run -- make browsers ENGINES="chromium firefox webkit"
```

```bash
devbox run -- make check-site URL=https://your-host SITE_CONFIG=/path/to/your/gw44.json \
  EMBED="1/widget.js=sha384-…"            # the pair the deploy printed
```

`SITE_CONFIG` is **your** configuration file, the one the site was built from: the default chain and the chain list are what most of the cases assert, so a check run against the wrong file fails for the wrong reason. The quoted readings in this guide come from the test site, which is built from [`test/fixtures/gw44.two-chains.json`](../test/fixtures/gw44.two-chains.json): chains `11155111` and `84532`, both serving `0x00a9f390a6010d045e0d34856048ddd6910d25ba`, default `11155111`. Those are the values to pass if you want to reproduce this guide's readings against that site rather than your own.

Nine cases per engine, each in a fresh browser context, over real HTTPS. **`ENGINES` defaults to `chromium` alone**, so the bare command is one engine; pass `ENGINES="chromium firefox webkit"` for three, or one at a time if a machine is tight on memory. What the lines mean:

| Case | What it proves |
|:--|:--|
| the root ends on the default chain and shows the application | the redirect and the worker are both live, and the shell was replaced by your document |
| a cold deep link recovers from the host's own 404 page | the assumption the whole design rests on: Pages answers an unknown path with `404.html` at status **404**, that page is the shell, and the shell recovers |
| a chain without its trailing slash ends on the prefix | the `308` that keeps a document's relative URLs inside its own prefix |
| an unconfigured path is the gateway's 404 and not the application | a first segment you did not configure costs **no** chain call, and reads `gw44: no contract at this path` |
| a cold fragment link keeps its fragment | `/#/route` survives the first visit's script navigation, not only later ones |
| the favicon is answered 404 on a controlled page | see § 9 |
| with service workers blocked the root still shows the application | the no-worker fallback renders your root document at the top level |
| a second origin runs the embed with the printed integrity and is refused when it is changed | § 6, both halves |
| the embed on a controlled page is answered by the worker, not by the host | the worker's answer carries `cache-control: no-store` and no `etag`; the host's file carries `max-age=600` and one |

```bash
VERIFY_SITE=https://your-host \
  VERIFY_ADDRESS=0xyour-contract \
  VERIFY_CHAINS="1 8453" \
  devbox run -- make verify
```

That one reaches the chain, and **the three variables are not optional for a project**: left out, it checks *this repository's* fixture contract on Sepolia and Base Sepolia, which says nothing about your deploy. It announces whose contract it read on its first line —

```
verify: address 0x… on chains [1 8453]
```

— so read that line before you read the result. `VERIFY_CHAINS` is the chain set; the **endpoints** come from `./chains.json` in the checkout, or from `GW44_CHAINS=<file>`, which is where your own chains file goes. What it then proves is that what the site serves is byte for byte what the chain returns, decoded by `cast` and shell arithmetic rather than by anything under `src/`, and that a browser renders it.

**With one chain, read the lines rather than the exit code.** The run's last pass builds a configuration from `VERIFY_CHAINS` and asks for `/<chain>/`; with a single chain that configuration is a one-contract build, where the whole path is the contract's resource, so it asks your contract for a resource named after the chain and gets a 404. Every other pass is unaffected and the run still prints `ok` for each. The summary also blames the browser stage for it, which is wrong — both are [#110](https://github.com/dnznlabs/gw44/issues/110). Until that is fixed: with two or more chains the run is clean; with one, the `config` lines fail for a reason that is about this script and not about your deployment.

Neither target is part of `make check` or of CI: one needs a site somebody deployed and the other needs public endpoints, and a gate that depends on either is a decision rather than a detail.

## 8 — Updating

Deploy again and the three files are replaced. What a **returning** visitor sees depends on the service worker, not on the HTML:

- the worker's script is served `cache-control: max-age=600`, and the registration asks for it with `updateViaCache: "none"`, so the browser revalidates the script rather than reading it from the HTTP cache;
- a new worker calls `skipWaiting()` and claims its clients on activation, so there is no waiting worker for two versions to disagree over;
- nothing is cached by the gateway itself: every response it builds is `no-store`.

Pages' own `etag` is derived from modification time and size rather than from content, and a deploy resets the edge's `age`, so a deploy invalidates the CDN even when the bytes are unchanged.

**How soon a returning visitor sees it, measured.** A persistent browser profile that had the site installed, across a redeploy that changed the default chain, in Chromium on 2026-11-21:

| | |
|:--|:--|
| The host served the new bytes | from **56 seconds** after the deploy finished, and at every later reading |
| Plain navigations to `/` | **eleven over ten and a half minutes, every one on the old default.** The registration stayed `activated` with nothing installing or waiting |
| A clean window in the other direction, no intervention | **fourteen navigations across sixteen minutes**, every one on the old default — the last at 986 s, past any cache lifetime here |
| `registration.update()`, called once from the page | returned in **3.1 s** both times it was tried, and the new worker installed and claimed its clients at once |
| The navigation after that | the **new** default, about a second later, and every navigation after |

Both directions of the change were measured — to the other chain and back — and behaved identically. So the two halves of the mechanism behave very differently. The gateway's own side is immediate: `skipWaiting()` and `clients.claim()` move a returning visitor to the new build about a second after an update check happens. **What does not happen on its own is the check.** Navigating, even repeatedly, did not trigger one in the window measured.

**What to do about it, if propagation matters to you.** Have your document ask for it — `navigator.serviceWorker.getRegistration('/').then(r => r && r.update())` on load — and a returning visitor's next navigation is current. The gateway does not do this for you today ([#85](https://github.com/dnznlabs/gw44/issues/85) carries the measurement and the question of whether it should). Until then, treat "deployed" as "served to new visitors, and to returning ones when something asks".

## 9 — One contract on one chain

**Through the workflow, a one-entry configuration file.** `config` is required and there is no `PIN` input, so `PIN=` is a local build only — `devbox run -- make build PIN=<chain>:<address>` in a checkout of `dnznlabs/gw44`, with no configuration file at all.

The two paths produce **byte-identical** output, measured on local builds of both, so a project that grows a second chain changes its configuration file and nothing else.

With one contract there is no `/<chain>/` prefix: the whole path is the contract's resource. **Every** path on the origin is asked of your contract, including requests the application never made — the browser's own `/favicon.ico` is an ERC-5219 call, which Firefox and WebKit make and the headless Chromium shell does not, so a contract that does not answer that path pays one reverting `eth_call` per page load against your own endpoint ([#36](https://github.com/dnznlabs/gw44/issues/36)).

**So declare an icon in your document.** Either a real one your contract serves, or an empty one that stops the request:

```html
<link rel="icon" href="data:,">
```

A build configured with several chains does not have this shape: `/favicon.ico`'s first path segment is not a configured chain, so the gateway answers it itself with a 404 and no call.

## 10 — When it goes wrong

Failures this project has actually met, with the message each one gives.

| What you see | What it is |
|:--|:--|
| `git@github.com: Permission denied (publickey)`, then `fatal: Could not read from remote repository` | the deploy key. The private half is in the secret and the public half is not on `dnznlabs/gw44`, or they are not the same pair. Prove it with the `ssh -T` line in § 5 before spending another run. |
| the called workflow is not found | organisation access, § 5 setting 1, which has to be on before a caller can reference a private repository's workflow at all. |
| `gw44-ref must be a full 40-character commit SHA; got 'main'` | `gw44-ref` is a branch or a tag. Pin the commit. |
| `<name> is empty; both config and chains are required`, or `<name> names no file in this repository: …` | a path input is empty or points at nothing. Both are checked before the build. |
| `the build is not pinned; refusing to deploy an unpinned gateway` | neither `config` nor a pin reached the build, so it would have served every chain in the chains file at every URL. |
| `the build does not match expect; nothing is deployed` | the bytes differ from the `expect` you passed. Compare the printed lines with yours before assuming the build is wrong: a changed `gw44-ref` changes them legitimately. |
| `gw44-sw.js would be … over the 16384 B limit; nothing was written` | the worker is over its size cap, usually because the chains file compiled in is very large. Nothing was written. |
| `<dir>/ holds …; the deployable is only 404.html, gw44-sw.js, index.html; run 'make clean'` | something else is in the output directory. The build refuses it rather than deploying a mixture, and writes nothing. |
| `Found 0 artifact(s)`, right after `Artifact github-pages has been successfully uploaded!` | `actions/deploy-pages` finding no artifact that the REST API lists in the same job, **intermittently**: of seven runs through this workflow on 2026-11-21, four failed this way and three deployed. Measured on one failure: the workflow's own wait found the artifact on its **first** try and the action reported `Found 0` half a second later, about an artifact still listable a minute afterwards — so it is not a matter of waiting. The action does not use the REST endpoint; it calls the toolkit's internal `ListArtifacts` with the ids carried by the runtime token, which is a different view. The workflow now makes **three** attempts in one job, 20 s and 60 s apart, and names the one that deployed; both successful deploys since took the first attempt, so the later two are still unexercised. **Do not re-run the failed run**: a re-run uploads a second artifact to the same run and the lookup then fails the other way, `Multiple artifacts … Artifact count is 2`. Dispatch a new run. Upstream: [#451](https://github.com/actions/deploy-pages/issues/451). |
| `<chain> config root: tools/get.ts failed — MISMATCH (…)` from `make verify`, with a single chain, and `verify: the browser stage failed` under browser lines that all say `ok` | not your deployment: `verify.sh`'s config pass asks `/<chain>/` of a one-contract configuration, and the summary names the wrong stage ([#110](https://github.com/dnznlabs/gw44/issues/110)). The other passes are valid. |
| Pages shows the site but HTTPS cannot be enforced | the certificate has not been issued yet. It takes a few minutes after the custom domain is set, and the tick box stays disabled until then. `.https_certificate.state` reads `approved` when it is ready. |
| the deploy succeeds and the site serves someone else's content | the hostname was claimed before you verified the domain. § 2, and it is the reason the order in § 2 is not advice. |

## Related

- [`README.md`](../README.md) — what the gateway is, and the two URL forms.
- [`SECURITY.md`](../SECURITY.md) — the trust model, the review of record, and what the gateway does **not** defend.
- [`docs/ROADMAP.md`](ROADMAP.md) — the decisions this guide rests on, 9 and 11 in particular.
