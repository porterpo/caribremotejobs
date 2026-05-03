import { useEffect } from "react";

export const SITE_URL = "https://caribremotejobs.com";
export const SITE_NAME = "CaribRemotejobs.com";

export const DEFAULT_TITLE = `${SITE_NAME} \u2014 Remote Jobs for the Caribbean`;
export const DEFAULT_DESCRIPTION =
  "Find remote jobs open to Caribbean-based talent. Browse hundreds of roles across engineering, design, marketing, and more.";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export type JsonLd = Record<string, unknown> | Array<Record<string, unknown>>;

export interface SeoOptions {
  title?: string;
  description?: string;
  /** Path relative to the site root, e.g. "/jobs". Falls back to the current location. */
  canonicalPath?: string;
  ogImage?: string;
  ogType?: "website" | "article" | string;
  /** robots meta value, e.g. "noindex,nofollow" */
  robots?: string;
  jsonLd?: JsonLd | null;
}

const STRUCTURED_DATA_ID = "page-jsonld";

function setMetaByName(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setStructuredData(jsonLd: JsonLd | null): void {
  const existing = document.getElementById(STRUCTURED_DATA_ID);
  if (existing) existing.remove();
  if (!jsonLd) return;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = STRUCTURED_DATA_ID;
  script.text = JSON.stringify(jsonLd);
  document.head.appendChild(script);
}

function buildAbsoluteUrl(canonicalPath?: string): string {
  if (canonicalPath && canonicalPath.startsWith("http")) return canonicalPath;
  const path = canonicalPath ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function useSeo(options: SeoOptions): void {
  const {
    title,
    description,
    canonicalPath,
    ogImage,
    ogType = "website",
    robots,
    jsonLd = null,
  } = options;

  useEffect(() => {
    const prevTitle = document.title;
    const finalTitle = title ?? DEFAULT_TITLE;
    const finalDescription = description ?? DEFAULT_DESCRIPTION;
    const finalImage = ogImage ?? DEFAULT_OG_IMAGE;
    const finalUrl = buildAbsoluteUrl(canonicalPath);
    const finalRobots = robots ?? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

    document.title = finalTitle;
    setMetaByName("description", finalDescription);
    setMetaByName("robots", finalRobots);
    setLink("canonical", finalUrl);

    setMetaByProperty("og:site_name", SITE_NAME);
    setMetaByProperty("og:title", finalTitle);
    setMetaByProperty("og:description", finalDescription);
    setMetaByProperty("og:type", ogType);
    setMetaByProperty("og:url", finalUrl);
    setMetaByProperty("og:image", finalImage);

    setMetaByName("twitter:card", "summary_large_image");
    setMetaByName("twitter:title", finalTitle);
    setMetaByName("twitter:description", finalDescription);
    setMetaByName("twitter:image", finalImage);

    setStructuredData(jsonLd);

    return () => {
      document.title = prevTitle;
      setStructuredData(null);
    };
  }, [title, description, canonicalPath, ogImage, ogType, robots, jsonLd]);
}
