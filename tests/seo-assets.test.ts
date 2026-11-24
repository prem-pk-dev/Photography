import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const robots = readFileSync("public/robots.txt", "utf8");
const sitemap = readFileSync("public/sitemap.xml", "utf8");

test("robots.txt points crawlers to the production sitemap", () => {
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /Sitemap: https:\/\/golden-films\.pages\.dev\/sitemap\.xml/);
});

test("robots.txt excludes private admin entry points and APIs", () => {
  for (const path of ["/admin", "/admin.html", "/login", "/login.html", "/register", "/register.html", "/api/admin/"]) {
    assert.ok(robots.includes(`Disallow: ${path}`), `missing disallow rule for ${path}`);
  }
});

test("sitemap lists only the six public, implemented website routes", () => {
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls, [
    "https://golden-films.pages.dev/",
    "https://golden-films.pages.dev/portfolio",
    "https://golden-films.pages.dev/services",
    "https://golden-films.pages.dev/about",
    "https://golden-films.pages.dev/showreel",
    "https://golden-films.pages.dev/contact",
  ]);
  assert.ok(!sitemap.includes("/admin"));
  assert.ok(!sitemap.includes("/login"));
  assert.ok(!sitemap.includes("/register"));
});
