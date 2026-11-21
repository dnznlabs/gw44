// The build's two gates (#73, #74). `tools/build.ts` is a program rather than a module, so these
// run it: the thing under test is what the process does to a directory and what it exits with.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");

type Run = { readonly code: number | null; readonly stderr: string };

/** One build, with `GW44_OUT` pointed at `out` and nothing of the caller's environment overridden. */
function build(out: string, overrides: Record<string, string> = {}): Run {
  // Removed rather than emptied: emptying them is the thing one of these tests is about.
  const base = { ...process.env };
  delete base["GW44_PIN"];
  delete base["GW44_CONFIG"];
  const result = spawnSync(process.execPath, ["tools/build.ts"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...base, GW44_OUT: out, ...overrides },
  });
  return { code: result.status, stderr: result.stderr };
}

function tempOut(): string {
  return mkdtempSync(join(tmpdir(), "gw44-build-"));
}

/** A directory that already holds an output, so a later failure's effect on it is visible. */
const SENTINEL = "<!doctype html><!-- the deployed page, which a failed build must not touch -->";
function withSentinel(): string {
  const out = tempOut();
  for (const name of ["index.html", "404.html", "gw44-sw.js"]) writeFileSync(join(out, name), SENTINEL);
  return out;
}

for (const name of ["GW44_PIN", "GW44_CONFIG"]) {
  test(`${name} set but empty is an error naming it`, () => {
    const out = tempOut();

    const run = build(out, { [name]: "" });

    assert.notEqual(run.code, 0, "an empty value was accepted");
    assert.match(run.stderr, new RegExp(`${name} is set but empty`));
  });
}

/* The complement, so the error above is about emptiness and not about the variable: unset is the
   ordinary unpinned build, which is what `make build` with no arguments has to keep doing. */
test("neither set is an unpinned build, not an error", () => {
  const out = tempOut();

  const run = build(out);

  assert.equal(run.code, 0, run.stderr);
});

test("a fourth file in the output directory fails the build before it writes", () => {
  const out = withSentinel();
  writeFileSync(join(out, "stray.html"), "x");

  const run = build(out);

  assert.notEqual(run.code, 0, "the stray file was accepted");
  assert.match(run.stderr, /stray\.html/);
  assert.equal(readFileSync(join(out, "index.html"), "utf8"), SENTINEL, "index.html was overwritten");
});

/* The size gate, reached by making the worker too big the way a deployer could: the chains file is
   compiled into it, so enough endpoints push it over the cap. Nothing else about the build changes. */
test("a worker over the size cap fails the build before it writes", () => {
  const out = withSentinel();
  const chains: Record<string, string[]> = {};
  for (let i = 0; i < 100; i++) {
    chains[String(70000 + i)] = [`https://endpoint-${i}.example.invalid/${"p".repeat(100)}`];
  }
  const chainsFile = join(tempOut(), "chains.json");
  writeFileSync(chainsFile, JSON.stringify(chains));

  const run = build(out, { GW44_CHAINS: chainsFile });

  assert.notEqual(run.code, 0, "an oversized worker was accepted");
  assert.match(run.stderr, /over the 16384 B limit/);
  assert.equal(readFileSync(join(out, "index.html"), "utf8"), SENTINEL, "index.html was overwritten");
});
