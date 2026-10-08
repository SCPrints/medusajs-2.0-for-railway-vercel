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

// AI TRAINING scrapers only. They bring no customers and walk the whole
// catalog repeatedly. Search engines are deliberately NOT here, and neither
// are the answer-time fetchers (ChatGPT-User, OAI-SearchBot, PerplexityBot,
// Perplexity-User, Claude-User, Claude-SearchBot): those fetch one page when
// a person asks the assistant a question so it can cite + link us. chatgpt.com
// was the #3 referrer (54 visitors / 90d) before they were blocked on 2026-10-04.
const AI_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
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
