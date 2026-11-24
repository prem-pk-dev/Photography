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

test("wedding demo gallery uses registered public media and remains clearly labelled as demo", () => {
  const data = readFileSync("src/data.ts", "utf8");
  const weddingAssets = [
    "wedding-garden-portrait.webp",
    "wedding-chapel-ceremony.webp",
    "wedding-reception-laughter.webp",
    "wedding-rings-bouquet.webp",
    "wedding-sunset-kiss.webp"
  ];
  for (const asset of weddingAssets) {
    assert.ok(data.includes(`https://media-assets-4sb.pages.dev/images/photography/wedding/${asset}`), `missing registered wedding asset: ${asset}`);
  }
  assert.match(portfolio, /"डेमो" : "DEMO"/);
  assert.match(data, /sample demo image/);
});
