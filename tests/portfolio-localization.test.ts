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
  assert.match(portfolio, /"वेडिंग प्रेरणा — नमूना गैलरी" : "Wedding inspiration — sample gallery"/);
  assert.match(portfolio, /projects\.filter\(p => p\.category\.en === "Wedding Photography"/);
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


test("owner contact details are actionable and consistent across contact channels", () => {
  const contact = pages.slice(pages.indexOf("function ContactContentPage"), pages.indexOf("export default function Pages"));
  assert.match(contact, /href="tel:\+918949800427"/);
  assert.match(contact, /href="https:\/\/wa\.me\/918949800427"/);
  assert.match(contact, /href="mailto:prem92006@gmail\.com"/);
  assert.match(contact, /https:\/\/wa\.me\/918949800427\?text=/);
  assert.doesNotMatch(contact, /details are temporary|ये विवरण अस्थायी हैं/);
});

test("about fallback is a factual bilingual Golden Films studio biography", () => {
  const about = pages.slice(pages.indexOf("function AboutContentPage"), pages.indexOf("function ServicesContentPage"));
  assert.match(about, /Golden Films is a visual storytelling studio/);
  assert.match(about, /Golden Films एक विज़ुअल स्टोरीटेलिंग स्टूडियो है/);
  assert.match(about, /not verified client work/);
});

test("showreel uses the four rights-verified MEDIA-ASSETS photography videos", () => {
  const showreel = pages.slice(pages.indexOf("function ShowreelContentPage"), pages.indexOf("function ContactContentPage"));
  const videos = [
    "photography-cinematic-showcase.mp4",
    "photography-visual-story.mp4",
    "photography-gemini-motion-01.mp4",
    "photography-gemini-motion-02.mp4"
  ];
  for (const video of videos) {
    assert.ok(showreel.includes("https://media-assets-4sb.pages.dev/videos/photography/" + video), "missing registered video: " + video);
  }
  assert.match(showreel, /Four cinematic video clips/);
  assert.match(showreel, /AI-generated samples, not evidence of client shoots/);
  assert.match(showreel, /ये AI-generated नमूना क्लिप केवल प्रेरणा के लिए हैं/);
  assert.match(showreel, /An approved client showreel will be featured separately when available/);
  assert.doesNotMatch(showreel, /शो-रील खाली रहेगी|showreel slot remains empty/);
  assert.doesNotMatch(showreel, /videos\.pexels\.com/);
});
