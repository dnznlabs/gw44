// One browser load for `tools/verify.sh`'s last stage: the fixture's root served by `tools/serve.ts`,
// opened in headless Chromium, passing only when the contract's document has replaced the shell.
//   node tools/verify-browser.ts <url> [timeoutMs]
//
// The launch shape is `test/e2e/gateway.e2e.ts`'s — Playwright resolves its own cached browser, so
// there is no executable path here either (m01-t01). Deliberately Playwright's API only, with no
// `page.evaluate`: this file is typechecked by `tsconfig.json`, which has no DOM lib, and `title()`
// needs none. The shell's own title is the thing being waited out.
import { chromium } from "playwright-core";

const SHELL_TITLE = "gw44";

/* The URL is passed in rather than built from a chain and an address: a pinned build serves its
   contract at the root and has no URL that names either. */
const [url, timeoutRaw] = process.argv.slice(2);
if (url === undefined) {
  console.error("usage: node tools/verify-browser.ts <url> [timeoutMs]");
  process.exit(2);
}
const budgetMs = Number(timeoutRaw ?? 20_000);
if (!Number.isInteger(budgetMs) || budgetMs <= 0) {
  console.error(`verify-browser: timeoutMs must be a positive integer; got ${JSON.stringify(timeoutRaw)}`);
  process.exit(2);
}

const browser = await chromium.launch();
const errors: string[] = [];
let ok = false;
let lastTitle = "";
let why = "";

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "load", timeout: budgetMs });

  /* The shell's own `<pre id="gw44">` going away is the unambiguous signal, and it is the one
     `test/e2e/gateway.e2e.ts:206` uses. The title alone is not: Chromium shows the URL as the tab
     title while a page is still loading, so a title that merely differs from the shell's can be the
     placeholder rather than the contract's document. Both are checked, in that order. */
  try {
    await page.waitForSelector("#gw44", { state: "detached", timeout: budgetMs });
  } catch {
    lastTitle = await page.title();
    why = `the shell's #gw44 was still in the page after ${budgetMs} ms`;
  }
  if (why === "") {
    lastTitle = await page.title();
    if (lastTitle === "" || lastTitle === SHELL_TITLE) {
      why = `the shell was replaced but the title is ${JSON.stringify(lastTitle)}`;
    } else {
      ok = true;
    }
  }
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error(`verify-browser: ${url} page error: ${errors.join("; ")}`);
  process.exit(1);
}
if (!ok) {
  console.error(`verify-browser: ${url} ${why}`);
  process.exit(1);
}
console.error(`verify-browser: ${url} shell replaced, title ${JSON.stringify(lastTitle)}`);
