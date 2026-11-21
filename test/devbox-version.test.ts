// `devbox.json`'s `$schema` and the workflow's `devbox-version` name the same devbox twice, and
// nothing kept them equal: #12 found them two minor versions apart, and the fix was a one-off edit
// that the next bump can undo again. This is the check that makes the next divergence a failure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const SCHEMA = /devbox\/([0-9]+\.[0-9]+\.[0-9]+)\/\.schema\/devbox\.schema\.json/;
const WORKFLOW = /devbox-version:\s*([0-9]+\.[0-9]+\.[0-9]+)/;

/** Read as text, not parsed: the workflow is YAML and parsing it would add a dependency. */
function version(path: string, pattern: RegExp, what: string): string {
  const found = pattern.exec(readFileSync(path, "utf8"));
  if (found?.[1] === undefined) throw new Error(`${path} has no ${what} matching ${String(pattern)}`);
  return found[1];
}

test("devbox.json's $schema and the workflow's devbox-version name the same version", () => {
  const schema = version("devbox.json", SCHEMA, "$schema");
  const workflow = version(".github/workflows/ci.yml", WORKFLOW, "devbox-version");

  assert.equal(
    schema,
    workflow,
    `devbox.json $schema is ${schema} and .github/workflows/ci.yml devbox-version is ${workflow}; ` +
      "the two must name one version, or CI runs a devbox the schema does not describe",
  );
});
