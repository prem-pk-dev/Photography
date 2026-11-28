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

test("showreel plays one registered rights-verified MEDIA-ASSETS video with clear AI disclosure", () => {
  const showreel = pages.slice(pages.indexOf("function ShowreelContentPage"), pages.indexOf("function ContactContentPage"));
  const videoUrl = "https://media-assets-4sb.pages.dev/videos/photography/photography-cinematic-showcase.mp4";
  assert.ok(showreel.includes(videoUrl), "missing selected registered video");
  assert.equal((showreel.match(/\.mp4/g) || []).length, 1, "showreel should contain exactly one MP4");
  assert.match(showreel, /One cinematic video clip/);
  assert.match(showreel, /This is one registered AI-generated sample video from MEDIA-ASSETS/);
  assert.match(showreel, /This video loads from the MEDIA-ASSETS public CDN/);
  assert.doesNotMatch(showreel, /These are registered AI-generated sample videos|Videos load from the MEDIA-ASSETS public CDN/);
  assert.match(showreel, /controls preload="metadata" playsInline/);
  assert.match(showreel, /AI-generated Google Gemini demo/);
  assert.match(showreel, /AI-generated नमूना वीडियो/);
  assert.match(showreel, /वास्तविक क्लाइंट प्रोजेक्ट या शूट किया गया असाइनमेंट नहीं/);
  assert.doesNotMatch(showreel, /autoplay|photography-visual-story\.mp4|photography-gemini-motion-0[12]\.mp4/);
  assert.doesNotMatch(showreel, /videos\.pexels\.com/);
});
