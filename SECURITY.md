# Security

> **Purpose:** What gw44 trusts, what it defends, and what it does not. Pre-MVP: nothing here has been reviewed by anyone but its authors.

## Reporting a vulnerability

Use GitHub private vulnerability reporting on this repository. Do not open a public issue. No bounty.

## Review status

**None.** The code is a spike prototype. A review of record is an acceptance criterion of M01 in [the roadmap](docs/ROADMAP.md).

## Trust model

A visitor trusts three things, and the gateway adds no fourth:

1. **The static host**, for two files. Whoever can change `gw44-sw.js` controls every origin under the gateway. It is 7 KB with no dependencies so that it can be read, and built reproducibly so that it can be checked.
2. **The RPC endpoint** named in `chains.json`. Its answer is taken as the chain's. A lying endpoint can serve any document at a contract's origin. Not defended today; quorum and proof verification are on the roadmap.
3. **The contract**, for its own origin and nothing else.

There is no gateway server and no server-side cache, so there is no operator who can serve a stale or altered document without changing one of those two files.

## What the gateway defends

- **One contract from another.** The public URL form gives each contract its own origin. The path form, which shares one, is refused off loopback (`test/target.test.ts`).
- **The RPC endpoint from the URL.** Endpoints are compiled in. Nothing in a URL can choose one, so a link cannot point a contract's origin at an attacker's node.
- **The decoder from the contract.** Every offset and length in return data is bounds-checked, and mutated inputs produce only typed errors — 20,000 per local run, **1,000,000 in CI** via `GW44_FUZZ_RUNS` (`test/abi.test.ts`).
- **Memory from a large response.** One JSON-RPC body is capped at `maxBytes`, 16 MiB by default, and the cap is enforced while reading: the stream is cancelled the moment it is exceeded, not drained first (`test/rpc-fetch.test.ts`).
- **A hung endpoint from stalling the gateway.** Each endpoint gets `timeoutMs`, 10 s by default, and it covers the body as well as the connect, so a response that stops after its headers still fails (`test/rpc-fetch.test.ts`). The bound is per endpoint: `n` endpoints can cost `n × timeoutMs`, which `createFetchRpc`'s doc comment states and a test pins.
- **A failing endpoint from being believed.** A non-2xx status fails that endpoint whatever its body contains, so a rate-limit page that happens to parse as JSON-RPC cannot be served as an answer; the next endpoint is tried. A revert is the contract's answer, not a failure, and stops the walk (`test/rpc-fetch.test.ts`).
- **The response from the contract's headers.** `request()` headers pass an allowlist; `Set-Cookie`, `Clear-Site-Data`, caching headers and values with control bytes are dropped (`test/resolve.test.ts`). Every response is `no-store` and `nosniff`.
- **Error pages from injection.** Error bodies are `text/plain` and built from fixed strings.

## What it does not defend

- **Cookies across contracts.** Origins isolate storage and scripts, not cookies: a document can set a cookie for the base domain that sibling origins receive. Closing this needs the base domain on the Public Suffix List, which is a roadmap item and a one-way door.
- **ERC-8244's rendering rules.** The ERC asks a client to render the document in a sandboxed frame with a default-deny policy and to mediate the wallet. A gateway serves the document as a top-level page, like any website; the wallet is the visitor's own. The origin per contract is the isolation, and it is weaker than the ERC's.
- **A contract's own document.** It is code its owner chose, running in its own origin. If the owner can change it, the gateway will serve the change.
- **Availability of the endpoints.** A public RPC endpoint can rate-limit or disappear. Failover is ordered and every endpoint is tried once per call; there is no health tracking, no retry, no backoff and no racing, so a list whose first entry is slow pays that cost on every request. When no endpoint answers, the visitor gets a 502 whose body is a fixed string and carries nothing the endpoint said (`test/resolve.test.ts`).
