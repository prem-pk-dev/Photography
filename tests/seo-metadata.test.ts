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

test("booking route describes its unavailable state without looking like a 404", () => {
  const english = getSeoMetadata("/book", "en");
  assert.equal(english.title, "Booking temporarily unavailable — Golden Films");
  assert.match(english.description, /Online booking is temporarily unavailable/);
  assert.equal(english.canonical, "https://golden-films.pages.dev/book");
  assert.equal(english.robots, "noindex,nofollow");

  const hindi = getSeoMetadata("/book/", "hi");
  assert.equal(hindi.language, "hi");
  assert.equal(hindi.title, "ऑनलाइन बुकिंग फिलहाल उपलब्ध नहीं — Golden Films");
  assert.match(hindi.description, /ऑनलाइन बुकिंग अस्थायी रूप से उपलब्ध नहीं है/);
  assert.equal(hindi.robots, "noindex,nofollow");
});

test("private and unknown routes are excluded from indexing", () => {
  for (const route of ["/book", "/admin", "/login", "/register", "/missing-route"]) {
    assert.equal(getSeoMetadata(route).robots, "noindex,nofollow", route);
  }
});

test("booking unavailable page copy is localized in English and Hindi", async () => {
  const { getBookingUnavailableCopy } = await import("../src/seo.ts");
  const english = getBookingUnavailableCopy("en");
  assert.equal(english.title, "Booking temporarily unavailable");
  assert.match(english.description, /Online booking is temporarily unavailable/);
  const hindi = getBookingUnavailableCopy("hi");
  assert.equal(hindi.title, "ऑनलाइन बुकिंग फिलहाल उपलब्ध नहीं");
  assert.match(hindi.description, /बुकिंग सेवा तैयार होने तक ऑनलाइन बुकिंग/);
  assert.match(hindi.description, /कोई खाता या बुकिंग अनुरोध सबमिट नहीं किया गया है/);
});
