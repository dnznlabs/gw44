/**
 * Puts the boot bundle inside the shell's `<script>` element.
 *
 * Its own module so it can be unit-tested: `tools/build.ts` reads files and writes a deployable at
 * module load, so a test cannot import it without running a build.
 *
 * Two sequences end a script element, and the escape used to handle one of them case-sensitively
 * (#58, and the 2026-11-21 review's F6):
 *
 * - `</script`, in any case. HTML tag matching is case-insensitive, so `</SCRIPT` closed the element
 *   just as well and the rest of the bundle became document text.
 * - `<!--`, which opens a comment inside a script element and makes the parser treat the remainder
 *   up to `-->` as commented-out, so a bundle containing it would silently stop executing part-way.
 *
 * Both are escaped with a backslash, which JavaScript ignores before `/` and `!` but which stops the
 * HTML parser recognising the sequence.
 *
 * The replacement keeps the matched text (`$1`) rather than writing a fixed string. A fixed one
 * would lower-case the bundle's own characters — `</SCRIPT` became `<\/script` — which rewrites a
 * string literal inside the program being inlined. Caught by this module's own test.
 */
/*
 * What the escaping does and does not claim (A13, the 2026-11-21b review). A backslash before `/`
 * and before `!` is not an escape sequence in a string literal, a template literal, a comment or a
 * regular expression without the `u` or `v` flag, so in every context the bundle contains today the
 * program is byte for byte the one that was compiled. It is **not** meaning-preserving everywhere:
 * inside a `u`- or `v`-flagged regular expression `\!` is an invalid identity escape and a
 * `SyntaxError`, and inside `String.raw` the backslash is part of the value. Neither context holds
 * one of these sequences in any bundle this repository produces, and `isScriptSafe` is the check
 * that would be needed to decide the question for an arbitrary one.
 */
export function inlineBoot(shell: string, boot: string): string {
  const safe = boot.replace(/<(\/script)/gi, "<\\$1").replaceAll("<!--", "<\\!--");
  // A function replacement: a string one would expand `$&` and friends found in the minified script.
  return shell.replace("/*@boot@*/", () => safe);
}

/** True when nothing in this text can end or comment out the script element it is placed in. */
export function isScriptSafe(text: string): boolean {
  return !/<\/script/i.test(text) && !text.includes("<!--");
}
