import { MetadataRoute } from "next"

import { getBaseURL } from "@lib/util/env"

const DISALLOW = [
  "/api/",
  "/*/account",
  "/*/checkout",
  "/*/cart",
  // Token/id-addressed transactional pages reached from email links.
  // Never content; crawling them just produces canonical-less duplicates.
  "/*/artwork-approval",
  "/*/quote-accept",
  "/*/quote-approval",
  "/*/group-order",
  "/*/order/confirmed",
  // Faceted listing URLs. Every sort/page/filter combination is a distinct
  // server render + a fresh set of runtime-cache writes, and none of them
  // are canonical content (Oct 2026: >99% of invocations were crawlers).
  "/*?*sortBy=",
  "/*?*page=",
  "/*?*brand=",
  "/*?*fabric=",
  "/*?*minPrice=",
  "/*?*maxPrice=",
  "/*?*inStock=",
]

// AI training / answer-engine scrapers. They bring no customers and walk
// the whole catalog repeatedly. Search engines are deliberately NOT here.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "PerplexityBot",
  "Amazonbot",
  "meta-externalagent",
  "Applebot-Extended",
  "Google-Extended",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "omgili",
]

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseURL()

  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
