import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateSeoFiles, renderSeoHtml } from "../scripts/prerender-seo.mjs";

const template = `<!doctype html>
<html lang="en">
<head>
  <meta name="description" content="Old homepage description" />
  <meta property="og:title" content="Old title" />
  <title>Old title</title>
</head>
<body><div id="root"></div></body>
</html>`;

test("static route renderer writes distinct public metadata and private noindex entrypoints", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "golden-films-seo-"));
  try {
    await writeFile(path.join(directory, "index.html"), template, "utf8");
    await generateSeoFiles(directory);

    const home = await readFile(path.join(directory, "index.html"), "utf8");
    const portfolio = await readFile(path.join(directory, "portfolio", "index.html"), "utf8");
    const contact = await readFile(path.join(directory, "contact", "index.html"), "utf8");
    const admin = await readFile(path.join(directory, "admin", "index.html"), "utf8");
    const booking = await readFile(path.join(directory, "book", "index.html"), "utf8");

    assert.match(home, /<title>Golden Films — Photography, Films &amp; Editing<\\/title>/);
    assert.match(portfolio, /<title>Portfolio — Golden Films<\\/title>/);
    assert.match(portfolio, /canonical" href="https:\\/\\/golden-films\\.pages\\.dev\\/portfolio"/);
    assert.match(contact, /Contact Golden Films/);
    assert.match(admin, /name="robots" content="noindex,nofollow"/);
    assert.match(booking, /name="robots" content="noindex,nofollow"/);
    assert.match(portfolio, /name="robots" content="index,follow"/);
    assert.match(portfolio, /property="og:url" content="https:\\/\\/golden-films\\.pages\\.dev\\/portfolio"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("static route renderer emits Hindi language and metadata when requested", () => {
  const html = renderSeoHtml(template, "/portfolio", "hi");
  assert.match(html, /<html lang="hi">/);
  assert.match(html, /<title>पोर्टफोलियो — Golden Films<\\/title>/);
  assert.match(html, /property="og:locale" content="hi_IN"/);
});
