export type SiteLanguage = "en" | "hi";

export interface SeoMetadata {
  title: string;
  description: string;
  canonical: string;
  language: SiteLanguage;
  robots: "index,follow" | "noindex,nofollow";
}

const ORIGIN = "https://golden-films.pages.dev";

const pageCopy: Record<string, { en: [string, string]; hi: [string, string] }> = {
  "/": {
    en: ["Golden Films — Photography, Films & Editing", "Golden Films photography, videography and editing portfolio. Explore sample wedding, portrait, event and brand visuals. Demo content is clearly labelled."],
    hi: ["Golden Films — फोटोग्राफी, फिल्में और एडिटिंग", "Golden Films का फोटोग्राफी, वीडियोग्राफी और एडिटिंग पोर्टफोलियो देखें। शादी, पोर्ट्रेट, इवेंट और ब्रांड विजुअल्स के नमूने। डेमो सामग्री स्पष्ट रूप से चिह्नित है।"]
  },
  "/portfolio": {
    en: ["Portfolio — Golden Films", "Explore Golden Films portfolio categories and selected photography and videography projects. Sample visuals are labelled as demo content."],
    hi: ["पोर्टफोलियो — Golden Films", "Golden Films की फोटोग्राफी और वीडियोग्राफी कैटेगरी तथा चुने हुए प्रोजेक्ट देखें। नमूना तस्वीरों को डेमो सामग्री के रूप में चिह्नित किया गया है।"]
  },
  "/services": {
    en: ["Photography & Film Services — Golden Films", "Explore photography, videography, photo retouching and video editing services from Golden Films."],
    hi: ["फोटोग्राफी और फिल्म सेवाएँ — Golden Films", "Golden Films की फोटोग्राफी, वीडियोग्राफी, फोटो रीटचिंग और वीडियो एडिटिंग सेवाओं के बारे में जानें।"]
  },
  "/about": {
    en: ["About Golden Films", "Learn about Golden Films, a creative portfolio for photography, filmmaking, photo editing and video editing. Owner biography is pending approval."],
    hi: ["Golden Films के बारे में", "Golden Films के फोटोग्राफी, फिल्ममेकिंग, फोटो एडिटिंग और वीडियो एडिटिंग पोर्टफोलियो के बारे में जानें। व्यक्तिगत परिचय की पुष्टि बाकी है।"]
  },
  "/showreel": {
    en: ["Showreel — Golden Films", "Preview the Golden Films showreel gallery. Demo thumbnails are samples; approved film links will be added later."],
    hi: ["शो-रील — Golden Films", "Golden Films की शो-रील गैलरी का प्रीव्यू देखें। डेमो थंबनेल नमूने हैं; स्वीकृत फिल्म लिंक बाद में जोड़े जाएँगे।"]
  },
  "/contact": {
    en: ["Contact Golden Films", "Get in touch with Golden Films about photography, videography, editing and creative projects. Contact details shown on this preview are temporary."],
    hi: ["Golden Films से संपर्क करें", "फोटोग्राफी, वीडियोग्राफी, एडिटिंग और क्रिएटिव प्रोजेक्ट के लिए Golden Films से संपर्क करें। इस प्रीव्यू पर दिखाई गई संपर्क जानकारी अस्थायी है।"]
  }
};

const privateRoutes = new Set(["/book", "/admin", "/login", "/register", "/admin.html", "/login.html", "/register.html"]);

export function getSeoMetadata(pathname: string, language: SiteLanguage = "en"): SeoMetadata {
  const path = pathname.replace(/\/$/, "") || "/";
  const known = pageCopy[path];
  const [title, description] = known?.[language] ?? [
    language === "hi" ? "पेज नहीं मिला — Golden Films" : "Page not found — Golden Films",
    language === "hi" ? "माँगा गया पेज उपलब्ध नहीं है।" : "The requested page could not be found."
  ];
  const isPrivate = privateRoutes.has(path) || !known;
  return { title, description, canonical: ORIGIN + (known ? path : "/"), language, robots: isPrivate ? "noindex,nofollow" : "index,follow" };
}

function setMeta(attribute: "name" | "property", key: string, value: string): void {
  let element = document.head.querySelector<HTMLMetaElement>('meta[' + attribute + '="' + key + '"]');
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

export function applySeoMetadata(pathname: string, language: SiteLanguage = "en"): void {
  const metadata = getSeoMetadata(pathname, language);
  document.title = metadata.title;
  document.documentElement.lang = metadata.language;
  setMeta("name", "description", metadata.description);
  setMeta("name", "robots", metadata.robots);
  setMeta("property", "og:title", metadata.title);
  setMeta("property", "og:description", metadata.description);
  setMeta("property", "og:type", "website");
  setMeta("property", "og:url", metadata.canonical);
  setMeta("property", "og:locale", metadata.language === "hi" ? "hi_IN" : "en_IN");
  setMeta("name", "twitter:card", "summary_large_image");
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
  canonical.href = metadata.canonical;
}
