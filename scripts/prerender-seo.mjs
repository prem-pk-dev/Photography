import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSeoMetadata } from "../src/seo.ts";

export const STATIC_SEO_ROUTES = [
  "/", "/portfolio", "/services", "/about", "/showreel", "/contact",
  "/book", "/admin", "/login", "/register"
];

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function upsertMeta(html, attribute, key, value) {
  const matcher = new RegExp("<meta\\s+" + attribute + "=[\"']" + key + "[\\"'][^>]*>", "i");
  const tag = '<meta ' + attribute + '="' + key + '" content="' + escapeAttribute(value) + '" />';
  if (matcher.test(html)) return html.replace(matcher, tag);
  return html.replace("</head>", "    " + tag + "\n  </head>");
}

export function renderSeoHtml(template, pathname, language = "en") {
  const metadata = getSeoMetadata(pathname, language);
  let html = template.replace(/<html\b([^>]*)>/i, (_tag, attributes) => {
    const withoutLanguage = attributes.replace(/\s+lang=("[^"]*"|'[^']*')/i, "");
    return '<html' + withoutLanguage + ' lang="' + escapeAttribute(metadata.language) + '">';
  });
  html = html.replace(/<title>[^<]*<\/title>/i, "<title>" + escapeAttribute(metadata.title) + "</title>");
  html = upsertMeta(html, "name", "description", metadata.description);
  html = upsertMeta(html, "name", "robots", metadata.robots);
  html = upsertMeta(html, "property", "og:title", metadata.title);
  html = upsertMeta(html, "property", "og:description", metadata.description);
  html = upsertMeta(html, "property", "og:type", "website");
  html = upsertMeta(html, "property", "og:url", metadata.canonical);
  html = upsertMeta(html, "property", "og:locale", metadata.language === "hi" ? "hi_IN" : "en_IN");
  html = upsertMeta(html, "name", "twitter:card", "summary_large_image");

  const canonical = '<link rel="canonical" href="' + escapeAttribute(metadata.canonical) + '" />';
  const canonicalMatcher = /<link\s+rel=["']canonical["'][^>]*>/i;
  html = canonicalMatcher.test(html)
    ? html.replace(canonicalMatcher, canonical)
    : html.replace("</head>", "    " + canonical + "\n  </head>");
  return html;
}

export async function generateSeoFiles(outputDirectory) {
  const root = path.resolve(outputDirectory);
  const template = await readFile(path.join(root, "index.html"), "utf8");
  await writeFile(path.join(root, "index.html"), renderSeoHtml(template, "/"), "utf8");

  for (const route of STATIC_SEO_ROUTES.filter((item) => item !== "/")) {
    const destination = path.join(root, route.slice(1), "index.html");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, renderSeoHtml(template, route), "utf8");
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const outputDirectory = path.resolve(process.cwd(), "dist");
  await generateSeoFiles(outputDirectory);
  console.log("Generated static SEO entrypoints for " + STATIC_SEO_ROUTES.length + " routes.");
}
