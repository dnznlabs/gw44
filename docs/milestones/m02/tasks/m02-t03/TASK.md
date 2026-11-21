# m02-t03 — The deploy guide

Milestone: [M02](../../MILESTONE.md) · Phase: 2 — A workflow anyone can call

`docs/DEPLOY.md` takes the owner of a project from nothing to a gateway on their own domain, and someone who did not write it has followed it. The test site has been opened on a phone.

## Plan

Runs after m02-t04 is merged, so the guide describes the configuration file and the behaviour that ship. Everything in it is taken from a handoff that measured it (m02-t01, m02-t02, m02-t04); a step nobody has run is not written as an instruction.

1. **`docs/DEPLOY.md`**, in the handbook's runbook shape (`templates/RUNBOOK.md`): each step a command or a setting, then the reading that shows it worked. Sections, in order:
   - *What you are deploying, and what you are trusting.* Three static files on your domain; your visitors' browsers read your contract through the RPC endpoints you name. One paragraph on endpoints: a lying endpoint decides what your domain shows, so name ones you would answer for, and more than one. Chains of one project share an origin; testnets do not belong on it (roadmap decisions 9 and 11).
   - *Before you start.* A repository for the site (GitHub Pages takes one custom domain per repository); the domain verified for the organisation or account **before** the DNS record exists, and why (a record pointing at Pages with no site behind it can be claimed by another account); admin on that repository.
   - *The configuration.* `gw44.json` with every key, including `frame` and what `"any"` gives up; the chains file and its rules.
   - *DNS and Pages.* The `CNAME` record; Pages with GitHub Actions as the source, the custom domain, HTTPS enforced; the three API readings that confirm it.
   - *The workflow.* The caller's file in full, as `pages-test.yml` is after m02-t02, with each input explained; pinning `gw44-ref` to a full commit and passing `expect`; the deploy key and the Actions access setting while this repository is private, with the organisation setting that has to be on first.
   - *Embeds.* The `embeds` input, where the copies land, the printed `integrity` snippet, and that the copy is refused by the browser when it differs from the chain's bytes at deploy time. A contract whose script changes needs a redeploy and a new snippet: say so plainly.
   - *Checking a deployment.* `make check-site` and `VERIFY_SITE=… make verify`, and what each line means.
   - *Updating.* How soon a returning visitor sees a redeploy, with m02-t02's measured figure.
   - *One contract on one chain.* `PIN=` or a one-entry file; the contract is asked for every path, the browser's `/favicon.ico` included, so declare an icon in the document (`<link rel="icon" href="data:,">` or a real one). `Closes #36`.
   - *When it goes wrong.* The failures already met, each with its message: Pages not enabled, the certificate pending, deploy keys disabled for the organisation, a `gw44-ref` that is not a full SHA, hashes that differ.
2. **A second reader follows it.** A fresh agent session with no context but the repository at the PR's head and `docs/DEPLOY.md` follows the guide as far as a `verify-only` call for the two-chain fixture (it cannot create DNS or a second Pages site), using a local script that runs the workflow's steps if a `verify-only` run would cost one. Its transcript's list of every place it had to guess goes in `HANDOFF.md`, and each is fixed in the guide or answered there. The engineer does not coach it.
3. **Phones** (milestone criterion 7): the Product Owner opens `https://gw-test.dnzn.dev` in mobile Safari and in the in-app browser of one mobile wallet, by the action issue filed when this task is dispatched. The handoff records the date, devices and versions he reports.
4. **`README.md`** links the guide from § Documentation and from the pinned-build section.

## Acceptance criteria

- Milestone criterion 6: `docs/DEPLOY.md` exists with the sections above, and step 2's list of guesses is empty after the fixes, or each remaining one is named with the reason it cannot be removed.
- Every command and setting in the guide appears in a handoff or an issue that ran it; `HANDOFF.md` maps each section to its source.
- Milestone criterion 7: the phone readings are recorded.
- #36 is closed by the sentence in the guide.
- Markdown only: no file outside `docs/`, `README.md` and `AGENTS.md` changes.

## Out of scope

- Any host but GitHub Pages; the public gateway; names; the loader.
- rake's deployment. The guide is what rake's m05-t04 follows, and what it finds wrong comes back as issues here.
- New code, including the local script of step 2 if one already exists from m02-t02.

## Open questions

None.

## Context

- [M02](../../MILESTONE.md) criteria 6 and 7.
- The handoffs of m02-t01, m02-t02 and m02-t04; issues #51 and #86 for the settings and the order they had to be done in.
- #36.
