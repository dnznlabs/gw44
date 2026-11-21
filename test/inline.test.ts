// The one place a bundle is inlined into the shell (#58, and the 2026-11-21 review's F6).
//
// The output is checked with a ten-line state check rather than a parser: the repository has no HTML
// parser and will not take one for this, and what matters is a property a short scan can decide —
// that nothing between `<script>` and `</script>` can end the element or comment it out.
import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineBoot, isScriptSafe } from "../tools/inline.ts";

const SHELL = '<!doctype html><html><body><script>/*@boot@*/</script></body></html>';

/** The script element's contents, by scanning rather than parsing: the first `<script>` to the
 *  first `</script` after it, which is exactly where the HTML parser would end the element. */
function scriptBody(html: string): string {
  const open = html.indexOf("<script>");
  assert.notEqual(open, -1, "no script element");
  const from = open + "<script>".length;
  const end = html.slice(from).search(/<\/script/i);
  assert.notEqual(end, -1, "the script element is never closed");
  return html.slice(from, from + end);
}

test("a bundle with no dangerous sequence is inlined unchanged", () => {
  const boot = 'console.log("hello");';

  const out = inlineBoot(SHELL, boot);

  assert.equal(scriptBody(out), boot);
});

/* Each case on its own, and in the case the bundler might emit it: a guard that only handled the
   lower-case form passed a test written with the lower-case form. */
test("every case of </script is escaped, so the element ends where the shell says", () => {
  for (const needle of ["</script", "</SCRIPT", "</Script ", "</sCrIpT>"]) {
    const boot = `const s = "${needle}";`;
    const out = inlineBoot(SHELL, boot);

    // The body the parser would take must still be the whole bundle, with the sequence defanged.
    const body = scriptBody(out);
    assert.ok(isScriptSafe(body), `${needle}: the inlined body can still end the element`);
    /* The only change is inserted backslashes: strip them and the program is byte for byte what it
       was. That is the whole property — the sequence is defanged and nothing else, including its
       case, is touched. A fixed replacement string lower-cased the bundle's own text and failed
       exactly here. */
    assert.equal(body.replaceAll("\\", ""), boot, `${needle}: the bundle's text changed`);
  }
});

test("<!-- is escaped, so the rest of the bundle is not commented out", () => {
  const boot = 'const s = "<!--"; console.log(s);';

  const body = scriptBody(inlineBoot(SHELL, boot));

  assert.ok(!body.includes("<!--"), "the comment opener survived");
  assert.ok(body.includes("<\\!--"));
  assert.ok(body.includes("console.log(s)"), "the code after it is still there");
});

test("the escapes leave the bundle running in the contexts a bundle contains", () => {
  // What the browser evaluates is the escaped text, so it has to still be the same program. A
  // backslash before `/` or `!` is not an escape sequence in a string, a template, a comment or an
  // un-flagged regular expression; in a `u`-flagged one `\!` is a SyntaxError, which is A13 of the
  // 2026-11-21b review and is stated at `tools/inline.ts` rather than fixed.
  const boot = 'globalThis.out = ["</SCRIPT", "<!--"].join("|");';

  const body = scriptBody(inlineBoot(SHELL, boot));
  const value = new Function(`${body}; return globalThis.out;`)() as string;

  assert.equal(value, "</SCRIPT|<!--");
});

test("isScriptSafe decides what the escaping has to achieve", () => {
  assert.equal(isScriptSafe('const s = "ok";'), true);
  for (const bad of ["</script>", "</SCRIPT>", "a <!-- b"]) assert.equal(isScriptSafe(bad), false, bad);
});
