import assert from "node:assert/strict";
import test from "node:test";
import { getSeoMetadata } from "../src/seo.ts";

test("public routes have distinct canonical SEO metadata", () => {
  for (const route of ["/", "/portfolio", "/services", "/about", "/showreel", "/contact"]) {
    const metadata = getSeoMetadata(route, "en");
    assert.ok(metadata.title.includes("Golden Films"), route);
    assert.ok(metadata.description.length > 40, route);
    assert.equal(metadata.canonical, "https://golden-films.pages.dev" + route);
    assert.equal(metadata.robots, "index,follow");
  }
});

test("Hindi metadata carries the Hindi document language", () => {
  const metadata = getSeoMetadata("/portfolio", "hi");
  assert.equal(metadata.language, "hi");
  assert.match(metadata.title, /पोर्टफोलियो/);
  assert.match(metadata.description, /फोटोग्राफी/);
});

test("private and unknown routes are excluded from indexing", () => {
  for (const route of ["/book", "/admin", "/login", "/register", "/missing-route"]) {
    assert.equal(getSeoMetadata(route).robots, "noindex,nofollow", route);
  }
});
