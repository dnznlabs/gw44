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

## Conventions

- Strict TypeScript, erasable syntax only: Node runs `tools/` and `test/` directly, with no build step. Imports carry the `.ts` extension.
- No runtime dependencies. A dependency in the worker is code every visitor of every contract executes; adding one is a roadmap decision, not a PR detail.
- The core never throws to an adapter: `resolve()` returns a response for every failure. A new failure is a `GatewayErrorKind`, not an exception.
- Bytes from a contract or an RPC endpoint are hostile. Every ABI read is bounds-checked; error bodies are plain text and never built from a URL or from contract data.
- ABI test vectors come from `cast`, and the test-side encoder in `test/helpers.ts` is separate from `src/core/abi.ts` on purpose. Do not make the tests import the encoder they check.

## Gotchas

- `curl` against the gateway always returns the shell. That is correct. Use `make get URL=…`.
- Four tsconfigs, because a worker, a page and Node have different globals: `tsconfig.json` (core, tools, unit tests), `.sw.json`, `.dom.json`, `.e2e.json`.
- `/gw44-sw.js` is reserved on every origin. The worker script must sit at the root to hold scope `/`, since a static host cannot send `Service-Worker-Allowed`.
- The path form (`/<chain>/<contract>/`) is loopback-only by design. Do not relax `isLoopback` to make a public demo work.
- In the path form a document's absolute URLs (`/widget.js`) miss the contract. Host form does not have this; it is a limit of local path URLs, not a bug.
- The e2e suite's no-service-worker case takes about four seconds: Playwright's block leaves `register()` pending, so the test waits out `WORKER_MS` in `boot.ts`.
