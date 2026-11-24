import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = readFileSync("src/Pages.tsx", "utf8");
const siteFrame = pages.slice(pages.indexOf("function SiteFrame"), pages.indexOf("function AdminLoginPage"));

test("secondary pages expose an accessible mobile navigation toggle", () => {
  assert.match(siteFrame, /className="mobile-menu-toggle"/);
  assert.match(siteFrame, /aria-expanded={menuOpen}/);
  assert.match(siteFrame, /aria-controls="site-navigation"/);
  assert.ok(siteFrame.includes('menuOpen ? "is-open" : ""'));
});

test("secondary page navigation closes after a route is selected", () => {
  assert.ok(siteFrame.includes("onClick={() => setMenuOpen(false)}"));
});


test("Hindi mobile navigation localizes the booking route label", () => {
  assert.match(siteFrame, /"Book a slot": "स्लॉट बुक करें"/);
});
