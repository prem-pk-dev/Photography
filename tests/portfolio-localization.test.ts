import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = readFileSync("src/Pages.tsx", "utf8");
const portfolio = pages.slice(pages.indexOf("function PortfolioPageContent"), pages.indexOf("export default function Pages"));

test("portfolio page localizes headings, category names and demo labels", () => {
  assert.match(portfolio, /title={language === "hi" \? "पोर्टफोलियो" : "Portfolio"}/);
  assert.match(portfolio, /item\.title\[language\]/);
  assert.match(portfolio, /item\.imageAlt\[language\]/);
  assert.match(portfolio, /groupLabels\[item\.group\]/);
  assert.match(portfolio, /"डेमो" : "DEMO"/);
});

test("published portfolio content uses Hindi fields and localized media actions", () => {
  assert.match(portfolio, /project\.title_hi/);
  assert.match(portfolio, /project\.description_hi/);
  assert.match(portfolio, /item\.alt_hi/);
  assert.match(portfolio, /"वीडियो देखें" : "Watch video"/);
  assert.match(portfolio, /"सभी प्रोजेक्ट" : "All projects"/);
});
