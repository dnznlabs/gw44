# gw44

<!-- Project-specific only. Org-wide rules belong in ../shared/ORG.md. -->

> `../shared` is an optional sibling checkout. Without it, only this file applies.

## Overview

A static web gateway for ERC-8244 `html()` and ERC-5219 `request()`. Two shipped files, no server, no runtime dependencies. Scope is in `docs/ROADMAP.md`; § Not on the roadmap is as binding as the milestones.

## Repo Structure

- `src/core/` — the gateway, with no I/O: URL to target (`target.ts`), ABI (`abi.ts`), target to response (`resolve.ts`). The one port is `Rpc` in `ports.ts`.
- `src/adapters/rpc/` — `Rpc` adapters: `fetch.ts` (JSON-RPC, ordered failover) and `memory.ts` (a map; the test backend).
- `src/adapters/sw/` — the browser adapter: `sw.ts` the service worker, `boot.ts` the script inlined into `shell.html`.
- `tools/` — `build.ts` (esbuild to `dist/`), `serve.ts` (a stand-in static host), `get.ts` (resolve a URL from the command line).
- `test/*.test.ts` unit, `test/e2e/*.e2e.ts` browser. `mk/*.mk` make targets, `procs/*.yml` the `make serve` processes.

## Commands

`make check` is what a PR must pass: `make test` (four strict typechecks, then unit tests) and `make e2e`. Run through `devbox run --`.

`make e2e` runs the browser suite once per engine in `ENGINES`, in order, stopping at the first failure; default `ENGINES=chromium`, names `chromium`, `firefox`, `webkit`, and any other name is a failure at load rather than a skip. `make browsers` installs them into Playwright's cache (Chromium as `chromium-headless-shell`). CI runs all three; `.github/workflows/ci.yml` is the gate on every push.

`make build PIN=<chain>:<address>` compiles one contract into the deployable: every URL on the origin serves it, the hostname is never read, and only that chain's endpoints are embedded. `make build CONFIG=<file>` does the same for one project's contract on each of several chains, each under `/<chain>/` with `/` redirecting to the default; `PIN` and `CONFIG` together is an error. Both empty is the ordinary build. `GW44_PIN` and `GW44_CONFIG` are the variables the tools read, and `tools/get.ts` honours both, printing a redirect rather than following it.

**`make verify` is not part of `make check`, and that is deliberate: CI is offline.** It reads live contracts over the public endpoints in `chains.json`, so making it a gate would make every push depend on somebody else's rate limit. It is the only target that touches a chain, it is absent from the workflow, and `make check` does not reach it. Run it by hand when the question is whether the gateway and the chain still agree.

## Conventions

- Strict TypeScript, erasable syntax only: Node runs `tools/` and `test/` directly, with no build step. Imports carry the `.ts` extension.
- No runtime dependencies. A dependency in the worker is code every visitor of every contract executes; adding one is a roadmap decision, not a PR detail.
- The core never throws to an adapter: `resolve()` returns a response for every failure. A new failure is a `GatewayErrorKind`, not an exception.
- Bytes from a contract or an RPC endpoint are hostile. Every ABI read is bounds-checked; error bodies are plain text and never built from a URL or from contract data.
- ABI test vectors come from `cast`, and the test-side encoder in `test/helpers.ts` is separate from `src/core/abi.ts` on purpose. Do not make the tests import the encoder they check.

## Gotchas

- `curl` against the gateway always returns the shell. That is correct. Use `make get URL=…`.
- **A multi-chain build answers `/favicon.ico` itself, with a 404 and no call.** A one-contract build still asks the contract for it, because there every path is the contract's resource — so Firefox and WebKit, which request a favicon where the headless Chromium shell does not, cost a reverting call per page load on a pinned build and nothing on a configured one (#36).
- **Any change under `src/adapters/rpc/` moves `gw44-sw.js` and both pages**, because `src/adapters/sw/sw.ts` and `boot.ts` each import `createFetchRpc` from it; a pin changes all three files too. Whether the deployable moved is read from the hashes `make build` prints, never inferred from which source directories were edited.
- Four tsconfigs, because a worker, a page and Node have different globals: `tsconfig.json` (core, tools, unit tests), `.sw.json`, `.dom.json`, `.e2e.json`.
- `/gw44-sw.js` is reserved on every origin. The worker script must sit at the root to hold scope `/`, since a static host cannot send `Service-Worker-Allowed`.
- The path form (`/<chain>/<contract>/`) is loopback-only by design. Do not relax `isLoopback` to make a public demo work.
- In the path form a document's absolute URLs (`/widget.js`) miss the contract. Host form does not have this; it is a limit of local path URLs, not a bug.
- The e2e suite's no-service-worker case takes about four seconds: Playwright's block leaves `register()` pending, so the test waits out `WORKER_MS` in `boot.ts`.
- **Only Chromium launches on a machine without Firefox's and WebKit's system libraries, and this VM is one.** `make e2e ENGINES=firefox` or `webkit` exits non-zero at launch with Playwright's "Host system is missing dependencies" and a list — Firefox wants 18 libraries, starting `libasound.so.2`; WebKit wants more. That is a failure by design, never a skip, so an engine that cannot run is never mistaken for one that passed. **Open question 1 of m01-t01 took its default: the libraries are not installed here**, so the two engines are exercised in CI only.
- **Playwright's pre-launch host check is wrong under devbox, so `make e2e` disables it.** The check shells out to `ldd`; inside `devbox run --` that is nix's glibc `ldd`, which cannot see system libraries however they were installed, so it reports every library missing even on a machine that has them all — measured on the CI runner, where `ldd` outside devbox reports 0 "not found" on the same Firefox binary. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` lives in the `e2e` recipe in `mk/10-gateway.mk`, not in CI, because it is a property of devbox and not of a runner. Consequence worth knowing: `sudo npx playwright-core install-deps firefox webkit` is only useful **with** that skip in place; on its own it would change nothing.
- A case an engine genuinely cannot run is skipped **by name with the reason in the `test()` call**, so the reason appears in the run output. One exists: the forced-reload case drives the Chrome DevTools Protocol, which Playwright exposes on Chromium alone.
