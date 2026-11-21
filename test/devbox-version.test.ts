// `devbox.json`'s `$schema` and every workflow's `devbox-version` name the same devbox, and nothing
// kept them equal: #12 found the schema two minor versions behind, and the fix was a one-off edit
// that the next bump can undo again. #83 found the second half of the gap — this test read `ci.yml`
// alone, so a workflow added later could pin anything and fail nothing.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const SCHEMA = /devbox\/([0-9]+\.[0-9]+\.[0-9]+)\/\.schema\/devbox\.schema\.json/;
const WORKFLOW = /devbox-version:\s*([0-9]+\.[0-9]+\.[0-9]+)/;
const WORKFLOWS = ".github/workflows";

function schemaVersion(): string {
  const found = SCHEMA.exec(readFileSync("devbox.json", "utf8"));
  if (found?.[1] === undefined) throw new Error(`devbox.json has no $schema matching ${String(SCHEMA)}`);
  return found[1];
}

/** Every workflow that pins a devbox version, with the version it pins. Read as text: the files are
 *  YAML and parsing them would add a dependency the project does not have. */
function workflowVersions(): [file: string, version: string][] {
  const out: [string, string][] = [];
  for (const name of readdirSync(WORKFLOWS).sort()) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    const found = WORKFLOW.exec(readFileSync(`${WORKFLOWS}/${name}`, "utf8"));
    if (found?.[1] !== undefined) out.push([`${WORKFLOWS}/${name}`, found[1]]);
  }
  return out;
}

test("every workflow that pins a devbox version names devbox.json's $schema version", () => {
  const schema = schemaVersion();
  const pinned = workflowVersions();

  // A guard on the guard: if nothing is found, the check would pass by reading nothing (#29's shape).
  assert.ok(pinned.length > 0, `no workflow under ${WORKFLOWS} pins a devbox-version; this test read nothing`);

  const differing = pinned.filter(([, version]) => version !== schema);
  assert.deepEqual(
    differing,
    [],
    `devbox.json $schema is ${schema}; ${differing
      .map(([file, version]) => `${file} pins ${version}`)
      .join(", ")}. Each must name one version, or a workflow runs a devbox the schema does not describe`,
  );
});

test("the workflows that pin devbox are the ones expected, so a new one is noticed", () => {
  // Not a list to keep in step for its own sake: it is what makes the count above meaningful, and a
  // workflow added without a devbox pin is a workflow whose toolchain nobody checked.
  assert.deepEqual(
    workflowVersions().map(([file]) => file),
    [".github/workflows/ci.yml", ".github/workflows/deploy-pages.yml"],
  );
});
