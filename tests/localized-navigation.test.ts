import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = readFileSync("src/Pages.tsx", "utf8");

test("localizedPath preserves query parameters and adds or removes the selected language", () => {
  const helper = pages.slice(pages.indexOf("function localizedPath"), pages.indexOf("function SiteFrame"));
  assert.match(helper, /new URLSearchParams\(query\)/);
  assert.match(helper, /params\.set\("lang", "hi"\)/);
  assert.match(helper, /params\.delete\("lang"\)/);
});

test("public navigation keeps Hindi selected across home, portfolio, contact and services", () => {
  assert.match(pages, /href={localizedPath\("\/", language\)}/);
  assert.match(pages, /href={localizedPath\(href, language\)}/);
  assert.match(pages, /href={localizedPath\("\/portfolio", language\)}/);
  assert.match(pages, /href={localizedPath\("\/contact", language\)}/);
  assert.match(pages, /href={localizedPath\("\/services", language\)}/);
  assert.match(pages, /localizedPath\("\/contact\?service=" \+ encodeURIComponent\(title\), language\)/);
});
